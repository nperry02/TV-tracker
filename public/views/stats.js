import { libraryStats, statuses } from "../model.js";
import { esc } from "../ui.js";

// Compact display formatting
function formatHours(minutes) {
  if (minutes == null) return "—";
  const hours = minutes / 60;
  return hours >= 10 ? Math.round(hours).toLocaleString() : hours.toFixed(1);
}

// SVG keeps the histogram dependency-free while exposing each bucket to assistive tech.
function ratingChart(buckets) {
  const max = Math.max(1, ...buckets.map((bucket) => bucket.count));
  const bars = buckets
    .map((bucket, index) => {
      const height = (bucket.count / max) * 112;
      const x = 18 + index * 49;
      const y = 132 - height;
      return `<g tabindex="0" role="listitem" aria-label="${bucket.rating} stars: ${bucket.count} ${bucket.count === 1 ? "show" : "shows"}"><title>${bucket.rating} stars: ${bucket.count}</title><rect x="${x}" y="${y}" width="34" height="${height || 2}" rx="4"></rect><text x="${x + 17}" y="157" text-anchor="middle">${bucket.rating}</text></g>`;
    })
    .join("");
  return `<svg class="rating-chart" viewBox="0 0 520 170" role="list" aria-label="Show ratings from half a star to five stars">${bars}</svg>`;
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
      <article><i aria-hidden="true">▶</i><strong>${data.trackedShows.toLocaleString()}</strong><span>Tracked shows</span></article>
      <article><i aria-hidden="true">✓</i><strong>${data.episodesWatched.toLocaleString()}</strong><span>Episodes watched</span></article>
      <article><i aria-hidden="true">▤</i><strong>${data.seasonsCompleted.toLocaleString()}</strong><span>Seasons completed</span></article>
      <article><i aria-hidden="true">◷</i><strong>${formatHours(data.estimatedMinutes)}${data.estimatedMinutes == null ? "" : "h"}</strong><span>Estimated hours watched</span></article>
    </section>
    <div class="stats-layout">
      <section class="stats-panel ratings-panel" aria-labelledby="ratings-heading">
        <div class="stats-panel-heading"><div><p class="eyebrow">YOUR TASTE</p><h2 id="ratings-heading">Ratings</h2></div><strong>${data.averageRating == null ? "—" : data.averageRating.toFixed(1)} <small>average</small></strong></div>
        ${data.ratedShows ? ratingChart(data.ratingBuckets) : '<div class="stats-empty"><strong>No ratings yet.</strong><span>Your rating spread will appear here.</span></div>'}
        <p class="stats-footnote">${data.ratedShows} rated · ${data.unratedShows} unrated</p>
      </section>
      <section class="stats-panel" aria-labelledby="library-breakdown-heading">
        <div class="stats-panel-heading"><div><p class="eyebrow">CURRENT STATUS</p><h2 id="library-breakdown-heading">Library breakdown</h2></div></div>
        <ul class="stats-bars">${statusList}</ul>
        <div class="watchlist-total"><span><i class="nav-dot watchlist"></i>Watchlist <small>can overlap</small></span><strong>${data.watchlistShows}</strong></div>
      </section>
      <section class="stats-panel" aria-labelledby="genres-heading">
        <div class="stats-panel-heading"><div><p class="eyebrow">MOST WATCHED</p><h2 id="genres-heading">Top genres</h2></div></div>
        <ol class="stats-bars genre-bars">${genreList}</ol>
      </section>
      <section class="stats-panel" aria-labelledby="genres-rating-heading">
        <div class="stats-panel-heading"><div><p class="eyebrow stats-eyebrow">HIGHEST RATED <span class="stats-info" tabindex="0" aria-label="How genre ratings are calculated" aria-describedby="genre-rating-formula"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.7 9a2.5 2.5 0 0 1 4.8 1c0 1.8-2.5 2-2.5 3.8"></path><path d="M12 17.3h.01"></path></svg><span id="genre-rating-formula" role="tooltip">Weighted score = (genre rating total + 3 × overall rating average) ÷ (rated shows in genre + 3). Unrated shows are excluded.</span></span></p><h2 id="genres-rating-heading">Top genres by rating</h2></div></div>
        <ol class="stats-bars genre-bars genre-rating-bars">${ratedGenreList}</ol>
      </section>
      <section class="stats-panel progress-panel" aria-labelledby="progress-heading">
        <div class="stats-panel-heading"><div><p class="eyebrow">AIRED EPISODES</p><h2 id="progress-heading">Progress</h2></div><strong>${Math.round(data.progressPercent)}%</strong></div>
        <progress value="${data.watchedRegularEpisodes}" max="${data.airedRegularEpisodes || 1}" aria-label="${data.watchedRegularEpisodes} of ${data.airedRegularEpisodes} regular aired episodes watched"></progress>
        <p><strong>${data.watchedRegularEpisodes.toLocaleString()}</strong> of ${data.airedRegularEpisodes.toLocaleString()} regular aired episodes watched</p>
        <small>Specials are excluded from progress and completed-season totals.</small>
      </section>
    </div>
    <section class="stats-panel runtime-panel" aria-labelledby="runtime-heading">
      <div><p class="eyebrow">WATCH TIME</p><h2 id="runtime-heading">About your estimate</h2></div><p>${runtimeNote}</p>
    </section>`;
}
