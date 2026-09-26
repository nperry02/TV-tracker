import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("local API preserves progress, ratings, and overrides across restarts", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "tv-tracker-test-"));
  const file = join(directory, "library.json");
  const episodes = [
    { season_number: 0, episode_number: 1, air_date: "2020-01-01" },
    ...[1, 2].flatMap((season_number) =>
      [1, 2].map((episode_number) => ({
        season_number,
        episode_number,
        air_date: "2020-01-01",
      })),
    ),
    { season_number: 2, episode_number: 3, air_date: "2099-01-01" },
    { season_number: 2, episode_number: 4, air_date: null },
  ];
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
          episodes,
          seasons: [{ number: 0 }, { number: 1 }, { number: 2 }],
        },
      ],
    }),
  );
  let child;
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
  async function stop() {
    if (child && child.exitCode === null) {
      const done = once(child, "exit");
      child.kill();
      await done;
    }
  }
  t.after(async () => {
    await stop();
    rmSync(directory, { recursive: true, force: true });
  });
  let base = await start();
  async function patch(body) {
    const res = await fetch(`${base}/api/shows/1`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  }
  let result = await patch({
    progress: { action: "through", season: 2, episode: 1, watched: true },
    rating: 4.5,
    seasonRating: { season: 1, rating: 3.5 },
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.watched, ["1:1", "1:2", "2:1"]);
  assert.equal(result.data.rating, 4.5);
  assert.equal(result.data.seasonRatings["1"], 3.5);
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
  const exported = await (await fetch(`${base}/api/export`)).json();
  assert.equal(exported.shows[0].rating, 4.5);
  await stop();
  base = await start();
  const saved = await (await fetch(`${base}/api/library`)).json();
  assert.equal(saved.shows[0].statusOverride, "Dropped");
  assert.equal(saved.shows[0].rating, 4.5);
  assert.deepEqual(saved.shows[0].watched, ["1:2", "2:1", "2:2"]);
  await fetch(`${base}/api/shows/1`, { method: "DELETE" });
  assert.equal(JSON.parse(readFileSync(file)).shows.length, 0);
});
