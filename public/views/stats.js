import { libraryStats, statuses } from "../model.js";
import { esc } from "../ui.js";

const circleQuestionMarkIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 1 1 5.83 1c0 2-3 3-3 3"></path><path d="M12 17h.01"></path></svg>`;

// Compact display formatting
function formatHours(minutes) {
  if (minutes == null) return "—";
  const hours = minutes / 60;
  return hours >= 10 ? Math.round(hours).toLocaleString() : hours.toFixed(1);
}

// One compact SVG keeps the histogram dependency-free and easy to inspect.
function ratingChart(buckets) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const bars = buckets
    .map((bucket, index) => {
      const height = (bucket.count / max) * 110;
      const x = 18 + index * 49;
      const y = 114 - height;
      return `<g tabindex="0" role="listitem" aria-label="${bucket.rating} stars: ${bucket.count} ${bucket.count === 1 ? "show" : "shows"}"><title>${bucket.rating} stars: ${bucket.count}</title><rect x="${x}" y="${y}" width="34" height="${height || 2}" rx="4"></rect><text x="${x + 17}" y="139" text-anchor="middle">${bucket.rating}</text></g>`;
    })
    .join("");
  return `<svg class="rating-chart" viewBox="0 0 520 152" role="list" aria-label="Show ratings from half a star to five stars">${bars}</svg>`;
}

