import { artworkPath, inWatchlist, listEntries, statuses, watchStatus } from "../model.js";
import { collectionControls, collectionGenreFilter, collectionStatusFilter, $, esc, image, poster, viewToggle, year } from "../ui.js";
import { galleryShowCard, listShowRow } from "./library.js";

export const listSortOptions = [
  ["added-oldest", "Added: oldest first"],
  ["added-newest", "Added: newest first"],
  ["title-asc", "Title: A–Z"],
  ["title-desc", "Title: Z–A"],
  ["watch-status", "Watch status"],
  ["release-newest", "Release date: newest"],
  ["release-oldest", "Release date: oldest"],
  ["rating-high", "Rating: highest"],
  ["rating-low", "Rating: lowest"],
];
const rankedSortOption = ["manual", "Ranked order"];

// Overview previews always reflect the order visitors will see inside the list.
function listCard(list, shows) {
  const entries = listEntries(list, shows);
  // Small lists use one cover; four or more shows form a backdrop mosaic.
  const preview = entries.slice(0, entries.length >= 4 ? 4 : 1);
  const description = list.description
    ? `<p>${esc(list.description)}</p>`
    : '<p class="list-card-description-empty">No description</p>';
  return `<article class="list-card">
    <button class="list-card-open" type="button" data-open-list="${esc(list.id)}" aria-label="Open ${esc(list.name)}">
      <span class="list-preview list-preview-${preview.length || "empty"}">
        ${preview.length ? preview.map(({ show }) => {
          // Missing backdrops retain artwork through the existing poster fallback.
          const backdrop = image(artworkPath(show, "backdrop"), "w780");
          return backdrop ? `<img class="list-preview-image" src="${backdrop}" alt="" loading="lazy">` : poster(show, "list-preview-image", "w342");
        }).join("") : '<span class="list-preview-empty" aria-hidden="true">＋</span>'}
      </span>
      ${list.ordered ? '<span class="list-card-rank-label">Ranked</span>' : ""}
      <span class="list-card-count">${entries.length} ${entries.length === 1 ? "show" : "shows"}</span>
      <span class="list-card-copy">
        <strong>${esc(list.name)}</strong>
        ${description}
      </span>
    </button>
    <button class="list-card-edit" type="button" data-edit-list="${esc(list.id)}" aria-label="Edit ${esc(list.name)}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M8 12h.01"></path><path d="M12 12h.01"></path><path d="M16 12h.01"></path></svg></button>
  </article>`;
}

function listShowCard({ show, index: rankIndex }, list, viewMode) {
  return `<article class="list-show-card${viewMode === "list" ? " ranked-list-row" : ""}" data-list-show="${show.id}" data-list-id="${esc(list.id)}">
    ${list.ordered ? `<span class="list-rank">${rankIndex + 1}</span>` : ""}
    ${viewMode === "list" ? listShowRow(show) : galleryShowCard(show, viewMode)}
  </article>`;
}

