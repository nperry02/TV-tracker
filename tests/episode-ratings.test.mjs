import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { episodeRating, validEpisodeRatingData, libraryStats, progress, watchStatus } from "../public/model.js";

test("episode thumbs are optional, independent ratings on watched episode keys", () => {
  const show = { id: 1, tracked: true, watched: ["0:1", "1:1"], rating: 4, genres: [],
    seriesStatus: "Returning Series", episodeCount: 2,
    episodes: [{ season_number: 0, episode_number: 1, air_date: "2020-01-01", runtime: 10 },
      { season_number: 1, episode_number: 1, air_date: "2020-01-01", runtime: 40 }] };
  assert.equal(episodeRating(show, "1:1"), null);
  assert.equal(validEpisodeRatingData(show), true);
  assert.equal(validEpisodeRatingData({ ...show, episodeRatings: {} }), true);
  const rated = { ...show, episodeRatings: { "0:1": "down", "1:1": "up" } };
  assert.equal(episodeRating(rated, "1:1"), "up");
  assert.equal(episodeRating(rated, "0:1"), "down");
  assert.equal(episodeRating(rated, "1:2"), null);
  assert.equal(validEpisodeRatingData(rated), true);
  assert.deepEqual(libraryStats([rated]), libraryStats([show]));
  assert.deepEqual(progress(rated), progress(show));
  assert.equal(watchStatus(rated), watchStatus(show));
  // Refreshed metadata can omit a previously watched episode without losing its thumb.
  assert.equal(validEpisodeRatingData({ ...rated, episodes: [] }), true);
  for (const episodeRatings of [null, [], true, "up", { "1:1": null }, { "1:1": 1 },
    { "1:1": "UP" }, { "1:1": "neutral" }, { "1:2": "up" }, { invalid: "down" }])
    assert.equal(validEpisodeRatingData({ ...show, episodeRatings }), false);
});

