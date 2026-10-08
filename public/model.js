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

// Return the recorded repeats for an episode key, excluding its original watch.
export function episodeRewatches(show, key, watched = null) {
  return (watched ? watched.has(key) : show.watched.includes(key)) ? show.rewatchCounts?.[key] || 0 : 0;
}

// Count complete repeats across aired episodes; specials belong only to their own season.
export function completeRewatches(show, season = null, date = today()) {
  const episodes = show.episodes.filter((episode) => aired(episode, date) &&
    (season === null ? episode.season_number > 0 : episode.season_number === season));
  if (!episodes.length) return 0;
  // Reuse a lookup across the summary rather than scanning progress for every episode.
  const watched = new Set(show.watched);
  return episodes.reduce((count, episode) => Math.min(count,
    episodeRewatches(show, episodeKey(episode), watched)), Infinity);
}

// Validate optional repeat counts without requiring refreshed metadata to retain every key.
export function validRewatchData(show) {
  if ("lastRewatchedAt" in show && (typeof show.lastRewatchedAt !== "string" ||
      !Number.isFinite(Date.parse(show.lastRewatchedAt)))) return false;
  if (!("rewatchCounts" in show)) return true;
  const counts = show.rewatchCounts;
  return counts !== null && typeof counts === "object" && !Array.isArray(counts) &&
    Object.entries(counts).every(([key, count]) => /^\d+:\d+$/.test(key) &&
      show.watched?.includes(key) && Number.isSafeInteger(count) && count > 0 &&
      count < Number.MAX_SAFE_INTEGER);
}

// Return the latest original or repeat viewing time for My Shows, leaving progress order separate.
export function lastViewingUpdate(show) {
  const dates = [show.lastWatchedAt, show.lastRewatchedAt].filter(Boolean);
  return dates.sort((a, b) => Date.parse(b) - Date.parse(a))[0] || null;
}
// Return the current local calendar date in sortable YYYY-MM-DD form.
export function today(d = new Date()) {
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

// Upcoming releases use date-only UTC ordinals so daylight-saving changes cannot shift a day.
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

// Normalize the browser's upcoming window, retaining only supported choices.
export function upcomingWindow(value) {
  return String(value) === "90" ? 90 : 30;
}

// Convert a valid calendar date into an ordinal, rejecting missing or malformed metadata.
function calendarDay(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) return null;
  return timestamp / DAY_MILLISECONDS;
}

// Select each saved show's nearest future unwatched regular episode in the chosen date window.
export function upcomingEpisodes(shows, window = 30, date = today()) {
  const start = calendarDay(date);
  if (start === null) return [];
  const end = start + upcomingWindow(window);
  const entries = [];
  for (const show of shows) {
    // Dropped is an explicit choice; all other saved statuses and Watchlist remain eligible.
    if ((!inLibrary(show) && !inWatchlist(show)) || show.statusOverride === "Dropped") continue;
    const watched = new Set(show.watched);
    let next = null, nextDay = null;
    // Compare candidates without sorting or changing the cached episode list.
    for (const episode of show.episodes) {
      if (episode.season_number <= 0 || watched.has(episodeKey(episode))) continue;
      const day = calendarDay(episode.air_date);
      if (day === null || day <= start || day > end) continue;
      if (!next || day < nextDay || (day === nextDay &&
          (episode.season_number < next.season_number ||
            (episode.season_number === next.season_number && episode.episode_number < next.episode_number)))) {
        next = episode;
        nextDay = day;
      }
    }
    if (next) entries.push({ show, episode: next, daysUntil: nextDay - start });
  }
  return entries.sort((a, b) => a.daysUntil - b.daysUntil ||
    a.show.name.localeCompare(b.show.name) || a.show.id - b.show.id);
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
// Describe refresh eligibility from the last successful check without scheduling a request.
export function metadataRefreshTiming(show, now = new Date()) {
  const interval = metadataRefreshInterval(show, today(now));
  const refreshed = show.refreshedAt ? Date.parse(show.refreshedAt) : NaN;
  if (!Number.isFinite(refreshed))
    return { refreshedAt: null, dueAt: null, interval, overdue: true, elapsedDays: null, dueDays: 0, overdueDays: 0 };
  const timestamp = now.getTime();
  const dueAt = refreshed + interval;
  // Keep the queue's strict boundary: a check is overdue only after its interval expires.
  return {
    refreshedAt: refreshed,
    dueAt,
    interval,
    overdue: timestamp > dueAt,
    elapsedDays: Math.max(0, Math.floor((timestamp - refreshed) / DAY)),
    dueDays: Math.max(0, Math.floor((dueAt - timestamp) / DAY)),
    overdueDays: Math.max(0, Math.floor((timestamp - dueAt) / DAY)),
  };
}
// Return overview rows with unknown checks first, then overdue and oldest checks.
export function metadataRefreshOverview(shows, now = new Date()) {
  return shows.map((show) => ({ show, timing: metadataRefreshTiming(show, now) }))
    .sort((a, b) =>
      Number(b.timing.refreshedAt === null) - Number(a.timing.refreshedAt === null) ||
      Number(b.timing.overdue) - Number(a.timing.overdue) ||
      (a.timing.refreshedAt ?? 0) - (b.timing.refreshedAt ?? 0) ||
      a.show.name.localeCompare(b.show.name) || a.show.id - b.show.id,
    );
}
// Select a limited queue of stale shows, prioritizing active statuses and oldest metadata.
export function metadataRefreshQueue(
  shows,
  now = new Date(),
  limit = 5,
) {
  const date = today(now);

  // Prioritize shorter refresh intervals, then the stalest metadata.
  return shows
    .filter((show) => metadataRefreshTiming(show, now).overdue)
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
      const watches = 1 + episodeRewatches(show, key, watched);
      episodesWatched += watches;
      const episode = episodesByKey.get(key);
      const exact = positiveRuntime(episode?.runtime);
      const typical = positiveRuntime(show.typicalRuntime);
      const runtime = exact || typical || libraryMedianRuntime;
      if (exact || typical) runtimeCoveredEpisodes += watches;
      if (!exact && runtime) runtimeEstimatedEpisodes += watches;
      if (runtime) estimatedMinutes += runtime * watches;
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
  };
}