export function renderStats(shows, container) {
  // The model owns all calculations; this renderer only shapes accessible sections.
  const data = libraryStats(shows);
  const statusList = statuses
    .map(
      (status) =>
        `<li><span><i class="nav-dot ${status.toLowerCase().replaceAll(" ", "-")}"></i>${status}</span><strong>${data.statusCounts[status]}</strong><progress value="${data.statusCounts[status]}" max="${data.trackedShows || 1}" aria-label="${data.statusCounts[status]} of ${data.trackedShows} tracked shows are ${status.toLowerCase()}"></progress></li>`,
    )
    .join("");
  const genreList = data.topGenres.length
    ? data.topGenres
        .map(
          (genre, index) =>
            `<li><span><b>${index + 1}</b>${esc(genre.name)}</span><strong>${genre.count}</strong><progress value="${genre.count}" max="${data.topGenres[0].count}" aria-label="${genre.count} shows in ${esc(genre.name)}"></progress></li>`,
        )
        .join("")
    : '<li class="stats-empty">Genres will appear as you add shows.</li>';
  const ratedGenreList = data.topGenresByRating.length
    ? data.topGenresByRating
        .map(
          (genre, index) =>
            `<li><span><b>${index + 1}</b><span>${esc(genre.name)}<small>${genre.ratedShows} rated ${genre.ratedShows === 1 ? "show" : "shows"} · ${genre.averageRating.toFixed(1)} raw average</small></span></span><strong>${genre.weightedRating.toFixed(1)} ★</strong><progress value="${genre.weightedRating}" max="5" aria-label="${esc(genre.name)} has a weighted rating of ${genre.weightedRating.toFixed(1)} out of 5, based on a ${genre.averageRating.toFixed(1)} average from ${genre.ratedShows} rated ${genre.ratedShows === 1 ? "show" : "shows"}"></progress></li>`,
        )
        .join("")
    : '<li class="stats-empty">Rated genres will appear after you rate shows.</li>';

  // Coverage distinguishes metadata-backed runtimes from the median fallback.
  const runtimeNote =
    data.estimatedMinutes == null
      ? "Your estimate will appear as runtime metadata refreshes."
      : `${data.runtimeCoveredEpisodes.toLocaleString()} of ${data.episodesWatched.toLocaleString()} watched episodes have show or episode runtime data. Missing runtimes use your library median.`;
  container.innerHTML = `
    <section class="stats-overview" aria-label="Library overview">
      <article><i class="stats-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="3" rx="2"></rect><path d="M8 21h8M12 17v4"></path></svg></i><strong>${data.trackedShows.toLocaleString()}</strong><span>Tracked shows</span></article>
      <article><i class="stats-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="m10 8 6 4-6 4Z"></path></svg></i><strong>${data.episodesWatched.toLocaleString()}</strong><span>Episodes watched</span></article>
      <article><i class="stats-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><path d="M12 6v6h4"></path></svg></i><strong>${formatHours(data.estimatedMinutes)}${data.estimatedMinutes == null ? "" : "<small>h</small>"}</strong><span class="stats-overview-label">Est. hours watched <span class="stats-info runtime-info" tabindex="0" aria-label="How watch time is estimated" aria-describedby="runtime-estimate-help">${circleQuestionMarkIcon}<span id="runtime-estimate-help" role="tooltip">${runtimeNote} Specials count toward watched time. Regular aired episodes determine progress and completed seasons.</span></span></span></article>
      <article><i class="stats-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 2 10 5-10 5L2 7Z"></path><path d="m2 12 10 5 10-5M2 17l10 5 10-5"></path></svg></i><strong>${data.seasonsCompleted.toLocaleString()}</strong><span>Seasons completed</span></article>
      <article><i class="stats-overview-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01Z"></path></svg></i><strong>${data.ratedShows.toLocaleString()}</strong><span>Rated shows</span></article>
    </section>
    <div class="stats-layout">
      <section class="stats-panel ratings-panel" aria-labelledby="ratings-heading">
        <div class="stats-panel-heading"><h2 id="ratings-heading">Ratings</h2><strong>${data.averageRating == null ? "—" : data.averageRating.toFixed(1)} <small>average</small></strong></div>
        ${data.ratedShows ? ratingChart(data.ratingBuckets) : '<div class="stats-empty"><strong>No ratings yet.</strong><span>Your rating spread will appear here.</span></div>'}
        <p class="stats-footnote">${data.ratedShows} rated · ${data.unratedShows} unrated</p>
      </section>
      <section class="stats-panel" aria-labelledby="library-breakdown-heading">
        <div class="stats-panel-heading"><h2 id="library-breakdown-heading">Library breakdown</h2></div>
        <ul class="stats-bars">${statusList}</ul>
        <div class="watchlist-total"><span><i class="nav-dot watchlist"></i>Watchlist <small>can overlap</small></span><strong>${data.watchlistShows}</strong></div>
      </section>
      <div class="stats-genre-layout">
        <section class="stats-panel" aria-labelledby="genres-heading">
          <div class="stats-panel-heading"><h2 id="genres-heading">Most watched genres</h2></div>
          <ol class="stats-bars genre-bars">${genreList}</ol>
        </section>
        <section class="stats-panel" aria-labelledby="genres-rating-heading">
          <div class="stats-panel-heading"><div class="stats-heading-with-info"><h2 id="genres-rating-heading">Highest-rated genres</h2><span class="stats-info" tabindex="0" aria-label="How genre ratings are calculated" aria-describedby="genre-rating-formula">${circleQuestionMarkIcon}<span id="genre-rating-formula" role="tooltip"><span class="stats-formula" aria-label="Weighted rate equals v times R plus m times C, divided by v plus m"><i>Weighted Rate</i> = <span class="stats-fraction"><span>(<i>v</i> × <i>R</i>) + (<i>m</i> × <i>C</i>)</span><span><i>v</i> + <i>m</i></span></span></span><span class="stats-formula-definitions"><span><i>v</i> = rated shows in the genre</span><span><i>R</i> = genre’s raw rating average</span><span><i>m</i> = confidence weight of 3 ratings</span><span><i>C</i> = average across all rated shows</span></span><span class="stats-formula-note">Unrated shows are excluded.</span></span></span></div></div>
          <ol class="stats-bars genre-bars genre-rating-bars">${ratedGenreList}</ol>
        </section>
      </div>
      <section class="stats-panel progress-panel" aria-labelledby="progress-heading">
        <div class="stats-panel-heading"><h2 id="progress-heading">Aired episode progress</h2><strong>${Math.round(data.progressPercent)}%</strong></div>
        <progress value="${data.watchedRegularEpisodes}" max="${data.airedRegularEpisodes || 1}" aria-label="${data.watchedRegularEpisodes} of ${data.airedRegularEpisodes} regular aired episodes watched"></progress>
        <p><strong>${data.watchedRegularEpisodes.toLocaleString()}</strong> of ${data.airedRegularEpisodes.toLocaleString()} regular aired episodes watched</p>
        <small>Specials are excluded from progress and completed-season totals.</small>
      </section>
    </div>`;
}
