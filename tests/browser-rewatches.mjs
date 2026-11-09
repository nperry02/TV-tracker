import assert from "node:assert/strict";

// Verify repeat controls against the current watched fixture, then restore its exact library.
export async function checkRewatches(page, base) {
  const backup = await (await page.request.get(`${base}/api/export`)).json();
  const original = backup.shows.find((show) => show.id === 1396);
  const viewport = page.viewportSize();
  // Wait for a completed show write before inspecting replacement controls.
  const settled = () => page.waitForFunction(() => !document.querySelector("#show-rating")?.disabled);
  // Dialog closure queues a close event; wait for its focus-restoration handler as well.
  const editorClosed = () => page.waitForFunction(() =>
    !document.querySelector("#rewatch-dialog").open &&
    document.activeElement === document.querySelector("#rewatch-options-1"));
  // Open the correction dialog through the keyboard-accessible episode menu.
  async function edit(number) {
    await page.locator(`#rewatch-options-${number}`).click();
    await page.locator(`[data-edit-rewatch="${number}"]`).click();
    await page.locator("#rewatch-dialog[open]").waitFor();
  }
  try {
    assert.equal(await page.locator("#rewatch-3").isDisabled(), true);
    await page.locator("#rewatch-1").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector("#rewatch-1 span")?.textContent === "1");
    await settled();
    assert.equal(await page.locator("#rewatch-1").evaluate((button) => button === document.activeElement), true);
    await page.locator("#rewatch-1").click();
    await page.waitForFunction(() => document.querySelector("#rewatch-1 span")?.textContent === "2");
    await settled();
    // Delayed writes disable every repeat control and cannot be submitted twice.
    let releaseSave;
    const delayed = new Promise((resolve) => { releaseSave = resolve; });
    await page.route("**/api/shows/1396", async (route) => {
      if (route.request().method() === "PATCH") await delayed;
      await route.continue();
    });
    await page.locator("#rewatch-2").click();
    assert.equal(await page.locator("#rewatch-1").isDisabled(), true);
    assert.equal(await page.locator("#rewatch-2").isDisabled(), true);
    releaseSave();
    await page.waitForFunction(() => document.querySelector("#rewatch-2 span")?.textContent === "1");
    await settled();
    await page.unroute("**/api/shows/1396");
    let stored = (await (await page.request.get(`${base}/api/library`)).json()).shows.find((show) => show.id === 1396);
    for (const key of ["watched", "statusOverride", "lastWatchedAt", "latestUpdate"])
      assert.deepEqual(stored[key], original[key]);

    // Failed increments keep saved counts and restore the original button focus.
    await page.route("**/api/shows/1396", (route) => route.request().method() === "PATCH"
      ? route.fulfill({ status: 500, json: { error: "Rewatch save failed" } }) : route.continue());
    await page.locator("#rewatch-1").click();
    await page.getByText("Rewatch save failed", { exact: true }).waitFor();
    await settled();
    assert.equal(await page.locator("#rewatch-1 span").textContent(), "2");
    await edit(1);
    await page.locator("#rewatch-count").fill("5");
    await page.locator("#rewatch-save").click();
    await page.waitForFunction(() => document.querySelector("#rewatch-dialog").dataset.saving === "false");
    assert.equal(await page.locator("#rewatch-dialog").isVisible(), true);
    assert.equal(await page.locator("#rewatch-count").inputValue(), "5");
    await page.unroute("**/api/shows/1396");
    await page.locator("#rewatch-count").fill("1.5");
    assert.equal(await page.locator("#rewatch-count").evaluate((input) => input.checkValidity()), false);
    await page.locator("#rewatch-count").fill("4");
    await page.locator("#rewatch-save").click();
    await editorClosed();
    assert.equal(await page.locator("#rewatch-1 span").textContent(), "4");
    assert.equal(await page.locator("#rewatch-options-1").evaluate((button) => button === document.activeElement), true);
    await edit(1);
    await page.locator("#rewatch-count").fill("0");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await editorClosed();
    assert.equal(await page.locator("#rewatch-1 span").textContent(), "4");
    await edit(1);
    await page.locator("#rewatch-count").fill("0");
    await page.locator("#rewatch-save").click();
    await editorClosed();
    assert.equal(await page.locator("#rewatch-1 span").count(), 0);

    // Small screens keep repeat controls and the correction editor inside the dialog.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator("#rewatch-options-1").click();
    const menuBox = await page.locator(".rewatch-options[open] .rewatch-menu").boundingBox();
    assert.ok(menuBox.x >= 0 && menuBox.x + menuBox.width <= 360);
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#show-dialog").isVisible(), true);
    await edit(1);
    assert.equal(await page.locator("#rewatch-dialog").evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth), true);
    await page.keyboard.press("Escape");
    await editorClosed();
    assert.equal(await page.locator("#rewatch-dialog").isVisible(), false);
    assert.equal(await page.locator(".episode").first().evaluate((row) => row.scrollWidth <= row.clientWidth), true);
    await page.setViewportSize(viewport);

    // Seed complete repeats to verify read-only summaries and clearing dependencies.
    const complete = structuredClone(backup);
    const show = complete.shows.find((entry) => entry.id === 1396);
    show.watched = show.episodes.map((episode) => `${episode.season_number}:${episode.episode_number}`);
    show.rewatchCounts = Object.fromEntries(show.watched.map((key) => [key, 2]));
    await page.request.post(`${base}/api/import`, { data: complete });
    await page.reload();
    await page.locator('.show-card[data-show="1396"]').click();
    assert.equal(await page.locator('[data-rewatch-summary="Show"] span').textContent(), "2");
    assert.equal(await page.locator('[data-rewatch-summary="Season"] span').textContent(), "2");
    await page.locator("#show-dialog").screenshot({ path: "test-results/rewatches-desktop.png" });
    await page.setViewportSize({ width: 360, height: 800 });
    await page.locator("#show-dialog").screenshot({ path: "test-results/rewatches-mobile.png" });
    await page.setViewportSize(viewport);
    await page.locator("#rewatch-1").click();
    await page.waitForFunction(() => document.querySelector("#rewatch-1 span")?.textContent === "3");
    await settled();
    assert.equal(await page.locator('[data-rewatch-summary="Season"] span').textContent(), "2");
    await page.locator('[data-episode="1"]').uncheck();
    await page.waitForFunction(() => document.querySelector("#rewatch-1")?.disabled);
    await settled();
    assert.equal(await page.locator("[data-rewatch-summary]").count(), 0);
    stored = (await (await page.request.get(`${base}/api/library`)).json()).shows.find((entry) => entry.id === 1396);
    assert.equal(stored.rewatchCounts["1:1"], undefined);
    assert.equal(stored.rewatchCounts["1:2"], 2);
    await page.locator("#clear-season").click();
    await settled();
    stored = (await (await page.request.get(`${base}/api/library`)).json()).shows.find((entry) => entry.id === 1396);
    assert.equal(stored.rewatchCounts["1:2"], undefined);
    assert.equal(stored.rewatchCounts["2:1"], 2);
    // My Shows recency includes a repeat while the original progress time stays unchanged.
    const sorting = structuredClone(backup);
    const rewatched = sorting.shows.find((entry) => entry.id === 1396);
    rewatched.lastWatchedAt = "2000-01-01T00:00:00.000Z";
    delete rewatched.lastRewatchedAt;
    sorting.shows.push({ ...structuredClone(rewatched), id: 900001,
      name: "Newer viewing", lastWatchedAt: "2020-01-01T00:00:00.000Z" });
    await page.request.post(`${base}/api/import`, { data: sorting });
    await page.reload();
    await page.locator("#sort").selectOption("last-updated");
    assert.equal(await page.locator(".show-card").first().getAttribute("data-show"), "900001");
    await page.locator('.show-card[data-show="1396"]').click();
    await page.locator("#rewatch-1").click();
    await page.waitForFunction(() => document.querySelector(".show-card")?.dataset.show === "1396");
    await settled();
    stored = (await (await page.request.get(`${base}/api/library`)).json()).shows.find((entry) => entry.id === 1396);
    assert.equal(stored.lastWatchedAt, "2000-01-01T00:00:00.000Z");
    assert.ok(Date.parse(stored.lastRewatchedAt) > Date.parse("2020-01-01"));
  } finally {
    await page.unroute("**/api/shows/1396");
    await page.request.post(`${base}/api/import`, { data: backup });
    await page.setViewportSize(viewport);
    await page.reload();
    await page.locator('.show-card[data-show="1396"]').click();
  }
}
