import {
  inLibrary,
  inWatchlist,
  libraryTabs,
  matchesTab,
  progress,
  statuses,
  watchStatus,
} from "../model.js";
import {
  $,
  badge,
  displayDate,
  episodeCode,
  esc,
  poster,
  stars,
  year,
} from "../ui.js";

function progressLabel(show) {
  const showProgress = progress(show);
  if (showProgress.next)
    return `${episodeCode(showProgress.next)} next · ${showProgress.done}/${showProgress.total} watched`;
  if (showProgress.done)
    return `${showProgress.done}/${showProgress.total} aired watched`;
  return "Not started";
}

function sortShows(shows, sort) {
  shows.sort((a, b) => {
    if (sort === "last-updated") {
      if (!a.lastWatchedAt || !b.lastWatchedAt)
        return (
          Number(!a.lastWatchedAt) - Number(!b.lastWatchedAt) ||
          (b.addedAt || "").localeCompare(a.addedAt || "") ||
          a.name.localeCompare(b.name)
        );
      return (
        b.lastWatchedAt.localeCompare(a.lastWatchedAt) ||
        (b.addedAt || "").localeCompare(a.addedAt || "") ||
        a.name.localeCompare(b.name)
      );
    }
    if (sort === "release-newest" || sort === "release-oldest") {
      if (!a.first_air_date || !b.first_air_date)
        return (
          Number(!a.first_air_date) - Number(!b.first_air_date) ||
          a.name.localeCompare(b.name)
        );
      const order = a.first_air_date.localeCompare(b.first_air_date);
      return (
        (sort === "release-newest" ? -order : order) ||
        a.name.localeCompare(b.name)
      );
    }
    return sort === "title"
      ? a.name.localeCompare(b.name)
      : sort === "rating"
        ? (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name)
        : b.addedAt.localeCompare(a.addedAt);
  });
}

export function renderLibrary(shows, activeTab, viewMode) {
  const counts = Object.fromEntries(
    [...statuses, "Watchlist"].map((status) => [
      status,
      shows.filter((show) => matchesTab(show, status)).length,
    ]),
  );
  const tracked = shows.filter((show) => matchesTab(show, "All"));
  $("#tabs").innerHTML = libraryTabs
    .map(
      (status) =>
        `<button class="tab ${activeTab === status ? "active" : ""}" data-tab="${status}" aria-pressed="${activeTab === status}">${status === "All" ? "All shows" : status}<span class="count">${status === "All" ? tracked.length : counts[status]}</span></button>`,
    )
    .join("");
  const selectedGenre = $("#genre").value;
  const genres = [
    ...new Map(
      shows
        .flatMap((show) => show.genres)
        .map((genre) => [String(genre.id), genre.name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  $("#genre").innerHTML =
    '<option value="">All genres</option>' +
    genres
      .map(([id, name]) => `<option value="${id}">${esc(name)}</option>`)
      .join("");
  $("#genre").value = genres.some(([id]) => id === selectedGenre)
    ? selectedGenre
    : "";
  const query = $("#library-query").value.trim().toLowerCase();
  const rating = $("#rating-filter").value;
  const filtered = shows.filter(
    (show) =>
      matchesTab(show, activeTab) &&
      show.name.toLowerCase().includes(query) &&
      (!$("#genre").value ||
        show.genres.some(
          (genre) => String(genre.id) === $("#genre").value,
        )) &&
      (!rating ||
        (rating === "unrated"
          ? !show.rating
          : show.rating >= Number(rating))),
  );
  sortShows(filtered, $("#sort").value);
  $("#result-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "show" : "shows"}${activeTab === "All" ? " in your collection" : ` · ${activeTab.toLowerCase()}`}`;
  $("#library-grid").className =
    viewMode === "list" ? "show-list" : "poster-grid";
  $("#library-grid").innerHTML =
    viewMode === "list"
      ? `<div class="list-header" aria-hidden="true"><span>Show</span><span>Released</span><span>Status</span><span>Rating</span><span>Progress</span><span>Last updated</span></div>${filtered
          .map(
            (show) =>
              `<button class="show-card show-row" data-show="${show.id}" aria-label="Open ${esc(show.name)}"><span class="list-title">${poster(show, "list-poster", "w92")}<span><strong>${esc(show.name)}</strong>${inWatchlist(show) ? '<small>On watchlist</small>' : ""}</span></span><span class="list-cell" data-label="Released">${displayDate(show.first_air_date)}</span><span class="list-cell" data-label="Status">${badge(watchStatus(show))}</span><span class="list-cell" data-label="Rating">${stars(show.rating)}</span><span class="list-cell" data-label="Progress">${esc(progressLabel(show))}</span><span class="list-cell" data-label="Last updated">${show.lastWatchedAt ? displayDate(show.lastWatchedAt, true) : "No updates yet"}</span></button>`,
          )
          .join("")}`
      : filtered
          .map((show) => {
            const showProgress = progress(show);
            return `<button class="show-card" data-show="${show.id}" aria-label="Open ${esc(show.name)}"><div class="poster-wrap">${poster(show)}<span class="card-badges">${inLibrary(show) ? badge(watchStatus(show)) : ""}${inWatchlist(show) ? badge("Watchlist") : ""}</span></div><div class="card-heading"><h3>${esc(show.name)}</h3><small>${year(show)}</small></div><div class="card-meta">${stars(show.rating)}<span>${showProgress.done ? `${showProgress.done} / ${showProgress.total} eps` : "Not started"}</span></div><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="${showProgress.done} of ${showProgress.total} aired episodes watched"></progress></button>`;
          })
          .join("");
  $("#empty").hidden = filtered.length > 0;
  $("#empty").innerHTML = shows.length
    ? '<span class="empty-icon">⌕</span><h2>No shows here just yet.</h2><p>Try another status or adjust your filters to find your shows.</p><button id="reset-filters">Clear filters</button>'
    : '<span class="empty-icon">▰</span><h2>A new season starts here.</h2><p>Build a home for the shows you love. Find your first show, give it a rating, and pick up right where you left off.</p><button class="primary" id="first-show">Find your first show <span aria-hidden="true">↗</span></button>';
  if (!filtered.length && activeTab === "Watchlist") {
    $("#empty").innerHTML =
      '<span class="empty-icon">＋</span><h2>Your next great show starts here.</h2><p>Save any show here, whether you have started it or not. Add or remove the watchlist flag from its details.</p><button class="primary" id="first-show">Find a show</button>';
  } else if (!tracked.length && counts.Watchlist && activeTab === "All") {
    $("#empty").innerHTML =
      '<span class="empty-icon">▰</span><h2>Your shows are on your watchlist.</h2><p>Start watching a saved show to include it in All shows. You can keep its watchlist flag and viewing status separately.</p><button class="primary" data-tab="Watchlist">View watchlist</button>';
  }
}
