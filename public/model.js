export const statuses = ["Watching", "Caught Up", "Completed", "Dropped"];
export const libraryTabs = ["All", ...statuses, "Watchlist"];
export function inWatchlist(show) {
  return typeof show.watchlist === "boolean"
    ? show.watchlist
    : !show.watched.length && !show.statusOverride;
}
export function matchesTab(show, tab) {
  if (tab === "Watchlist") return inWatchlist(show);
  if (tab === "All")
    return !inWatchlist(show) || statuses.includes(watchStatus(show));
  return watchStatus(show) === tab;
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
  if (!show.watched.length) return "Not started";
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
