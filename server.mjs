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
import {
  aired,
  episodeKey,
  statuses,
  inLibrary,
  inWatchlist,
} from "./public/model.js";

const root = dirname(fileURLToPath(import.meta.url));
const dataFile = resolve(
  process.env.TV_DATA_FILE || resolve(root, "data/library.json"),
);
mkdirSync(dirname(dataFile), { recursive: true });
let library = existsSync(dataFile)
  ? JSON.parse(readFileSync(dataFile, "utf8"))
  : { version: 1, shows: [] };
if (library.version !== 1 || !Array.isArray(library.shows))
  throw new Error("Unsupported library file. Your data has not been changed.");
library.shows = library.shows.map((s) => ({
  ...s,
  tracked: inLibrary(s),
  watchlist: inWatchlist(s),
}));
function commit(next) {
  writeFileSync(`${dataFile}.tmp`, JSON.stringify(next, null, 2), {
    mode: 0o600,
  });
  renameSync(`${dataFile}.tmp`, dataFile);
  library = next;
}
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
    seasons: s.seasons.map((x) => ({ number: x.season_number, name: x.name })),
    episodes,
    refreshedAt: new Date().toISOString(),
  };
}
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
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 100000)
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
  "/app.js": ["app.js", "text/javascript"],
  "/model.js": ["model.js", "text/javascript"],
  "/style.css": ["style.css", "text/css"],
  "/assets/logo.png": ["assets/logo.png", "image/png"],
};
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
          return s;
        });
        return send(200, show);
      }
      if (req.method === "DELETE" && !match[2]) {
        commit({ ...library, shows: library.shows.filter((s) => s.id !== id) });
        return send(200, { ok: true });
      }
    }
    send(404, { error: "Not found." });
  } catch (error) {
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
