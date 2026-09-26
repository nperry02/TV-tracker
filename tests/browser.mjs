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
  await page.goto(base);
  await page.getByRole("button", { name: /Find your first show/ }).click();
  await page
    .getByRole("searchbox", { name: "Search TMDB", exact: true })
    .fill("Breaking Bad");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.locator('[data-add="1396"]').click();
  await page.locator("#show-rating").waitFor();
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
  }
  mkdirSync("test-results", { recursive: true });
  await page.screenshot({
    path: `test-results/${live ? "live" : "desktop"}.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
    "Library fits mobile viewport",
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