test("episode thumbs persist atomically and clear with original progress", async (t) => {
  // Temporary storage and fixture metadata never touch the user's library or TMDB.
  const directory = mkdtempSync(join(tmpdir(), "tv-episode-ratings-"));
  const file = join(directory, "library.json");
  let child;
  // Start an isolated fixture server and reject startup failures promptly.
  async function start() {
    child = spawn(process.execPath, ["--import", "./tests/tmdb-fixture.mjs", "server.mjs"], {
      env: { ...process.env, PORT: "0", TV_DATA_FILE: file, TMDB_TOKEN: "fixture" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", errors = "";
    child.stderr.on("data", chunk => { errors += chunk; });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Fixture startup timed out: ${errors}`)), 10000);
      child.once("exit", () => { clearTimeout(timer); reject(new Error(errors || "Server exited")); });
      child.stdout.on("data", chunk => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) { clearTimeout(timer); resolve(match[0]); }
      });
    });
  }
  // Stop the server before restarting or removing its isolated storage.
  async function stop() {
    if (child?.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  let base = await start();
  // Send a JSON request and preserve unsuccessful responses for validation assertions.
  async function request(path, method = "GET", body) {
    const response = await fetch(`${base}${path}`, { method, headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, data: await response.json() };
  }
  // Build an exact episode-thumb mutation using the existing show PATCH endpoint.
  const thumb = (rating, season = 1, episode = 1) => ({ episodeRating: { season, episode, rating } });
  // Build an original-progress mutation for individual, through, and season actions.
  const watched = (value, action = "episode", season = 1, episode = 1) => ({ progress: { action, season, episode, watched: value } });
  const path = "/api/shows/1396";
  assert.equal((await request(path, "POST", {})).status, 201);
  assert.equal((await request(path, "PATCH", thumb("up"))).status, 400);
  assert.equal((await request("/api/shows/999", "PATCH", thumb("up"))).status, 404);

  // Continue Watching can mark and rate in one atomic mutation.
  const first = await request(path, "PATCH", { ...watched(true), ...thumb("up") });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.watched, ["1:1"]);
  assert.deepEqual(first.data.episodeRatings, { "1:1": "up" });
  assert.equal(typeof first.data.lastWatchedAt, "string");
  const original = first.data;
  const changed = await request(path, "PATCH", thumb("down"));
  assert.deepEqual(changed.data.episodeRatings, { "1:1": "down" });
  for (const key of ["watched", "rating", "seasonRatings", "lastWatchedAt", "lastRewatchedAt", "rewatchCounts", "latestUpdate", "statusOverride"])
    assert.deepEqual(changed.data[key], original[key]);
  assert.deepEqual((await request(path, "PATCH", thumb("down"))).data.episodeRatings, { "1:1": "down" });
  assert.equal((await request(path, "PATCH", thumb(null))).data.episodeRatings, undefined);
  assert.equal((await request(path, "PATCH", thumb(null, 1, 2))).status, 200);

  // Reject bad combined mutations before any progress, recency, or metadata is saved.
  for (const episodeRating of [null, {}, [], { season: "1", episode: 1, rating: "up" },
    { season: 1, episode: "1", rating: "up" }, { season: 1, episode: 99, rating: "up" },
    ...[true, 1, "neutral", "UP"].map(rating => ({ season: 1, episode: 2, rating }))]) {
    const before = readFileSync(file, "utf8");
    assert.equal((await request(path, "PATCH", { ...watched(true, "episode", 1, 2), episodeRating })).status, 400);
    assert.equal(readFileSync(file, "utf8"), before);
  }

  // Regular episodes and specials retain thumbs across refresh, backup, and restart.
  const specialFixture = (await request("/api/export")).data;
  specialFixture.shows[0].seasons.push({ number: 0, name: "Specials" });
  specialFixture.shows[0].episodes.push({ season_number: 0, episode_number: 1, name: "Special", air_date: "2020-01-01" });
  assert.equal((await request("/api/import", "POST", specialFixture)).status, 200);
  await request(path, "PATCH", { ...watched(true, "season"), ...thumb("up") });
  await request(path, "PATCH", thumb("down", 1, 2));
  await request(path, "PATCH", { ...watched(true, "episode", 0, 1), ...thumb("up", 0, 1) });
  await request(path, "PATCH", { ...watched(true, "episode", 2, 1), ...thumb("down", 2, 1) });
  await request(path, "PATCH", { rewatch: { action: "increment", season: 1, episode: 1 } });
  const ratings = { "1:1": "up", "1:2": "down", "0:1": "up", "2:1": "down" };
  assert.deepEqual((await request(`${path}/refresh`, "POST", {})).data.episodeRatings, ratings);
  const backup = (await request("/api/export")).data;
  assert.deepEqual(backup.shows[0].episodeRatings, ratings);
  const beforeImport = readFileSync(file, "utf8");
  for (const badRatings of [null, [], { "1:1": null }, { "1:1": "bad" }, { "2:3": "up" }]) {
    const bad = structuredClone(backup);
    bad.shows[0].episodeRatings = badRatings;
    assert.equal((await request("/api/import", "POST", bad)).status, 400);
    assert.equal(readFileSync(file, "utf8"), beforeImport);
  }
  assert.equal((await request("/api/import", "POST", backup)).status, 200);
  await stop();
  base = await start();
  assert.deepEqual((await request("/api/library")).data.shows[0].episodeRatings, ratings);

  // Individual and bulk clears affect only the cleared episodes and keep other seasons intact.
  const cleared = await request(path, "PATCH", watched(false));
  assert.deepEqual(cleared.data.episodeRatings, { "1:2": "down", "0:1": "up", "2:1": "down" });
  assert.equal(cleared.data.rewatchCounts, undefined);
  assert.deepEqual((await request(path, "PATCH", watched(false, "season"))).data.episodeRatings, { "0:1": "up", "2:1": "down" });
  assert.deepEqual((await request(path, "PATCH", watched(false, "through", 2, 1))).data.episodeRatings, { "0:1": "up" });
  assert.equal((await request(path, "PATCH", watched(false, "season", 0))).data.episodeRatings, undefined);

  // Removing tracked membership clears every thumb even when Watchlist keeps the show saved.
  await request("/api/import", "POST", backup);
  const removed = await request(path, "PATCH", { tracked: false, watchlist: true });
  assert.equal(removed.data.episodeRatings, undefined);
  assert.deepEqual(removed.data.watched, []);
  const legacy = structuredClone(backup);
  delete legacy.shows[0].episodeRatings;
  assert.equal((await request("/api/import", "POST", legacy)).status, 200);
  assert.equal((await request("/api/library")).data.shows[0].episodeRatings, undefined);

  // Unaired progress cannot smuggle a rating into an unwatched episode.
  const future = structuredClone(legacy);
  future.shows[0].watched = [];
  delete future.shows[0].rewatchCounts;
  future.shows[0].episodes[0].air_date = "2099-01-01";
  assert.equal((await request("/api/import", "POST", future)).status, 200);
  const beforeFuture = readFileSync(file, "utf8");
  const episode = future.shows[0].episodes[0];
  assert.equal((await request(path, "PATCH", {
    ...watched(true, "episode", episode.season_number, episode.episode_number),
    ...thumb("up", episode.season_number, episode.episode_number),
  })).status, 400);
  assert.equal(readFileSync(file, "utf8"), beforeFuture);
});
