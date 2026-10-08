import { test } from "node:test";
import assert from "node:assert/strict";
import { metadataRefreshTiming, metadataRefreshOverview, metadataRefreshQueue } from "../public/model.js";

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-08T12:00:00Z");

// Make an isolated saved-show fixture with a chosen check age and watch status.
function savedShow(id, daysAgo, statusOverride = "Watching", extra = {}) {
  return { id, name: `Show ${id}`, tracked: true, watchlist: false, episodes: [], watched: [], statusOverride,
    refreshedAt: new Date(now.getTime() - daysAgo * DAY).toISOString(), ...extra };
}

test("refresh timing retains daily, weekly, and monthly membership rules", () => {
  for (const [status, interval] of [["Watching", 1], ["Caught Up", 1], ["Paused", 7], ["Completed", 30], ["Dropped", 30]]) {
    const timing = metadataRefreshTiming(savedShow(1, 0, status), now);
    assert.equal(timing.interval, interval * DAY);
    assert.equal(timing.dueDays, interval);
    assert.equal(timing.overdue, false);
    assert.equal(timing.dueAt, now.getTime() + interval * DAY);
  }
  assert.equal(metadataRefreshTiming(savedShow(2, 0, "Completed", { tracked: false, watchlist: true }), now).interval, 7 * DAY);
});

test("refresh eligibility uses the strict interval boundary and whole-day display values", () => {
  for (const [status, interval] of [["Watching", 1], ["Paused", 7], ["Completed", 30]]) {
    const entry = savedShow(1, interval, status);
    assert.equal(metadataRefreshTiming(entry, new Date(now.getTime() - 1)).overdue, false);
    assert.equal(metadataRefreshTiming(entry, now).overdue, false);
    assert.equal(metadataRefreshTiming(entry, new Date(now.getTime() + 1)).overdue, true);
    assert.equal(metadataRefreshTiming(entry, now).dueDays, 0);
    assert.deepEqual(metadataRefreshQueue([entry], now), []);
    assert.deepEqual(metadataRefreshQueue([entry], new Date(now.getTime() + 1)), [entry]);
  }
  const timing = metadataRefreshTiming(savedShow(1, 3.5), now);
  assert.equal(timing.elapsedDays, 3);
  assert.equal(timing.overdueDays, 2);
  assert.equal(timing.dueDays, 0);
  assert.equal(metadataRefreshTiming(savedShow(1, -1), now).elapsedDays, 0);
});

test("unknown check timestamps are immediately eligible without invented dates", () => {
  for (const refreshedAt of [undefined, null, "", "invalid"]) {
    const entry = savedShow(1, 0, "Completed", { refreshedAt });
    const timing = metadataRefreshTiming(entry, now);
    assert.equal(timing.overdue, true);
    assert.equal(timing.refreshedAt, null);
    assert.equal(timing.dueAt, null);
    assert.equal(timing.elapsedDays, null);
    assert.deepEqual(metadataRefreshQueue([entry], now), [entry]);
  }
});

test("overview prioritizes unknown and overdue checks without changing startup priority", () => {
  const entries = [savedShow(1, 20, "Completed"), savedShow(2, 2), savedShow(3, 40, "Dropped"),
    savedShow(4, 0, "Paused", { refreshedAt: "invalid", name: "Zulu" }),
    savedShow(5, 0, "Completed", { refreshedAt: null, name: "Alpha" }),
    savedShow(6, 2, "Watching", { name: "Alpha" }), savedShow(7, 8, "Paused"),
    savedShow(8, 1, "Completed", { tracked: false, watchlist: true })];
  const snapshot = structuredClone(entries);
  assert.deepEqual(metadataRefreshOverview(entries, now).map(({ show }) => show.id), [5, 4, 3, 7, 6, 2, 1, 8]);
  // Startup continues to prioritize interval length rather than overview age ordering.
  assert.deepEqual(metadataRefreshQueue(entries, now, 20).map(show => show.id), [6, 2, 7, 4, 5, 3]);
  assert.equal(metadataRefreshQueue(entries, now).length, 5);
  assert.deepEqual(entries, snapshot);
});

test("refresh intervals measure elapsed time across daylight-saving changes", () => {
  const spring = savedShow(1, 0, "Watching", { refreshedAt: "2026-03-07T12:00:00-05:00" });
  const before = new Date("2026-03-08T12:00:00-04:00");
  assert.equal(metadataRefreshTiming(spring, before).overdue, false);
  assert.equal(metadataRefreshTiming(spring, new Date("2026-03-08T13:00:00.001-04:00")).overdue, true);
  const fall = { ...spring, refreshedAt: "2026-10-31T12:00:00-04:00" };
  assert.equal(metadataRefreshTiming(fall, new Date("2026-11-01T12:00:00-05:00")).overdue, true);
});
