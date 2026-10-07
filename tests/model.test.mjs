import { test } from "node:test";
import assert from "node:assert/strict";
import {
  progress,
  watchStatus,
  inWatchlist,
  matchesTab,
  matchesLibraryFilters,
  matchesGenres,
  libraryStats,
  topRatedShows,
  metadataRefreshInterval,
  metadataRefreshQueue,
  listEntries,
  artworkPath,
  validArtworkPath,
  artworkOptions,
} from "../public/model.js";

test("artwork choices override defaults independently and reset cleanly", () => {
  const show = { poster_path: "/default.jpg", backdrop_path: "/default-backdrop.jpg", posterOverride: "/chosen.jpg" };
  assert.equal(artworkPath(show, "poster"), "/chosen.jpg");
  assert.equal(artworkPath(show, "backdrop"), "/default-backdrop.jpg");
  assert.equal(artworkPath({ ...show, posterOverride: null }, "poster"), "/default.jpg");
  assert.equal(artworkPath({}, "backdrop"), null);
  assert.equal(validArtworkPath("/chosen.jpg"), true);
  for (const path of ["https://example.com/a.jpg", "/../a.jpg", "//host/a.jpg", "/a.svg", 5, ""])
    assert.equal(validArtworkPath(path), false);
});

test("artwork options prioritize English posters and text-free backdrops stably", () => {
  const items = [{ iso_639_1: "ja", file_path: "/ja.jpg" }, { iso_639_1: null, file_path: "/plain.jpg" }, { iso_639_1: "en", file_path: "/en.jpg" }];
  assert.deepEqual(artworkOptions(items, "poster").map((item) => item.file_path), ["/en.jpg", "/ja.jpg", "/plain.jpg"]);
  assert.deepEqual(artworkOptions(items, "backdrop").map((item) => item.file_path), ["/plain.jpg", "/ja.jpg", "/en.jpg"]);
  assert.equal(items[0].file_path, "/ja.jpg");
});

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

// Progress and automatic status rules
test("progress distinguishes not started, partially watched, and caught up", () => {
  assert.equal(watchStatus(show(), "2026-09-26"), "Not started");
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
  assert.equal(watchStatus(show({ statusOverride: "Paused" })), "Paused");
  assert.equal(watchStatus(show({ statusOverride: "Dropped" })), "Dropped");
  assert.equal(watchStatus(show({ statusOverride: "Watching" })), "Watching");
  assert.equal(
    watchStatus(show({ statusOverride: "Dropped", watched: ["1:1", "1:2"] })),
    "Dropped",
  );
  assert.equal(watchStatus(show({ statusOverride: "Completed" })), "Completed");
});

// Library membership and combined filters
test("legacy show membership is preserved before normalization", () => {
  assert.equal(inWatchlist(show()), true);
  assert.equal(matchesTab(show(), "All"), false);
  assert.equal(matchesTab(show({ watchlist: false }), "All"), true);
  assert.equal(inWatchlist(show({ watched: ["1:1"] })), false);
  assert.equal(inWatchlist(show({ watchlist: false })), false);
  assert.equal(watchStatus(show({ rating: 5 })), "Not started");
  assert.equal(
    watchStatus(show({ episodes: [], episodeCount: 0 })),
    "Not started",
  );
  assert.equal(
    watchStatus(show({ episodes: [episode(1, 1, "2099-01-01")] })),
    "Not started",
  );
  const s = show({ watched: ["1:1"] });
  assert.equal(watchStatus(s), "Watching");
  s.watched = [];
  assert.equal(watchStatus(s), "Not started");
  // A watched special counts as starting a show, but not toward regular completion.
  assert.equal(
    watchStatus(
      show({ watched: ["0:1"], episodes: [episode(0, 1), episode(1, 1)] }),
    ),
    "Watching",
  );
});
test("tracking and watchlist flags are independent even without progress", () => {
  for (const tracked of [true, false]) {
    const s = show({ tracked, watchlist: false });
    assert.equal(matchesTab(s, "All"), tracked);
    assert.equal(watchStatus(s), tracked ? "Watching" : "Not started");
    s.watchlist = true;
    assert.equal(matchesTab(s, "All"), tracked);
    assert.equal(matchesTab(s, "Watching"), tracked);
    assert.equal(inWatchlist(s), true);
    s.watchlist = false;
    assert.equal(matchesTab(s, "All"), tracked);
  }
});
test("explicit watchlist flags overlap every status and stay in All without changing progress", () => {
  for (const statusOverride of [
    "Watching",
    "Paused",
    "Caught Up",
    "Completed",
    "Dropped",
  ]) {
    const s = show({ watched: ["1:1"], statusOverride, watchlist: true });
    assert.equal(watchStatus(s), statusOverride);
    assert.equal(matchesTab(s, statusOverride), true);
    assert.equal(matchesTab(s, "Watchlist"), true);
    assert.equal(matchesTab(s, "All"), true);
    s.watched.push("1:2");
    assert.equal(inWatchlist(s), true);
    s.watchlist = false;
    assert.equal(matchesTab(s, "All"), true);
    assert.equal(matchesTab(s, "Watchlist"), false);
    assert.equal(watchStatus(s), statusOverride);
  }
});

