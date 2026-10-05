import { listEntries } from "../model.js";
import { $, esc, poster, stars, year } from "../ui.js";

export const listSortOptions = [
  ["added-oldest", "Added: oldest first"],
  ["added-newest", "Added: newest first"],
  ["title-asc", "Title: A–Z"],
  ["title-desc", "Title: Z–A"],
  ["release-newest", "Release date: newest"],
  ["release-oldest", "Release date: oldest"],
  ["rating-high", "Rating: highest"],
  ["rating-low", "Rating: lowest"],
];
const rankedSortOption = ["manual", "Ranked order"];

// Overview previews always reflect the order visitors will see inside the list.
function listCard(list, shows) {
  const entries = listEntries(list, shows);
  const preview = entries.slice(0, 4);
  const description = list.description
    ? `<p>${esc(list.description)}</p>`
    : '<p class="list-card-description-empty">No description</p>';
  return `<article class="list-card">
    <button class="list-card-open" type="button" data-open-list="${esc(list.id)}" aria-label="Open ${esc(list.name)}">
      <span class="list-preview list-preview-${preview.length || "empty"}">
        ${preview.length ? preview.map(({ show }) => poster(show, "list-preview-poster", "w342")).join("") : '<span class="list-preview-empty" aria-hidden="true">＋</span>'}
      </span>
      <span class="list-card-copy">
        <strong>${esc(list.name)}</strong>
        ${description}
        <span class="list-card-meta"><span>${entries.length} ${entries.length === 1 ? "show" : "shows"}</span><span>${list.ordered ? "Ranked" : "Unranked"}</span></span>
      </span>
    </button>
    <button class="list-card-edit icon-button" type="button" data-edit-list="${esc(list.id)}" aria-label="Edit ${esc(list.name)}">•••</button>
  </article>`;
}

function listShowCard({ show, index: rankIndex }, index, list, viewMode) {
  const rankingVisible = list.ordered && list.sort === "manual";
  const controls = rankingVisible
    ? `<span class="list-rank-controls"><button type="button" data-move-list-show="up" data-list-id="${esc(list.id)}" data-show-id="${show.id}" aria-label="Move ${esc(show.name)} up"${index === 0 ? " disabled" : ""}>↑</button><button type="button" data-move-list-show="down" data-list-id="${esc(list.id)}" data-show-id="${show.id}" aria-label="Move ${esc(show.name)} down"${index === list.entries.length - 1 ? " disabled" : ""}>↓</button></span>`
    : "";
  return `<article class="list-show-card ${viewMode === "list" ? "list-show-row" : ""}" draggable="${rankingVisible}" data-list-show="${show.id}" data-list-id="${esc(list.id)}">
    ${list.ordered ? `<span class="list-rank">${rankIndex + 1}</span>` : ""}
    <button type="button" class="list-show-open" data-show="${show.id}" aria-label="Open ${esc(show.name)}">${poster(show, "list-show-poster", "w342")}<span><strong>${esc(show.name)}</strong><small>${year(show)}</small>${stars(show.rating)}</span></button>
    ${controls}
  </article>`;
}

function renderDetail(list, shows, viewMode) {
  const entries = listEntries(list, shows);
  const availableSorts = list.ordered ? [rankedSortOption, ...listSortOptions] : listSortOptions;
  const sortLabel = availableSorts.find(([value]) => value === list.sort)?.[1];
  $("#list-detail").innerHTML = `<a class="list-back" href="#lists">← Back to Lists</a>
    <header class="list-detail-header"><div><span class="list-type">${list.ordered ? `Ranked · ${esc(sortLabel)}` : esc(sortLabel)}</span><h1>${esc(list.name)}</h1>${list.description ? `<p>${esc(list.description)}</p>` : ""}<small>${entries.length} ${entries.length === 1 ? "show" : "shows"}</small></div><div class="list-detail-actions"><button type="button" data-edit-list="${esc(list.id)}">Edit</button><button class="primary" type="button" data-add-list-shows="${esc(list.id)}">＋ Add shows</button></div></header>
    <div class="list-detail-toolbar"><label class="list-detail-sort"><span>Display order</span><select data-list-sort="${esc(list.id)}" aria-label="Display order for ${esc(list.name)}">${availableSorts.map(([value, label]) => `<option value="${value}"${list.sort === value ? " selected" : ""}>${label}</option>`).join("")}</select></label><div class="view-toggle" role="group" aria-label="List view"><button type="button" data-list-view="gallery" data-list-id="${esc(list.id)}" aria-pressed="${viewMode === "gallery"}">Gallery</button><button type="button" data-list-view="list" data-list-id="${esc(list.id)}" aria-pressed="${viewMode === "list"}">List</button></div></div>
    <div class="list-shows ${viewMode === "list" ? "list-shows-rows" : ""}">${entries.length ? entries.map((entry, index) => listShowCard(entry, index, list, viewMode)).join("") : '<div class="empty list-detail-empty"><h2>No shows in this list yet.</h2><p>Add shows already saved in My Shows or Watchlist.</p><button class="primary" type="button" data-add-list-shows="' + esc(list.id) + '">Add shows</button></div>'}</div>`;
}

export function renderLists(lists, shows, selectedListId = null, viewMode = "gallery") {
  const selected = lists.find((list) => list.id === selectedListId);
  $("#lists-overview").hidden = Boolean(selected);
  $("#list-detail").hidden = !selected;
  if (selected) renderDetail(selected, shows, viewMode);
  $("#lists-grid").innerHTML = lists.map((list) => listCard(list, shows)).join("");
  $("#lists-empty").hidden = lists.length > 0;
  $("#lists-grid").hidden = !lists.length;
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

export function renderListDialog(list = null) {
  const editing = Boolean(list);
  $("#list-dialog-title").textContent = editing ? "Edit list" : "Create a list";
  $("#list-dialog-submit").textContent = editing ? "Save changes" : "Create list";
  $("#delete-list").hidden = !editing;
  $("#list-id").value = list?.id || "";
  $("#list-name").value = list?.name || "";
  $("#list-description").value = list?.description || "";
  $("#list-ordered").checked = list?.ordered || false;
  $("#list-ordered").dataset.original = String(list?.ordered || false);
}
