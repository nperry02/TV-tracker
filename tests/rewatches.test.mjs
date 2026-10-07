import { test } from "node:test";
import assert from "node:assert/strict";
import { completeRewatches, episodeRewatches, validRewatchData, libraryStats, progress, watchStatus, reconcileUpdates } from "../public/model.js";

// Build a partially watched show with regular episodes, a special, and a future release.
function fixture(overrides = {}) {
  return { id: 1, tracked: true, watched: ["0:1", "1:1", "1:2"], rating: 4,
    genres: [], seriesStatus: "Returning Series", episodeCount: 3,
    episodes: [
      { season_number: 0, episode_number: 1, air_date: "2020-01-01", runtime: 10 },
      { season_number: 1, episode_number: 1, air_date: "2020-01-01", runtime: 40 },
      { season_number: 1, episode_number: 2, air_date: "2020-01-01" },
      { season_number: 2, episode_number: 1, air_date: "2099-01-01", runtime: 60 },
    ], typicalRuntime: 50, ...overrides };
}

test("complete repeat counts use minimum aired counts and exclude specials from shows", () => {
  const show = fixture({ rewatchCounts: { "1:1": 3, "1:2": 2, "0:1": 4 } });
  assert.equal(completeRewatches(show, 1, "2026-10-07"), 2);
  assert.equal(completeRewatches(show, null, "2026-10-07"), 2);
  assert.equal(completeRewatches(show, 0, "2026-10-07"), 4);
  assert.equal(completeRewatches(show, 2, "2026-10-07"), 0);
  assert.equal(completeRewatches(show, null, "2099-01-01"), 0);
  assert.equal(completeRewatches(fixture()), 0);
  assert.equal(episodeRewatches({ ...show, watched: [] }, "1:1"), 0);
});

test("repeat watches multiply runtime totals without changing unique progress or status", () => {
  const original = fixture();
  const repeated = fixture({ rewatchCounts: { "1:1": 2, "1:2": 1, "0:1": 3 } });
  const before = libraryStats([original]);
  const after = libraryStats([repeated]);
  assert.equal(after.episodesWatched, 9);
  assert.equal(after.estimatedMinutes, 260);
  assert.equal(after.runtimeCoveredEpisodes, 9);
  assert.equal(after.runtimeEstimatedEpisodes, 2);
  for (const key of ["seasonsCompleted", "watchedRegularEpisodes", "airedRegularEpisodes", "progressPercent", "trackedShows"])
    assert.equal(after[key], before[key]);
  assert.deepEqual(progress(repeated), progress(original));
  assert.equal(watchStatus(repeated), watchStatus(original));
  const baseline = reconcileUpdates(original);
  assert.deepEqual(reconcileUpdates({ ...baseline, rewatchCounts: repeated.rewatchCounts }, { source: "personal" }).latestUpdate, baseline.latestUpdate);
});

test("backup repeat data is optional and accepts only positive safe counts on watched keys", () => {
  assert.equal(validRewatchData(fixture()), true);
  assert.equal(validRewatchData(fixture({ rewatchCounts: {} })), true);
  assert.equal(validRewatchData(fixture({ rewatchCounts: { "1:1": 2 } })), true);
  for (const rewatchCounts of [null, [], false, { "1:1": 0 }, { "1:1": -1 },
    { "1:1": 1.5 }, { "1:1": "2" }, { "2:1": 1 }, { invalid: 1 }, { "1:1": Number.MAX_SAFE_INTEGER }])
    assert.equal(validRewatchData(fixture({ rewatchCounts })), false);
});
