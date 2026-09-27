export const statuses = [
  "Watching",
  "Paused",
  "Caught Up",
  "Completed",
  "Dropped",
];
export const libraryTabs = ["All", ...statuses, "Watchlist"];
export function inLibrary(show) {
  // Preserve membership of libraries saved before tracking and watchlist were separate.
  return typeof show.tracked === "boolean"
    ? show.tracked
    : Boolean(
        show.watched.length || show.statusOverride || show.watchlist === false,
      );
}
export function inWatchlist(show) {
  return typeof show.watchlist === "boolean"
    ? show.watchlist
    : !show.watched.length && !show.statusOverride;
}
export function matchesTab(show, tab) {
  if (tab === "Watchlist") return inWatchlist(show);
  if (tab === "All") return inLibrary(show);
  return inLibrary(show) && watchStatus(show) === tab;
}
export const episodeKey = (e) => `${e.season_number}:${e.episode_number}`;
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export const aired = (e, date = today()) =>
  Boolean(e.air_date && e.air_date <= date);
export function regularEpisodes(show) {
  return show.episodes
    .filter((e) => e.season_number > 0)
    .sort(
      (a, b) =>
        a.season_number - b.season_number ||
        a.episode_number - b.episode_number,
    );
}
export function progress(show, date = today()) {
  const episodes = regularEpisodes(show);
  const available = episodes.filter((e) => aired(e, date));
  const watched = new Set(show.watched);
  return {
    total: available.length,
    done: available.filter((e) => watched.has(episodeKey(e))).length,
    last: episodes.filter((e) => watched.has(episodeKey(e))).at(-1),
    next: available.find((e) => !watched.has(episodeKey(e))),
    upcoming: episodes.find((e) => e.air_date > date),
  };
}
export function watchStatus(show, date = today()) {
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

const positiveRuntime = (value) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : null;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function libraryStats(shows, date = today()) {
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
  const ratingBuckets = Array.from({ length: 10 }, (_, index) => {
    const rating = (index + 1) / 2;
    return { rating, count: ratings.filter((value) => value === rating).length };
  });
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
  const genreCounts = new Map();
  for (const show of tracked)
    for (const genre of show.genres || [])
      genreCounts.set(genre.name, (genreCounts.get(genre.name) || 0) + 1);
  const topGenres = [...genreCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 5);
  const topRated = tracked
    .filter((show) => Number.isFinite(show.rating))
    .sort(
      (a, b) =>
        b.rating - a.rating ||
        (b.lastWatchedAt || "").localeCompare(a.lastWatchedAt || "") ||
        (b.addedAt || "").localeCompare(a.addedAt || "") ||
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
    averageRating: ratings.length
      ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
      : null,
    ratedShows: ratings.length,
    unratedShows: tracked.length - ratings.length,
    ratingBuckets,
    watchedRegularEpisodes,
    airedRegularEpisodes,
    progressPercent: airedRegularEpisodes
      ? (watchedRegularEpisodes / airedRegularEpisodes) * 100
      : 0,
    topGenres,
    topRated,
  };
}
