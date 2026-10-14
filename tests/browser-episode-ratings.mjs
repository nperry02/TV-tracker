import assert from "node:assert/strict";

// Exercise episode thumbs in isolated browser contexts and restore the fixture library.
export async function checkEpisodeRatings(page, base) {
  const backup = await (await page.request.get(`${base}/api/export`)).json();
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1050 } });
  const preview = await context.newPage();
  let touchContext;
  const errors = [], writes = [];
  preview.on("pageerror", error => errors.push(error.message));
  preview.on("request", request => {
    if (request.method() === "PATCH" && /\/api\/shows\/1396$/.test(request.url())) writes.push(request.postDataJSON());
  });
  // Read the persisted show after a UI write rather than trusting optimistic presentation.
  async function stored() {
    return (await (await preview.request.get(`${base}/api/library`)).json()).shows[0];
  }
  // Wait for enabled controls after the mutation finally block finishes rendering.
  async function settled() {
    await preview.waitForFunction(() => !document.querySelector("#next-watched-1396")?.disabled &&
      !document.querySelector("#show-rating")?.disabled);
  }
  // Select the exact episode's quick-rating button to guard against advancing the wrong episode.
  const quickThumb = (episode, direction) => preview.locator(`#thumb-continue-1396-1-${episode}-${direction}`);
  // Select one stable toggle in the show dialog for corrections and focus assertions.
  const rowThumb = (episode, direction) => preview.locator(`#thumb-episode-1396-1-${episode}-${direction}`);
  try {
    const template = backup.shows.find(show => show.id === 1396);
    const fixture = { ...structuredClone(template), watched: [], rewatchCounts: undefined, episodeRatings: undefined,
      lastWatchedAt: null, lastRewatchedAt: undefined, seriesStatus: "Returning Series", statusOverride: null,
      tracked: true, watchlist: false, rating: 4, seasonRatings: { 1: 3 },
      refreshedAt: "2099-01-01T00:00:00Z", latestUpdate: null, updateSnapshot: undefined };
    assert.equal((await preview.request.post(`${base}/api/import`, { data: { version: 1, shows: [fixture], lists: [] } })).status(), 200);
    await preview.goto(`${base}/#home`);
    const check = preview.locator("#next-watched-1396");
    const bar = preview.locator(".continue-rating-bar");
    await check.waitFor();
    assert.equal(await bar.isVisible(), false);
    // Normal clicking remains a single watch without inventing a thumb.
    await check.click();
    await quickThumb(2, "up").waitFor({ state: "attached" });
    await settled();
    assert.equal((await stored()).episodeRatings, undefined);
    assert.equal(writes.length, 1);
    assert.equal(await check.evaluate(button => button === document.activeElement), true);
    // Keyboard focus and pointer hover expose the bar above the circle, inside the card.
    await check.focus();
    assert.equal(await bar.isVisible(), true);
    await preview.keyboard.press("Escape");
    assert.equal(await bar.isVisible(), false);
    await preview.locator("#home-view h1").click();
    await check.hover();
    assert.equal(await bar.isVisible(), true);
    const circleBox = await check.boundingBox(), barBox = await bar.boundingBox(), cardBox = await preview.locator(".continue-card").boundingBox();
    const upBox = await quickThumb(2, "up").boundingBox(), downBox = await quickThumb(2, "down").boundingBox();
    assert.equal(barBox.width, circleBox.width + 4);
    assert.equal(barBox.x + barBox.width / 2, circleBox.x + circleBox.width / 2);
    assert.equal(barBox.y + barBox.height, circleBox.y + circleBox.height + 2);
    assert.ok(barBox.y >= cardBox.y && upBox.y + upBox.height <= downBox.y && downBox.y + downBox.height <= circleBox.y);
    await preview.locator(".continue-card").screenshot({ path: "test-results/episode-thumbs-home.png" });
    await quickThumb(2, "up").hover();
    assert.equal(await bar.isVisible(), true);
    await quickThumb(2, "up").click();
    await quickThumb(3, "down").waitFor({ state: "attached" });
    await settled();
    assert.deepEqual((await stored()).episodeRatings, { "1:2": "up" });
    assert.deepEqual(writes[1], { episodeRating: { season: 1, episode: 2, rating: "up" },
      progress: { action: "episode", season: 1, episode: 2, watched: true } });
    await check.hover();
    await quickThumb(3, "down").click();
    await preview.locator("#thumb-continue-1396-2-1-up").waitFor({ state: "attached" });
    await settled();
    assert.deepEqual((await stored()).episodeRatings, { "1:2": "up", "1:3": "down" });

    // Failed quick ratings preserve progress and restore the same thumb's keyboard focus.
    const beforeFailure = await stored();
    await preview.route("**/api/shows/1396", route => route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Thumb save failed" } }) : route.continue());
    await check.hover();
    await preview.locator("#thumb-continue-1396-2-1-up").click();
    await preview.getByText("Thumb save failed", { exact: true }).waitFor();
    await settled();
    assert.deepEqual(await stored(), beforeFailure);
    assert.equal(await preview.locator("#thumb-continue-1396-2-1-up").evaluate(button => button === document.activeElement), true);
    await preview.unroute("**/api/shows/1396");

    // Delayed writes disable all choices and reject a duplicate event before another request.
    let release;
    const delay = new Promise(resolve => { release = resolve; });
    await preview.route("**/api/shows/1396", async route => { if (route.request().method() === "PATCH") await delay; await route.continue(); });
    await preview.locator("#thumb-continue-1396-2-1-up").click();
    assert.equal(await check.isDisabled(), true);
    assert.equal(await preview.locator(".continue-rating-bar .thumb-button").first().isDisabled(), true);
    const pendingWrites = writes.length;
    await preview.locator(".continue-rating-bar .thumb-button").first().dispatchEvent("click");
    assert.equal(writes.length, pendingWrites);
    release();
    await preview.locator("#thumb-continue-1396-2-2-up").waitFor({ state: "attached" });
    await settled();
    await preview.unroute("**/api/shows/1396");
    await check.focus();
    await preview.keyboard.press("Tab");
    assert.equal(await preview.locator("#thumb-continue-1396-2-2-up").evaluate(button => button === document.activeElement), true);
    await preview.keyboard.press("Enter");
    await preview.locator("#thumb-continue-1396-2-3-up").waitFor({ state: "attached" });
    await settled();
    await check.click();
    await preview.waitForFunction(() => document.querySelector("#continue-section").hidden);
    await settled();
    assert.equal(await preview.locator("#home-view h1").evaluate(element => element === document.activeElement), true);

    // Show-detail corrections highlight the stored thumb without affecting recency or stars.
    await preview.goto(`${base}/#library`);
    await preview.locator('.show-card[data-show="1396"]').click();
    const thumbPosition = await rowThumb(2, "up").evaluate(button => {
      const row = button.closest(".episode");
      const thumbs = button.closest(".episode-thumbs").getBoundingClientRect();
      return thumbs.left >= row.querySelector(".episode-name").getBoundingClientRect().right &&
        thumbs.right <= row.querySelector(".episode-rewatch").getBoundingClientRect().left &&
        thumbs.left > row.getBoundingClientRect().left + row.getBoundingClientRect().width / 2;
    });
    assert.equal(thumbPosition, true);
    assert.equal(await rowThumb(2, "up").getAttribute("aria-pressed"), "true");
    assert.equal(await rowThumb(3, "down").getAttribute("aria-pressed"), "true");
    const beforeEdit = await stored();
    await rowThumb(2, "down").click();
    await preview.waitForFunction(() => document.querySelector("#thumb-episode-1396-1-2-down")?.getAttribute("aria-pressed") === "true");
    await settled();
    assert.equal(await rowThumb(2, "down").evaluate(button => button === document.activeElement), true);
    const afterEdit = await stored();
    for (const key of ["watched", "rating", "seasonRatings", "lastWatchedAt", "lastRewatchedAt", "latestUpdate"])
      assert.deepEqual(afterEdit[key], beforeEdit[key]);
    await rowThumb(2, "down").click();
    await preview.waitForFunction(() => document.querySelector("#thumb-episode-1396-1-2-down")?.getAttribute("aria-pressed") === "false");
    await settled();
    assert.equal((await stored()).episodeRatings["1:2"], undefined);
    await preview.route("**/api/shows/1396", route => route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Thumb edit failed" } }) : route.continue());
    await rowThumb(3, "up").click();
    await preview.getByText("Thumb edit failed", { exact: true }).waitFor();
    await settled();
    assert.equal(await rowThumb(3, "down").getAttribute("aria-pressed"), "true");
    assert.equal(await rowThumb(3, "up").evaluate(button => button === document.activeElement), true);
    await preview.unroute("**/api/shows/1396");
    await preview.locator('[data-episode="3"]').uncheck();
    await settled();
    assert.equal(await rowThumb(3, "down").isDisabled(), true);
    assert.equal((await stored()).episodeRatings["1:3"], undefined);
    await preview.locator("#show-dialog").screenshot({ path: "test-results/episode-thumbs-detail.png" });
    await preview.setViewportSize({ width: 360, height: 800 });
    assert.equal(await preview.locator("#show-dialog").evaluate(dialog => dialog.scrollWidth <= dialog.clientWidth), true);
    assert.equal(await preview.locator(".episode").evaluateAll(rows => rows.every(row => row.scrollWidth <= row.clientWidth)), true);
    await preview.locator("#show-dialog").screenshot({ path: "test-results/episode-thumbs-detail-mobile.png" });

    // Touch choices open independently of the normal watched action and stay within the card.
    assert.equal((await preview.request.post(`${base}/api/import`, { data: { version: 1, shows: [fixture], lists: [] } })).status(), 200);
    touchContext = await page.context().browser().newContext({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
    const touch = await touchContext.newPage();
    touch.on("pageerror", error => errors.push(error.message));
    await touch.goto(`${base}/#home`);
    const toggle = touch.locator("[data-toggle-thumbs]");
    await toggle.tap();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    assert.deepEqual((await stored()).watched, []);
    await toggle.tap();
    assert.equal(await touch.locator(".continue-rating-bar").isVisible(), false);
    await toggle.tap();
    const touchBar = await touch.locator(".continue-rating-bar").boundingBox();
    assert.ok(touchBar.x >= 0 && touchBar.x + touchBar.width <= 360);
    assert.equal(await touch.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await touch.locator(".continue-card").screenshot({ path: "test-results/episode-thumbs-touch.png" });
    await touch.locator("#thumb-continue-1396-1-1-down").tap();
    await touch.locator("#thumb-continue-1396-1-2-down").waitFor({ state: "attached" });
    assert.deepEqual((await stored()).episodeRatings, { "1:1": "down" });
    assert.deepEqual(errors, []);
  } finally {
    await touchContext?.close();
    await context.close();
    await page.request.post(`${base}/api/import`, { data: backup });
  }
}
