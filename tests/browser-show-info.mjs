import assert from "node:assert/strict";

// Verify refresh visibility and guarded checks against an isolated fixture library.
export async function checkShowInfo(page, base) {
  const backup = await (await page.request.get(`${base}/api/export`)).json();
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: "America/New_York" });
  const preview = await context.newPage();
  const errors = [];
  preview.on("pageerror", error => errors.push(error.message));
  let requests = 0;
  let heldRoute = null;
  try {
    await preview.clock.install({ time: new Date("2026-10-08T16:00:00Z") });
    const template = backup.shows[0];
    const shows = Array.from({ length: 35 }, (_, index) => ({ ...structuredClone(template),
      id: 41000 + index, name: `Saved ${String(index).padStart(2, "0")}`,
      tracked: index !== 2, watchlist: index === 2, statusOverride: index === 3 ? "Dropped" : "Paused",
      refreshedAt: "2026-10-08T16:00:00Z", latestUpdate: null, updateSnapshot: undefined,
    }));
    const returning = { ...structuredClone(template), id: 95396, name: "Returning fixture", tracked: true, watchlist: false,
      seriesStatus: "Ended", statusOverride: null, refreshedAt: "2026-09-01T16:00:00Z",
      seasons: [{ number: 1, name: "Season 1" }, { number: 2, name: "Season 2" }],
      episodes: [1, 2].flatMap(season_number => [1, 2, 3].map(episode_number => ({ season_number, episode_number, name: "Watched", air_date: "2020-01-01" }))),
      watched: ["1:1", "1:2", "1:3", "2:1", "2:2", "2:3"], latestUpdate: null, updateSnapshot: undefined,
    };
    shows.push(returning);
    assert.equal((await preview.request.post(`${base}/api/import`, { data: { version: 1, shows, lists: [] } })).status(), 200);
    // Hold startup's check so duplicate manual clicks and disabled controls are observable.
    await preview.route("**/api/shows/*/refresh", route => { requests++; heldRoute = route; });
    await preview.goto(`${base}/#library`);
    await preview.waitForFunction(() => document.querySelector("#result-count")?.textContent.includes("shows"));
    // The muted site-footer action leaves the introduction and filter spacing unchanged.
    const placement = await preview.evaluate(() => {
      const header = document.querySelector(".library-header").getBoundingClientRect();
      const controls = document.querySelector(".library-controls").getBoundingClientRect();
      return { gap: controls.top - header.bottom,
        inFooter: Boolean(document.querySelector("#open-show-info").closest(".site-footer")),
        borderless: getComputedStyle(document.querySelector("#open-show-info")).borderTopWidth === "0px" };
    });
    assert.deepEqual(placement, { gap: 18, inFooter: true, borderless: true });
    await preview.locator("#open-show-info").click();
    const dialog = preview.locator("#show-info-dialog");
    const firstButton = preview.locator("#show-info-refresh-95396");
    await firstButton.getByText("Refreshing…", { exact: true }).waitFor();
    assert.equal(requests, 1);
    assert.equal(await dialog.locator(".show-info-row").count(), 36);
    assert.equal(await dialog.locator(".show-info-row").first().getAttribute("data-info-show"), "95396");
    assert.match(await preview.locator("#show-info-count").textContent(), /36 saved shows · 1 overdue/);
    assert.match(await dialog.textContent(), /Watchlist/);
    assert.match(await dialog.textContent(), /Dropped/);
    await firstButton.click({ force: true });
    assert.equal(requests, 1);
    await heldRoute.fulfill({ status: 503, json: { error: "Fixture refresh failed." } });
    await firstButton.getByText("Refresh", { exact: true }).waitFor();
    const failed = await (await preview.request.get(`${base}/api/export`)).json();
    assert.equal(failed.shows.find(show => show.id === 95396).refreshedAt, returning.refreshedAt);
    // A manual check succeeds through the real fixture API and updates derived status.
    await firstButton.focus();
    await preview.keyboard.press("Enter");
    await firstButton.getByText("Refreshing…", { exact: true }).waitFor();
    assert.equal(requests, 2);
    assert.equal(await firstButton.evaluate(button => button === document.activeElement), true);
    assert.equal(await dialog.locator(".show-info-row").first().getAttribute("data-info-show"), "95396");
    await preview.locator("#show-info-refresh-41000").click({ force: true });
    assert.equal(requests, 2);
    await heldRoute.fulfill({ response: await heldRoute.fetch() });
    await firstButton.getByText("Refresh", { exact: true }).waitFor();
    assert.match(await dialog.locator('[data-info-show="95396"]').textContent(), /Severance.*Caught Up/s);
    assert.match(await preview.locator("#show-info-count").textContent(), /0 overdue/);
    let refreshed = await (await preview.request.get(`${base}/api/export`)).json();
    assert.notEqual(refreshed.shows.find(show => show.id === 95396).refreshedAt, returning.refreshedAt);
    assert.deepEqual(refreshed.shows.find(show => show.id === 95396).watched, returning.watched);
    // A successful check with unchanged metadata still records success without new activity.
    const previous = refreshed.shows.find(show => show.id === 95396);
    await firstButton.click();
    await firstButton.getByText("Refreshing…", { exact: true }).waitFor();
    await heldRoute.fulfill({ response: await heldRoute.fetch() });
    await firstButton.getByText("Refresh", { exact: true }).waitFor();
    refreshed = await (await preview.request.get(`${base}/api/export`)).json();
    const unchanged = refreshed.shows.find(show => show.id === 95396);
    assert.ok(Date.parse(unchanged.refreshedAt) >= Date.parse(previous.refreshedAt));
    assert.deepEqual(unchanged.latestUpdate, previous.latestUpdate);
    assert.deepEqual(unchanged.episodes, previous.episodes);
    // Opening and searching are read-only, including when My Shows itself is filtered.
    await preview.locator("#show-info-query").fill("saved 02");
    assert.equal(await dialog.locator(".show-info-row").count(), 1);
    await preview.locator("#show-info-query").fill("no matching title");
    await dialog.getByText("No shows match your search.", { exact: true }).waitFor();
    // A focused search input consumes Escape to clear text; test dismissal from a button.
    await dialog.getByRole("button", { name: "Close show info", exact: true }).focus();
    await preview.keyboard.press("Escape");
    await preview.waitForFunction(() => document.activeElement?.id === "open-show-info");
    await preview.locator("#library-query").fill("Severance");
    await preview.locator("#open-show-info").click();
    assert.equal(await dialog.locator(".show-info-row").count(), 36);
    assert.equal(requests, 3);
    assert.deepEqual(await (await preview.request.get(`${base}/api/export`)).json(), refreshed);
    // Failed manual checks retain timestamps, focus, and scroll; no sort occurs mid-request.
    const list = preview.locator("#show-info-list");
    await list.evaluate(element => { element.scrollTop = element.scrollHeight; });
    const bottomButton = dialog.locator("[data-info-refresh]").last();
    const bottomId = await bottomButton.getAttribute("id");
    await bottomButton.focus();
    const scroll = await list.evaluate(element => element.scrollTop);
    await preview.keyboard.press("Enter");
    await bottomButton.getByText("Refreshing…", { exact: true }).waitFor();
    assert.equal(await preview.locator(`#${bottomId}`).evaluate(button => button === document.activeElement), true);
    assert.equal(await list.evaluate(element => element.scrollTop), scroll);
    await heldRoute.fulfill({ status: 503, json: { error: "Fixture manual refresh failed." } });
    await bottomButton.getByText("Refresh", { exact: true }).waitFor();
    assert.equal(await preview.locator(`#${bottomId}`).evaluate(button => button === document.activeElement), true);
    assert.equal(await list.evaluate(element => element.scrollTop), scroll);
    await preview.getByText("Fixture manual refresh failed.", { exact: true }).waitFor();
    assert.deepEqual(await (await preview.request.get(`${base}/api/export`)).json(), refreshed);
    await dialog.screenshot({ path: "test-results/show-info-desktop.png" });
    await preview.setViewportSize({ width: 360, height: 800 });
    assert.equal(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth), true);
    assert.equal(await list.evaluate(element => element.scrollHeight > element.clientHeight), true);
    assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await dialog.screenshot({ path: "test-results/show-info-mobile.png" });
    // Minute and visibility reconciliation update eligibility without fetching metadata.
    await preview.locator("#show-info-query").fill("Saved 00");
    await preview.clock.fastForward(8 * 24 * 60 * 60 * 1000);
    await preview.locator('[data-info-show="41000"]').getByText("Overdue by 1 day", { exact: true }).waitFor();
    assert.equal(requests, 4);
    await preview.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    assert.match(await preview.locator("#show-info-count").textContent(), /35 overdue|36 overdue/);
    await preview.keyboard.press("Escape");
    // Missing timestamps sort first and render safely; stop startup after its first failed check.
    await preview.request.post(`${base}/api/import`, { data: { version: 1, shows: [
      { ...shows[0], id: 42000, name: "Zulu missing", refreshedAt: null },
      { ...shows[1], id: 42001, name: "Alpha invalid", refreshedAt: "invalid" },
    ], lists: [] } });
    await preview.reload();
    await preview.locator("#open-show-info").click();
    await dialog.getByText("Never checked", { exact: false }).first().waitFor();
    assert.equal(await dialog.locator(".show-info-row").first().getAttribute("data-info-show"), "42001");
    assert.match(await dialog.textContent(), /Due now/);
    await heldRoute.fulfill({ status: 503, json: { error: "Fixture unknown check failed." } });
    await preview.request.post(`${base}/api/import`, { data: { version: 1, shows: [], lists: [] } });
    await preview.reload();
    await preview.locator("#open-show-info").click();
    await dialog.getByText("No saved shows yet.", { exact: true }).waitFor();
    assert.match(await preview.locator("#show-info-count").textContent(), /0 saved shows · 0 overdue/);
    assert.deepEqual(errors, []);
  } finally {
    await context.close();
    await page.request.post(`${base}/api/import`, { data: backup });
  }
}
