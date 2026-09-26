import { test } from "node:test";
import assert from "node:assert/strict";
import { progress, watchStatus } from "../public/model.js";

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
  assert.equal(watchStatus(show(), "2026-09-26"), "Watching");
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
  assert.equal(
    watchStatus(show({ statusOverride: "Dropped", watched: ["1:1", "1:2"] })),
    "Dropped",
  );
  assert.equal(watchStatus(show({ statusOverride: "Completed" })), "Completed");
});
