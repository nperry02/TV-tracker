import { listEntries } from "../model.js";
import { $, esc, poster } from "../ui.js";

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
        <span class="list-card-meta"><span>${entries.length} ${entries.length === 1 ? "show" : "shows"}</span><span>${list.ordered ? "Ordered" : "Unordered"}</span></span>
      </span>
    </button>
    <button class="list-card-edit icon-button" type="button" data-edit-list="${esc(list.id)}" aria-label="Edit ${esc(list.name)}">•••</button>
  </article>`;
}

export function renderLists(lists, shows) {
  $("#lists-grid").innerHTML = lists.map((list) => listCard(list, shows)).join("");
  $("#lists-empty").hidden = lists.length > 0;
  $("#lists-grid").hidden = !lists.length;
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
  $("#list-sort").innerHTML = listSortOptions
    .map(
      ([value, label]) =>
        `<option value="${value}"${(list?.sort || "added-oldest") === value ? " selected" : ""}>${label}</option>`,
    )
    .join("");
  $("#list-sort-field").hidden = $("#list-ordered").checked;
}
