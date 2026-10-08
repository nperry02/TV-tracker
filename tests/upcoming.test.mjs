import { test } from "node:test";
import assert from "node:assert/strict";
import { upcomingEpisodes, upcomingWindow } from "../public/model.js";

// Build one cached episode with a known date and optional metadata overrides.
function episode(date, overrides = {}) {
  return { season_number: 1, episode_number: 1, air_date: date, ...overrides };
}

// Build a saved show without consulting network metadata or personal library data.
function show(id, episodes, overrides = {}) {
  return { id, name: `Show ${id}`, tracked: true, watchlist: false, watched: [], episodes, ...overrides };
}

test("upcoming windows include their final day and exclude today's releases", () => {
  const shows = [show(1, [episode("2026-10-08")]), show(2, [episode("2026-10-09")]),
    show(3, [episode("2026-11-07")]), show(4, [episode("2026-11-08")]),
    show(5, [episode("2027-01-06")]), show(6, [episode("2027-01-07")])];
  assert.deepEqual(upcomingEpisodes(shows, 30, "2026-10-08").map(({ show, daysUntil }) => [show.id, daysUntil]), [[2, 1], [3, 30]]);
  assert.deepEqual(upcomingEpisodes(shows, 90, "2026-10-08").map(({ show, daysUntil }) => [show.id, daysUntil]), [[2, 1], [3, 30], [4, 31], [5, 90]]);
});

test("all saved statuses and Watchlist are eligible except Dropped", () => {
  const episodes = [episode("2026-10-09")];
  const shows = [show(1, episodes), show(2, episodes, { statusOverride: "Paused" }),
    show(3, episodes, { statusOverride: "Completed" }), show(4, episodes, { statusOverride: "Caught Up" }),
    show(5, episodes, { tracked: false, watchlist: true }),
    show(6, episodes, { statusOverride: "Dropped", watchlist: true }),
    show(7, episodes, { tracked: false, watchlist: false })];
  assert.deepEqual(upcomingEpisodes(shows, 30, "2026-10-08").map(({ show }) => show.id), [1, 2, 3, 4, 5]);
});

test("choose one earliest episode per show with deterministic same-day ties", () => {
  const episodes = [episode("2026-10-11"), episode("2026-10-10", { season_number: 2 }),
    episode("2026-10-10", { episode_number: 3 }), episode("2026-10-10", { episode_number: 2 })];
  const shows = [show(1, episodes, { name: "Zulu" }), show(2, episodes, { name: "Alpha" }),
    show(3, [episode("2026-10-09")], { name: "Later alphabetically" })];
  const original = structuredClone(shows);
  const selected = upcomingEpisodes(shows, 30, "2026-10-08");
  assert.deepEqual(selected.map(({ show }) => show.id), [3, 2, 1]);
  assert.equal(selected[1].episode.season_number, 1);
  assert.equal(selected[1].episode.episode_number, 2);
  assert.deepEqual(shows, original);
});

test("specials, watched episodes, past and invalid dates do not appear", () => {
  const shows = [show(1, [episode("2026-10-09", { season_number: 0 }), episode("2026-10-07"),
    ...[null, "", "bad", "2026-02-30"].map((date, index) => episode(date, { episode_number: index + 2 }))]),
    show(2, [episode("2026-10-09"), episode("2026-10-10", { episode_number: 2 })], { watched: ["1:1"] })];
  assert.equal(upcomingEpisodes(shows, 30, "2026-10-08").length, 1);
  assert.equal(upcomingEpisodes(shows, 30, "2026-10-08")[0].episode.episode_number, 2);
  assert.deepEqual(upcomingEpisodes([], 30, "2026-10-08"), []);
  assert.deepEqual(upcomingEpisodes(shows, 30, "invalid"), []);
});

test("calendar-day distances remain exact across DST, leap days, and year changes", () => {
  for (const [date, future, distance] of [["2026-03-07", "2026-03-09", 2],
    ["2026-10-31", "2026-11-02", 2], ["2028-02-28", "2028-03-01", 2], ["2026-12-31", "2027-01-01", 1]])
    assert.equal(upcomingEpisodes([show(1, [episode(future)])], 30, date)[0].daysUntil, distance);
});

test("window preferences default safely and date rollover removes newly aired entries", () => {
  for (const value of [null, undefined, "", "invalid", 60, false]) assert.equal(upcomingWindow(value), 30);
  assert.equal(upcomingWindow("90"), 90);
  const shows = [show(1, [episode("2026-10-09"), episode("2026-10-10", { episode_number: 2 })])];
  assert.equal(upcomingEpisodes(shows, 30, "2026-10-08")[0].episode.episode_number, 1);
  assert.equal(upcomingEpisodes(shows, 30, "2026-10-09")[0].episode.episode_number, 2);
  assert.deepEqual(upcomingEpisodes(shows, 30, "2026-10-10"), []);
});
