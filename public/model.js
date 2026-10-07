// Library membership and filter rules
export const statuses = [
  "Watching",
  "Paused",
  "Caught Up",
  "Completed",
  "Dropped",
];

// Artwork overrides are personal choices; refreshed TMDB defaults stay separate.
// Resolve a personal artwork override before falling back to the TMDB default.
export function artworkPath(show, kind) {
  return show[`${kind}Override`] || show[`${kind}_path`] || null;
}

// Check that an artwork choice is a supported relative TMDB image path.
export function validArtworkPath(value) {
  return typeof value === "string" && /^\/[\w.-]+\.(?:jpg|jpeg|png|webp)$/i.test(value);
}

// Stable sorting prioritizes readable posters and backdrops without overlaid text.
// Order artwork stably, prioritizing English posters or text-free backdrops.
export function artworkOptions(items, kind) {
  const preferred = kind === "poster" ? "en" : null;
  return [...items].sort((a, b) =>
    Number(b.iso_639_1 === preferred) - Number(a.iso_639_1 === preferred));
}

// Existing gallery/list preferences remain valid; unknown saved values reset safely.
// Normalize saved collection display preferences, defaulting unknown values to gallery.
export function collectionView(value) {
  return ["gallery", "backdrop", "list"].includes(value) ? value : "gallery";
}
// Determine tracked membership, preserving libraries saved before explicit membership flags.
export function inLibrary(show) {
  // Preserve membership of libraries saved before tracking and watchlist were separate.
  return typeof show.tracked === "boolean"
    ? show.tracked
    : Boolean(
        show.watched.length || show.statusOverride || show.watchlist === false,
      );
}
// Determine Watchlist membership, including the implied flag in legacy libraries.
export function inWatchlist(show) {
  // Older saves implied Watchlist when a show had no progress or manual status.
  return typeof show.watchlist === "boolean"
    ? show.watchlist
    : !show.watched.length && !show.statusOverride;
}
// Test library or Watchlist membership against a collection tab.
export function matchesTab(show, tab) {
  if (tab === "Watchlist") return inWatchlist(show);
  if (tab === "All") return inLibrary(show);
  return inLibrary(show) && watchStatus(show) === tab;
}
// Match any selected status and intersect it with optional Watchlist membership.
export function matchesLibraryFilters(show, selectedStatuses, watchlistOnly) {
  // Watchlist intersects selected statuses because it is independent membership.
  if (watchlistOnly && !inWatchlist(show)) return false;
  if (!selectedStatuses.size) return watchlistOnly || inLibrary(show);
  return inLibrary(show) && selectedStatuses.has(watchStatus(show));
}
// Require a show to contain every selected genre.
export function matchesGenres(show, selectedGenres) {
  // Multiple genre selections use AND behavior.
  return [...selectedGenres].every((selectedGenre) =>
    show.genres.some((genre) => String(genre.id) === selectedGenre),
  );
}