test("library filters combine statuses and intersect them with watchlist", () => {
  const watching = show({ tracked: true, watchlist: true });
  const paused = show({ tracked: true, watchlist: false, statusOverride: "Paused" });
  const dropped = show({ tracked: true, watchlist: true, statusOverride: "Dropped" });
  const watchlistOnly = show({ tracked: false, watchlist: true });
  const selected = new Set(["Watching", "Paused"]);

  assert.equal(matchesLibraryFilters(watching, new Set(), false), true);
  assert.equal(matchesLibraryFilters(watchlistOnly, new Set(), false), false);
  assert.equal(matchesLibraryFilters(watchlistOnly, new Set(), true), true);
  assert.equal(matchesLibraryFilters(watching, selected, false), true);
  assert.equal(matchesLibraryFilters(paused, selected, false), true);
  assert.equal(matchesLibraryFilters(dropped, selected, false), false);
  assert.equal(matchesLibraryFilters(watching, selected, true), true);
  assert.equal(matchesLibraryFilters(paused, selected, true), false);
});

test("genre filters require every selected genre", () => {
  const crimeDrama = show({
    genres: [
      { id: 18, name: "Drama" },
      { id: 80, name: "Crime" },
    ],
  });
  const drama = show({ genres: [{ id: 18, name: "Drama" }] });

  assert.equal(matchesGenres(crimeDrama, new Set()), true);
  assert.equal(matchesGenres(crimeDrama, new Set(["18"])), true);
  assert.equal(matchesGenres(crimeDrama, new Set(["18", "80"])), true);
  assert.equal(matchesGenres(drama, new Set(["18", "80"])), false);
});

// Statistics and refresh scheduling
test("library stats aggregate ratings, statuses, progress, specials, seasons, and runtime estimates", () => {
  const stats = libraryStats(
    [
      show({
        id: 1,
        name: "Alpha",
        tracked: true,
        watchlist: false,
        rating: 4,
        genres: [
          { id: 18, name: "Drama" },
          { id: 80, name: "Crime" },
        ],
        episodes: [
          { ...episode(0, 1), runtime: 30 },
          { ...episode(1, 1), runtime: 45 },
          episode(1, 2),
          episode(2, 1, "2099-01-01"),
        ],
        watched: ["0:1", "1:1", "1:2"],
        typicalRuntime: 50,
        lastWatchedAt: "2026-09-27T10:00:00.000Z",
      }),
      show({
        id: 2,
        name: "Beta",
        tracked: true,
        watchlist: true,
        rating: 4.5,
        genres: [
          { id: 18, name: "Drama" },
          { id: 35, name: "Comedy" },
        ],
        episodes: [episode(1, 1), episode(1, 2)],
        watched: ["1:1"],
        statusOverride: "Completed",
        lastWatchedAt: "2026-09-27T11:00:00.000Z",
      }),
      show({
        id: 3,
        name: "Watchlist only",
        tracked: false,
        watchlist: true,
        rating: null,
        genres: [],
      }),
    ],
    "2026-09-27",
  );
  assert.equal(stats.trackedShows, 2);
  assert.equal(stats.episodesWatched, 4);
  assert.equal(stats.seasonsCompleted, 1);
  assert.equal(stats.estimatedMinutes, 170);
  assert.equal(stats.runtimeCoveredEpisodes, 3);
  assert.equal(stats.runtimeEstimatedEpisodes, 2);
  assert.equal(stats.watchedRegularEpisodes, 3);
  assert.equal(stats.airedRegularEpisodes, 4);
  assert.equal(stats.progressPercent, 75);
  assert.equal(stats.statusCounts["Caught Up"], 1);
  assert.equal(stats.statusCounts.Completed, 1);
  assert.equal(stats.watchlistShows, 2);
  assert.equal(stats.averageRating, 4.25);
  assert.equal(stats.ratedShows, 2);
  assert.equal(stats.unratedShows, 0);
  assert.equal(stats.ratingBuckets.length, 10);
  assert.equal(
    stats.ratingBuckets.reduce((sum, bucket) => sum + bucket.count, 0),
    2,
  );
  assert.equal(
    stats.ratingBuckets.find((bucket) => bucket.rating === 4.5).count,
    1,
  );
  assert.deepEqual(stats.topGenres, [
    { name: "Drama", count: 2 },
    { name: "Comedy", count: 1 },
    { name: "Crime", count: 1 },
  ]);
  assert.deepEqual(stats.topGenresByRating, [
    { name: "Comedy", averageRating: 4.5, weightedRating: 4.3125, ratedShows: 1 },
    { name: "Drama", averageRating: 4.25, weightedRating: 4.25, ratedShows: 2 },
    { name: "Crime", averageRating: 4, weightedRating: 4.1875, ratedShows: 1 },
  ]);
  assert.deepEqual(
    stats.topRated.map((entry) => entry.name),
    ["Beta", "Alpha"],
  );
});

