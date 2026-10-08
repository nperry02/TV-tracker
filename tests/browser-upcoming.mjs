import assert from "node:assert/strict";

// Exercise upcoming releases in an isolated browser context and restore the fixture library.
export async function checkUpcoming(page, base) {
  const backup = await (await page.request.get(`${base}/api/export`)).json();
  const context = await page.context().browser().newContext({ viewport: { width: 1440, height: 1050 }, timezoneId: "America/New_York" });
  const preview = await context.newPage();
  // Compare resolved styles so future panel overrides cannot silently break shared framing.
  async function checkPanelStyles() {
    const differences = await preview.evaluate(() => {
      const baseline = getComputedStyle(document.querySelector(".stats-panel"));
      const heading = getComputedStyle(document.querySelector(".stats-panel-heading h2"));
      return [...document.querySelectorAll(".stats-panel, .upcoming-section, .updates-section, .help-card-grid article, .help-details article")]
        .flatMap((panel) => {
          const style = getComputedStyle(panel);
          const title = panel.querySelector("h2, h3");
          const titleStyle = title && getComputedStyle(title);
          return style.padding !== baseline.padding || style.backgroundColor !== baseline.backgroundColor || (titleStyle &&
            (titleStyle.fontSize !== heading.fontSize || titleStyle.lineHeight !== heading.lineHeight))
            ? [{ panel: panel.className, padding: style.padding, background: style.backgroundColor, fontSize: titleStyle?.fontSize, lineHeight: titleStyle?.lineHeight }] : [];
        });
    });
    assert.deepEqual(differences, []);
  }
  try {
    await preview.clock.install({ time: new Date("2026-10-08T16:00:00Z") });
    // Fixed future metadata keeps automatic refresh from replacing test releases.
    const template = backup.shows[0];
    const shows = Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(template),
      id: 30000 + index, name: `Upcoming ${String(index).padStart(2, "0")}`,
      tracked: index !== 2, watchlist: index === 2, watched: [], statusOverride: index === 1 ? "Paused" : null,
      rewatchCounts: {}, refreshedAt: "2099-01-01T00:00:00Z", updateSnapshot: undefined, latestUpdate: null,
      seasons: [{ number: 1, name: "Season 1" }, { number: 2, name: "Season 2" }],
      episodes: [{ season_number: 1, episode_number: 1, air_date: "2020-01-01", name: "Earlier episode" },
        { season_number: 2, episode_number: 1, air_date: `2026-10-${String(index + 9).padStart(2, "0")}`, name: "Return premiere" },
        { season_number: 2, episode_number: 2, air_date: "2026-10-25", name: "Following episode" }],
    }));
    shows.push({ ...structuredClone(shows[0]), id: 30100, name: "Far return",
      episodes: [{ season_number: 2, episode_number: 1, air_date: "2026-11-17", name: "Far premiere" }] });
    shows.push({ ...structuredClone(shows[0]), id: 30200, name: "Dropped return", statusOverride: "Dropped" });
    const imported = await preview.request.post(`${base}/api/import`, { data: { version: 1, shows, lists: [] } });
    assert.equal(imported.status(), 200);
    await preview.goto(`${base}/#home`);
    await preview.locator(".upcoming-entry").first().waitFor();
    assert.equal(await preview.locator(".upcoming-entry").count(), 12);
    assert.equal(await preview.locator('.upcoming-entry[data-show="30200"]').count(), 0);
    assert.match(await preview.locator(".upcoming-entry").first().textContent(), /Tomorrow/);
    assert.equal(await preview.locator(".upcoming-premiere").count(), 12);
    assert.equal(await preview.locator(".upcoming-copy").first().textContent(), "Season 2 premiere");
    assert.match(await preview.locator(".upcoming-entry").first().getAttribute("title"), /Return premiere.*2026/);
    await preview.locator(".upcoming-entry").first().click();
    assert.equal(await preview.locator("#season-select").inputValue(), "2");
    await preview.getByRole("button", { name: "Close show", exact: true }).click();
    const snapshot = await (await preview.request.get(`${base}/api/export`)).json();
    await preview.locator("#upcoming-window").selectOption("90");
    assert.equal(await preview.locator(".upcoming-entry").count(), 13);
    assert.equal(await preview.locator("#upcoming-window").evaluate((select) => select.closest(".custom-select").querySelector(".custom-select-trigger") === document.activeElement), true);
    assert.deepEqual(await (await preview.request.get(`${base}/api/export`)).json(), snapshot);
    await preview.reload();
    assert.equal(await preview.locator("#upcoming-window").inputValue(), "90");
    await preview.locator(".upcoming-entry").first().waitFor();
    const geometry = await preview.evaluate(() => {
      const upcoming = document.querySelector("#upcoming-section").getBoundingClientRect();
      const updates = document.querySelector("#updates-section").getBoundingClientRect();
      const list = document.querySelector("#upcoming-list");
      const continueGap = document.querySelector(".continue-card").getBoundingClientRect().top -
        document.querySelector("#continue-section h2").getBoundingClientRect().bottom;
      const upcomingGap = document.querySelector(".upcoming-entry .poster-wrap").getBoundingClientRect().top -
        document.querySelector("#upcoming-heading").getBoundingClientRect().bottom;
      const updatesGap = document.querySelector("#updates-list").getBoundingClientRect().top -
        document.querySelector("#updates-heading").getBoundingClientRect().bottom;
      const bottomInset = upcoming.bottom - document.querySelector(".upcoming-entry").getBoundingClientRect().bottom - 1;
      return { height: upcoming.height, aligned: upcoming.top === updates.top,
        balancedInset: Math.abs(bottomInset - parseFloat(getComputedStyle(document.querySelector("#upcoming-section")).paddingTop)) < 1,
        contentGapMatched: Math.abs(upcomingGap - continueGap) < .5 && Math.abs(updatesGap - continueGap) < .5,
        titleAligned: document.querySelector("#upcoming-heading").getBoundingClientRect().top === document.querySelector("#updates-heading").getBoundingClientRect().top,
        titleAtPadding: document.querySelector("#upcoming-heading").getBoundingClientRect().top - upcoming.top ===
          parseFloat(getComputedStyle(document.querySelector("#upcoming-section")).paddingTop) + 1,
        sameHeight: upcoming.height === updates.height, beside: updates.left >= upcoming.right,
        scrollable: list.scrollWidth > list.clientWidth };
    });
    assert.deepEqual(geometry, { height: 360, aligned: true, balancedInset: true, contentGapMatched: true, titleAligned: true, titleAtPadding: true, sameHeight: true, beside: true, scrollable: true });
    await checkPanelStyles();
    await preview.locator("#upcoming-list").evaluate((list) => { list.scrollLeft = 200; });
    assert.ok(await preview.locator("#upcoming-list").evaluate((list) => list.scrollLeft > 0));
    await preview.locator("#upcoming-list").evaluate((list) => { list.scrollLeft = 0; });
    await preview.locator(".home-discovery").screenshot({ path: "test-results/upcoming-desktop.png" });
    await preview.setViewportSize({ width: 360, height: 800 });
    await checkPanelStyles();
    assert.equal(await preview.locator("#upcoming-list").evaluate((list) => list.clientHeight <= 320 && list.scrollWidth > list.clientWidth && list.scrollHeight <= list.clientHeight), true);
    assert.equal(await preview.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await preview.locator("#upcoming-section").screenshot({ path: "test-results/upcoming-mobile.png" });
    // Midnight swaps the earliest episode using cached dates without a manual refresh.
    await preview.clock.fastForward(13 * 60 * 60 * 1000);
    await preview.waitForFunction(() => document.querySelector('.upcoming-entry[data-show="30000"] .upcoming-copy')?.textContent === "S2 E2");
    await preview.evaluate(() => localStorage.setItem("next-episode:upcoming-window", "invalid"));
    await preview.reload();
    assert.equal(await preview.locator("#upcoming-window").inputValue(), "30");
    await preview.request.post(`${base}/api/import`, { data: { version: 1, shows: [], lists: [] } });
    await preview.reload();
    await preview.getByText("No episodes announced for the next 30 days.", { exact: true }).waitFor();
    await preview.locator("#upcoming-window").selectOption("90");
    await preview.getByText("No episodes announced for the next 90 days.", { exact: true }).waitFor();
  } finally {
    await page.request.post(`${base}/api/import`, { data: backup });
    await context.close();
  }
}