// List presentation preserves manual ranks while unordered lists use saved sorts.
export const listSorts = [
  "manual",
  "added-oldest",
  "added-newest",
  "title-asc",
  "title-desc",
  "release-newest",
  "release-oldest",
  "rating-high",
  "rating-low",
  "watch-status",
];
// Resolve list members and apply display sorting without changing stored manual ranks.
export function listEntries(list, shows) {
  const showsById = new Map(shows.map((show) => [show.id, show]));
  const entries = list.entries
    .map((entry, index) => ({ entry, index, show: showsById.get(entry.showId) }))
    .filter(({ show }) => show);
  if (list.ordered && list.sort === "manual") return entries;

  // Compare a list field in either direction while keeping absent values last.
  const missingLast = (a, b, value, direction = 1) => {
    const valueA = value(a.show);
    const valueB = value(b.show);
    if (valueA == null && valueB == null) return a.index - b.index;
    if (valueA == null) return 1;
    if (valueB == null) return -1;
    return direction * (valueA < valueB ? -1 : valueA > valueB ? 1 : 0);
  };
  const comparators = {
    // Group statuses with title ordering while preserving exact ties by original index.
    "watch-status": (a, b) => compareWatchStatus(a.show, b.show) || a.index - b.index,
    // Retain the stored entry order for ranked lists.
    manual: (a, b) => a.index - b.index,
    // Order list members by oldest membership date, preserving exact ties.
    "added-oldest": (a, b) =>
      a.entry.addedAt.localeCompare(b.entry.addedAt) || a.index - b.index,
    // Order list members by newest membership date, preserving exact ties.
    "added-newest": (a, b) =>
      b.entry.addedAt.localeCompare(a.entry.addedAt) || a.index - b.index,
    // Order list titles alphabetically, preserving exact ties.
    "title-asc": (a, b) =>
      a.show.name.localeCompare(b.show.name) || a.index - b.index,
    // Order list titles in reverse alphabetical order, preserving exact ties.
    "title-desc": (a, b) =>
      b.show.name.localeCompare(a.show.name) || a.index - b.index,
    // Order premiere dates newest first, leaving unknown dates last.
    "release-newest": (a, b) =>
      missingLast(a, b, (show) => show.first_air_date || null, -1) ||
      a.index - b.index,
    // Order premiere dates oldest first, leaving unknown dates last.
    "release-oldest": (a, b) =>
      missingLast(a, b, (show) => show.first_air_date || null) ||
      a.index - b.index,
    // Order personal ratings highest first, leaving unrated shows last.
    "rating-high": (a, b) =>
      missingLast(
        a,
        b,
        (show) => (Number.isFinite(show.rating) ? show.rating : null),
        -1,
      ) || a.index - b.index,
    // Order personal ratings lowest first, leaving unrated shows last.
    "rating-low": (a, b) =>
      missingLast(
        a,
        b,
        (show) => (Number.isFinite(show.rating) ? show.rating : null),
      ) || a.index - b.index,
  };
  return entries.sort(comparators[list.sort] || comparators["added-oldest"]);
}

// Episode ordering, availability, and progress
// Build the season-and-episode key used to store watched progress.
export const episodeKey = (e) => `${e.season_number}:${e.episode_number}`;
// Return the current local calendar date in sortable YYYY-MM-DD form.
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// Treat episodes with a known air date on or before the chosen date as available.
export const aired = (e, date = today()) =>
  Boolean(e.air_date && e.air_date <= date);
// Return nonspecial episodes ordered by season and episode number.
export function regularEpisodes(show) {
  return show.episodes
    .filter((e) => e.season_number > 0)
    .sort(
      (a, b) =>
        a.season_number - b.season_number ||
        a.episode_number - b.episode_number,
    );
}
// Summarize aired progress, last watched, next unwatched, and upcoming regular episodes.
export function progress(show, date = today()) {
  const episodes = regularEpisodes(show);
  const available = episodes.filter((e) => aired(e, date));
  const watched = new Set(show.watched);

  // Upcoming follows the full timeline while next is limited to aired episodes.
  return {
    total: available.length,
    done: available.filter((e) => watched.has(episodeKey(e))).length,
    last: episodes.filter((e) => watched.has(episodeKey(e))).at(-1),
    next: available.find((e) => !watched.has(episodeKey(e))),
    upcoming: episodes.find((e) => e.air_date > date),
  };
}
// Use a manual status when present; otherwise derive status from progress and series state.
export function watchStatus(show, date = today()) {
  // Explicit corrections always take precedence over derived progress.
  if (show.statusOverride) return show.statusOverride;
  if (!show.watched.length) return inLibrary(show) ? "Watching" : "Not started";
  const p = progress(show, date);
  if (!p.total || p.done < p.total) return "Watching";
  const all = regularEpisodes(show);
  const ended = ["Ended", "Canceled"].includes(show.seriesStatus);
  // Unknown dates and announced but unaired episodes prevent false completion.
  if (
    ended &&
    all.every((e) => aired(e, date) && show.watched.includes(episodeKey(e))) &&
    all.length >= show.episodeCount
  )
    return "Completed";
  return "Caught Up";
}