// Latest-update detection and retention
const UPDATE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UPDATE_EVENT_TYPES = new Set(["series", "episodes", "premiere", "status"]);

// Return unexpired latest entries in discovery order, including personal activity.
export function latestUpdates(shows, now = new Date().toISOString()) {
  const timestamp = Date.parse(now);
  return shows.filter((show) => show.latestUpdate &&
    timestamp - Date.parse(show.latestUpdate.detectedAt) < UPDATE_RETENTION_MS)
    .sort((a, b) => Date.parse(b.latestUpdate.detectedAt) - Date.parse(a.latestUpdate.detectedAt) || a.id - b.id);
}

// Capture only the facts needed to identify meaningful changes on the next visit.
export function updateSnapshot(show, date) {
  return {
    status: watchStatus(show, date),
    seriesStatus: show.seriesStatus || "",
    aired: (show.episodes || []).filter((episode) => episode.season_number > 0 && aired(episode, date)).map(episodeKey).sort(),
    premieres: (show.episodes || []).filter((episode) => episode.season_number > 0 && episode.episode_number === 1 && episode.air_date > date)
      .map((episode) => ({ season: episode.season_number, date: episode.air_date })),
  };
}

// Reject malformed optional feed data while allowing libraries predating the feed.
export function validUpdateData(show) {
  const snapshot = show.updateSnapshot;
  const entry = show.latestUpdate;
  return (snapshot == null || (typeof snapshot === "object" && typeof snapshot.status === "string" && typeof snapshot.seriesStatus === "string" &&
    Array.isArray(snapshot.aired) && snapshot.aired.every((key) => typeof key === "string") &&
    Array.isArray(snapshot.premieres) && snapshot.premieres.every((item) => item && Number.isSafeInteger(item.season) && item.season > 0 && typeof item.date === "string"))) &&
    (entry == null || (typeof entry === "object" && typeof entry.id === "string" && entry.id.length > 0 && UPDATE_EVENT_TYPES.has(entry.type) && ["external", "personal"].includes(entry.source) &&
      typeof entry.detectedAt === "string" && Number.isFinite(Date.parse(entry.detectedAt)) &&
      (entry.readAt == null || (typeof entry.readAt === "string" && Number.isFinite(Date.parse(entry.readAt)))) &&
      typeof entry.before === "string" && typeof entry.after === "string" && typeof entry.message === "string"));
}

// Replace a show's latest news, preserving unread external news against personal edits.
export function reconcileUpdates(show, { source = "external", now = new Date().toISOString() } = {}) {
  const date = today(new Date(now));
  const current = updateSnapshot(show, date);
  const previous = show.updateSnapshot;
  let entry = show.latestUpdate || null;
  if (entry && Date.parse(now) - Date.parse(entry.detectedAt) >= UPDATE_RETENTION_MS) entry = null;
  let event;
  if (previous) {
    // Episode-key membership stays linear for shows with large back catalogs.
    const previousAired = new Set(previous.aired);
    if (source === "external" && previous.seriesStatus !== current.seriesStatus && ["Ended", "Canceled"].includes(current.seriesStatus)) {
      event = { type: "series", message: current.seriesStatus === "Canceled" ? "Series cancelled" : "Series ended" };
    } else if (source === "external" && current.aired.some((key) => !previousAired.has(key))) {
      event = { type: "episodes", message: "New episodes available" };
    } else if (source === "external" && JSON.stringify(previous.premieres) !== JSON.stringify(current.premieres)) {
      const changed = current.premieres.find((item) => !previous.premieres.some((old) => old.season === item.season && old.date === item.date));
      // Passing a known premiere date is episode news, not a withdrawn announcement.
      const removed = previous.premieres.find((item) => item.date > date && !current.premieres.some((next) => next.season === item.season));
      if (changed) event = { type: "premiere", message: `Season ${changed.season} premieres ${changed.date}` };
      else if (removed) event = { type: "premiere", message: `Season ${removed.season} premiere date is no longer announced` };
    }
    if (!event && previous.status !== current.status) {
      event = { type: "status", message: `${previous.status} → ${current.status}` };
    }
  }
  if (event && !(source === "personal" && entry?.source === "external" && !entry.readAt)) {
    entry = { ...event, id: `${show.id}:${now}:${event.type}`, source, detectedAt: now, readAt: null,
      before: previous.status, after: current.status };
  }
  return { ...show, updateSnapshot: current, latestUpdate: entry };
}