function renderDetail(list, shows, viewMode, filters) {
  const allEntries = listEntries(list, shows);
  const statusMenuOpen = document.querySelector(".list-collection-controls .status-filter")?.open;
  const genreMenuOpen = document.querySelector(".list-collection-controls .genre-filter")?.open;
  const genres = [...new Map(allEntries.flatMap(({ show }) => show.genres).map((genre) => [String(genre.id), genre.name])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const query = filters.query.toLowerCase();
  const entries = allEntries.filter(({ show }) =>
    show.name.toLowerCase().includes(query) &&
    (!filters.statuses.size || filters.statuses.has(watchStatus(show))) &&
    (!filters.watchlist || inWatchlist(show)) &&
    (!filters.genres.size || [...filters.genres].every((id) => show.genres.some((genre) => String(genre.id) === id))) &&
    (!filters.rating || (filters.rating === "unrated" ? !show.rating : show.rating >= Number(filters.rating))),
  );
  const availableSorts = list.ordered ? [rankedSortOption, ...listSortOptions] : listSortOptions;
  const statusCounts = Object.fromEntries(statuses.map((status) => [status, allEntries.filter(({ show }) => watchStatus(show) === status).length]));
  const controls = collectionControls({
    label: "List filters and sorting",
    className: "list-collection-controls",
    statusControl: collectionStatusFilter({
      selected: filters.statuses,
      options: statuses,
      counts: { ...statusCounts, "": allEntries.length },
      attribute: "data-list-status",
      allLabel: "All shows",
      open: statusMenuOpen,
    }),
    watchlistControl: `<button type="button" class="watchlist-filter${filters.watchlist ? " active" : ""}" data-list-watchlist aria-pressed="${filters.watchlist}"><span><i class="status-filter-dot watchlist" aria-hidden="true"></i>Watchlist</span><span class="count">${allEntries.filter(({ show }) => inWatchlist(show)).length}</span></button>`,
    searchInput: `<label class="library-search"><span aria-hidden="true">⌕</span><input data-list-query="${esc(list.id)}" type="search" value="${esc(filters.query)}" placeholder="Search this list…" aria-label="Search this list"></label>`,
    viewControl: viewToggle(viewMode, { kind: "list", id: list.id, label: "List view" }),
    genreControl: `<div class="genre-filter-wrap">${collectionGenreFilter({ selected: filters.genres, genres, attribute: "data-list-genre", open: genreMenuOpen })}</div>`,
    ratingControl: `<label class="rating-filter-control"><span class="sr-only">Rating</span><select data-list-filter="rating" aria-label="Filter list by rating"><option value="">All ratings</option><option value="unrated"${filters.rating === "unrated" ? " selected" : ""}>Unrated</option>${[4, 3, 2, 1].map((rating) => `<option value="${rating}"${filters.rating === String(rating) ? " selected" : ""}>${rating}+ stars</option>`).join("")}</select></label>`,
    sortControl: `<label class="list-detail-sort sort-filter-control"><span class="sr-only">Display order</span><select data-list-sort="${esc(list.id)}" aria-label="Display order for ${esc(list.name)}">${availableSorts.map(([value, label]) => `<option value="${value}"${list.sort === value ? " selected" : ""}>${label}</option>`).join("")}</select></label>`,
  });
  $("#list-detail").innerHTML = `<header class="list-detail-header"><div><a class="list-back" href="#lists">← Back to Lists</a><h1>${esc(list.name)}</h1>${list.description ? `<p>${esc(list.description)}</p>` : ""}</div><div class="list-detail-actions"><button type="button" data-edit-list="${esc(list.id)}">Edit</button><button class="primary" type="button" data-add-list-shows="${esc(list.id)}">＋ Add shows</button></div></header>
    ${controls}
    <div class="library-results"><p class="result-count list-result-count">${entries.length} of ${allEntries.length} ${allEntries.length === 1 ? "show" : "shows"}</p>
    <div class="list-shows ${viewMode === "list" ? `show-list list-shows-rows${list.ordered ? " ranked-list-rows" : ""}` : `poster-grid${viewMode === "backdrop" ? " backdrop-gallery" : ""}`}">${viewMode === "list" && entries.length ? `<div class="list-header" aria-hidden="true">${list.ordered ? "<span>#</span>" : ""}<span>Show</span><span>Released</span><span>Status</span><span>Rating</span><span>Progress</span><span>Last updated</span></div>` : ""}${entries.length ? entries.map((entry) => listShowCard(entry, list, viewMode)).join("") : allEntries.length ? '<div class="empty list-detail-empty"><h2>No shows match these filters.</h2><p>Try another search, status, genre, or rating.</p><button type="button" data-clear-list-filters>Clear filters</button></div>' : '<div class="empty list-detail-empty"><h2>No shows in this list yet.</h2><p>Add shows already saved in My Shows or Watchlist.</p><button class="primary" type="button" data-add-list-shows="' + esc(list.id) + '">Add shows</button></div>'}</div></div>`;
}

export function renderLists(lists, shows, selectedListId = null, viewMode = "gallery", filters = { query: "", statuses: new Set(), watchlist: false, genres: new Set(), rating: "" }, overviewQuery = "") {
  const selected = lists.find((list) => list.id === selectedListId);
  $("#lists-overview").hidden = Boolean(selected);
  $("#list-detail").hidden = !selected;
  if (selected) renderDetail(selected, shows, viewMode, filters);
  else $("#list-detail").replaceChildren();
  // Overview search matches metadata without changing list contents or order.
  const query = overviewQuery.trim().toLowerCase();
  const matches = lists.filter((list) =>
    list.name.toLowerCase().includes(query) || (list.description || "").toLowerCase().includes(query),
  );
  $("#lists-grid").innerHTML = matches.map((list) => listCard(list, shows)).join("");
  $("#lists-empty").hidden = lists.length > 0;
  $("#lists-no-results").hidden = !lists.length || matches.length > 0;
  $("#lists-grid").hidden = !matches.length;
}

export function renderMemberOptions(list, shows, query = "", selectedIds = null) {
  const selected = selectedIds || new Set(list.entries.map((entry) => entry.showId));
  const matches = shows.filter((show) => show.name.toLowerCase().includes(query.trim().toLowerCase()));
  $("#list-members-options").innerHTML = matches.length
    ? matches.map((show) => `<label class="list-member-option">${poster(show, "list-member-poster", "w92")}<span><strong>${esc(show.name)}</strong><small>${year(show)}</small></span><input type="checkbox" name="showId" value="${show.id}"${selected.has(show.id) ? " checked" : ""}></label>`).join("")
    : '<p class="muted">No saved shows match your search.</p>';
}

export function renderShowListOptions(show, lists) {
  $("#show-lists-options").innerHTML = lists.length
    ? lists.map((list) => `<label class="show-list-option"><input type="checkbox" name="listId" value="${esc(list.id)}"${list.entries.some((entry) => entry.showId === show.id) ? " checked" : ""}><span><strong>${esc(list.name)}</strong><small>${list.entries.length} ${list.entries.length === 1 ? "show" : "shows"}</small></span></label>`).join("")
    : '<p class="muted">You have not created any lists yet.</p>';
}

export function renderListDialog(list = null, shows = []) {
  const editing = Boolean(list);
  $("#list-dialog-title").textContent = editing ? "Edit list" : "Create a list";
  $("#list-dialog-submit").textContent = editing ? "Save changes" : "Create list";
  $("#delete-list").hidden = !editing;
  $("#list-id").value = list?.id || "";
  $("#list-name").value = list?.name || "";
  $("#list-description").value = list?.description || "";
  $("#list-ordered").checked = list?.ordered || false;
  $("#list-ordered").dataset.original = String(list?.ordered || false);
  $("#list-form").classList.toggle("ranked-editing", Boolean(list?.ordered));
  $("#list-edit-shows").hidden = !editing;
  if (editing) {
    const showsById = new Map(shows.map((show) => [show.id, show]));
    $("#list-edit-show-options").innerHTML = list.entries.length
      ? list.entries
          .map((entry) => showsById.get(entry.showId))
          .filter(Boolean)
          .map((show, index) =>
            `<div class="list-edit-show" data-edit-list-show="${show.id}"><input class="list-edit-rank" type="number" min="1" max="${list.entries.length}" value="${index + 1}" aria-label="Rank for ${esc(show.name)}">${poster(show, "list-member-poster", "w92")}<span><strong>${esc(show.name)}</strong><small>${year(show)}</small></span><input type="hidden" name="existingShowId" value="${show.id}"><button type="button" data-remove-edit-list-show="${show.id}" aria-label="Remove ${esc(show.name)} from list">Remove</button></div>`,
          )
          .join("")
      : '<p class="muted">This list has no shows yet.</p>';
  }
}