// Group by the interface's status order; Watchlist-only saves come last.
// Titles provide a consistent order inside groups without changing manual ranks.
// Compare shows by the interface's status order, then alphabetically by title.
export function compareWatchStatus(a, b, date = today()) {
  // Map a derived watch status to its sort position, placing untracked shows last.
  const rank = (show) => {
    const index = statuses.indexOf(watchStatus(show, date));
    return index < 0 ? statuses.length : index;
  };
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

// Metadata refresh scheduling

// App startup builds this queue after rendering saved data, then refreshes up to
// five overdue shows sequentially. There is no background timer; later starts or
// reloads continue through the remaining eligible shows.
const DAY = 24 * 60 * 60 * 1000;
// Choose the refresh interval from membership and current watch status.
export function metadataRefreshInterval(show, date = today()) {
  // Active shows refresh most often; stable library states back off gradually.
  if (!inLibrary(show) && inWatchlist(show)) return 7 * DAY;
  const status = watchStatus(show, date);
  if (["Watching", "Caught Up"].includes(status)) return DAY;
  if (status === "Paused") return 7 * DAY;
  return 30 * DAY;
}
// Select a limited queue of stale shows, prioritizing active statuses and oldest metadata.
export function metadataRefreshQueue(
  shows,
  now = new Date(),
  limit = 5,
) {
  const timestamp = now.getTime();
  const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  // Prioritize shorter refresh intervals, then the stalest metadata.
  return shows
    .filter((show) => {
      const refreshed = new Date(show.refreshedAt).getTime();
      return (
        !Number.isFinite(refreshed) ||
        timestamp - refreshed > metadataRefreshInterval(show, date)
      );
    })
    .sort(
      (a, b) =>
        metadataRefreshInterval(a, date) - metadataRefreshInterval(b, date) ||
        (a.refreshedAt || "").localeCompare(b.refreshedAt || "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}

// Statistics helpers
// Normalize a finite positive runtime or return null when it is unavailable.
const positiveRuntime = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

// Find the middle runtime, averaging the two central values for an even sample.
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Select up to five rated tracked shows, breaking ties by progress recency and title.
export function topRatedShows(shows) {
  return shows
    .filter(inLibrary)
    .filter((show) => Number.isFinite(show.rating))
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        (b.lastWatchedAt || "").localeCompare(a.lastWatchedAt || "") ||
        (b.addedAt || "").localeCompare(a.addedAt || "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 5);
}

// Aggregate tracked-library ratings, statuses, progress, runtime estimates, and genre rankings.
export function libraryStats(shows, date = today()) {
  // Overview and ratings include tracked shows; Watchlist is counted separately.
  const tracked = shows.filter(inLibrary);
  const statusCounts = Object.fromEntries(
    statuses.map((status) => [
      status,
      tracked.filter((show) => watchStatus(show, date) === status).length,
    ]),
  );
  const ratings = tracked
    .map((show) => show.rating)
    .filter((rating) => Number.isFinite(rating));
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;
  const ratingBuckets = Array.from({ length: 10 }, (_, index) => {
    const rating = (index + 1) / 2;
    return { rating, count: ratings.filter((value) => value === rating).length };
  });

  // The library median is the final fallback when episode and show runtimes are absent.
  const knownRuntimes = tracked.flatMap((show) => [
    ...show.episodes.map((episode) => positiveRuntime(episode.runtime)),
    positiveRuntime(show.typicalRuntime),
  ]).filter(Boolean);
  const libraryMedianRuntime = median(knownRuntimes);
  let episodesWatched = 0;
  let seasonsCompleted = 0;
  let watchedRegularEpisodes = 0;
  let airedRegularEpisodes = 0;
  let estimatedMinutes = 0;
  let runtimeCoveredEpisodes = 0;
  let runtimeEstimatedEpisodes = 0;

  // Aggregate progress, completed seasons, and watch-time coverage per show.
  for (const show of tracked) {
    const watched = new Set(show.watched);
    const episodesByKey = new Map(
      show.episodes.map((episode) => [episodeKey(episode), episode]),
    );
    episodesWatched += watched.size;
    const airedRegular = show.episodes.filter(
      (episode) => episode.season_number > 0 && aired(episode, date),
    );
    airedRegularEpisodes += airedRegular.length;
    watchedRegularEpisodes += airedRegular.filter((episode) =>
      watched.has(episodeKey(episode)),
    ).length;

    // A season is complete only when every currently aired regular episode is watched.
    const seasons = new Map();
    for (const episode of airedRegular) {
      const group = seasons.get(episode.season_number) || [];
      group.push(episode);
      seasons.set(episode.season_number, group);
    }
    seasonsCompleted += [...seasons.values()].filter(
      (episodes) =>
        episodes.length &&
        episodes.every((episode) => watched.has(episodeKey(episode))),
    ).length;

    // Specials contribute to watch time even though they do not affect show progress.
    for (const key of watched) {
      const episode = episodesByKey.get(key);
      const exact = positiveRuntime(episode?.runtime);
      const typical = positiveRuntime(show.typicalRuntime);
      const runtime = exact || typical || libraryMedianRuntime;
      if (exact || typical) runtimeCoveredEpisodes += 1;
      if (!exact && runtime) runtimeEstimatedEpisodes += 1;
      if (runtime) estimatedMinutes += runtime;
    }
  }

  // Rankings use deterministic alphabetical fallbacks for equal counts or ratings.
  const genreStats = new Map();
  for (const show of tracked) {
    for (const genre of show.genres || []) {
      const totals = genreStats.get(genre.name) || {
        count: 0,
        ratingTotal: 0,
        ratedShows: 0,
      };
      totals.count += 1;
      if (Number.isFinite(show.rating)) {
        totals.ratingTotal += show.rating;
        totals.ratedShows += 1;
      }
      genreStats.set(genre.name, totals);
    }
  }
  const topGenres = [...genreStats.entries()]
    .map(([name, totals]) => ({ name, count: totals.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
  // Three ratings at the library average temper genres backed by small samples.
  const genreRatingPriorWeight = 3;
  const topGenresByRating = [...genreStats.entries()]
    .filter(([, totals]) => totals.ratedShows)
    .map(([name, totals]) => ({
      name,
      averageRating: totals.ratingTotal / totals.ratedShows,
      weightedRating:
        (totals.ratingTotal + genreRatingPriorWeight * averageRating) /
        (totals.ratedShows + genreRatingPriorWeight),
      ratedShows: totals.ratedShows,
    }))
    .sort(
      (a, b) =>
        b.weightedRating - a.weightedRating ||
        b.ratedShows - a.ratedShows ||
        b.averageRating - a.averageRating ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 5);
  return {
    trackedShows: tracked.length,
    episodesWatched,
    seasonsCompleted,
    estimatedMinutes: knownRuntimes.length ? estimatedMinutes : null,
    runtimeCoveredEpisodes,
    runtimeEstimatedEpisodes,
    statusCounts,
    watchlistShows: shows.filter(inWatchlist).length,
    averageRating,
    ratedShows: ratings.length,
    unratedShows: tracked.length - ratings.length,
    ratingBuckets,
    watchedRegularEpisodes,
    airedRegularEpisodes,
    progressPercent: airedRegularEpisodes
      ? (watchedRegularEpisodes / airedRegularEpisodes) * 100
      : 0,
    topGenres,
    topGenresByRating,
    topRated: topRatedShows(tracked),
  };
}
