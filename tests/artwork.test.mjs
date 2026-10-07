import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("artwork API persists choices through refresh, backup, and restart", async (t) => {
  // Fixture metadata and a temporary library keep personal data untouched.
  const directory = mkdtempSync(join(tmpdir(), "tv-artwork-"));
  const file = join(directory, "library.json");
  let child;
  // Start the artwork fixture server against the test's temporary library.
  async function start() {
    child = spawn(process.execPath, ["--import", "./tests/tmdb-fixture.mjs", "server.mjs"], {
      env: { ...process.env, PORT: "0", TV_DATA_FILE: file, TMDB_TOKEN: "fixture" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "", errors = "";
    child.stderr.on("data", (chunk) => { errors += chunk; });
    return new Promise((resolve, reject) => {
      child.once("exit", () => reject(new Error(errors || "Server exited")));
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:\d+/);
        if (match) resolve(match[0]);
      });
    });
  }
  // Stop the fixture server before restart checks or temporary-library cleanup.
  async function stop() {
    if (child?.exitCode === null) {
      const exited = once(child, "exit");
      child.kill();
      await exited;
    }
  }
  t.after(async () => { await stop(); rmSync(directory, { recursive: true, force: true }); });
  let base = await start();
  // Send a JSON request to the current fixture server and return status and response data.
  async function request(path, method = "GET", body) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, data: await response.json() };
  }

  // Fetching options is read-only; saving choices is independent of viewing data.
  assert.equal((await request("/api/shows/999/images")).status, 404);
  assert.equal((await request("/api/shows/1396", "POST", {})).status, 201);
  const before = readFileSync(file, "utf8");
  const images = await request("/api/shows/1396/images");
  assert.equal(images.status, 200);
  assert.equal(images.data.posters[0].file_path, "/alternate-poster.jpg");
  assert.equal(images.data.backdrops[0].iso_639_1, null);
  assert.equal("logos" in images.data, false);
  assert.equal(readFileSync(file, "utf8"), before);
  const original = JSON.parse(before).shows[0];
  const choice = { posterOverride: "/alternate-poster.jpg", backdropOverride: "/alternate-backdrop.jpg" };
  const saved = await request("/api/shows/1396", "PATCH", choice);
  assert.equal(saved.status, 200);
  assert.deepEqual(saved.data.watched, original.watched);
  assert.equal(saved.data.rating, original.rating);
  assert.equal(saved.data.poster_path, original.poster_path);
  assert.equal((await request("/api/shows/1396", "PATCH", { posterOverride: "https://evil.example/a.jpg" })).status, 400);
  assert.equal((await request("/api/shows/999", "PATCH", choice)).status, 404);
  const refreshed = await request("/api/shows/1396/refresh", "POST", {});
  assert.equal(refreshed.status, 200);
  assert.equal(refreshed.data.posterOverride, choice.posterOverride);
  assert.equal(refreshed.data.backdropOverride, choice.backdropOverride);

  // Export/import retain paths but never store the fetched image collection.
  const backup = (await request("/api/export")).data;
  assert.equal(backup.shows[0].backdropOverride, choice.backdropOverride);
  assert.equal("posters" in backup.shows[0], false);
  const bad = structuredClone(backup);
  bad.shows[0].posterOverride = "/../invalid.jpg";
  assert.equal((await request("/api/import", "POST", bad)).status, 400);
  assert.equal((await request("/api/import", "POST", backup)).status, 200);
  await stop();
  base = await start();
  assert.equal((await request("/api/library")).data.shows[0].posterOverride, choice.posterOverride);
  const reset = await request("/api/shows/1396", "PATCH", { posterOverride: null });
  assert.equal(reset.data.posterOverride, null);
  assert.equal(reset.data.backdropOverride, choice.backdropOverride);
  const legacy = structuredClone(backup);
  delete legacy.shows[0].posterOverride;
  delete legacy.shows[0].backdropOverride;
  assert.equal((await request("/api/import", "POST", legacy)).status, 200);
});
