import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";

test("list APIs validate, persist, restore, and protect referenced shows", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "tv-tracker-lists-test-"));
  const file = join(directory, "library.json");
  const shows = [
    { id: 1, name: "Tracked", tracked: true, watchlist: false, watched: [] },
    { id: 2, name: "Watchlist", tracked: false, watchlist: true, watched: [] },
    { id: 3, name: "Unsaved", tracked: false, watchlist: false, watched: [] },
  ];
  writeFileSync(file, JSON.stringify({ version: 1, shows }));

  let child;
  // Start the list fixture server with an isolated persistent library file.
  async function start() {
    child = spawn(process.execPath, ["server.mjs"], {
      env: { ...process.env, PORT: "0", TV_DATA_FILE: file },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let errors = "";
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    return new Promise((resolve, reject) => {
      child.once("exit", () => reject(new Error(`Server exited: ${errors}`)));
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) resolve(`http://127.0.0.1:${match[1]}`);
      });
    });
  }
  // Stop the fixture server and wait for shutdown before cleanup or restart.
  async function stop() {
    if (child?.exitCode === null) {
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
  // Call the list fixture API with an optional JSON payload and capture its response.
  async function request(path, method = "GET", value) {
    const response = await fetch(`${base}${path}`, {
      method,
      headers: value ? { "Content-Type": "application/json" } : undefined,
      body: value ? JSON.stringify(value) : undefined,
    });
    return { status: response.status, data: await response.json() };
  }

  // Legacy saves receive lists and a quiet, persisted update baseline on first load.
  let result = await request("/api/library");
  assert.deepEqual(result.data.lists, []);
  assert.deepEqual(JSON.parse(readFileSync(file)).lists, []);
  assert.equal(result.data.shows[0].latestUpdate, null);
  assert.ok(result.data.shows[0].updateSnapshot);
  assert.equal((await request("/api/preferences", "PATCH", { includeActivity: "yes" })).status, 400);
  assert.equal((await request("/api/preferences", "PATCH", { includeActivity: false })).data.includeActivity, false);
  assert.equal((await request("/api/shows/1/update-read", "POST", { id: "stale" })).status, 409);

  result = await request("/api/lists", "POST", {
    name: "Favorites",
    description: "The best ones",
    ordered: false,
    sort: "added-oldest",
  });
  assert.equal(result.status, 201);
  const favorites = result.data;
  assert.match(favorites.id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(favorites.entries, []);
  assert.match(favorites.createdAt, /^\d{4}-\d{2}-\d{2}T/);

  assert.equal(
    (
      await request("/api/lists", "POST", {
        name: " favorites ",
        description: "duplicate",
        ordered: false,
        sort: "title-asc",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/lists", "POST", {
        name: "",
        description: "",
        ordered: false,
        sort: "invalid",
      })
    ).status,
    400,
  );

  result = await request(`/api/lists/${favorites.id}/items`, "PUT", {
    showIds: [1, 2],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data.entries.map((entry) => entry.showId), [1, 2]);
  const firstAddedAt = result.data.entries[0].addedAt;
  assert.equal(
    (
      await request(`/api/lists/${favorites.id}/items`, "PUT", {
        showIds: [1, 1],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request(`/api/lists/${favorites.id}/items`, "PUT", {
        showIds: [1, 3],
      })
    ).status,
    400,
  );

  result = await request(`/api/lists/${favorites.id}`, "PATCH", {
    name: "Ranked favorites",
    description: "In order",
    ordered: true,
    sort: "rating-high",
  });
  assert.equal(result.data.ordered, true);
  assert.equal(result.data.entries[0].addedAt, firstAddedAt);
  assert.equal(
    (
      await request(`/api/lists/${favorites.id}/order`, "PUT", {
        showIds: [2],
      })
    ).status,
    400,
  );
  result = await request(`/api/lists/${favorites.id}/order`, "PUT", {
    showIds: [2, 1],
  });
  assert.deepEqual(result.data.entries.map((entry) => entry.showId), [2, 1]);

  result = await request("/api/lists", "POST", {
    name: "Queue",
    description: "",
    ordered: false,
    sort: "title-asc",
  });
  const queue = result.data;
  result = await request("/api/shows/1/lists", "PUT", {
    listIds: [queue.id],
  });
  assert.equal(result.status, 200);
  assert.deepEqual(
    result.data.find((list) => list.id === favorites.id).entries.map((entry) => entry.showId),
    [2],
  );
  assert.deepEqual(
    result.data.find((list) => list.id === queue.id).entries.map((entry) => entry.showId),
    [1],
  );

  assert.equal(
    (await request("/api/shows/1", "PATCH", { tracked: false })).status,
    409,
  );
  assert.equal((await request("/api/shows/1", "DELETE")).status, 409);
  await request("/api/shows/1/lists", "PUT", { listIds: [] });
  assert.equal((await request("/api/shows/1", "DELETE")).status, 200);

  const exported = (await request("/api/export")).data;
  assert.equal(exported.lists.length, 2);
  assert.deepEqual(
    exported.lists.find((list) => list.id === favorites.id).entries.map(
      (entry) => entry.showId,
    ),
    [2],
  );

  await stop();
  base = await start();
  result = await request("/api/library");
  assert.equal(result.data.lists[0].name, "Ranked favorites");
  assert.deepEqual(result.data.lists[0].entries.map((entry) => entry.showId), [2]);

  const beforeBadImport = readFileSync(file, "utf8");
  const badBackup = structuredClone(exported);
  badBackup.lists[0].entries.push({
    showId: 999,
    addedAt: new Date().toISOString(),
  });
  assert.equal((await request("/api/import", "POST", badBackup)).status, 400);
  assert.equal(readFileSync(file, "utf8"), beforeBadImport);
  assert.equal((await request("/api/import", "POST", exported)).status, 200);

  assert.equal(
    (await request(`/api/lists/${queue.id}`, "DELETE")).status,
    200,
  );
  result = await request("/api/library");
  assert.equal(result.data.lists.length, 1);
  assert.equal(result.data.shows.some((show) => show.id === 2), true);
});
