import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { reconcileUpdates } from "../public/model.js";

test("local API preserves progress, ratings, and overrides across restarts", async (t) => {
  // Build an isolated library with regular, future, unknown, and special episodes.
  const directory = mkdtempSync(join(tmpdir(), "tv-tracker-test-"));
  const file = join(directory, "library.json");
  const episodes = [
    { season_number: 0, episode_number: 1, air_date: "2020-01-01", runtime: 12 },
    ...[1, 2].flatMap((season_number) =>
      [1, 2].map((episode_number) => ({
        season_number,
        episode_number,
        air_date: "2020-01-01",
        runtime: 44,
      })),
    ),
    { season_number: 2, episode_number: 3, air_date: "2099-01-01" },
    { season_number: 2, episode_number: 4, air_date: null },
  ];
  const untouchedShow = reconcileUpdates({
    id: 2,
    name: "Untouched sentinel",
    watched: ["1:1"],
    rating: 5,
    seasonRatings: { 1: 4.5 },
    statusOverride: "Completed",
    tracked: true,
    watchlist: true,
    episodes: [{ season_number: 1, episode_number: 1, air_date: "2020-01-01" }],
    seasons: [{ number: 1 }],
    customMetadata: { mustRemain: "exactly the same" },
  });
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      shows: [
        {
          id: 1,
          watched: [],
          rating: null,
          seasonRatings: {},
          statusOverride: null,
          typicalRuntime: 45,
          episodes,
          seasons: [{ number: 0 }, { number: 1 }, { number: 2 }],
        },
        untouchedShow,
      ],
    }),
  );
  let child;
  // Start an isolated fixture server and resolve its dynamically assigned address.
  async function start() {
    child = spawn(process.execPath, ["server.mjs"], {
      env: {
        ...process.env,
        PORT: "0",
        TV_DATA_FILE: file,
        TMDB_TOKEN: "",
        TMDB_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      errors = "";
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    return await new Promise((resolve, reject) => {
      child.once("exit", () => reject(new Error(`Server exited: ${errors}`)));
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  // Stop the fixture server and wait for its process to exit.
  async function stop() {
    if (child && child.exitCode === null) {
      const done = once(child, "exit");
      child.kill();
      await done;
    }
  }

  // Cleanup runs even when an assertion or server request fails.
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
  // Send a show mutation to the fixture API and return its status and JSON response.
  async function patch(body) {
    const res = await fetch(`${base}/api/shows/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }

  // Exercise independent membership before adding progress and ratings.
  let result = await patch({ watchlist: false });
  assert.equal(result.data.tracked, false);
  assert.equal(result.data.watchlist, false);
  const promoted = await (
    await fetch(`${base}/api/shows/1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "library" }),
    })
  ).json();
  assert.equal(promoted.tracked, true);
  assert.equal(promoted.watchlist, false);
  const flagged = await (
    await fetch(`${base}/api/shows/1`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: "watchlist" }),
    })
  ).json();
  assert.equal(flagged.tracked, true);
  assert.equal(flagged.watchlist, true);
  result = await patch({
    progress: { action: "through", season: 2, episode: 1, watched: true },
    rating: 4.5,
    seasonRating: { season: 1, rating: 3.5 },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.watched, ["1:1", "1:2", "2:1"]);
  assert.match(result.data.lastWatchedAt, /^\d{4}-\d{2}-\d{2}T/);
  let firstWatchedAt = result.data.lastWatchedAt;
  // Repeat writes preserve progress, status, update news, and Continue Watching order.
  const beforeRewatch = structuredClone(result.data);
  for (let count = 1; count <= 2; count++) {
    result = await patch({ rewatch: { action: "increment", season: 1, episode: 1 } });
    assert.equal(result.status, 200);
    assert.equal(result.data.rewatchCounts["1:1"], count);
  }
  for (const key of ["watched", "statusOverride", "lastWatchedAt", "latestUpdate", "rating"])
    assert.deepEqual(result.data[key], beforeRewatch[key]);
  // Reject invalid repeat requests without mutating the saved count.
  for (const rewatch of [null, { action: "increment", season: 2, episode: 2 },
    { action: "increment", season: 99, episode: 1 }, { action: "other", season: 1, episode: 1 },
    ...[-1, 1.5, "2", Number.MAX_SAFE_INTEGER].map((count) => ({ action: "set", season: 1, episode: 1, count }))])
    assert.equal((await patch({ rewatch })).status, 400);
  assert.equal(JSON.parse(readFileSync(file)).shows[0].rewatchCounts["1:1"], 2);
  result = await patch({ rewatch: { action: "set", season: 1, episode: 1, count: 4 } });
  assert.equal(result.data.rewatchCounts["1:1"], 4);
  result = await patch({ rewatch: { action: "set", season: 1, episode: 1, count: 0 } });
  assert.equal(result.data.rewatchCounts, undefined);
  await patch({ rewatch: { action: "increment", season: 1, episode: 2 } });
  result = await patch({ progress: { action: "episode", season: 1, episode: 2, watched: false } });
  assert.equal(result.data.rewatchCounts, undefined);
  // Restore original progress so the remaining API scenarios retain their fixture state.
  result = await patch({ progress: { action: "episode", season: 1, episode: 2, watched: true } });
  firstWatchedAt = result.data.lastWatchedAt;
  await patch({ rewatch: { action: "increment", season: 1, episode: 1 } });
  await patch({ rewatch: { action: "increment", season: 2, episode: 1 } });
  result = await patch({ progress: { action: "season", season: 1, watched: false } });
  assert.deepEqual(result.data.rewatchCounts, { "2:1": 1 });
  await patch({ progress: { action: "season", season: 1, watched: true } });
  result = await patch({ rewatch: { action: "set", season: 2, episode: 1, count: 0 } });
  firstWatchedAt = result.data.lastWatchedAt;
  assert.equal(result.data.rating, 4.5);
  assert.equal(result.data.seasonRatings["1"], 3.5);
  result = await patch({ watchlist: true });
  assert.equal(result.data.watchlist, true);
  assert.deepEqual(result.data.watched, ["1:1", "1:2", "2:1"]);
  assert.equal(result.data.rating, 4.5);
  assert.equal((await patch({ watchlist: "yes" })).status, 400);
  result = await patch({ statusOverride: "Paused" });
  assert.equal(result.data.statusOverride, "Paused");
  result = await patch({
    progress: { action: "episode", season: 1, episode: 1, watched: false },
  });
  assert.equal(result.data.statusOverride, "Paused");
  assert.equal(result.data.lastWatchedAt, firstWatchedAt);
  result = await patch({
    progress: { action: "episode", season: 1, episode: 1, watched: true },
  });
  assert.equal(result.data.statusOverride, null);
  result = await patch({
    progress: { action: "season", season: 2, watched: true },
    statusOverride: "Dropped",
  });
  assert.deepEqual(result.data.watched, ["1:1", "1:2", "2:1", "2:2"]);
  result = await patch({
    progress: { action: "episode", season: 1, episode: 1, watched: false },
  });
  assert.deepEqual(result.data.watched, ["1:2", "2:1", "2:2"]);
  assert.equal((await patch({ rating: 4.2 })).status, 400);
  assert.equal((await patch({ statusOverride: "Bogus" })).status, 400);
  assert.equal(
    (await patch({ seasonRating: { season: 99, rating: 2 } })).status,
    400,
  );
  assert.equal(
    (
      await patch({
        progress: { action: "episode", season: 1, episode: 99, watched: true },
      })
    ).status,
    400,
  );

  // Reject cross-origin writes, private files, missing credentials, and bad pages.
  const hostile = await fetch(`${base}/api/shows/1`, {
    method: "PATCH",
    headers: {
      Origin: "https://example.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ rating: 1 }),
  });
  assert.equal(hostile.status, 403);
  assert.equal((await fetch(`${base}/.env`)).status, 404);
  assert.equal((await fetch(`${base}/api/search?q=test`)).status, 503);
  for (const page of ["0", "-1", "1.5", "501", "oops"]) {
    assert.equal(
      (await fetch(`${base}/api/search?q=test&page=${page}`)).status,
      400,
    );
  }
  await patch({ rewatch: { action: "increment", season: 1, episode: 2 } });
  const exported = await (await fetch(`${base}/api/export`)).json();
  assert.equal(exported.shows[0].rating, 4.5);
  assert.deepEqual(exported.shows[0].rewatchCounts, { "1:2": 1 });
  // Backup validation rejects bad repeat data before replacing the current library.
  const invalidBackup = structuredClone(exported);
  invalidBackup.shows[0].rewatchCounts["1:2"] = -1;
  assert.equal((await fetch(`${base}/api/import`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(invalidBackup) })).status, 400);
  assert.equal((await fetch(`${base}/api/import`, { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(exported) })).status, 200);

  // Restart from disk before verifying persistence and destructive membership changes.
  await stop();
  base = await start();
  const saved = await (await fetch(`${base}/api/library`)).json();
  assert.equal(saved.shows[0].statusOverride, "Dropped");
  assert.equal(saved.shows[0].rating, 4.5);
  assert.equal(saved.shows[0].watchlist, true);
  assert.equal(saved.shows[0].tracked, true);
  assert.equal(saved.shows[0].typicalRuntime, 45);
  assert.deepEqual(saved.shows[0].rewatchCounts, { "1:2": 1 });
  assert.equal(saved.shows[0].episodes[0].runtime, 12);
  result = await patch({ tracked: false });
  assert.equal(result.data.tracked, false);
  assert.equal(result.data.watchlist, true);
  assert.equal(result.data.statusOverride, null);
  assert.equal(result.data.rating, null);
  assert.deepEqual(result.data.seasonRatings, {});
  assert.deepEqual(result.data.watched, []);
  assert.equal(result.data.rewatchCounts, undefined);
  assert.equal(result.data.lastWatchedAt, null);
  assert.deepEqual(
    JSON.parse(readFileSync(file)).shows.find((show) => show.id === 2),
    untouchedShow,
  );
  assert.equal((await patch({ tracked: "no" })).status, 400);
  result = await patch({ statusOverride: "Watching" });
  assert.equal(result.data.tracked, true);
  assert.equal(result.data.watchlist, true);
  result = await patch({ watchlist: false });
  assert.equal(result.data.statusOverride, "Watching");
  assert.equal(result.data.watchlist, false);
  assert.equal(result.data.rating, null);
  assert.deepEqual(result.data.watched, []);
  assert.deepEqual(saved.shows[0].watched, ["1:2", "2:1", "2:2"]);
  await fetch(`${base}/api/shows/1`, { method: "DELETE" });
  const afterDelete = JSON.parse(readFileSync(file));
  assert.equal(afterDelete.shows.length, 1);
  assert.deepEqual(afterDelete.shows[0], untouchedShow);
});
