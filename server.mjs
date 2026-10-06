import http from "node:http";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  existsSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  aired,
  episodeKey,
  statuses,
  inLibrary,
  inWatchlist,
  listSorts,
} from "./public/model.js";

// Persistent library setup and compatibility normalization
const root = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(
  process.env.TV_DATA_FILE || resolve(root, "data/library.json"),
);
mkdirSync(dirname(dataFile), { recursive: true });
let library = existsSync(dataFile)
  ? JSON.parse(readFileSync(dataFile, "utf8"))
  : { version: 1, shows: [], lists: [] };
if (library.version !== 1 || !Array.isArray(library.shows))
  throw new Error("Unsupported library file. Your data has not been changed.");
library.shows = library.shows.map((s) => ({
  ...s,
  tracked: inLibrary(s),
  watchlist: inWatchlist(s),
}));
if ("lists" in library && !Array.isArray(library.lists))
  throw new Error("Unsupported library file. Your data has not been changed.");
library.lists ||= [];

// Write a complete temporary file before replacing the saved library atomically.
function commit(next) {
  writeFileSync(`${dataFile}.tmp`, JSON.stringify(next, null, 2), {
    mode: 0o600,
  });
  renameSync(`${dataFile}.tmp`, dataFile);
  library = next;
}

// Clone mutations keep the in-memory library unchanged when validation fails.
function update(id, transform) {
  const index = library.shows.findIndex((s) => s.id === id);
  if (index < 0)
    throw Object.assign(new Error("Show not found in your library."), {
      status: 404,
    });
  const next = structuredClone(library);
  next.shows[index] = transform(next.shows[index]);
  commit(next);
  return next.shows[index];
}

function updateList(id, transform) {
  const index = library.lists.findIndex((list) => list.id === id);
  if (index < 0)
    throw Object.assign(new Error("List not found."), { status: 404 });
  const next = structuredClone(library);
  next.lists[index] = transform(next.lists[index]);
  commit(next);
  return next.lists[index];
}

const savedShow = (show) => inLibrary(show) || inWatchlist(show);
const listsContainingShow = (id, source = library) =>
  source.lists.filter((list) =>
    list.entries.some((entry) => entry.showId === id),
  );

function validateListFields(value, currentId = null, source = library) {
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description =
    typeof value.description === "string" ? value.description.trim() : "";
  if (!name || name.length > 80)
    throw Object.assign(new Error("List names must be 1 to 80 characters."), {
      status: 400,
    });
  if (description.length > 1000)
    throw Object.assign(
      new Error("List descriptions must be 1000 characters or fewer."),
      { status: 400 },
    );
  if (typeof value.ordered !== "boolean")
    throw Object.assign(new Error("Ranked must be true or false."), {
      status: 400,
    });
  if (!listSorts.includes(value.sort))
    throw Object.assign(new Error("Invalid list sort."), { status: 400 });
  if (!value.ordered && value.sort === "manual")
    throw Object.assign(new Error("Only ranked lists use ranked order."), {
      status: 400,
    });
  if (
    source.lists.some(
      (list) =>
        list.id !== currentId &&
        list.name.trim().toLowerCase() === name.toLowerCase(),
    )
  )
    throw Object.assign(new Error("A list with that name already exists."), {
      status: 409,
    });
  return { name, description, ordered: value.ordered, sort: value.sort };
}

function validateShowIds(showIds, source = library) {
  if (
    !Array.isArray(showIds) ||
    showIds.some((id) => !Number.isSafeInteger(id)) ||
    new Set(showIds).size !== showIds.length
  )
    throw Object.assign(new Error("Show IDs must be a unique list of integers."), {
      status: 400,
    });
  const showsById = new Map(source.shows.map((show) => [show.id, show]));
  if (showIds.some((id) => !showsById.has(id) || !savedShow(showsById.get(id))))
    throw Object.assign(
      new Error("Lists can contain only shows in My Shows or Watchlist."),
      { status: 400 },
    );
  return showIds;
}

