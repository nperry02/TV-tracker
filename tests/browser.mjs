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
  let artworkRequests = 0;
  page.on("request", (request) => {
    if (/\/api\/shows\/\d+\/images$/.test(request.url())) artworkRequests++;
  });
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
    ["home", "library", "lists", "stats"],
  );
  assert.equal(await page.locator(".sidebar").count(), 0);
  assert.equal(await page.locator("#home-view").isVisible(), true);
  assert.equal(await page.locator("#library-view").isVisible(), false);
  assert.equal(await page.locator("#lists-view").isVisible(), false);
  assert.equal(await page.locator("#stats-view").isVisible(), false);
  assert.equal(await page.locator("#help-view").isVisible(), false);
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  assert.equal(new URL(page.url()).hash, "#lists");
  await page.getByText("Make your first list.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Create a list", exact: true }).click();
  await page.locator("#list-name").fill("Weekend favorites");
  await page.locator("#list-description").fill("Shows worth revisiting.");
  await page.locator("#list-ordered").check();
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page.getByText("Weekend favorites", { exact: true }).waitFor();
  assert.equal(await page.locator(".list-card").count(), 1);
  assert.equal(await page.locator(".list-card-count").textContent(), "0 shows");
  assert.equal(await page.locator(".list-card-rank-label").textContent(), "Ranked");
  // Overview search matches names and descriptions without losing input focus.
  const listsSearch = page.getByRole("searchbox", { name: "Search lists", exact: true });
  await listsSearch.fill("  WEEKEND  ");
  assert.equal(await page.locator(".list-card").count(), 1);
  await listsSearch.fill("revisiting");
  assert.equal(await page.locator(".list-card").count(), 1);
  await listsSearch.fill("no matching collection");
  assert.equal(await page.locator(".list-card").count(), 0);
  assert.equal(await page.locator("#lists-no-results").isVisible(), true);
  assert.equal(await page.locator("#lists-empty").isVisible(), false);
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  assert.equal(await listsSearch.inputValue(), "");
  assert.equal(await listsSearch.evaluate((input) => input === document.activeElement), true);
  assert.equal(await page.locator(".list-card").count(), 1);
  await page.getByRole("button", { name: "Edit Weekend favorites" }).click();
  // Tall editor content scrolls independently while every action stays visible.
  const editorActionsFit = await page.locator("#list-dialog").evaluate((dialog) => {
    const body = dialog.querySelector(".list-editor-body");
    const spacer = document.createElement("div");
    spacer.style.height = "1200px";
    body.append(spacer);
    const actions = dialog.querySelector(".list-dialog-actions");
    const before = actions.getBoundingClientRect();
    body.scrollTop = body.scrollHeight;
    const after = actions.getBoundingClientRect();
    const bounds = dialog.getBoundingClientRect();
    const fits = body.scrollTop > 0 && Math.abs(before.top - after.top) < 1 &&
      after.bottom <= bounds.bottom && after.bottom <= innerHeight &&
      Math.abs(body.getBoundingClientRect().bottom - after.top) < 1 &&
      getComputedStyle(dialog.querySelector("#list-edit-show-options")).overflowY === "visible";
    spacer.remove();
    body.scrollTop = 0;
    return fits;
  });
  assert.equal(editorActionsFit, true, "List editor actions stay visible while content scrolls");
  await page.locator("#list-name").fill("Weekend watchlist");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("Weekend watchlist", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Edit Weekend watchlist" }).click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByText("Make your first list.", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Home", exact: true }).click();
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
  // Show details can create a list and add the current saved show in one flow.
  await page.getByRole("button", { name: /Manage lists/ }).click();
  await page.getByRole("button", { name: /Create new list/ }).click();
  await page.locator("#list-name").fill("Ranked favorites");
  await page.locator("#list-description").fill("The best saved shows, in order.");
  await page.locator("#list-ordered").check();
  await page.getByRole("button", { name: "Create list", exact: true }).click();
  await page.getByRole("button", { name: /Manage lists \(1\)/ }).waitFor();
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await page.getByRole("link", { name: "Lists", exact: true }).click();
  await page.getByRole("button", { name: "Open Ranked favorites" }).click();
  await page.getByRole("heading", { name: "Ranked favorites", exact: true }).waitFor();
  assert.equal(await page.locator('.list-show-card[data-list-show="1396"]').count(), 1);
  assert.equal(await page.locator(".list-rank").textContent(), "1");
  // Each list remembers backdrop view independently of the My Shows preference.
  await page.getByRole("button", { name: "Backdrop gallery", exact: true }).click();
  assert.equal(await page.locator(".list-shows.backdrop-gallery").count(), 1);
  await page.reload();
  await page.locator(".list-shows.backdrop-gallery .show-card").waitFor();
  assert.equal(await page.getByRole("button", { name: "Backdrop gallery", exact: true }).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".list-rank").textContent(), "1");
  await page.getByRole("button", { name: "List", exact: true }).click();
  assert.equal(await page.locator(".list-shows-rows").count(), 1);
  await page.reload();
  assert.equal(await page.locator(".list-shows-rows").count(), 1);
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByRole("button", { name: "Remove Breaking Bad from list" }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByText("No shows in this list yet.", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Add shows", exact: true }).first().click();
  await page.locator('#list-members-options input[value="1396"]').check();
  await page.getByRole("button", { name: "Save shows", exact: true }).click();
  await page.locator('.list-show-card[data-list-show="1396"]').waitFor();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  page.once("dialog", (dialog) => dialog.accept());
  assert.equal(await page.getByRole("button", { name: "Delete list", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "Delete list", exact: true }).click();
  await page.getByText("Make your first list.", { exact: true }).waitFor();
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
    await page.getByRole("button", { name: "Poster gallery", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("#library-grid.poster-grid").count(), 1);
  // Three icon-only choices share information and ordering with wider backdrop cards.
  const switchButtons = page.locator("#library-view-toggle button");
  assert.equal(await switchButtons.count(), 3);
  assert.deepEqual(await switchButtons.allTextContents(), ["", "", ""]);
  const beforeView = await page.locator("#library-grid").evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns,
    info: grid.querySelector(".show-card").textContent,
  }));
  await page.getByRole("button", { name: "Backdrop gallery", exact: true }).click();
  assert.equal(await page.locator("#library-grid.backdrop-gallery").count(), 1);
  const afterView = await page.locator("#library-grid").evaluate((grid) => ({
    columns: getComputedStyle(grid).gridTemplateColumns,
    info: grid.querySelector(".show-card").textContent,
    ratio: getComputedStyle(grid.querySelector(".poster-wrap")).aspectRatio,
  }));
  assert.equal(beforeView.columns.split(" ").length, 6);
  assert.equal(afterView.columns.split(" ").length, 4);
  assert.equal(await page.locator("#library-grid .card-heading small").count(), 0);
  assert.equal(await page.locator("#library-grid .card-heading .backdrop-status-label").count(), await page.locator("#library-grid .show-card").count());
  assert.ok(await page.locator("#library-grid .card-heading .backdrop-status-label").first().textContent());
  assert.equal(afterView.ratio, "16 / 9");
  assert.equal(await page.locator("#library-grid .show-card").first().evaluate((card) => {
    const frame = card.querySelector(".poster-wrap").getBoundingClientRect();
    const title = card.querySelector(".card-heading").getBoundingClientRect();
    const badges = card.querySelector(".card-badges").getBoundingClientRect();
    const progress = card.querySelector(".progress-track").getBoundingClientRect();
    const label = card.querySelector(".backdrop-status-label");
    return getComputedStyle(label, "::before").content === "none" &&
      title.top > badges.bottom && progress.bottom <= frame.bottom &&
      Math.abs(card.getBoundingClientRect().bottom - frame.bottom) < 1;
  }), true, "Backdrop card information stays within the image frame");
  if (!live) {
    // Missing backdrops use posters; personal backdrop choices take priority.
    assert.ok((await page.locator('#library-grid [data-show="1396"] img').getAttribute("src")).endsWith("/ztkUQFLlC19CCMYHW9o1zWhJRNq.jpg"));
    await page.request.patch(`${base}/api/shows/1396`, { data: { backdropOverride: "/alternate-backdrop.jpg" } });
  }
  await page.reload();
  await page.locator("#library-grid.backdrop-gallery .show-card").waitFor();
  assert.equal(await page.getByRole("button", { name: "Backdrop gallery", exact: true }).getAttribute("aria-pressed"), "true");
  if (!live) {
    assert.ok((await page.locator('#library-grid [data-show="1396"] img').getAttribute("src")).endsWith("/alternate-backdrop.jpg"));
    await page.request.patch(`${base}/api/shows/1396`, { data: { backdropOverride: null } });
    await page.reload();
    await page.locator("#library-grid.backdrop-gallery .show-card").waitFor();
  }
  await page.getByRole("button", { name: "Poster gallery", exact: true }).click();
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
  await page.locator('.show-card[data-show="1396"]').click();
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
    assert.equal(await page.locator(".stats-overview article").count(), 5);
    const ratedShowsSummary = await page
      .locator(".stats-overview article", { hasText: "Rated shows" })
      .locator("strong")
      .textContent();
    assert.equal(ratedShowsSummary.replace(/\s+/g, " ").trim(), "6 / 6");
    assert.equal(await page.locator(".rating-chart g").count(), 10);
    await page.getByText("6 rated · 0 unrated", { exact: true }).waitFor();
    await page.locator(".runtime-info").hover();
    assert.match(
      await page.locator(".runtime-info [role=tooltip]").textContent(),
      /watched episodes have show or episode runtime data/,
    );
    await page.getByRole("heading", { name: "Highest-rated genres" }).waitFor();
    assert.equal(await page.locator(".genre-rating-bars li").count(), 2);
    const genreRatingInfo = page.getByLabel("How genre ratings are calculated");
    await genreRatingInfo.hover();
    await genreRatingInfo.getByRole("tooltip").waitFor();
    assert.match(
      await genreRatingInfo.getByRole("tooltip").textContent(),
      /Unrated shows are excluded/,
    );
    const progressInfo = page.getByLabel("What aired episode progress includes");
    await progressInfo.hover();
    assert.match(
      await progressInfo.getByRole("tooltip").textContent(),
      /Specials are excluded/,
    );
    assert.equal(
      await page.locator(".progress-panel").evaluate(
        (panel) => getComputedStyle(panel).gridColumnEnd,
      ),
      "-1",
    );
    assert.equal(await page.locator("#stats-view .stats-show").count(), 0);
    await page.screenshot({ path: "test-results/desktop-stats.png", fullPage: true });
    await page.getByRole("link", { name: "Home", exact: true }).click();
    await page.locator("#home-view").waitFor();
    assert.equal(await page.locator("#home-top-rated-grid .stats-show").count(), 5);
    await page.locator("#home-top-rated-grid .stats-show").first().click();
    await page.locator("#show-dialog[open]").waitFor();
    await page.getByRole("button", { name: "Close show", exact: true }).click();
    await page.getByRole("link", { name: "My Shows", exact: true }).click();
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
    await page.getByRole("button", { name: "Poster gallery", exact: true }).click();
    assert.equal(await page.locator("#library-grid.poster-grid").count(), 1);
  }

  // Responsive navigation and overflow checks
  mkdirSync("test-results", { recursive: true });
  await page.getByRole("button", { name: "Backdrop gallery", exact: true }).click();
  assert.equal(await page.locator("#library-grid.backdrop-gallery .show-card").count(), 6);
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.view), "backdrop");
  await page.screenshot({ path: "test-results/desktop-backdrop-gallery.png", fullPage: true });
  await page.getByRole("button", { name: "Poster gallery", exact: true }).click();
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
  // A taller header must reduce body space without pushing it outside the drawer.
  const drawerFits = await navDrawer.evaluate((dialog) => {
    const header = dialog.querySelector(".nav-drawer-header");
    const body = dialog.querySelector(".nav-drawer-body");
    const originalHeight = body.getBoundingClientRect().height;
    header.style.minHeight = "130px";
    const fits = body.getBoundingClientRect().height < originalHeight &&
      body.getBoundingClientRect().bottom <= dialog.getBoundingClientRect().bottom + 1;
    header.style.removeProperty("min-height");
    return fits;
  });
  assert.equal(drawerFits, true, "Drawer body adapts to header height");
  assert.equal(await navDrawer.getByRole("navigation", { name: "Pages" }).getByRole("link").count(), 4);
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
  await page.getByRole("button", { name: "Poster gallery", exact: true }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Gallery view fits mobile viewport",
  );
  await page.getByRole("button", { name: "Backdrop gallery", exact: true }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true,
    "Backdrop gallery fits mobile viewport");
  const mobileArtworkRatio = await page.locator("#library-grid .poster-wrap").first().evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return bounds.width / bounds.height;
  });
  assert.ok(Math.abs(mobileArtworkRatio - 16 / 9) < 0.02);
  // Multiple badges must not collide with the title on narrow landscape cards.
  const mobileOverlayFits = await page.locator("#library-grid .show-card").first().evaluate((card) => {
    const badges = card.querySelector(".card-badges");
    const watchlist = document.createElement("span");
    watchlist.className = "status-badge status-watchlist";
    watchlist.textContent = "Watchlist";
    badges.append(watchlist);
    const frame = card.querySelector(".poster-wrap").getBoundingClientRect();
    const title = card.querySelector(".card-heading").getBoundingClientRect();
    const progress = card.querySelector(".progress-track").getBoundingClientRect();
    const status = card.querySelector(".card-heading .backdrop-status-label").getBoundingClientRect();
    const name = card.querySelector(".card-heading h3").getBoundingClientRect();
    const fits = title.top > badges.getBoundingClientRect().bottom && progress.bottom <= frame.bottom &&
      name.right <= status.left && status.right <= frame.right;
    watchlist.remove();
    return fits;
  });
  assert.equal(mobileOverlayFits, true, "Mobile backdrop overlays fit with overlapping memberships");
  await page.screenshot({ path: "test-results/mobile-backdrop-gallery.png", fullPage: true });
  await page.getByRole("button", { name: "Poster gallery", exact: true }).click();
  await page.screenshot({ path: "test-results/mobile.png", fullPage: true });
  await page.locator('.show-card[data-show="1396"]').click();
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
  // Artwork loads only on opening; both tabs share that one response.
  assert.equal(artworkRequests, 0);
  await page.getByRole("button", { name: "Change artwork", exact: true }).click();
  const artworkPicker = page.locator("#artwork-dialog");
  await page.waitForFunction(() => !document.querySelector("#artwork-status").textContent.includes("Loading"));
  assert.equal(artworkRequests, 1);
  await artworkPicker.getByRole("button", { name: "Backdrop", exact: true }).click();
  assert.equal(artworkRequests, 1);
  assert.equal(await artworkPicker.evaluate((dialog) => {
    const footer = dialog.querySelector(".artwork-footer").getBoundingClientRect();
    return dialog.scrollWidth <= dialog.clientWidth && footer.bottom <= innerHeight;
  }), true, "Artwork picker and footer fit mobile viewport");
  await artworkPicker.getByRole("button", { name: "Cancel", exact: true }).click();
  if (!live) {
    const openArtwork = async () => {
      await page.getByRole("button", { name: "Change artwork", exact: true }).click();
      await page.waitForFunction(() => !document.querySelector("#artwork-status").textContent.includes("Loading"));
    };
    // Selection stays pending until saved; browsing more adds no API request.
    await openArtwork();
    assert.equal(await artworkPicker.getByRole("radio").count(), 25);
    await page.screenshot({ path: "test-results/artwork-picker.png", fullPage: true });
    const beforeMore = artworkRequests;
    await artworkPicker.getByRole("button", { name: "Show more", exact: true }).click();
    assert.equal(await artworkPicker.getByRole("radio").count(), 31);
    assert.equal(artworkRequests, beforeMore);
    await artworkPicker.getByRole("radio", { name: "Poster 1", exact: true }).check();
    await artworkPicker.getByRole("button", { name: "Cancel", exact: true }).click();
    await openArtwork();
    assert.equal(await artworkPicker.getByRole("radio", { name: "Use TMDB default", exact: true }).isChecked(), true);
    await artworkPicker.getByRole("radio", { name: "Poster 1", exact: true }).check();
    await artworkPicker.getByRole("button", { name: "Backdrop", exact: true }).click();
    await artworkPicker.getByRole("radio", { name: "Backdrop 1", exact: true }).check();
    // A failed save retains both selections and lets the user retry.
    await page.route("**/api/shows/1396", (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 502, json: { error: "Artwork save unavailable" } }) : route.continue());
    await artworkPicker.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.locator("#artwork-save-error").waitFor();
    assert.equal(await artworkPicker.getByRole("radio", { name: "Backdrop 1", exact: true }).isChecked(), true);
    await page.unroute("**/api/shows/1396");
    await artworkPicker.getByRole("button", { name: "Save changes", exact: true }).click();
    await artworkPicker.waitFor({ state: "hidden" });
    assert.ok((await page.locator(".detail-poster").getAttribute("src")).endsWith("/alternate-poster.jpg"));
    assert.ok((await page.locator(".detail-backdrop").getAttribute("src")).endsWith("/alternate-backdrop.jpg"));
    await page.locator("#refresh-show").click();
    await page.waitForFunction(() => document.querySelector("#refresh-show")?.disabled === false);
    assert.ok((await page.locator(".detail-backdrop").getAttribute("src")).endsWith("/alternate-backdrop.jpg"));
    await page.route("**/api/shows/1396/images", (route) => route.fulfill({ json: { posters: [], backdrops: [] } }));
    await openArtwork();
    assert.equal(await artworkPicker.getByRole("radio", { name: "Saved selection", exact: true }).isChecked(), true);
    await artworkPicker.getByRole("radio", { name: "Use TMDB default", exact: true }).check();
    await artworkPicker.getByRole("button", { name: "Backdrop", exact: true }).click();
    await artworkPicker.getByRole("radio", { name: "Use TMDB default", exact: true }).check();
    await artworkPicker.getByRole("button", { name: "Save changes", exact: true }).click();
    await artworkPicker.waitFor({ state: "hidden" });
    await page.unroute("**/api/shows/1396/images");
    // Failed image requests are retryable and never mutate saved choices.
    await page.route("**/api/shows/1396/images", (route) => route.fulfill({ status: 502, json: { error: "Artwork unavailable" } }));
    await openArtwork();
    await artworkPicker.getByRole("button", { name: "Try again", exact: true }).waitFor();
    await page.unroute("**/api/shows/1396/images");
    await artworkPicker.getByRole("button", { name: "Try again", exact: true }).click();
    await artworkPicker.getByRole("radio", { name: "Poster 1", exact: true }).waitFor();
    await artworkPicker.getByRole("button", { name: "Cancel", exact: true }).click();
  }
  // Long metadata stays within a growing hero instead of overlapping its edges.
  const heroFits = await page.locator(".detail-hero").evaluate((hero) => {
    const overview = hero.querySelector(".overview");
    const original = overview.textContent;
    const originalHeight = hero.getBoundingClientRect().height;
    overview.textContent = "A long show description with many details. ".repeat(80);
    const content = hero.querySelector(".detail-hero-content").getBoundingClientRect();
    const bounds = hero.getBoundingClientRect();
    const fits = bounds.height > originalHeight && content.top >= bounds.top &&
      content.bottom <= bounds.bottom;
    overview.textContent = original;
    return fits;
  });
  assert.equal(heroFits, true, "Show hero grows to contain long metadata");
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
  if (!live) {
    // Manual ranks survive alternate unordered display sorts and support both controls.
    const createdList = await (
      await page.request.post(`${base}/api/lists`, {
        data: {
          name: "Ordering test",
          description: "Two ways to arrange shows.",
          ordered: true,
          sort: "manual",
        },
      })
    ).json();
    await page.request.put(`${base}/api/lists/${createdList.id}/items`, {
      data: { showIds: [1396, 200022] },
    });
    await page.goto(`${base}/#lists/${createdList.id}`);
    await page.reload();
    await page.getByRole("heading", { name: "Ordering test", exact: true }).waitFor();
    await page.locator("[data-list-query]").fill("Test series");
    assert.equal(await page.locator(".list-show-card").count(), 1);
    await page.locator("[data-list-query]").fill("");
    assert.equal(await page.locator(".list-show-card").count(), 2);
    await page.locator("[data-list-watchlist]").click();
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Test series 23"],
    );
    await page.locator("[data-list-watchlist]").click();
    // Ranked order is edited only through position fields in the list dialog.
    assert.equal(await page.getByRole("button", { name: /Move .* (up|down)/ }).count(), 0);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Rank for Breaking Bad" }).fill("2");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Test series 23");
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Test series 23", "Breaking Bad"],
    );
    // Saving membership without changes must preserve the edited manual order.
    await page.getByRole("button", { name: "＋ Add shows", exact: true }).click();
    await page.getByRole("button", { name: "Save shows", exact: true }).click();
    await page.locator("#list-members-dialog").waitFor({ state: "hidden" });
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Test series 23", "Breaking Bad"],
    );
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("spinbutton", { name: "Rank for Test series 23" }).fill("2");
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Breaking Bad");
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Breaking Bad", "Test series 23"],
    );
    await page.locator("[data-list-sort]").selectOption("title-desc");
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Test series 23");
    assert.equal(await page.getByRole("button", { name: /Move .* (up|down)/ }).count(), 0);
    await page.locator("[data-list-sort]").selectOption("manual");
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Breaking Bad");
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("#list-ordered").uncheck();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await page.locator("#list-dialog").waitFor({ state: "hidden" });
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Breaking Bad");
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Breaking Bad", "Test series 23"],
    );
    await page.locator("[data-list-sort]").selectOption("title-desc");
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Test series 23");
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Test series 23", "Breaking Bad"],
    );
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("#list-ordered").check();
    const rankedSave = page.waitForResponse(
      (response) => response.url().endsWith(`/api/lists/${createdList.id}`) && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    const rankedList = await (await rankedSave).json();
    assert.equal(rankedList.ordered, true);
    assert.equal(rankedList.sort, "manual");
    await page.waitForFunction(() => document.querySelector(".list-show-card .card-heading h3")?.textContent === "Breaking Bad");
    assert.deepEqual(
      await page.locator(".list-show-card .card-heading h3").allTextContents(),
      ["Breaking Bad", "Test series 23"],
    );
    await page.request.delete(`${base}/api/lists/${createdList.id}`);
    await page.goto(`${base}/#library`);
  }
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
