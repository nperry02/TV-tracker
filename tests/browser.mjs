import { chromium } from "playwright";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";

const live = process.env.LIVE_TMDB === "1";
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
  await page.goto(base);
  await page.waitForFunction(
    () => document.querySelector(".brand-icon")?.naturalWidth > 0,
  );
  await page.getByRole("button", { name: /Find your first show/ }).click();
  await page
    .getByRole("searchbox", { name: "Search TMDB", exact: true })
    .fill("Breaking Bad");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator('[data-add="1396"]').click();
  await page.locator("#show-rating").waitFor();
  assert.equal(
    await page.locator(".detail-hero .status-badge").first().textContent(),
    "Watching",
  );
  await page.getByRole("button", { name: "Close show", exact: true }).click();
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
    await page.locator('#tabs [data-tab="Watchlist"] .count').textContent(),
    "0",
  );
  assert.equal(
    await page.locator('#continue-list [data-show="1396"]').count(),
    1,
  );
  await page.reload();
  await page.locator('.show-card[data-show="1396"]').click();
  await page.locator("#show-rating").selectOption("4.5");
  await page.waitForFunction(
    () =>
      !document.querySelector("#show-rating").disabled &&
      document.querySelector("#show-rating").value === "4.5",
  );
  await page.locator("#season-rating").selectOption("4");
  await page.waitForFunction(
    () =>
      !document.querySelector("#season-rating").disabled &&
      document.querySelector("#season-rating").value === "4",
  );
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
    await page.locator('#tabs [data-tab="Watchlist"] .count').textContent(),
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
    await page.locator('#tabs [data-tab="Watchlist"] .count').textContent(),
    "1",
  );
  await page.getByRole("button", { name: "Close show", exact: true }).click();
  await page.locator('#tabs [data-tab="Watching"]').click();
  assert.equal(await page.locator(".show-card").count(), 1);
  await page.locator('#tabs [data-tab="Watchlist"]').click();
  assert.equal(await page.locator(".show-card").count(), 1);
  await page.reload();
  await page.locator('#tabs [data-tab="Watchlist"]').click();
  await page.locator('.show-card[data-show="1396"]').click();
  assert.equal(
    await page.locator("#toggle-watchlist").getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(await page.locator("#show-rating").inputValue(), "4.5");
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
  await page.reload();
  await page.locator('[data-show="1396"]').first().click();
  assert.equal(await page.locator("#show-rating").inputValue(), "4.5");
  assert.equal(await page.locator("#show-status").inputValue(), "Dropped");
  await page.locator("#season-select").selectOption("1");
  assert.equal(await page.locator("#season-rating").inputValue(), "4");
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
    // Quick progress works from the library without opening a dialog.
    await page.locator('#continue-list [data-next="1396"]').click();
    await page.waitForFunction(
      () =>
        document
          .querySelector('#continue-list [data-next="1396"]')
          ?.getAttribute("aria-label") === "Mark Breaking Bad S2 E2 watched",
    );
    assert.equal(await page.locator("#show-dialog").isVisible(), false);
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
    assert.equal(await page.locator("#show-rating").inputValue(), "4.5");
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
    await page.locator(".show-card").nth(5).waitFor();
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
    await page.locator('[data-tab="Completed"]').click();
    assert.equal(await page.locator(".show-card").count(), 2);
    await page.locator('[data-tab="All"]').click();
    await page.locator("#rating-filter").selectOption("4");
    assert.equal(await page.locator(".show-card").count(), 5);
    await page.locator("#genre").selectOption("18");
    await page.locator("#library-query").fill("severance");
    assert.equal(await page.locator(".show-card").count(), 1);
    await page.locator("#library-query").fill("");
    await page.locator("#rating-filter").selectOption("");
    const showOrder = () =>
      page
        .locator(".show-card")
        .evaluateAll((cards) => cards.map((card) => Number(card.dataset.show)));
    assert.equal(
      await page.getByLabel("Sort shows", { exact: true }).inputValue(),
      "last-updated",
    );
    assert.deepEqual(
      (await showOrder()).slice(0, 1),
      [60059],
    );
    await page
      .getByLabel("Sort shows", { exact: true })
      .selectOption("last-updated");
    assert.equal((await showOrder()).at(0), 60059);
    await page
      .getByLabel("Sort shows", { exact: true })
      .selectOption("release-newest");
    assert.deepEqual(
      await showOrder(),
      [95396, 85552, 76331, 60059, 1396, 1438],
    );
    await page
      .getByLabel("Sort shows", { exact: true })
      .selectOption("release-oldest");
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
      await page.getByLabel("Sort shows", { exact: true }).selectOption(sort);
      assert.equal((await showOrder()).at(-1), 1438);
    }
    await page.unroute("**/api/library");
    await page.reload();
    await page.locator(".show-card").nth(5).waitFor();
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
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: `test-results/${live ? "live" : "desktop"}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: /List/ }).click();
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "List view fits mobile viewport",
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
  await page.getByRole("button", { name: /Find a show/ }).click();
  if (!live) {
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
      await page.locator('#tabs [data-tab="Watchlist"] .count').textContent(),
      "1",
    );
    await page
      .getByRole("button", { name: "Close search", exact: true })
      .click();
    await page.reload();
    await page.locator('#tabs [data-tab="Watchlist"]').click();
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
    await page.locator("#show-rating").selectOption("2");
    await page.waitForFunction(
      () =>
        document.querySelector("#show-rating")?.value === "2" &&
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
      await page.locator('#tabs [data-tab="Watchlist"] .count').textContent(),
      "1",
    );
    await page.locator('#tabs [data-tab="Watchlist"]').click();
    await page.locator('.show-card[data-show="200022"]').click();
    assert.equal(await page.locator("#show-rating").inputValue(), "");
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
    await page.getByRole("button", { name: /Find a show/ }).click();
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
  await page.getByRole("button", { name: "About & credits" }).click();
  if (live)
    await page.waitForFunction(
      () => document.querySelector(".tmdb-logo").naturalWidth > 0,
    );
  await page.getByRole("button", { name: "Close credits" }).click();
  assert.deepEqual(errors, []);
  console.log(
    `${live ? "Live TMDB" : "Fixture"} browser checks passed: search, add, ratings, season progress, overrides, reload persistence, filters, errors, and mobile layout.`,
  );
} finally {
  await browser?.close();
  if (child.exitCode === null) {
    const done = once(child, "exit");
    child.kill();
    await done;
  }
  rmSync(directory, { recursive: true, force: true });
}
