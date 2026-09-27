import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progress,
  watchStatus,
  inWatchlist,
  matchesTab,
} from "../public/model.js";

const episode = (season, number, date = "2026-01-01") => ({
  season_number: season,
  episode_number: number,
  air_date: date,
});
const show = (changes) => ({
  episodes: [episode(1, 1), episode(1, 2)],
  watched: [],
  episodeCount: 2,
  seriesStatus: "Returning Series",
  statusOverride: null,
  ...changes,
});
test("progress distinguishes not started, partially watched, and caught up", () => {
  assert.equal(watchStatus(show(), "2026-09-26"), "Not started");
  assert.equal(
    watchStatus(show({ watched: ["1:1"] }), "2026-09-26"),
    "Watching",
  );
  assert.equal(
    watchStatus(show({ watched: ["1:1", "1:2"] }), "2026-09-26"),
    "Caught Up",
  );
});
test("finished ended and canceled series become completed", () => {
  for (const seriesStatus of ["Ended", "Canceled"])
    assert.equal(
      watchStatus(
        show({ watched: ["1:1", "1:2"], seriesStatus }),
        "2026-09-26",
      ),
      "Completed",
    );
});
test("newly aired episode moves caught up show back to watching", () => {
  const s = show({
    watched: ["1:1"],
    episodes: [episode(1, 1), episode(1, 2, "2026-09-27")],
  });
  assert.equal(watchStatus(s, "2026-09-26"), "Caught Up");
  assert.equal(watchStatus(s, "2026-09-27"), "Watching");
});
test("unknown, future, and missing episodes prevent false completion", () => {
  for (const date of [null, "2027-01-01"]) {
    assert.equal(
      watchStatus(
        show({
          watched: ["1:1"],
          seriesStatus: "Ended",
          episodes: [episode(1, 1), episode(1, 2, date)],
        }),
        "2026-09-26",
      ),
      "Caught Up",
    );
  }
  assert.equal(
    watchStatus(
      show({ watched: ["1:1", "1:2"], seriesStatus: "Ended", episodeCount: 3 }),
      "2026-09-26",
    ),
    "Caught Up",
  );
});
test("specials do not count toward completion or next episode", () => {
  const s = show({
    watched: ["1:1", "1:2"],
    seriesStatus: "Ended",
    episodes: [episode(0, 1), episode(1, 1), episode(1, 2)],
  });
  assert.equal(watchStatus(s, "2026-09-26"), "Completed");
  assert.equal(progress(s, "2026-09-26").total, 2);
});
test("dropped and manual corrections persist over automatic status", () => {
  assert.equal(watchStatus(show({ statusOverride: "Paused" })), "Paused");
  assert.equal(watchStatus(show({ statusOverride: "Dropped" })), "Dropped");
  assert.equal(watchStatus(show({ statusOverride: "Watching" })), "Watching");
  assert.equal(
    watchStatus(show({ statusOverride: "Dropped", watched: ["1:1", "1:2"] })),
    "Dropped",
  );
  assert.equal(watchStatus(show({ statusOverride: "Completed" })), "Completed");
});
test("legacy show membership is preserved before normalization", () => {
  assert.equal(inWatchlist(show()), true);
  assert.equal(matchesTab(show(), "All"), false);
  assert.equal(matchesTab(show({ watchlist: false }), "All"), true);
  assert.equal(inWatchlist(show({ watched: ["1:1"] })), false);
  assert.equal(inWatchlist(show({ watchlist: false })), false);
  assert.equal(watchStatus(show({ rating: 5 })), "Not started");
  assert.equal(
    watchStatus(show({ episodes: [], episodeCount: 0 })),
    "Not started",
  );
  assert.equal(
    watchStatus(show({ episodes: [episode(1, 1, "2099-01-01")] })),
    "Not started",
  );
  const s = show({ watched: ["1:1"] });
  assert.equal(watchStatus(s), "Watching");
  s.watched = [];
  assert.equal(watchStatus(s), "Not started");
  // A watched special counts as starting a show, but not toward regular completion.
  assert.equal(
    watchStatus(
      show({ watched: ["0:1"], episodes: [episode(0, 1), episode(1, 1)] }),
    ),
    "Watching",
  );
});
test("tracking and watchlist flags are independent even without progress", () => {
  for (const tracked of [true, false]) {
    const s = show({ tracked, watchlist: false });
    assert.equal(matchesTab(s, "All"), tracked);
    assert.equal(watchStatus(s), tracked ? "Watching" : "Not started");
    s.watchlist = true;
    assert.equal(matchesTab(s, "All"), tracked);
    assert.equal(matchesTab(s, "Watching"), tracked);
    assert.equal(inWatchlist(s), true);
    s.watchlist = false;
    assert.equal(matchesTab(s, "All"), tracked);
  }
});
test("explicit watchlist flags overlap every status and stay in All without changing progress", () => {
  for (const statusOverride of [
    "Watching",
    "Paused",
    "Caught Up",
    "Completed",
    "Dropped",
  ]) {
    const s = show({ watched: ["1:1"], statusOverride, watchlist: true });
    assert.equal(watchStatus(s), statusOverride);
    assert.equal(matchesTab(s, statusOverride), true);
    assert.equal(matchesTab(s, "Watchlist"), true);
    assert.equal(matchesTab(s, "All"), true);
    s.watched.push("1:2");
    assert.equal(inWatchlist(s), true);
    s.watchlist = false;
    assert.equal(matchesTab(s, "All"), true);
    assert.equal(matchesTab(s, "Watchlist"), false);
    assert.equal(watchStatus(s), statusOverride);
  }
});
