import { artworkPath, episodeKey, episodeRating } from "./model.js";

// Shared info controls use the same icon and hover/focus tooltip presentation.
export const infoIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M12 16v-4"></path><path d="M12 8h.01"></path></svg>`;

// Shared Lucide Repeat and Ellipsis icons keep episode controls and summaries consistent.
export const repeatIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m17 2 4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="m7 22-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg>`;
export const ellipsisIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`;

// Complete Lucide thumbs SVGs share the same stroke style as other episode controls.
// Source: https://github.com/lucide-icons/lucide/tree/main/icons
export const thumbsUpIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/><path d="M7 10v12"/></svg>`;
export const thumbsDownIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/><path d="M17 14V2"/></svg>`;

// Render reusable thumb toggles for a watched episode or an atomic watch-and-rate action.
export function episodeThumbButtons(show, episode, { disabled = false, markWatched = false } = {}) {
  const rating = episodeRating(show, episodeKey(episode));
  const description = `${episodeCode(episode)} · ${episode.name || show.name}`;
  return `<div class="episode-thumbs" role="group" aria-label="Thumb rating for ${esc(description)}">${["up", "down"].map((direction) => {
    const selected = rating === direction;
    const action = selected ? `Clear thumbs-${direction} rating for` : `${markWatched ? "Mark watched and " : ""}${direction === "up" ? "like" : "dislike"}`;
    const label = `${action} ${description}`;
    return `<button type="button" class="thumb-button" id="thumb-${markWatched ? "continue" : "episode"}-${show.id}-${episode.season_number}-${episode.episode_number}-${direction}" data-episode-thumb="${direction}" data-thumb-show="${show.id}" data-thumb-season="${episode.season_number}" data-thumb-episode="${episode.episode_number}"${markWatched ? " data-thumb-watch" : ""} aria-pressed="${selected}" aria-label="${esc(label)}" title="${disabled && !markWatched && !show.watched.includes(episodeKey(episode)) ? "Mark watched before rating this episode" : esc(label)}"${disabled ? " disabled" : ""}>${direction === "up" ? thumbsUpIcon : thumbsDownIcon}</button>`;
  }).join("")}</div>`;
}

// Keep the watched circle independent from the hover, keyboard, and touch rating choices.
export function continueWatchControls(show, episode, disabled) {
  return `<div class="continue-watch-actions"><button type="button" id="next-watched-${show.id}" class="next-watched" data-next="${show.id}" aria-label="Mark ${esc(show.name)} ${episodeCode(episode)} watched"${disabled ? " disabled" : ""}>✓<span>Watched</span></button><button type="button" class="continue-thumb-toggle" data-toggle-thumbs aria-label="Rate ${esc(show.name)} ${episodeCode(episode)}" aria-expanded="false" aria-controls="continue-thumbs-${show.id}"${disabled ? " disabled" : ""}>${ellipsisIcon}</button><div id="continue-thumbs-${show.id}" class="continue-rating-bar">${episodeThumbButtons(show, episode, { disabled, markWatched: true })}</div></div>`;
}

// Render a focusable info control with trusted tooltip markup and escaped identifiers.
export function infoTooltip(id, label, content, className = "") {
  return `<span class="stats-info ${esc(className)}" tabindex="0" aria-label="${esc(label)}" aria-describedby="${esc(id)}">${infoIcon}<span id="${esc(id)}" role="tooltip">${content}</span></span>`;
}

// Find the first element matching a document selector.
export const $ = (selector) => document.querySelector(selector);

// Render the shared poster-gallery frame while callers supply their own detail content.
export function posterGalleryCard(show, content, { className = "", season = null, label = null, badges = "", title = null } = {}) {
  return `<button class="show-card ${esc(className)}" data-show="${show.id}"${season === null ? "" : ` data-show-season="${season}"`}${title ? ` title="${esc(title)}"` : ""} aria-label="${esc(label || `Open ${show.name}`)}"><div class="poster-wrap">${poster(show)}${badges}</div>${content}</button>`;
}

// Accessible custom-select enhancement
let openSelect;
let selectId = 0;

// Close a custom select menu and optionally restore focus to its trigger.
function closeSelect(wrapper, restoreFocus = false) {
  if (!wrapper) return;
  const trigger = wrapper.querySelector(".custom-select-trigger");
  wrapper.querySelector(".custom-select-menu").hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  wrapper.classList.remove("open");
  if (openSelect === wrapper) openSelect = null;
  if (restoreFocus) trigger.focus();
}

// Synchronize a custom select's label, disabled state, and menu with its native options.
function syncSelect(wrapper) {
  const select = wrapper.querySelector("select");
  const trigger = wrapper.querySelector(".custom-select-trigger");
  const menu = wrapper.querySelector(".custom-select-menu");
  const selected = select.options[select.selectedIndex] || select.options[0];
  const selectedText = selected?.textContent || "Select";
  trigger.querySelector("span").textContent = selectedText;
  trigger.setAttribute("aria-label", `${trigger.dataset.label}: ${selectedText}`);
  trigger.disabled = select.disabled;
  // Rebuild from the native options so programmatic updates remain authoritative.
  menu.replaceChildren(
    ...Array.from(select.options, (option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.disabled = option.disabled;
      item.dataset.value = option.value;
      item.innerHTML = `<i aria-hidden="true">${option.selected ? "✓" : ""}</i><span></span>`;
      item.querySelector("span").textContent = option.textContent;
      // Apply the selected native value, notify listeners, and close the menu.
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeSelect(wrapper, true);
      });
      return item;
    }),
  );
}

// Close any other menu, synchronize this select, and focus its selected option.
function openCustomSelect(wrapper) {
  if (openSelect && openSelect !== wrapper) closeSelect(openSelect);
  syncSelect(wrapper);
  const trigger = wrapper.querySelector(".custom-select-trigger");
  const menu = wrapper.querySelector(".custom-select-menu");
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  wrapper.classList.add("open");
  openSelect = wrapper;
  menu.querySelector('[aria-selected="true"]')?.focus();
}

// Create or resynchronize accessible custom controls for native selects in a subtree.
export function enhanceSelects(root = document) {
  root.querySelectorAll("select").forEach((select) => {
    // Render cycles reuse existing wrappers and only resynchronize their contents.
    const existing = select.closest(".custom-select");
    if (existing) return syncSelect(existing);
    const wrapper = document.createElement("span");
    wrapper.className = "custom-select";
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add("custom-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const menuId = `custom-select-${++selectId}`;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", menuId);
    trigger.dataset.label =
      select.getAttribute("aria-label") ||
        select.closest("label")?.querySelector(".field-label, .sr-only")
          ?.textContent ||
      "Choose an option";
    trigger.innerHTML = '<span></span><i aria-hidden="true"></i>';
    const menu = document.createElement("span");
    menu.id = menuId;
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    wrapper.append(trigger, menu);
    syncSelect(wrapper);
    // Redirect native-select focus to its visible custom trigger.
    select.addEventListener("focus", () => trigger.focus());
    // Reflect native value changes in the visible custom menu.
    select.addEventListener("change", () => syncSelect(wrapper));
    // Toggle this custom select menu from its trigger.
    trigger.addEventListener("click", () => {
      if (menu.hidden) openCustomSelect(wrapper);
      else closeSelect(wrapper);
    });
    // Handle opening, dismissal, and keyboard navigation between enabled options.
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return closeSelect(wrapper, true);
      }
      if (menu.hidden && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        return openCustomSelect(wrapper);
      }
      if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        // Keyboard movement wraps between enabled options like a native listbox.
        event.preventDefault();
        const items = [...menu.querySelectorAll(".custom-select-option:not(:disabled)")];
        const current = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    });
  });
}

// Close the active custom select when a click occurs outside its wrapper.
document.addEventListener("click", (event) => {
  if (openSelect && !event.target.closest(".custom-select")) closeSelect(openSelect);
});

// Safe display and media formatting
// Escape text for safe insertion into HTML markup and attributes.
export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

// Build a sized TMDB image URL, returning an empty string when no path is available.
export const image = (path, size = "w342") =>
  path && /^\/[\w.-]+$/.test(path)
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "";

// Extract a show's premiere year from its first air date.
export const year = (show) => (show.first_air_date || "").slice(0, 4);
// Format an episode's season and number for display.
export const episodeCode = (episode) =>
  `S${episode.season_number} E${episode.episode_number}`;

// Render the shared outlined watch-status or Watchlist label.
export const badge = (status) =>
  `<span class="status-badge status-${status.toLowerCase().replaceAll(" ", "-")}">${status}</span>`;

// Render a show's star rating, or an explicit unrated label.
export const stars = (rating) =>
  rating
    ? `<span class="stars" aria-label="${rating} out of 5 stars">${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}</span>`
    : '<span class="unrated">Not rated</span>';

// Render resolved poster artwork, falling back to a title placeholder.
export const poster = (show, className = "", size) =>
  image(artworkPath(show, "poster"), size)
    ? `<img class="${className}" src="${image(artworkPath(show, "poster"), size)}" alt="" loading="lazy">`
    : `<span class="poster-placeholder ${className}">${esc(show.name)}</span>`;

// Collection pages share one switch so its icons, labels, and semantics stay aligned.
// Render the shared icon-only poster, backdrop, and list display switch.
export function viewToggle(active, { kind = "library", id = "", label = "Collection view" } = {}) {
  const attribute = kind === "list" ? "data-list-view" : "data-view";
  const listId = kind === "list" ? ` data-list-id="${esc(id)}"` : "";
  // Render the gallery glyph, rotating the backdrop variant through its CSS class.
  const galleryIcon = (backdrop = false) => `<svg class="view-icon gallery-view-icon${backdrop ? " backdrop-gallery-view-icon" : ""}" viewBox="0 0 15 15" aria-hidden="true"><rect x="2" y="0.5" width="4.5" height="6" rx="0.6"></rect><rect x="8.5" y="0.5" width="4.5" height="6" rx="0.6"></rect><rect x="2" y="8.5" width="4.5" height="6" rx="0.6"></rect><rect x="8.5" y="8.5" width="4.5" height="6" rx="0.6"></rect></svg>`;
  const views = [
    ["gallery", "Poster gallery", galleryIcon()],
    ["backdrop", "Backdrop gallery", galleryIcon(true)],
    ["list", "List", '<svg class="view-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 4h1M6 4h7.5M2.5 8h1M6 8h7.5M2.5 12h1M6 12h7.5"></path></svg>'],
  ];
  return `<div class="view-toggle"${kind === "library" ? ' id="library-view-toggle"' : ""} role="group" aria-label="${esc(label)}">${views.map(([value, name, icon]) => `<button type="button" ${attribute}="${value}"${listId} aria-pressed="${active === value}" aria-label="${name}" title="${name}">${icon}</button>`).join("")}</div>`;
}

// List collections use the library toolbar structure and shared view switch.
// Compose the shared collection toolbar from feature-supplied search and filter controls.
export function collectionControls({
  label,
  statusControl,
  watchlistControl,
  searchInput,
  viewControl,
  genreControl,
  ratingControl,
  sortControl,
  className = "",
}) {
  return `<aside class="library-controls ${className}" aria-label="${esc(label)}"><p class="library-controls-label">Filter and sort</p><div class="status-filter-wrap"><span>Watch status</span><div class="tabs">${statusControl}</div></div>${watchlistControl}<div class="filterbar">${searchInput}<div class="filters">${viewControl}${genreControl}${ratingControl}${sortControl}</div></div></aside>`;
}

// Collection status filters share the same multi-select menu and status cues.
// Render status and Watchlist filter options with counts and selection state.
export function collectionStatusFilter({
  selected,
  options,
  counts,
  attribute,
  allLabel = "All shows",
  allValue = "",
  allActive = !selected.size,
  id = "",
  open = false,
}) {
  const selectedLabels = [...selected];
  const dots = selectedLabels
    .map((status) => `<i class="status-filter-dot ${status.toLowerCase().replaceAll(" ", "-")}" aria-hidden="true"></i>`)
    .join("");
  // Render one status-filter option with its count and current selection.
  const option = (status, label, isAll = false) => {
    const active = isAll ? allActive : selected.has(status);
    const value = isAll ? allValue : status;
    const count = counts?.[status];
    return `<button class="status-filter-option" type="button" ${attribute}="${esc(value)}" aria-pressed="${active}"><span><i class="status-filter-dot ${(status || "all").toLowerCase().replaceAll(" ", "-")}" aria-hidden="true"></i>${esc(label)}</span>${count == null ? "" : `<span class="count">${count}</span>`}</button>`;
  };
  return `<details class="status-filter"${id ? ` id="${esc(id)}"` : ""}${open ? " open" : ""}><summary><span class="status-filter-selection">${dots}<span>${selectedLabels.length ? selectedLabels.join(" + ") : esc(allLabel)}</span></span><i class="status-filter-chevron" aria-hidden="true"></i></summary><div class="status-filter-menu" role="group" aria-label="Filter by watch status">${option("", allLabel, true)}${options.map((status) => option(status, status)).join("")}</div></details>`;
}

// Genre filtering uses the same multi-select dropdown in every show collection.
// Render a multi-genre filter with a summary of the current selection.
export function collectionGenreFilter({ selected, genres, attribute, id = "", open = false }) {
  const names = genres.filter(([value]) => selected.has(value)).map(([, name]) => name);
  // Render one genre-filter option with its current selection.
  const option = (value, name, isAll = false) => `<button class="status-filter-option" type="button" ${attribute}="${esc(value)}" aria-pressed="${isAll ? !selected.size : selected.has(value)}"><span>${esc(name)}</span></button>`;
  return `<details class="status-filter genre-filter"${id ? ` id="${esc(id)}"` : ""}${open ? " open" : ""}><summary><span class="status-filter-selection"><span>${names.length ? names.join(" + ") : "All genres"}</span></span><i class="status-filter-chevron" aria-hidden="true"></i></summary><div class="status-filter-menu" role="group" aria-label="Filter by genre">${option("", "All genres", true)}${genres.map(([value, name]) => option(value, name)).join("")}</div></details>`;
}

// Dates without a time are interpreted locally to avoid timezone date shifts.
// Format a local date or timestamp, with a fallback for missing or invalid values.
export function displayDate(value, includeTime = false, includeYear = true) {
  if (!value) return "Not recorded";
  const date = new Date(includeTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

// Transient feedback
let toastTimer;
// Show temporary feedback in a popover, replacing the previous dismissal timer.
export function toast(message) {
  clearTimeout(toastTimer);
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  element.showPopover();
  toastTimer = setTimeout(() => {
    element.hidePopover();
    element.hidden = true;
  }, 6000);
}

// Display an operation's error message through the shared toast.
export function report(error) {
  toast(error.message);
}