test("library stats handle empty libraries and missing runtime metadata", () => {
  const stats = libraryStats([
    show({
      tracked: true,
      watchlist: false,
      rating: null,
      genres: [],
      watched: ["1:1"],
    }),
  ]);
  assert.equal(stats.estimatedMinutes, null);
  assert.equal(stats.unratedShows, 1);
  assert.equal(stats.runtimeCoveredEpisodes, 0);
  assert.deepEqual(libraryStats([]).topGenres, []);
  assert.deepEqual(libraryStats([]).topGenresByRating, []);
});

test("top-rated shows use progress recency to break equal ratings", () => {
  const ranked = topRatedShows([
    show({ id: 1, name: "Older", tracked: true, rating: 5, lastWatchedAt: "2026-01-01" }),
    show({ id: 2, name: "Newer", tracked: true, rating: 5, lastWatchedAt: "2026-02-01" }),
    show({ id: 3, name: "Watchlist", tracked: false, watchlist: true, rating: 5 }),
  ]);
  assert.deepEqual(ranked.map((entry) => entry.name), ["Newer", "Older"]);
});

test("list entries preserve ranks and sort missing values last", () => {
  const shows = [
    { id: 1, name: "Beta", first_air_date: "2020-01-01", rating: 4 },
    { id: 2, name: "Alpha", first_air_date: "2022-01-01", rating: null },
    { id: 3, name: "Gamma", first_air_date: null, rating: 5 },
  ];
  const list = {
    ordered: true,
    sort: "title-asc",
    entries: [
      { showId: 3, addedAt: "2026-03-01T00:00:00.000Z" },
      { showId: 1, addedAt: "2026-01-01T00:00:00.000Z" },
      { showId: 2, addedAt: "2026-02-01T00:00:00.000Z" },
    ],
  };
  const ids = (value) => listEntries(value, shows).map(({ show }) => show.id);
  assert.deepEqual(ids(list), [2, 1, 3]);
  assert.deepEqual(ids({ ...list, sort: "manual" }), [3, 1, 2]);
  assert.deepEqual(ids({ ...list, ordered: false }), [2, 1, 3]);
  assert.deepEqual(ids({ ...list, ordered: false, sort: "added-oldest" }), [1, 2, 3]);
  assert.deepEqual(ids({ ...list, ordered: false, sort: "release-newest" }), [2, 1, 3]);
  assert.deepEqual(ids({ ...list, ordered: false, sort: "rating-high" }), [3, 1, 2]);
  assert.deepEqual(ids({ ...list, ordered: false, sort: "rating-low" }), [1, 3, 2]);
});

test("metadata refreshes active shows most often and limits startup work", () => {
  const day = 24 * 60 * 60 * 1000;
  const now = new Date("2026-09-27T12:00:00.000Z");
  const dated = (daysAgo) =>
    new Date(now.getTime() - daysAgo * day).toISOString();
  const entries = [
    show({ id: 1, name: "Fresh active", tracked: true, refreshedAt: dated(0.5) }),
    show({ id: 2, name: "Stale active", tracked: true, refreshedAt: dated(2) }),
    show({ id: 3, name: "Fresh paused", tracked: true, statusOverride: "Paused", refreshedAt: dated(6) }),
    show({ id: 4, name: "Stale paused", tracked: true, statusOverride: "Paused", refreshedAt: dated(8) }),
    show({ id: 5, name: "Fresh completed", tracked: true, statusOverride: "Completed", refreshedAt: dated(29) }),
    show({ id: 6, name: "Stale completed", tracked: true, statusOverride: "Completed", refreshedAt: dated(31) }),
    show({ id: 7, name: "Watchlist only", tracked: false, watchlist: true, refreshedAt: dated(8) }),
    show({ id: 8, name: "Never refreshed", tracked: true, refreshedAt: null }),
    show({ id: 9, name: "Second stale active", tracked: true, refreshedAt: dated(3) }),
    show({ id: 10, name: "Third stale active", tracked: true, refreshedAt: dated(4) }),
    show({ id: 11, name: "Fourth stale active", tracked: true, refreshedAt: dated(5) }),
  ];
  assert.equal(metadataRefreshInterval(entries[0]), day);
  assert.equal(metadataRefreshInterval(entries[2]), 7 * day);
  assert.equal(metadataRefreshInterval(entries[4]), 30 * day);
  assert.equal(metadataRefreshInterval(entries[6]), 7 * day);
  assert.deepEqual(
    metadataRefreshQueue(entries, now).map((entry) => entry.id),
    [8, 11, 10, 9, 2],
  );
  assert.deepEqual(
    metadataRefreshQueue(entries, now, 20).map((entry) => entry.id),
    [8, 11, 10, 9, 2, 4, 7, 6],
  );
});
