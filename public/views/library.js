import {
  artworkPath,
  compareWatchStatus,
  inLibrary,
  inWatchlist,
  matchesLibraryFilters,
  matchesGenres,
  matchesTab,
  progress,
  statuses,
  watchStatus,
  lastViewingUpdate,
} from "../model.js";
import {
  $,
  badge,
  collectionGenreFilter,
  collectionStatusFilter,
  displayDate,
  episodeCode,
  esc,
  poster,
  stars,
  image,
  viewToggle,
  posterGalleryCard,
} from "../ui.js";

// Card and list presentation helpers
// Describe the next unwatched episode or the current aired-episode progress.
function progressLabel(show) {
  const showProgress = progress(show);
  if (showProgress.next)
    return `${episodeCode(showProgress.next)} next · ${showProgress.done}/${showProgress.total} watched`;
  if (showProgress.done)
    return `${showProgress.done}/${showProgress.total} aired watched`;
  return "Not started";
}

// Sort a filtered collection in place using the chosen library display order.
function sortShows(shows, sort) {
  // Missing dates stay after dated shows; names make every ordering deterministic.
  shows.sort((a, b) => {
    if (sort === "watch-status") return compareWatchStatus(a, b);
    if (sort === "last-updated") {
      const dateA = lastViewingUpdate(a), dateB = lastViewingUpdate(b);
      if (!dateA || !dateB)
        return (
          Number(!dateA) - Number(!dateB) ||
          (b.addedAt || "").localeCompare(a.addedAt || "") ||
          a.name.localeCompare(b.name)
        );
      return (
        Date.parse(dateB) - Date.parse(dateA) ||
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

// Render library counts, filters, and the selected collection layout from saved shows.
export function renderLibrary(shows, libraryFilters, viewMode) {
  // My Shows and list details use the same complete three-way view switch.
  const focusedView = document.activeElement?.closest("#library-view-toggle [data-view]")?.dataset.view;
  $("#library-view-toggle").outerHTML = viewToggle(viewMode, { label: "Library view" });
  if (focusedView) $(`#library-view-toggle [data-view="${focusedView}"]`)?.focus({ preventScroll: true });
  // Preserve native details state because rendering replaces both filter menus.
  const { selectedStatuses, selectedGenres, watchlistOnly } = libraryFilters;
  const statusMenuOpen = $("#status-filter")?.open;
  const genreMenuOpen = $("#genre-filter")?.open;
  const counts = Object.fromEntries(
    [...statuses, "Watchlist"].map((status) => [
      status,
      shows.filter((show) => matchesTab(show, status)).length,
    ]),
  );

  // Watch statuses share one multi-select menu; Watchlist remains independent.
  const tracked = shows.filter((show) => matchesTab(show, "All"));
  const selectedLabels = [...selectedStatuses];
  $("#tabs").innerHTML = collectionStatusFilter({
    selected: selectedStatuses,
    options: statuses,
    counts: { ...counts, "": tracked.length },
    attribute: "data-tab",
    allLabel: "All shows",
    allValue: "All",
    allActive: !selectedStatuses.size && !watchlistOnly,
    id: "status-filter",
    open: statusMenuOpen,
  });
  $("#watchlist-filter").classList.toggle("active", watchlistOnly);
  $("#watchlist-filter").setAttribute("aria-pressed", String(watchlistOnly));
  $("#watchlist-filter").innerHTML = `<span><i class="status-filter-dot watchlist" aria-hidden="true"></i>Watchlist</span><span class="count">${counts.Watchlist}</span>`;

  // Derive available genres from current library metadata and retain ID-based state.
  const genres = [
    ...new Map(
      shows
        .flatMap((show) => show.genres)
        .map((genre) => [String(genre.id), genre.name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  $("#genre-filter-wrap").innerHTML = collectionGenreFilter({
    selected: selectedGenres,
    genres,
    attribute: "data-genre",
    id: "genre-filter",
    open: genreMenuOpen,
  });

  // Statuses use OR, selected genres use AND, and Watchlist intersects both.
  const query = $("#library-query").value.trim().toLowerCase();
  const rating = $("#rating-filter").value;
  const filtered = shows.filter(
    (show) =>
      matchesLibraryFilters(show, selectedStatuses, watchlistOnly) &&
      show.name.toLowerCase().includes(query) &&
      matchesGenres(show, selectedGenres) &&
      (!rating ||
        (rating === "unrated"
          ? !show.rating
          : show.rating >= Number(rating))),
  );
  sortShows(filtered, $("#sort").value);
  const filterLabels = [
    ...selectedLabels,
    ...(watchlistOnly ? ["Watchlist"] : []),
  ];
  $("#result-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "show" : "shows"}${filterLabels.length ? ` · ${filterLabels.join(" + ").toLowerCase()}` : " in your collection"}`;

  // Gallery and list views share the filtered collection but expose different detail.
  $("#library-grid").className =
    viewMode === "list" ? "show-list" : `poster-grid${viewMode === "backdrop" ? " backdrop-gallery" : ""}`;
  $("#library-grid").innerHTML =
    viewMode === "list"
      ? `<div class="list-header" aria-hidden="true"><span>Show</span><span>Released</span><span>Status</span><span>Rating</span><span>Progress</span><span>Last updated</span></div>${filtered
          .map(
            (show) =>
              listShowRow(show),
          )
          .join("")}`
      : filtered
          .map((show) => galleryShowCard(show, viewMode))
          .join("");

  // Empty states distinguish no results, an empty Watchlist, and Watchlist-only saves.
  $("#empty").hidden = filtered.length > 0;
  $("#empty").innerHTML = shows.length
    ? '<span class="empty-icon">⌕</span><h2>No shows here just yet.</h2><p>Try another status or adjust your filters to find your shows.</p><button id="reset-filters">Clear filters</button>'
    : '<span class="empty-icon">▰</span><h2>A new season starts here.</h2><p>Build a home for the shows you love. Find your first show, give it a rating, and pick up right where you left off.</p><button class="primary" id="first-show">Find your first show <span aria-hidden="true">↗</span></button>';
  if (!filtered.length && watchlistOnly && !selectedStatuses.size) {
    $("#empty").innerHTML =
      '<span class="empty-icon">＋</span><h2>Your next great show starts here.</h2><p>Save any show here, whether you have started it or not. Add or remove the watchlist flag from its details.</p><button class="primary" id="first-show">Find a show</button>';
  } else if (!tracked.length && counts.Watchlist && allSelected) {
    $("#empty").innerHTML =
      '<span class="empty-icon">▰</span><h2>Your shows are on your watchlist.</h2><p>Start watching a saved show to include it in All shows. You can keep its watchlist flag and viewing status separately.</p><button class="primary" data-tab="Watchlist">View watchlist</button>';
  }
}

// Lists and My Shows share gallery cards, including the backdrop overlay variant.
// Render a shared poster or backdrop card with status, rating, progress, and membership.
export function galleryShowCard(show, viewMode = "gallery") {
  const showProgress = progress(show);
  const isBackdrop = viewMode === "backdrop";
  const backdrop = isBackdrop ? image(artworkPath(show, "backdrop"), "w780") : "";
  const artwork = backdrop ? `<img src="${backdrop}" alt="" loading="lazy">` : poster(show);
  const badges = `<span class="card-badges">${inWatchlist(show) ? badge("Watchlist") : ""}</span>`;
  // Both galleries use the same outlined status label beside the title.
  const status = watchStatus(show);
  const headingInfo = badge(status);
  const details = `<div class="card-heading"><h3>${esc(show.name)}</h3>${headingInfo}</div><div class="card-meta">${stars(show.rating)}<span>${showProgress.done ? `${showProgress.done} / ${showProgress.total} eps` : "Not started"}</span></div><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="${showProgress.done} of ${showProgress.total} aired episodes watched"></progress>`;
  // Backdrop details sit inside the image frame; poster cards keep their footer.
  const overlay = isBackdrop ? `<div class="backdrop-card-overlay">${badges}<div class="backdrop-card-info">${details}</div></div>` : badges;
  if (!isBackdrop) return posterGalleryCard(show, details, { badges });
  return `<button class="show-card" data-show="${show.id}" aria-label="Open ${esc(show.name)}"><div class="poster-wrap">${artwork}${overlay}</div>${isBackdrop ? "" : details}</button>`;
}

// Render a compact show row with artwork, release date, status, rating, and progress.
export function listShowRow(show) {
  const updatedAt = lastViewingUpdate(show);
  return `<button class="show-card show-row" data-show="${show.id}" aria-label="Open ${esc(show.name)}"><span class="list-title">${poster(show, "list-poster", "w92")}<span><strong>${esc(show.name)}</strong>${inWatchlist(show) ? '<small>On watchlist</small>' : ""}</span></span><span class="list-cell" data-label="Released">${displayDate(show.first_air_date)}</span><span class="list-cell" data-label="Status">${badge(watchStatus(show))}</span><span class="list-cell" data-label="Rating">${stars(show.rating)}</span><span class="list-cell" data-label="Progress">${esc(progressLabel(show))}</span><span class="list-cell" data-label="Last updated">${updatedAt ? displayDate(updatedAt, true) : "No updates yet"}</span></button>`;
}