function validateImportedLibrary(value) {
  if (value?.version !== 1 || !Array.isArray(value.shows))
    throw Object.assign(new Error("Unsupported backup file."), { status: 400 });
  const next = structuredClone(value);
  if (
    next.shows.some((show) => !Number.isSafeInteger(show.id)) ||
    new Set(next.shows.map((show) => show.id)).size !== next.shows.length
  )
    throw Object.assign(new Error("Backup contains invalid shows."), {
      status: 400,
    });
  next.shows = next.shows.map((show) => ({
    ...show,
    tracked: inLibrary(show),
    watchlist: inWatchlist(show),
  }));
  if ("lists" in next && !Array.isArray(next.lists))
    throw Object.assign(new Error("Backup contains invalid lists."), {
      status: 400,
    });
  next.lists ||= [];
  const seenIds = new Set();
  for (const list of next.lists) {
    if (
      typeof list.id !== "string" ||
      !list.id ||
      seenIds.has(list.id) ||
      !Array.isArray(list.entries) ||
      list.entries.some((entry) => !entry || typeof entry !== "object") ||
      typeof list.createdAt !== "string" ||
      !Number.isFinite(new Date(list.createdAt).getTime()) ||
      typeof list.updatedAt !== "string" ||
      !Number.isFinite(new Date(list.updatedAt).getTime())
    )
      throw Object.assign(new Error("Backup contains invalid lists."), {
        status: 400,
      });
    seenIds.add(list.id);
    validateListFields(list, list.id, next);
    const showIds = list.entries.map((entry) => entry.showId);
    validateShowIds(showIds, next);
    if (
      list.entries.some(
        (entry) =>
          typeof entry.addedAt !== "string" ||
          !Number.isFinite(new Date(entry.addedAt).getTime()),
      )
    )
      throw Object.assign(new Error("Backup contains invalid list entries."), {
        status: 400,
      });
  }
  return next;
}

// TMDB requests and metadata shaping
async function tmdb(path) {
  const token = process.env.TMDB_TOKEN || process.env.TMDB_API_KEY;
  if (!token)
    throw Object.assign(
      new Error(
        "Add your TMDB token to .env and restart the app to search for shows.",
      ),
      { status: 503 },
    );
  const url = new URL(`https://api.themoviedb.org/3/${path}`);
  const headers = { Accept: "application/json" };
  // JWT-style tokens use bearer auth; legacy API keys remain query parameters.
  if (token.includes(".")) headers.Authorization = `Bearer ${token}`;
  else url.searchParams.set("api_key", token);
  let res;
  try {
    res = await fetch(url, { headers, signal: AbortSignal.timeout(20000) });
  } catch {
    throw Object.assign(
      new Error(
        "Could not reach TMDB. Check your connection and try again. Your library is still saved.",
      ),
      { status: 502 },
    );
  }
  if (!res.ok)
    throw Object.assign(
      new Error(
        res.status === 401
          ? "TMDB rejected the credential. Check your local .env file."
          : `TMDB is unavailable (HTTP ${res.status}). Please try again.`,
      ),
      { status: 502 },
    );
  return res.json();
}
async function metadata(id) {
  const s = await tmdb(`tv/${id}`);
  const episodes = [];
  // Small batches keep long-running shows from overwhelming the metadata API.
  for (let i = 0; i < s.seasons.length; i += 4) {
    const batch = await Promise.all(
      s.seasons
        .slice(i, i + 4)
        .map((season) => tmdb(`tv/${id}/season/${season.season_number}`)),
    );
    for (const season of batch)
      for (const e of season.episodes)
        episodes.push({
          id: e.id,
          name: e.name,
          season_number: e.season_number,
          episode_number: e.episode_number,
          air_date: e.air_date,
          runtime:
            Number.isFinite(e.runtime) && e.runtime > 0 ? e.runtime : undefined,
        });
  }
  return {
    id: s.id,
    name: s.name,
    overview: s.overview,
    poster_path: s.poster_path,
    backdrop_path: s.backdrop_path,
    first_air_date: s.first_air_date,
    genres: s.genres,
    seriesStatus: s.status,
    episodeCount: s.number_of_episodes,
    typicalRuntime:
      s.episode_run_time?.find(
        (runtime) => Number.isFinite(runtime) && runtime > 0,
      ) || undefined,
    seasons: s.seasons.map((x) => ({ number: x.season_number, name: x.name })),
    episodes,
    refreshedAt: new Date().toISOString(),
  };
}

