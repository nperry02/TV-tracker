import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileUpdates, validUpdateData } from "../public/model.js";

// Build a caught-up fixture with a known future premiere.
function fixture(overrides = {}) {
  return { id: 1, tracked: true, watched: ["1:1"], seriesStatus: "Returning Series", episodeCount: 2,
    episodes: [{ season_number: 1, episode_number: 1, air_date: "2020-01-01" },
      { season_number: 2, episode_number: 1, air_date: "2026-10-10" }], ...overrides };
}

test("baseline is quiet and cached release dates create news only once", () => {
  const baseline = reconcileUpdates(fixture(), { now: "2026-10-09T12:00:00Z" });
  assert.equal(baseline.latestUpdate, null);
  const released = reconcileUpdates(baseline, { now: "2026-10-10T12:00:00Z" });
  assert.equal(released.latestUpdate.type, "episodes");
  assert.equal(released.latestUpdate.before, "Caught Up");
  assert.equal(released.latestUpdate.after, "Watching");
  assert.deepEqual(reconcileUpdates(released, { now: "2026-10-11T12:00:00Z" }).latestUpdate, released.latestUpdate);
});

test("cancellation replaces premiere news without falsely completing remaining episodes", () => {
  const baseline = reconcileUpdates(fixture({ episodes: [fixture().episodes[0]] }), { now: "2026-10-01T12:00:00Z" });
  const announcement = reconcileUpdates({ ...baseline, episodes: fixture().episodes }, { now: "2026-10-02T12:00:00Z" });
  assert.equal(announcement.latestUpdate.type, "premiere");
  const canceled = reconcileUpdates({ ...announcement, seriesStatus: "Canceled" }, { now: "2026-10-03T12:00:00Z" });
  assert.equal(canceled.latestUpdate.type, "series");
  assert.equal(canceled.latestUpdate.after, "Caught Up");
});

test("paused and dropped shows get news without changing their manual status", () => {
  for (const statusOverride of ["Paused", "Dropped"]) {
    const baseline = reconcileUpdates(fixture({ statusOverride }), { now: "2026-10-09T12:00:00Z" });
    const released = reconcileUpdates(baseline, { now: "2026-10-10T12:00:00Z" });
    assert.equal(released.latestUpdate.after, statusOverride);
    assert.equal(released.latestUpdate.type, "episodes");
  }
});

test("personal changes respect unread news and activity preferences", () => {
  const baseline = reconcileUpdates(fixture(), { now: "2026-10-09T12:00:00Z" });
  const news = reconcileUpdates({ ...baseline, seriesStatus: "Canceled" }, { now: "2026-10-09T13:00:00Z" });
  const personal = reconcileUpdates({ ...news, statusOverride: "Paused" }, { source: "personal", now: "2026-10-09T14:00:00Z" });
  assert.deepEqual(personal.latestUpdate, news.latestUpdate);
  const read = { ...news, latestUpdate: { ...news.latestUpdate, readAt: "2026-10-09T14:00:00Z" } };
  assert.equal(reconcileUpdates({ ...read, statusOverride: "Paused" }, { source: "personal" }).latestUpdate.source, "personal");
  assert.equal(reconcileUpdates({ ...baseline, statusOverride: "Paused" }, { source: "personal", includeActivity: false }).latestUpdate, null);
});

test("expiry is exactly 30 days and malformed backup records are rejected", () => {
  const baseline = reconcileUpdates(fixture(), { now: "2026-10-09T12:00:00Z" });
  const news = reconcileUpdates({ ...baseline, seriesStatus: "Canceled" }, { now: "2026-10-09T13:00:00Z" });
  assert.ok(reconcileUpdates(news, { now: "2026-11-08T12:59:59Z" }).latestUpdate);
  // Hold episode metadata steady so expiry is tested independently of release news.
  const steady = { ...news, episodes: [fixture().episodes[0]] };
  steady.updateSnapshot.aired = ["1:1"];
  steady.updateSnapshot.premieres = [];
  assert.equal(reconcileUpdates(steady, { now: "2026-11-08T13:00:00Z" }).latestUpdate, null);
  assert.equal(validUpdateData(news), true);
  assert.equal(validUpdateData({ latestUpdate: { detectedAt: "bad" } }), false);
});
