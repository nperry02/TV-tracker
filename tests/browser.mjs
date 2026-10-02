import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const live = process.env.LIVE_TMDB === "1";

// Run against an isolated library and deterministic TMDB fixture by default.
const directory = mkdtempSync(join(tmpdir(), "next-episode-browser-"));
const args = live
  ? ["--env-file=.env", "server.mjs"]
  : ["--import", "./tests/tmdb-fixture.mjs", "server.mjs"];
const child = spawn(process.execPath, args, {
  env: {
    ...process.env,
    PORT: "0",
    TV_DATA_FILE: join(directory, "library.json"),
    ...(live ? {} : { TMDB_TOKEN: "fixture" }),
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let browser,
  errors = [],
  stderr = "";
child.stderr.on("data", (chunk) => {
  stderr += chunk;
});
try {
  // Wait for the local server before creating shared page helpers.
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Server start timed out: ${stderr}`)),
      10000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error(stderr));
    });
    child.stdout.on("data", (chunk) => {
      const match = String(chunk).match(/http:\/\/localhost:\d+/);
      if (match) {
        clearTimeout(timer);
        resolve(match[0]);
      }
    });
  });
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1050 },
  });
  page.on("pageerror", (error) => errors.push(error.message));
  page.setDefaultTimeout(live ? 60000 : 10000);
  const selectLibraryStatus = async (status) => {
    if (status === "Watchlist") {
      await page.locator("#watchlist-filter").click();
      return;
    }
    const filter = page.locator("#status-filter");
    if (!(await filter.evaluate((details) => details.open)))
      await filter.locator("summary").click();
    await filter.locator(`[data-tab="${status}"]`).click();
  };
  const selectLibraryGenre = async (genre) => {
    const filter = page.locator("#genre-filter");
    if (!(await filter.evaluate((details) => details.open)))
      await filter.locator("summary").click();
    await filter.locator(`[data-genre="${genre}"]`).click();
  };

  // Live mode performs a small pagination contract check before the UI flow.
  if (live) {
    const first = await (
      await page.request.get(`${base}/api/search?q=Star&page=1`)
    ).json();
    const second = await (
      await page.request.get(`${base}/api/search?q=Star&page=2`)
    ).json();
    assert.equal(first.page, 1);
    assert.equal(second.page, 2);
    assert.ok(second.results.length > 0);
    assert.notDeepEqual(
      first.results.map((s) => s.id),
      second.results.map((s) => s.id),
    );
  }

  // Navigation, empty states, and the first library addition
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector(".brand-icon")?.naturalWidth > 0,
  );
  const desktopAlignment = await page.evaluate(() => {
    const heading = document.querySelector(".page-heading").getBoundingClientRect();
    const brand = document.querySelector(".brand").getBoundingClientRect();
    const links = document.querySelector(".top-links").getBoundingClientRect();
    return {
      left: Math.abs(brand.left - heading.left),
      right: Math.abs(links.right - heading.right),
    };
  });
  assert.ok(desktopAlignment.left < 1);
  assert.ok(desktopAlignment.right < 1);
  assert.deepEqual(
    await page.locator(".top-pages [data-page]").evaluateAll((links) =>
      links.map((link) => link.dataset.page),
    ),
    ["home", "library", "stats"],
  );
  assert.equal(await page.locator(".sidebar").count(), 0);
  assert.equal(await page.locator("#home-view").isVisible(), true);
  assert.equal(await page.locator("#library-view").isVisible(), false);
  assert.equal(await page.locator("#stats-view").isVisible(), false);
  assert.equal(await page.locator("#help-view").isVisible(), false);
  await page.getByRole("link", { name: "Stats", exact: true }).click();
  assert.equal(new URL(page.url()).hash, "#stats");
  await page.locator("#stats-view").waitFor();
  assert.equal(await page.locator("#stats-view").isVisible(), true);
  assert.equal(await page.locator("#home-view").isVisible(), false);
  assert.equal(await page.locator("#library-view").isVisible(), false);
  await page.getByText("No ratings yet.", { exact: true }).waitFor();
  await page.getByText("Genres will appear as you add shows.", { exact: true }).waitFor();
  await page.goBack();
  await page.locator("#home-view").waitFor();
  await page.getByRole("button", { name: "Add a show", exact: true }).click();
  await page
    .getByRole("searchbox", { name: "Search TMDB", exact: true })
    .fill("Breaking Bad");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator('[data-add="1396"]').click();
  await page.locator("#show-rating").waitFor();
  const runtimeLibrary = await (await page.request.get(`${base}/api/library`)).json();
  assert.equal(runtimeLibrary.shows[0].typicalRuntime, 45);
  assert.ok(runtimeLibrary.shows[0].episodes.every((episode) => episode.runtime > 0));
  assert.equal(
    await page.locator(".detail-hero .status-badge").first().textContent(),
    "Watching",
  );
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await page.getByRole("link", { name: "My Shows", exact: true }).click();
  await page.locator("#library-view").waitFor();
  assert.equal(await page.locator("#home-view").isVisible(), false);
  assert.equal(await page.locator("#stats-view").isVisible(), false);
  assert.equal(
    await page.locator('[data-tab="All"] .count').textContent(),
    "1",
  );
  assert.equal(await page.locator(".show-card").count(), 1);
  assert.equal(
    await page.getByRole("button", { name: /Gallery/ }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("#library-grid.poster-grid").count(), 1);
  assert.equal(
    await page.locator('#watchlist-filter .count').textContent(),
    "0",
  );

  // Ratings, progress, membership, and manual status persistence
  assert.equal(
    await page.locator('#continue-list [data-show="1396"]').count(),
    1,
  );
  await page.reload();
  await page.locator('.show-card[data-show="1396"]').click();
  const progressDetailsBox = await page.locator(".detail-progress-main").boundingBox();
  const nextEpisodeActionBox = await page.locator(".next-watched-detail").boundingBox();
  assert.ok(nextEpisodeActionBox.x > progressDetailsBox.x);
  assert.ok(nextEpisodeActionBox.y < progressDetailsBox.y + progressDetailsBox.height);
  await page.locator('#show-rating input[value="4.5"]').check();
  await page.waitForFunction(
    () =>
      !document.querySelector("#show-rating").disabled &&
      document.querySelector("#show-rating").dataset.value === "4.5",
  );
  await page.locator('#show-rating input[value="2.5"]').hover();
  assert.equal(await page.locator("#show-rating").getAttribute("data-value"), "4.5");
  assert.equal(await page.locator("#show-rating output").textContent(), "4.5 out of 5");
  assert.deepEqual(
    await page.locator("#show-rating .rating-star").evaluateAll((stars) =>
      stars.map((star) =>
        [...star.classList].find((name) =>
          ["full", "half", "unfilled"].includes(name),
        ),
      ),
    ),
    ["full", "full", "half", "unfilled", "unfilled"],
  );
  assert.deepEqual(
    await page.locator("#show-rating .rating-star").evaluateAll((stars) =>
      stars.map((star) =>
        [...star.classList].find((name) => name.startsWith("comparison-")) || null,
      ),
    ),
    [null, null, "comparison-full", "comparison-full", "comparison-half"],
  );
  await page.locator('#show-rating input[value="3"]').check();
  await page.waitForFunction(
    () => document.querySelector("#show-rating").dataset.value === "3",
  );
  await page.locator('#show-rating input[value="5"]').hover();
  assert.deepEqual(
    await page.locator("#show-rating .rating-star").evaluateAll((stars) =>
      stars.map((star) =>
        [...star.classList].find((name) => name.startsWith("comparison-")) || null,
      ),
    ),
    [null, null, null, "comparison-full", "comparison-full"],
  );
  await page.locator('#show-rating input[value="4.5"]').check();
  await page.waitForFunction(
    () => document.querySelector("#show-rating").dataset.value === "4.5",
  );
  // Adjacent star targets meet so the preview remains continuous between glyphs.
  const firstStarBox = await page.locator("#show-rating .rating-star").first().boundingBox();
  await page.locator("#show-rating .star-rating").hover({
    position: { x: firstStarBox.width + 1, y: firstStarBox.height / 2 },
  });
  assert.equal(await page.locator('#show-rating [data-rating-kind]:hover').count(), 1);
  await page.locator("#show-rating .star-rating").click({
    position: { x: firstStarBox.width + 1, y: firstStarBox.height / 2 },
  });
  await page.waitForFunction(
    () => document.querySelector("#show-rating").dataset.value === "1.5",
  );
  await page.locator('#show-rating input[value="4.5"]').check();
  await page.waitForFunction(
    () => document.querySelector("#show-rating").dataset.value === "4.5",
  );
  // Moving to Clear but remaining inside the fieldset restores the saved appearance.
  await page.locator("#show-rating .rating-clear").hover();
  assert.equal(await page.locator("#show-rating output").textContent(), "4.5 out of 5");
  await page.getByRole("button", { name: "Clear rating", exact: true }).first().click();
  await page.waitForFunction(
    () =>
      !document.querySelector("#show-rating").disabled &&
      document.querySelector("#show-rating").dataset.value === "",
  );
  await page.locator('#show-rating input[value="4.5"]').check();
  await page.waitForFunction(
    () => document.querySelector("#show-rating").dataset.value === "4.5",
  );
  assert.deepEqual(
    await page.locator("#show-rating .rating-star").evaluateAll((stars) =>
      stars.map((star) =>
        [...star.classList].find((name) =>
          ["full", "half", "unfilled"].includes(name),
        ),
      ),
    ),
    ["full", "full", "full", "full", "half"],
  );
  const unratedSeasonBox = await page.locator("#season-rating").boundingBox();
  const unratedSeasonActionBox = await page.locator("#mark-season").boundingBox();
  await page.locator('#season-rating input[value="4"]').check();
  await page.waitForFunction(
    () =>
      !document.querySelector("#season-rating").disabled &&
      document.querySelector("#season-rating").dataset.value === "4",
  );
  const ratedSeasonBox = await page.locator("#season-rating").boundingBox();
  const ratedSeasonActionBox = await page.locator("#mark-season").boundingBox();
  assert.equal(ratedSeasonBox.width, unratedSeasonBox.width);
  assert.equal(ratedSeasonActionBox.x, unratedSeasonActionBox.x);
  await page.locator('[data-through="2"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-episode="2"]')?.checked &&
      !document.querySelector("#show-rating").disabled,
  );
  assert.equal(await page.locator('[data-episode="1"]').isChecked(), true);
  assert.equal(
    await page.locator(".detail-hero .status-badge").textContent(),
    "Watching",
  );
  assert.equal(
    await page.locator('[data-tab="All"] .count').textContent(),
    "1",
  );
  assert.equal(
    await page.locator('#watchlist-filter .count').textContent(),
    "0",
  );
  await page.locator("#season-select").selectOption("2");
  await page.locator("#toggle-watchlist").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#toggle-watchlist")
        ?.getAttribute("aria-pressed") === "true" &&
      !document.querySelector("#toggle-watchlist").disabled,
  );
  assert.equal(
    await page.locator('[data-tab="All"] .count').textContent(),
    "1",
  );
  assert.equal(
    await page.locator('#tabs [data-tab="Watching"] .count').textContent(),
    "1",
  );
  assert.equal(
    await page.locator('#watchlist-filter .count').textContent(),
    "1",
  );
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await selectLibraryStatus("Watching");
  assert.equal(await page.locator(".show-card").count(), 1);
  await selectLibraryStatus("Watchlist");
  assert.equal(await page.locator(".show-card").count(), 1);
  await page.reload();
  assert.equal(
    await page.locator('#tabs [data-tab="Watching"]').getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    await page.locator('#watchlist-filter').getAttribute("aria-pressed"),
    "true",
  );
  await page.locator('.show-card[data-show="1396"]').click();
  assert.equal(
    await page.locator("#toggle-watchlist").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("#show-rating").getAttribute("data-value"), "4.5");
  await page.locator("#season-select").selectOption("2");
  await page.locator('[data-through="1"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-episode="1"]')?.checked &&
      !document.querySelector("#show-rating").disabled,
  );
  await page.locator("#show-status").selectOption("Dropped");
  await page.waitForFunction(
    () =>
      !document.querySelector("#show-status").disabled &&
      document.querySelector("#show-status").value === "Dropped",
  );
  assert.equal(
    await page.locator("#toggle-watchlist").getAttribute("aria-pressed"),
    "true",
  );
  await page.locator("#toggle-watchlist").click();
  await page.waitForFunction(
    () =>
      document
        .querySelector("#toggle-watchlist")
        ?.getAttribute("aria-pressed") === "false" &&
      !document.querySelector("#toggle-watchlist").disabled,
  );
  assert.equal(await page.locator("#show-status").inputValue(), "Dropped");
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await selectLibraryStatus("All");
  await page.reload();
  await page.locator('[data-show="1396"]').first().click();
  assert.equal(await page.locator("#show-rating").getAttribute("data-value"), "4.5");
  assert.equal(await page.locator("#show-status").inputValue(), "Dropped");
  await page.locator("#season-select").selectOption("1");
  assert.equal(await page.locator("#season-rating").getAttribute("data-value"), "4");
  assert.equal(await page.locator('[data-episode="1"]').isChecked(), true);
  await page.locator('[data-episode="1"]').uncheck();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-episode="1"]').checked &&
      !document.querySelector("#show-rating").disabled,
  );
  await page.locator("#show-status").selectOption("");
  await page.waitForFunction(
    () =>
      !document.querySelector("#show-status").disabled &&
      document.querySelector("#show-status").value === "",
  );
  await page.locator("#show-status").selectOption("Paused");
  await page.waitForFunction(
    () =>
      document.querySelector("#show-status")?.value === "Paused" &&
      !document.querySelector("#show-status").disabled,
  );
  assert.equal(
    await page.locator('[data-tab="Paused"] .count').textContent(),
    "1",
  );
  await page.locator('[data-episode="1"]').check();
  await page.waitForFunction(
    () =>
      document.querySelector("#show-status")?.value === "" &&
      document.querySelector(".detail-hero .status-badge")?.textContent ===
        "Watching" &&
      !document.querySelector("#show-status").disabled,
  );
  assert.equal(
    await page.locator('[data-tab="Paused"] .count').textContent(),
    "0",
  );
  // Restore the earlier gap so the existing quick-progress flow still begins there.
  await page.locator('[data-episode="1"]').uncheck();
  await page.waitForFunction(
    () =>
      !document.querySelector('[data-episode="1"]').checked &&
      !document.querySelector("#show-status").disabled,
  );
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  if (!live) {
    // Fixture-only flows build a varied library for filters, stats, and sorting.
    await page.getByRole("link", { name: "Home", exact: true }).click();
    // Quick progress works from Home without opening a dialog.
    await page.locator('#continue-list [data-next="1396"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('#continue-list [data-next="1396"]')
          ?.getAttribute("aria-label") === "Mark Breaking Bad S2 E2 watched",
    );
    assert.equal(await page.locator("#show-dialog").isVisible(), false);
    await page.getByRole("link", { name: "My Shows", exact: true }).click();
    await page.locator('.show-card[data-show="1396"]').click();
    await page.locator('#show-content [data-next="1396"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('#show-content [data-next="1396"]')
          ?.textContent.includes("S2 E3") &&
        !document.querySelector("#show-rating").disabled,
    );
    // Correct an earlier gap, then complete through season 2 in one action.
    await page.locator("#season-select").selectOption("1");
    await page.locator('[data-episode="1"]').uncheck();
    await page.waitForFunction(
      () => !document.querySelector("#show-rating").disabled,
    );
    await page.locator("#season-select").selectOption("2");
    await page
      .getByRole("button", { name: "Watched through this season", exact: true })
      .click();
    await page.waitForFunction(
      () =>
        document.querySelector(".detail-hero .status-badge")?.textContent ===
          "Completed" && !document.querySelector("#show-rating").disabled,
    );
    assert.equal(await page.locator("#show-content [data-next]").count(), 0);
    await page.locator("#season-select").selectOption("1");
    assert.equal(await page.locator('[data-episode="1"]').isChecked(), true);
    assert.equal(await page.locator("#show-rating").getAttribute("data-value"), "4.5");
    await page.getByRole("button", { name: "Close show", exact: true }).click();
    await page.reload();
    await page
      .locator('.show-card[data-show="1396"] .status-completed')
      .waitFor();
    for (const [id, rating, statusOverride] of [
      [95396, 5, "Caught Up"],
      [76331, 5, "Completed"],
      [60059, 4.5, null],
      [85552, 3, "Dropped"],
      [1438, 5, null],
    ]) {
      await page.request.post(`${base}/api/shows/${id}`);
      await page.request.patch(`${base}/api/shows/${id}`, {
        data: {
          rating,
          statusOverride,
          progress: { action: "through", season: 1, episode: 2, watched: true },
        },
      });
    }
    await page.reload();
    await page.locator(".show-card").nth(5).waitFor({ state: "attached" });
    await page.getByRole("link", { name: "Home", exact: true }).click();
    assert.equal(
      await page
        .locator("#continue-list .continue-open")
        .first()
        .getAttribute("data-show"),
      "1438",
    );
    await page.locator('#continue-list [data-next="60059"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#continue-list .continue-open")
          ?.getAttribute("data-show") === "60059",
    );
    await page.getByRole("link", { name: "My Shows", exact: true }).click();
    await page.locator("#library-view").waitFor({ state: "visible" });
    const toolbarControlTops = () =>
      page.locator(".library-controls").evaluate((toolbar) =>
        [
          "#library-query",
          "#status-filter summary",
          "#watchlist-filter",
          "#genre-filter summary",
          ".custom-select:has(#rating-filter) .custom-select-trigger",
          ".custom-select:has(#sort) .custom-select-trigger",
          ".view-toggle",
        ].map((selector) => toolbar.querySelector(selector).getBoundingClientRect().top),
      );
    const closedToolbarTops = await toolbarControlTops();
    await page.locator("#status-filter summary").click();
    assert.deepEqual(await toolbarControlTops(), closedToolbarTops);
    await page.locator("#status-filter summary").click();
    await page.locator("#genre-filter summary").click();
    assert.deepEqual(await toolbarControlTops(), closedToolbarTops);
    await page.locator("#genre-filter summary").click();
    await selectLibraryStatus("All");
    await selectLibraryStatus("Completed");
    assert.equal(await page.locator(".show-card").count(), 2);
    await selectLibraryStatus("Watching");
    assert.equal(
      await page.locator('#tabs [data-tab="Completed"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator('#tabs [data-tab="Watching"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.match(
      await page.locator("#status-filter summary").textContent(),
      /Completed \+ Watching/,
    );
    assert.equal(
      await page.locator("#status-filter summary .status-filter-dot").count(),
      2,
    );
    assert.ok(await page.locator(".show-card").count() > 2);
    await selectLibraryStatus("All");
    assert.match(
      await page.locator("#status-filter summary").textContent(),
      /All shows/,
    );
    await page.locator("#status-filter summary").click();
    await page.locator("#rating-filter").selectOption("4");
    assert.equal(await page.locator(".show-card").count(), 5);
    await selectLibraryGenre("18");
    await selectLibraryGenre("80");
    assert.match(
      await page.locator("#genre-filter summary").textContent(),
      /Crime \+ Drama/,
    );
    assert.equal(
      await page.locator('#genre-filter [data-genre="18"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator('#genre-filter [data-genre="80"]').getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(
      await page.locator(".library-controls").evaluate((panel) => {
        const summary = panel.querySelector("#genre-filter summary span span");
        summary.textContent = "Animation + Crime + Drama + Family + Kids";
        return [...panel.querySelectorAll("summary, input, .view-toggle, .custom-select")]
          .every((control) => control.getBoundingClientRect().right <= panel.getBoundingClientRect().right + 1);
      }),
      true,
      "Long filter labels stay inside the filter panel",
    );
    await page.evaluate(() => window.dispatchEvent(new Event("resize")));
    await selectLibraryGenre("18");
    await selectLibraryGenre("18");
    await page.locator("#library-query").fill("severance");
    assert.equal(await page.locator(".show-card").count(), 1);
    await page.locator("#library-query").fill("");
    await page.locator("#rating-filter").selectOption("");
    const ratingDropdown = page.locator(
      ".custom-select:has(#rating-filter)",
    );
    await ratingDropdown.locator(".custom-select-trigger").click();
    await ratingDropdown
      .locator(".custom-select-menu")
      .getByRole("option", { name: "4+ stars", exact: true })
      .click();
    assert.equal(await page.locator("#rating-filter").inputValue(), "4");
    assert.equal(await page.locator(".show-card").count(), 5);
    await ratingDropdown.locator(".custom-select-trigger").press("Enter");
    await ratingDropdown.locator(".custom-select-menu").waitFor();
    await ratingDropdown.locator(".custom-select-trigger").press("Escape");
    assert.equal(
      await ratingDropdown.locator(".custom-select-menu").isHidden(),
      true,
    );
    await page.locator("#rating-filter").selectOption("");
    const showOrder = () =>
      page
        .locator(".show-card")
        .evaluateAll((cards) => cards.map((card) => Number(card.dataset.show)));
    assert.equal(
      await page.locator("#sort").inputValue(),
      "last-updated",
    );
    assert.deepEqual(
      (await showOrder()).slice(0, 1),
      [60059],
    );
    await page.locator("#sort").selectOption("last-updated");
    assert.equal((await showOrder()).at(0), 60059);
    await page.locator("#sort").selectOption("release-newest");
    assert.deepEqual(
      await showOrder(),
      [95396, 85552, 76331, 60059, 1396, 1438],
    );
    await page.locator("#sort").selectOption("release-oldest");
    assert.deepEqual(
      await showOrder(),
      [1438, 1396, 60059, 76331, 85552, 95396],
    );
    // Missing premiere dates stay last for both directions.
    await page.route("**/api/library", async (route) => {
      const response = await route.fetch();
      const library = await response.json();
      library.shows.find((show) => show.id === 1438).first_air_date = null;
      await route.fulfill({ response, json: library });
    });
    await page.reload();
    await page.locator(".show-card").nth(5).waitFor();
    for (const sort of ["release-newest", "release-oldest"]) {
      await page.locator("#sort").selectOption(sort);
      assert.equal((await showOrder()).at(-1), 1438);
    }
    await page.unroute("**/api/library");
    await page.reload();
    await page.locator(".show-card").nth(5).waitFor();
    await page.getByRole("link", { name: "Stats", exact: true }).click();
    await page.locator("#stats-view").waitFor();
    assert.equal(new URL(page.url()).hash, "#stats");
    assert.equal(await page.locator(".stats-overview article").count(), 4);
    assert.equal(await page.locator(".rating-chart g").count(), 10);
    await page.getByText("6 rated · 0 unrated", { exact: true }).waitFor();
    assert.match(
      await page.locator(".runtime-panel").textContent(),
      /watched episodes have show or episode runtime data/,
    );
    assert.equal(await page.locator(".stats-show").count(), 5);
    await page.screenshot({ path: "test-results/desktop-stats.png", fullPage: true });
    await page.locator(".stats-show").first().click();
    await page.locator("#show-dialog[open]").waitFor();
    await page.getByRole("button", { name: "Close show", exact: true }).click();
    await page.goBack();
    await page.locator("#library-view").waitFor();
    await page.getByRole("button", { name: /List/ }).click();
    assert.equal(
      await page.getByRole("button", { name: /List/ }).getAttribute("aria-pressed"),
      "true",
    );
    assert.equal(await page.locator("#library-grid.show-list").count(), 1);
    assert.equal(await page.locator(".show-row").count(), 6);
    const breakingBadRow = page.locator('.show-row[data-show="1396"]');
    await breakingBadRow.getByText("Breaking Bad", { exact: true }).waitFor();
    assert.equal(await breakingBadRow.locator(".status-completed").count(), 1);
    assert.equal(await breakingBadRow.locator(".stars").textContent(), "★★★★½");
    assert.match(
      await breakingBadRow.locator('[data-label="Progress"]').textContent(),
      /6\/6 aired watched/,
    );
    assert.notEqual(
      await breakingBadRow.locator('[data-label="Released"]').textContent(),
      "Not recorded",
    );
    assert.notEqual(
      await breakingBadRow.locator('[data-label="Last updated"]').textContent(),
      "No updates yet",
    );
    await page.reload();
    await page.locator(".show-row").nth(5).waitFor();
    assert.equal(
      await page.getByRole("button", { name: /List/ }).getAttribute("aria-pressed"),
      "true",
      "List choice persists after reload",
    );
    await page.screenshot({
      path: "test-results/desktop-list.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: /Gallery/ }).click();
    assert.equal(await page.locator("#library-grid.poster-grid").count(), 1);
  }

  // Responsive navigation and overflow checks
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: `test-results/${live ? "live" : "desktop"}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 1000, height: 900 });
  await page.goto(`${base}/#home`);
  assert.equal(await page.locator(".top-pages").isVisible(), false);
  assert.equal(await page.locator("#nav-menu-toggle").isVisible(), true);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "Home view fits tablet viewport",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/#stats`);
  await page.locator("#stats-view").waitFor();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "Stats view fits mobile viewport",
  );
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  const navDrawer = page.locator("#nav-drawer");
  await navDrawer.waitFor();
  assert.equal(await navDrawer.getByRole("navigation", { name: "Pages" }).getByRole("link").count(), 3);
  assert.equal(
    await navDrawer.getByRole("button", { name: "Add a show", exact: true }).count(),
    1,
  );
  assert.equal(
    await navDrawer.getByRole("link", { name: "Back up library ↗", exact: true }).count(),
    0,
  );
  assert.equal(
    await page.locator(".site-footer").getByRole("link", { name: "Back up library ↗", exact: true }).count(),
    1,
  );
  await navDrawer.getByRole("link", { name: "My Shows", exact: true }).click();
  assert.equal(new URL(page.url()).hash, "#library");
  assert.equal(await navDrawer.evaluate((dialog) => dialog.open), false);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await navDrawer.getByRole("link", { name: "Stats", exact: true }).click();
  await page.locator("#stats-view").waitFor();
  assert.equal(new URL(page.url()).hash, "#stats");
  await page.screenshot({ path: "test-results/mobile-stats.png", fullPage: true });
  await page.goto(`${base}/#library`);
  await page.locator("#library-view").waitFor();
  await page.getByRole("button", { name: /List/ }).click();
  const mobileListLayout = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    offenders: [...document.querySelectorAll("body *")]
      .filter((element) => element.getBoundingClientRect().right > innerWidth + 1)
      .slice(0, 8)
      .map((element) => ({
        className: element.className,
        id: element.id,
        right: Math.round(element.getBoundingClientRect().right),
      })),
  }));
  assert.equal(
    mobileListLayout.document <= mobileListLayout.viewport,
    true,
    `List view fits mobile viewport: ${JSON.stringify(mobileListLayout)}`,
  );
  await page.screenshot({ path: "test-results/mobile-list.png", fullPage: true });
  await page.getByRole("button", { name: /Gallery/ }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Gallery view fits mobile viewport",
  );
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.locator('[data-show="1396"]').first().click();
  const seasonOptions = page.locator(".season-options");
  assert.equal(await seasonOptions.locator("summary").isVisible(), true);
  assert.equal(await seasonOptions.locator(".season-actions").isVisible(), false);
  await seasonOptions.locator("summary").click();
  assert.equal(await seasonOptions.locator(".season-actions").isVisible(), true);
  await seasonOptions.locator('#season-rating input[value="3.5"]').check();
  await page.waitForFunction(
    () => document.querySelector("#season-rating").dataset.value === "3.5",
  );
  assert.equal(await page.locator(".season-options").getAttribute("open"), "");
  assert.equal(
    await page
      .locator("#show-dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
    "Show details fit mobile viewport",
  );
  await page.screenshot({
    path: "test-results/mobile-detail.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await page.getByRole("button", { name: "Add a show", exact: true }).click();
  if (!live) {
    // Search pagination covers recovery, Watchlist-only records, and stale responses.
    const searchFor = async (query) => {
      await page
        .getByRole("searchbox", { name: "Search TMDB", exact: true })
        .fill(query);
      await page.getByRole("button", { name: "Search", exact: true }).click();
      await page.waitForFunction(
        (q) =>
          document
            .querySelector("#search-message")
            .textContent.includes(`results for “${q}”`),
        query,
      );
    };
    await searchFor("Test series");
    assert.equal(await page.locator(".search-result").count(), 20);
    await page.route("**/api/search?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("page") === "2") {
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({ error: "Temporary search failure." }),
        });
      } else await route.continue();
    });
    await page.locator("#load-more").click();
    await page
      .getByText("Temporary search failure.", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".search-result").count(), 20);
    await page.unroute("**/api/search?**");
    await page.locator("#load-more").click();
    await page
      .getByText("Showing 23 of 23 results for “Test series”", { exact: true })
      .waitFor();
    assert.equal(await page.locator(".search-result").count(), 23);
    assert.equal(await page.locator("#load-more").isVisible(), false);
    await page.locator('[data-watchlist-add="200022"]').click();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-watchlist-add="200022"]')?.textContent ===
        "✓ Watchlist",
    );
    assert.equal(
      await page.locator('[data-tab="All"] .count').textContent(),
      "6",
    );
    assert.equal(
      await page.locator('#watchlist-filter .count').textContent(),
      "1",
    );
    await page
      .getByRole("button", { name: "Close search", exact: true })
      .click();
    await page.reload();
    await selectLibraryStatus("Watchlist");
    await page.locator('.show-card[data-show="200022"]').click();
    assert.equal(
      await page.locator(".detail-hero .status-badge").first().textContent(),
      "Not started",
    );
    await page.locator("#toggle-watchlist").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#toggle-watchlist")
          ?.getAttribute("aria-pressed") === "false" &&
        !document.querySelector("#toggle-watchlist").disabled,
    );
    assert.equal(
      await page.locator('[data-tab="All"] .count').textContent(),
      "6",
    );
    await page.locator("#toggle-watchlist").click();
    await page.waitForFunction(
      () =>
        document
          .querySelector("#toggle-watchlist")
          ?.getAttribute("aria-pressed") === "true" &&
        !document.querySelector("#toggle-watchlist").disabled,
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Start watching", exact: true })
        .count(),
      0,
    );
    await page.locator("#show-status").selectOption("Watching");
    await page.waitForFunction(
      () =>
        document.querySelector(".detail-hero .status-badge")?.textContent ===
          "Watching" && !document.querySelector("#show-status").disabled,
    );
    assert.equal(
      await page.locator('[data-tab="All"] .count').textContent(),
      "7",
    );
    assert.equal(
      await page.locator("#toggle-watchlist").getAttribute("aria-pressed"),
      "true",
    );
    await page.locator('#show-rating input[value="2"]').check();
    await page.waitForFunction(
      () =>
        document.querySelector("#show-rating")?.dataset.value === "2" &&
        !document.querySelector("#show-rating").disabled,
    );
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .getByRole("button", { name: "Remove from All Shows", exact: true })
      .click();
    await page.waitForFunction(
      () => !document.querySelector("#show-dialog").open,
    );
    assert.equal(
      await page.locator('[data-tab="All"] .count').textContent(),
      "6",
    );
    assert.equal(
      await page.locator('#watchlist-filter .count').textContent(),
      "1",
    );
    await page.locator('.show-card[data-show="200022"]').click();
    assert.equal(await page.locator("#show-rating").getAttribute("data-value"), "");
    assert.equal(await page.locator("#show-status").inputValue(), "");
    assert.equal(
      await page.locator(".detail-hero .status-badge").first().textContent(),
      "Not started",
    );
    assert.equal(
      await page
        .getByRole("button", { name: "Remove saved show", exact: true })
        .count(),
      1,
    );
    await page.getByRole("button", { name: "Close show", exact: true }).click();
    await page
      .getByRole("button", { name: "Add a show", exact: true })
      .click();
    await searchFor("Test series 23");
    assert.equal(
      await page.locator('#search-results [data-show="200022"]').count(),
      1,
    );
    // A late response from an older query must not mix shows into the new query.
    await searchFor("Test series");
    let release, started;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const intercepted = new Promise((resolve) => {
      started = resolve;
    });
    await page.route("**/api/search?**", async (route) => {
      if (new URL(route.request().url()).searchParams.get("page") === "2") {
        started();
        await gate;
      }
      await route.continue();
    });
    await page.locator("#load-more").click();
    await intercepted;
    await searchFor("Breaking Bad");
    const oldResponse = page.waitForResponse(
      (response) => new URL(response.url()).searchParams.get("page") === "2",
    );
    release();
    await (await oldResponse).finished();
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    assert.equal(await page.locator(".search-result").count(), 1);
    assert.equal(await page.locator("#load-more").isVisible(), false);
    await page.unroute("**/api/search?**");
    await page
      .getByRole("searchbox", { name: "Search TMDB", exact: true })
      .fill("offline");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await page.getByText("TMDB is unavailable", { exact: false }).waitFor();
  }
  await page.getByRole("button", { name: "Close search", exact: true }).click();
  // Help is a routed page, so the footer link participates in browser history.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page
    .locator(".site-footer")
    .getByRole("link", { name: "Help & about", exact: true })
    .click();
  assert.equal(new URL(page.url()).hash, "#help");
  await page.getByRole("heading", { name: "Keep your place. Find what’s next." }).waitFor();
  assert.equal(await page.locator("#help-view").isVisible(), true);
  assert.equal(await page.locator("#home-view").isVisible(), false);
  assert.equal(await page.locator("#library-view").isVisible(), false);
  assert.equal(await page.locator("#stats-view").isVisible(), false);
  await page.getByText("Your library stays on this computer.", { exact: true }).waitFor();
  assert.equal(await page.locator("#help-view .tmdb-logo").count(), 1);
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    true,
    "Help view fits desktop viewport",
  );
  await page.locator("#toast").waitFor({ state: "hidden" });
  await page.screenshot({ path: "test-results/help.png", fullPage: true });
  await page.goBack();
  await page.locator("#library-view").waitFor();
  assert.deepEqual(errors, []);
  console.log(
    `${live ? "Live TMDB" : "Fixture"} browser checks passed: search, add, ratings, season progress, stats, overrides, reload persistence, filters, errors, and mobile layout.`,
  );
} finally {
  // Always stop the child server and remove its temporary library.
  await browser?.close();
  if (child.exitCode === null) {
    const done = once(child, "exit");
    child.kill();
    await done;
  }
  rmSync(directory, { recursive: true, force: true });
}