// Request validation and static asset routing
function validateRating(value) {
  if (
    value !== null &&
    (typeof value !== "number" ||
      value < 0.5 ||
      value > 5 ||
      !Number.isInteger(value * 2))
  )
    throw Object.assign(
      new Error("Ratings must be between 0.5 and 5 stars in half-star steps."),
      { status: 400 },
    );
}
async function body(req, limit = 100000) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > limit)
      throw Object.assign(new Error("Request too large."), { status: 413 });
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw Object.assign(new Error("Invalid JSON."), { status: 400 });
  }
}
const files = {
  "/": ["index.html", "text/html"],
  "/api.js": ["api.js", "text/javascript"],
  "/app.js": ["app.js", "text/javascript"],
  "/model.js": ["model.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
  "/ui.js": ["ui.js", "text/javascript"],
  "/views/home.js": ["views/home.js", "text/javascript"],
  "/views/help.js": ["views/help.js", "text/javascript"],
  "/views/library.js": ["views/library.js", "text/javascript"],
  "/views/lists.js": ["views/lists.js", "text/javascript"],
  "/views/search-dialog.js": ["views/search-dialog.js", "text/javascript"],
  "/views/show-dialog.js": ["views/show-dialog.js", "text/javascript"],
  "/views/stats.js": ["views/stats.js", "text/javascript"],
  "/assets/logo.png": ["assets/logo.png", "image/png"],
};

// Local HTTP API
export const server = http.createServer(async (req, res) => {
  const send = (status, value) => {
    res.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(JSON.stringify(value));
  };
  try {
    // Host and Origin checks prevent other sites from driving this local server.
    const allowedHosts = new Set([
      `127.0.0.1:${server.address().port}`,
      `localhost:${server.address().port}`,
    ]);
    if (!allowedHosts.has(req.headers.host))
      return send(403, { error: "Local access only." });
    if (
      req.headers.origin &&
      ![
        `http://127.0.0.1:${server.address().port}`,
        `http://localhost:${server.address().port}`,
      ].includes(req.headers.origin)
    )
      return send(403, { error: "Origin not allowed." });
    const url = new URL(req.url, "http://localhost");
    const path = url.pathname;

    // Static files use a restrictive policy while allowing TMDB-hosted artwork.
    if (req.method === "GET" && files[path]) {
      const [file, type] = files[path];
      res.writeHead(200, {
        "Content-Type": `${type}; charset=utf-8`,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; img-src 'self' https://image.tmdb.org https://www.themoviedb.org; style-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      return res.end(readFileSync(resolve(root, "public", file)));
    }
    if (req.method === "GET" && path === "/api/library")
      return send(200, library);
    if (req.method === "GET" && path === "/api/export") {
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="next-episode-backup.json"',
      );
      return send(200, library);
    }
    if (req.method === "POST" && path === "/api/import") {
      const restored = validateImportedLibrary(await body(req, 10_000_000));
      commit(restored);
      return send(200, library);
    }
    if (req.method === "GET" && path === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
      const page = Number(url.searchParams.get("page") || 1);
      if (!Number.isSafeInteger(page) || page < 1 || page > 500)
        return send(400, { error: "Search page must be between 1 and 500." });
      if (!q) return send(200, { results: [] });
      return send(
        200,
        await tmdb(
          `search/tv?query=${encodeURIComponent(q)}&include_adult=false&page=${page}`,
        ),
      );
    }

    // List routes keep metadata, membership, and manual ordering atomic.
    if (path === "/api/lists" && req.method === "POST") {
      const fields = validateListFields(await body(req));
      const timestamp = new Date().toISOString();
      const list = {
        id: randomUUID(),
        ...fields,
        createdAt: timestamp,
        updatedAt: timestamp,
        entries: [],
      };
      commit({ ...library, lists: [...library.lists, list] });
      return send(201, list);
    }
    const listMatch = path.match(
      /^\/api\/lists\/([^/]+)(?:\/(items|order))?$/,
    );
    if (listMatch) {
      const id = decodeURIComponent(listMatch[1]);
      const action = listMatch[2];
      if (req.method === "PATCH" && !action) {
        const request = await body(req);
        const fields = validateListFields(request, id);
        return send(
          200,
          updateList(id, (list) => ({
            ...list,
            ...fields,
            updatedAt: new Date().toISOString(),
          })),
        );
      }
      if (req.method === "DELETE" && !action) {
        if (!library.lists.some((list) => list.id === id))
          return send(404, { error: "List not found." });
        commit({
          ...library,
          lists: library.lists.filter((list) => list.id !== id),
        });
        return send(200, { ok: true });
      }
      if (req.method === "PUT" && action === "items") {
        const showIds = validateShowIds((await body(req)).showIds);
        return send(
          200,
          updateList(id, (list) => {
            const existing = new Map(
              list.entries.map((entry) => [entry.showId, entry]),
            );
            const timestamp = new Date().toISOString();
            return {
              ...list,
              entries: showIds.map(
                (showId) =>
                  existing.get(showId) || { showId, addedAt: timestamp },
              ),
              updatedAt: timestamp,
            };
          }),
        );
      }
      if (req.method === "PUT" && action === "order") {
        const showIds = (await body(req)).showIds;
        return send(
          200,
          updateList(id, (list) => {
            if (
              !list.ordered ||
              !Array.isArray(showIds) ||
              showIds.length !== list.entries.length ||
              new Set(showIds).size !== showIds.length ||
              showIds.some(
                (showId) =>
                  !list.entries.some((entry) => entry.showId === showId),
              )
            )
              throw Object.assign(new Error("Invalid list order."), {
                status: 400,
              });
            const entries = new Map(
              list.entries.map((entry) => [entry.showId, entry]),
            );
            return {
              ...list,
              entries: showIds.map((showId) => entries.get(showId)),
              updatedAt: new Date().toISOString(),
            };
          }),
        );
      }
    }

    const showListsMatch = path.match(/^\/api\/shows\/(\d+)\/lists$/);
    if (showListsMatch && req.method === "PUT") {
      const showId = Number(showListsMatch[1]);
      const show = library.shows.find((entry) => entry.id === showId);
      if (!show || !savedShow(show))
        return send(404, { error: "Show not found." });
      const listIds = (await body(req)).listIds;
      if (
        !Array.isArray(listIds) ||
        listIds.some((id) => typeof id !== "string") ||
        new Set(listIds).size !== listIds.length ||
        listIds.some((id) => !library.lists.some((list) => list.id === id))
      )
        return send(400, { error: "Invalid list IDs." });
      const selected = new Set(listIds);
      const timestamp = new Date().toISOString();
      const lists = library.lists.map((list) => {
        const contains = list.entries.some((entry) => entry.showId === showId);
        if (contains === selected.has(list.id)) return list;
        return {
          ...list,
          entries: selected.has(list.id)
            ? [...list.entries, { showId, addedAt: timestamp }]
            : list.entries.filter((entry) => entry.showId !== showId),
          updatedAt: timestamp,
        };
      });
      commit({ ...library, lists });
      return send(200, lists);
    }

    // Show routes share an ID matcher; the optional suffix distinguishes refreshes.
    const match = path.match(/^\/api\/shows\/(\d+)(\/refresh)?$/);
    if (match) {
      const id = Number(match[1]);
      if (req.method === "POST") {
        const request = match[2] ? {} : await body(req);
        const destination = request?.destination ?? "library";
        if (!["library", "watchlist"].includes(destination))
          return send(400, { error: "Invalid destination." });
        const addToDestination = (current) =>
          destination === "watchlist"
            ? { ...current, watchlist: true }
            : { ...current, tracked: true };
        const existing = library.shows.find((s) => s.id === id);
        // Existing additions only change membership; refreshes fetch and merge metadata.
        if (existing && !match[2])
          return send(200, update(id, addToDestination));
        if (!existing && match[2])
          return send(404, { error: "Show not found." });
        const meta = await metadata(id);
        if (match[2])
          return send(
            200,
            update(id, (current) => ({ ...current, ...meta })),
          );
        // Recheck after the remote request to avoid duplicate concurrent additions.
        const duplicate = library.shows.find((s) => s.id === id);
        if (duplicate) return send(200, update(id, addToDestination));
        const show = {
          ...meta,
          watched: [],
          rating: null,
          seasonRatings: {},
          statusOverride: null,
          watchlist: destination === "watchlist",
          tracked: destination === "library",
          lastWatchedAt: null,
          addedAt: new Date().toISOString(),
        };
        commit({ ...library, shows: [...library.shows, show] });
        return send(201, show);
      }
      if (req.method === "PATCH" && !match[2]) {
        const b = await body(req);
        const show = update(id, (s) => {
          // Removing tracked membership clears progress but can preserve Watchlist.
          if ("tracked" in b) {
            if (typeof b.tracked !== "boolean")
              throw Object.assign(new Error("Tracked must be true or false."), {
                status: 400,
              });
            s.tracked = b.tracked;
            if (!b.tracked) {
              s.watched = [];
              s.rating = null;
              s.seasonRatings = {};
              s.statusOverride = null;
              s.lastWatchedAt = null;
            }
          }
          if ("watchlist" in b) {
            if (typeof b.watchlist !== "boolean")
              throw Object.assign(
                new Error("Watchlist must be true or false."),
                { status: 400 },
              );
            s.watchlist = b.watchlist;
          }
          if ("rating" in b) {
            validateRating(b.rating);
            s.rating = b.rating;
          }
          if ("statusOverride" in b) {
            if (
              b.statusOverride !== null &&
              !statuses.includes(b.statusOverride)
            )
              throw Object.assign(new Error("Invalid status."), {
                status: 400,
              });
            s.statusOverride = b.statusOverride;
            if (b.statusOverride !== null) s.tracked = true;
          }
          if ("seasonRating" in b) {
            if (
              !b.seasonRating ||
              !s.seasons.some((x) => x.number === b.seasonRating.season)
            )
              throw Object.assign(new Error("Invalid season."), {
                status: 400,
              });
            validateRating(b.seasonRating.rating);
            s.seasonRatings[b.seasonRating.season] = b.seasonRating.rating;
          }
          if (b.progress) {
            const previousWatchedCount = s.watched.length;
            const { action, season, episode, watched } = b.progress;
            if (
              !["episode", "season", "through"].includes(action) ||
              !Number.isInteger(season) ||
              typeof watched !== "boolean"
            )
              throw Object.assign(new Error("Invalid progress action."), {
                status: 400,
              });
            if (
              action !== "season" &&
              !s.episodes.some(
                (e) =>
                  e.season_number === season && e.episode_number === episode,
              )
            )
              throw Object.assign(new Error("Episode not found."), {
                status: 400,
              });
            const keys = new Set(s.watched);
            // Bulk actions never mark unaired episodes, but clearing can remove any key.
            for (const e of s.episodes) {
              const selected =
                action === "episode"
                  ? e.season_number === season && e.episode_number === episode
                  : action === "season"
                    ? e.season_number === season
                    : season === 0
                      ? e.season_number === 0 && e.episode_number <= episode
                      : e.season_number > 0 &&
                        (e.season_number < season ||
                          (e.season_number === season &&
                            e.episode_number <= episode));
              if (selected && (!watched || aired(e)))
                watched ? keys.add(episodeKey(e)) : keys.delete(episodeKey(e));
            }
            s.watched = [...keys].sort((a, b) => {
              const [seasonA, episodeA] = a.split(":").map(Number);
              const [seasonB, episodeB] = b.split(":").map(Number);
              return seasonA - seasonB || episodeA - episodeB;
            });
            if (s.watched.length) s.tracked = true;
            if (s.watched.length > previousWatchedCount)
              s.lastWatchedAt = new Date().toISOString();
            if (
              s.statusOverride === "Paused" &&
              s.watched.length > previousWatchedCount
            )
              s.statusOverride = null;
          }
          if (!savedShow(s)) {
            const containing = listsContainingShow(id);
            if (containing.length)
              throw Object.assign(
                new Error(
                  `Remove this show from ${containing.map((list) => list.name).join(", ")} before deleting it from your saved shows.`,
                ),
                { status: 409 },
              );
          }
          return s;
        });
        return send(200, show);
      }
      if (req.method === "DELETE" && !match[2]) {
        const containing = listsContainingShow(id);
        if (containing.length)
          return send(409, {
            error: `Remove this show from ${containing.map((list) => list.name).join(", ")} before deleting it.`,
          });
        commit({ ...library, shows: library.shows.filter((s) => s.id !== id) });
        return send(200, { ok: true });
      }
    }
    send(404, { error: "Not found." });
  } catch (error) {
    // Expected errors reach the client; unexpected failures keep internals private.
    send(error.status || 500, {
      error: error.status
        ? error.message
        : "Something went wrong. Your last saved library is unchanged; please try again.",
    });
  }
});
server.listen(Number(process.env.PORT || 3210), "127.0.0.1", () =>
  console.log(
    `Next Episode is ready at http://localhost:${server.address().port}`,
  ),
);
