import {
  progress,
  inWatchlist,
  inLibrary,
  metadataRefreshQueue,
  metadataRefreshOverview,
  statuses,
  collectionView,
  today,
  latestUpdates,
  episodeKey,
  episodeRewatches,
  episodeRating,
  upcomingWindow,
} from "./model.js";
import { api } from "./api.js";
import {
  $,
  enhanceSelects,
  episodeCode,
  esc,
  report,
  toast,
} from "./ui.js";
import { renderStats } from "./views/stats.js";
import { createSearchDialog } from "./views/search-dialog.js";
import { createArtworkDialog } from "./views/artwork-dialog.js";
import { renderHome } from "./views/home.js";
import { renderHelp } from "./views/help.js";
import { renderShowInfoDialog } from "./views/show-info-dialog.js";
import { renderLibrary } from "./views/library.js";
import {
  renderListDialog,
  renderLists,
  renderMemberOptions,
  renderShowListOptions,
} from "./views/lists.js";
import {
  initialShowSeason,
  renderShowDialog,
} from "./views/show-dialog.js";

// Shared application and dialog state
let shows = [],
  lists = [],
  selectedId = null,
  selectedSeason = null,
  mutationPending = false,
  pendingListShowId = null,
  listMemberSelection = new Set();
const listFilters = new Map();

// Feed expansion stays local; read state persists with each show's update.
let updatesExpanded = false,
  pendingReadId = null,
  feedDate = null,
  feedSyncPending = false,
  metadataRefreshPending = 0;

// In-flight requests are shared by startup and manual checks for the same show.
const metadataRefreshRequests = new Map();
let showInfoOrder = null;

// The correction editor captures its show and season so later renders cannot retarget it.
let rewatchEditor = null;

// The release window is a browser preference, never a library or backup field.
let upcomingDays = readUpcomingWindow();

// Read the supported release window with a quiet fallback when storage is unavailable.
function readUpcomingWindow() {
  try {
    return upcomingWindow(localStorage.getItem("next-episode:upcoming-window"));
  } catch {
    return 30;
  }
}

// Read the selected list ID from the current hash route.
function selectedListId() {
  return location.hash.startsWith("#lists/")
    ? decodeURIComponent(location.hash.slice(7))
    : null;
}
// Restore a list's display mode, falling back to poster gallery if storage fails.
function listViewMode(id) {
  try {
    return collectionView(localStorage.getItem(`next-episode:list-view:${id}`));
  } catch {
    return "gallery";
  }
}
// Return a list's in-memory filters, creating an empty selection on first use.
function filtersForList(id) {
  if (!listFilters.has(id))
    listFilters.set(id, {
      query: "",
      statuses: new Set(),
      watchlist: false,
      genres: new Set(),
      rating: "",
    });
  return listFilters.get(id);
}

// Library selections survive page navigation and reloads within the current tab.
const libraryFilters = (() => {
  try {
    const saved = JSON.parse(
      sessionStorage.getItem("next-episode:library-filters"),
    );
    return {
      selectedStatuses: new Set(
        (saved?.statuses || []).filter((status) => statuses.includes(status)),
      ),
      selectedGenres: new Set(saved?.genres || []),
      watchlistOnly: Boolean(saved?.watchlist),
    };
  } catch {
    return {
      selectedStatuses: new Set(),
      selectedGenres: new Set(),
      watchlistOnly: false,
    };
  }
})();
// Persist library filter selections for this tab when session storage is available.
function saveLibraryFilters() {
  try {
    sessionStorage.setItem(
      "next-episode:library-filters",
      JSON.stringify({
        statuses: [...libraryFilters.selectedStatuses],
        genres: [...libraryFilters.selectedGenres],
        watchlist: libraryFilters.watchlistOnly,
      }),
    );
  } catch {}
}

// View mode persists across browser sessions when storage is available.
let viewMode = (() => {
  try {
    return collectionView(localStorage.getItem("next-episode:view"));
  } catch {
    return "gallery";
  }
})();

// Hash routing and top-level rendering
// Show the requested page, update navigation, and optionally reset scroll position.
function applyRoute({ scroll = false } = {}) {
  const requestedRoute = location.hash.slice(1);
  const routeName = requestedRoute.split("/")[0];
  const route = ["library", "lists", "stats", "help"].includes(routeName)
    ? routeName
    : "home";
  $("#home-view").hidden = route !== "home";
  $("#library-view").hidden = route !== "library";
  $("#lists-view").hidden = route !== "lists";
  $("#stats-view").hidden = route !== "stats";
  $("#help-view").hidden = route !== "help";
  document.querySelectorAll("[data-page]").forEach((link) =>
    link.classList.toggle("active", link.dataset.page === route),
  );
  if (route === "stats") renderStats(shows, $("#stats-content"));
  if (route === "lists")
    renderLists(
      lists,
      shows,
      selectedListId(),
      listViewMode(selectedListId()),
      filtersForList(selectedListId()),
      $("#lists-query").value,
    );
  if (route === "lists") enhanceSelects($("#lists-view"));
  if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
}
// Redraw collection pages and statistics from saved state, then synchronize select controls.
function render() {
  renderHome(shows, mutationPending, {
    expanded: updatesExpanded, pendingReadId,
  }, upcomingDays);
  renderLibrary(shows, libraryFilters, viewMode);
  renderLists(
    lists,
    shows,
    selectedListId(),
    listViewMode(selectedListId()),
    filtersForList(selectedListId()),
    $("#lists-query").value,
  );
  renderStats(shows, $("#stats-content"));
  renderShowInfo();
  enhanceSelects();
}
// Update the overview only while open, using the latest saved data and request state.
function renderShowInfo() {
  if (!$("#show-info-dialog").open) return;
  // Opening during a startup check pins the same order as a manual check does.
  if (metadataRefreshPending && !showInfoOrder)
    showInfoOrder = metadataRefreshOverview(shows).map(({ show }) => show.id);
  renderShowInfoDialog(shows, {
    pendingIds: new Set(metadataRefreshRequests.keys()),
    disabled: mutationPending || metadataRefreshPending > 0,
    order: showInfoOrder,
  });
}
// Synchronize refresh controls without rebuilding the rest of the show dialog.
function renderRefreshControls() {
  renderShowInfo();
  const button = $("#refresh-show");
  if (button) {
    button.disabled = mutationPending || metadataRefreshPending > 0;
    button.textContent = metadataRefreshRequests.has(selectedId) ? "Refreshing…" : "↻ Refresh show info";
  }
}
// Toggle touch choices and suppress automatic reopening after an explicit dismissal.
function setThumbMenu(wrapper, open) {
  wrapper.classList.toggle("thumb-menu-open", open);
  wrapper.classList.toggle("thumb-menu-dismissed", !open);
  wrapper.querySelector("[data-toggle-thumbs]")?.setAttribute("aria-expanded", String(open));
}

// Open saved show details on a requested season or its next available episode's season.
function openShow(id, season = null) {
  selectedId = Number(id);
  const show = shows.find((s) => s.id === selectedId);
  if (!show) return;
  selectedSeason = season !== null && show.seasons.some((entry) => entry.number === Number(season))
    ? Number(season) : initialShowSeason(show);
  renderShow();
  if ($("#search-dialog").open) $("#search-dialog").close();
  if (!$("#show-dialog").open) $("#show-dialog").showModal();
}
// Redraw the selected show while preserving the mobile season-options disclosure.
function renderShow() {
  const show = shows.find((entry) => entry.id === selectedId);
  if (show) {
    const keepSeasonOptionsOpen =
      $("#show-dialog").open && $(".season-options")?.open;
    renderShowDialog(show, selectedSeason, mutationPending, lists);
    const seasonOptions = $(".season-options");
    if (seasonOptions && matchMedia("(max-width: 800px)").matches)
      seasonOptions.open = Boolean(keepSeasonOptionsOpen);
    enhanceSelects($("#show-content"));
    renderRefreshControls();
  }
}

// Hover previews separate the shared fill from the difference to the saved rating.
// Preview star fills and differences from the saved rating without changing it.
function previewRating(control, value) {
  const savedValue = control.dataset.value ? Number(control.dataset.value) : null;
  const comparing = savedValue != null && value !== savedValue;
  const normalValue = comparing ? Math.min(savedValue, value) : value;
  const comparisonValue = comparing ? Math.max(savedValue, value) : 0;

  control.querySelectorAll(".rating-star").forEach((star, index) => {
    const normalFill = Math.max(0, Math.min(1, (normalValue || 0) - index));
    const comparisonFill = Math.max(0, Math.min(1, comparisonValue - index));
    star.classList.remove("unfilled", "half", "full", "comparison-half", "comparison-full");
    star.classList.add(
      normalFill === 1 ? "full" : normalFill === 0.5 ? "half" : "unfilled",
    );
    if (comparisonFill > normalFill) {
      star.classList.add(comparisonFill === 1 ? "comparison-full" : "comparison-half");
    }
  });
}

// Mutations redraw disabled controls immediately, then restore dialog context.
// Save a show mutation, reconcile page state, and restore the active dialog's focus and scroll.
async function save(body, message, id = selectedId) {
  if (mutationPending) return;
  mutationPending = true;
  // Check that the mutation still belongs to the currently open show dialog.
  const isCurrentDialog = () => selectedId === id && $("#show-dialog").open;
  const scroll = $("#show-dialog").scrollTop;
  const focused = document.activeElement;
  const focusId = focused?.id;
  const episode = focused?.dataset.episode;
  const homeShowId = focused?.closest(".continue-watch-actions")?.querySelector("[data-next]")?.dataset.next;
  render();
  if (isCurrentDialog()) renderShow();
  try {
    const updated = await api(`/api/shows/${id}`, { method: "PATCH", body });
    shows = shows.map((s) => (s.id === id ? updated : s));
    render();
    if (message) toast(message);
    return updated;
  } catch (error) {
    report(error);
    return null;
  } finally {
    mutationPending = false;
    render();
    if ($("#show-dialog").open) renderShow();
    if (isCurrentDialog()) {
      $("#show-dialog").scrollTop = scroll;
      // Recreated dialog markup receives focus by stable ID or episode number.
      const target = focusId
        ? document.getElementById(focusId)
        : episode
          ? $(`[data-episode="${episode}"]`)
          : null;
      target?.focus({ preventScroll: true });
    } else if (homeShowId && !$("#home-view").hidden && !document.querySelector("dialog[open]")) {
      // A successful watch advances the episode, so its old thumb ID no longer exists.
      const target = document.getElementById(focusId) || document.getElementById(`next-watched-${homeShowId}`) ||
        $("#continue-list .next-watched") || $("#home-view h1");
      // A failed save keeps the same thumb, but its recreated bar must be visible to focus it.
      if (target?.closest(".continue-rating-bar")) setThumbMenu(target.closest(".continue-watch-actions"), true);
      if (target && !target.matches("button")) target.tabIndex = -1;
      target?.focus({ preventScroll: true });
    }
  }
}
// Share an existing request and pin overview order before starting a fresh metadata check.
function refreshShow(id, notify = true) {
  if (metadataRefreshRequests.has(id)) return metadataRefreshRequests.get(id);
  metadataRefreshPending++;
  const request = fetchShowInfo(id, notify);
  metadataRefreshRequests.set(id, request);
  renderRefreshControls();
  return request;
}
// Fetch and apply successful metadata, retaining the saved snapshot on failure.
async function fetchShowInfo(id, notify) {
  try {
    const updated = await api(`/api/shows/${id}/refresh`, { method: "POST" });
    shows = shows.map((s) => (s.id === id ? updated : s));
    render();
    if (selectedId === id && $("#show-dialog").open) renderShow();
    if (notify) toast("Show information is up to date.");
  } finally {
    metadataRefreshPending--;
    metadataRefreshRequests.delete(id);
    if (!metadataRefreshPending) showInfoOrder = null;
    renderRefreshControls();
  }
}
// Guard manual checks and restore show-detail focus and scroll after either outcome.
async function refreshManually(id) {
  if (mutationPending || metadataRefreshPending) return;
  const dialog = $("#show-dialog");
  const inDetails = dialog.open;
  const scroll = dialog.scrollTop;
  const focusId = document.activeElement?.id;
  try {
    await refreshShow(id);
  } catch (error) {
    report(error);
  } finally {
    if (inDetails && dialog.open && selectedId === id) {
      renderShow();
      dialog.scrollTop = scroll;
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
    }
  }
}

// Persist read state, retaining the unread entry when its request fails.
async function markUpdateRead(showId, entryId) {
  if (mutationPending) return;
  mutationPending = true;
  // Keep the check selected while saving; persisted read state changes only on success.
  pendingReadId = showId;
  render();
  try {
    const value = await api(`/api/shows/${showId}/update-read`, { method: "POST", body: { id: entryId } });
    shows = shows.map((show) => show.id === showId ? value : show);
  } catch (error) {
    report(error);
  } finally {
    mutationPending = false;
    pendingReadId = null;
    render();
    const target = $(`#updates-list input[data-read-update="${showId}"]`) || $(`#updates-list .update-title[data-show="${showId}"]`);
    target?.focus({ preventScroll: true });
  }
}

// Mark the current unread feed in one save, preserving news that replaces it during the request.
async function markAllUpdatesRead() {
  if (mutationPending) return;
  // Snapshot all unread entries, including the ones beyond the initial ten rows.
  const updates = latestUpdates(shows).filter((show) => !show.latestUpdate.readAt)
    .map((show) => ({ showId: show.id, id: show.latestUpdate.id }));
  if (!updates.length) return;
  mutationPending = true;
  render();
  try {
    const value = await api("/api/updates/read-all", { method: "POST", body: { updates } });
    const saved = new Map(value.shows.map((show) => [show.id, show]));
    shows = shows.map((show) => saved.get(show.id) || show);
    toast("Updates marked as read.");
  } catch (error) {
    report(error);
  } finally {
    mutationPending = false;
    render();
    $("#updates-list").focus({ preventScroll: true });
  }
}

// Reconcile date transitions and expired entries while open, without racing edits.
async function syncFeedDate() {
  if (!feedDate || feedSyncPending || mutationPending || metadataRefreshPending) return;
  const hasExpired = latestUpdates(shows).length < shows.filter((show) => show.latestUpdate).length;
  if (feedDate === today() && !hasExpired) return;
  feedSyncPending = true;
  const originalShows = shows;
  const date = today();
  try {
    const value = await api("/api/library");
    // Newer mutations own browser state; a later timer retries skipped reconciliation.
    if (shows !== originalShows || mutationPending || metadataRefreshPending) return;
    const saved = new Map(value.shows.map((show) => [show.id, show]));
    shows = shows.map((show) => saved.has(show.id) ? {
      ...show, updateSnapshot: saved.get(show.id).updateSnapshot, latestUpdate: saved.get(show.id).latestUpdate,
    } : show);
    feedDate = date;
    render();
    if ($("#show-dialog").open) renderShow();
  } catch {
    // Keep saved data usable offline; the next visible date check retries quietly.
  } finally {
    feedSyncPending = false;
  }
}

// Artwork owns temporary image options; the app reconciles only saved choices.
const artworkDialog = createArtworkDialog({
  // Reconcile a saved artwork selection into application state and redraw its show.
  onSaved(updated) {
    shows = shows.map((show) => show.id === updated.id ? updated : show);
    render();
    if (selectedId === updated.id && $("#show-dialog").open) renderShow();
    toast("Artwork saved.");
  },
});

// Search owns its paging state while the app supplies library updates and routing.
const searchDialog = createSearchDialog({
  // Return the latest saved collection to search result rendering.
  getShows: () => shows,
  // Reconcile a newly saved search result into the collection and redraw the pages.
  onShowAdded: (show) => {
    if (shows.some((entry) => entry.id === show.id))
      shows = shows.map((entry) => (entry.id === show.id ? show : entry));
    else shows.push(show);
    render();
  },
  onOpenShow: openShow,
});

// Delegated button actions cover content that renderers replace after each change.
// Dispatch delegated navigation, dialog, collection, and show actions from clicked controls.
document.addEventListener("click", async (event) => {
  // Touch-open choices dismiss when another part of the page is used.
  document.querySelectorAll(".continue-watch-actions.thumb-menu-open").forEach((wrapper) => {
    if (!wrapper.contains(event.target)) setThumbMenu(wrapper, false);
  });
  // Episode menus close when interaction leaves their disclosure.
  document.querySelectorAll(".rewatch-options[open]").forEach((menu) => {
    if (!menu.contains(event.target)) menu.open = false;
  });
  // Native details filters close when interaction moves elsewhere on the page.
  document.querySelectorAll(".library-controls .status-filter[open]").forEach((filter) => {
    if (!filter.contains(event.target)) filter.open = false;
  });
  const seasonOptions = $(".season-options");
  if (
    matchMedia("(max-width: 800px)").matches &&
    seasonOptions &&
    !event.target.closest(".season-options")
  )
    seasonOptions.open = false;
  const pageLink = event.target.closest("[data-page]");
  if (pageLink && $("#nav-drawer").open) $("#nav-drawer").close();
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.close) {
    const dialog = $(`#${button.dataset.close}`);
    if (dialog.dataset.saving !== "true") dialog.close();
    return;
  }
  if (button.id === "updates-unread") return markAllUpdatesRead();
  if (button.id === "open-show-info") {
    $("#show-info-query").value = "";
    $("#show-info-dialog").showModal();
    renderShowInfo();
    $("#show-info-list").scrollTop = 0;
    $("#show-info-query").focus();
    return;
  }
  if (button.dataset.infoRefresh) return refreshManually(Number(button.dataset.infoRefresh));
  if (button.id === "updates-more") {
    updatesExpanded = !updatesExpanded;
    render();
    $("#updates-more").focus({ preventScroll: true });
    return;
  }
  if (button.dataset.tab) {
    // Statuses combine with OR; Watchlist is an independent intersecting filter.
    const tab = button.dataset.tab;
    if (tab === "All") {
      libraryFilters.selectedStatuses.clear();
      libraryFilters.watchlistOnly = false;
    } else if (tab === "Watchlist") {
      libraryFilters.watchlistOnly = !libraryFilters.watchlistOnly;
    } else if (libraryFilters.selectedStatuses.has(tab)) {
      libraryFilters.selectedStatuses.delete(tab);
    } else {
      libraryFilters.selectedStatuses.add(tab);
    }
    saveLibraryFilters();
    if (location.hash !== "#library") history.pushState(null, "", "#library");
    applyRoute();
    render();
    return;
  }
  if (button.dataset.genre !== undefined) {
    // Genre selections combine with AND in the model layer.
    const genre = button.dataset.genre;
    if (!genre) libraryFilters.selectedGenres.clear();
    else if (libraryFilters.selectedGenres.has(genre))
      libraryFilters.selectedGenres.delete(genre);
    else libraryFilters.selectedGenres.add(genre);
    saveLibraryFilters();
    render();
    return;
  }
  if (button.dataset.view) {
    viewMode = button.dataset.view;
    try {
      localStorage.setItem("next-episode:view", viewMode);
    } catch {
      // The view still changes for this session if browser storage is unavailable.
    }
    render();
    return;
  }
  if (button.dataset.show) return openShow(button.dataset.show, button.dataset.showSeason ?? null);
  if (button.dataset.toggleThumbs !== undefined) {
    const wrapper = button.closest(".continue-watch-actions");
    setThumbMenu(wrapper, !wrapper.classList.contains("thumb-menu-open"));
    return;
  }
  if (button.dataset.episodeThumb) {
    if (mutationPending || button.disabled) return;
    const id = Number(button.dataset.thumbShow);
    const show = shows.find((entry) => entry.id === id);
    if (!show) return;
    const season = Number(button.dataset.thumbSeason), episode = Number(button.dataset.thumbEpisode);
    const key = `${season}:${episode}`;
    const rating = episodeRating(show, key) === button.dataset.episodeThumb ? null : button.dataset.episodeThumb;
    const body = { episodeRating: { season, episode, rating } };
    if (button.dataset.thumbWatch !== undefined)
      body.progress = { action: "episode", season, episode, watched: true };
    return save(body, rating ? `Episode ${rating === "up" ? "liked" : "disliked"}.` : "Episode rating cleared.", id);
  }
  if (button.dataset.next) {
    // Continue Watching always resolves the next aired episode at click time.
    const id = Number(button.dataset.next);
    const show = shows.find((s) => s.id === id);
    const next = show && progress(show).next;
    if (!next) return;
    return save(
      {
        progress: {
          action: "episode",
          season: next.season_number,
          episode: next.episode_number,
          watched: true,
        },
      },
      `${show.name} · ${episodeCode(next)} marked watched.`,
      id,
    );
  }
  if (
    ["add-show", "first-show"].includes(button.id) ||
    button.dataset.addShow !== undefined
  ) {
    if ($("#nav-drawer").open) $("#nav-drawer").close();
    return searchDialog.open();
  }
  if (button.id === "nav-menu-toggle") return $("#nav-drawer").showModal();
  if (button.id === "credits") return $("#credits-dialog").showModal();
  if (button.id === "change-artwork") {
    const show = shows.find((entry) => entry.id === selectedId);
    if (show && !mutationPending) artworkDialog.open(show);
    return;
  }
  if (button.id === "create-list" || button.dataset.createList !== undefined) {
    renderListDialog();
    enhanceSelects($("#list-dialog"));
    return $("#list-dialog").showModal();
  }
  if (button.dataset.editList) {
    const list = lists.find((entry) => entry.id === button.dataset.editList);
    if (!list) return;
    renderListDialog(list, shows);
    enhanceSelects($("#list-dialog"));
    return $("#list-dialog").showModal();
  }
  if (button.dataset.openList) {
    location.hash = `lists/${encodeURIComponent(button.dataset.openList)}`;
    return;
  }
  if (button.dataset.removeEditListShow) {
    button.closest("[data-edit-list-show]")?.remove();
    refreshEditRanks();
    if (!$("#list-edit-show-options").querySelector("[data-edit-list-show]"))
      $("#list-edit-show-options").innerHTML =
        '<p class="muted">All shows will be removed when you save.</p>';
    return;
  }
  if (button.dataset.listView) {
    try {
      localStorage.setItem(`next-episode:list-view:${button.dataset.listId}`, button.dataset.listView);
    } catch {}
    render();
    $(`#list-detail [data-list-view="${button.dataset.listView}"]`)?.focus({ preventScroll: true });
    return;
  }
  if (button.dataset.clearListFilters !== undefined) {
    listFilters.set(selectedListId(), {
      query: "",
      statuses: new Set(),
      watchlist: false,
      genres: new Set(),
      rating: "",
    });
    render();
    return;
  }
  if (button.dataset.listWatchlist !== undefined) {
    const filters = filtersForList(selectedListId());
    filters.watchlist = !filters.watchlist;
    render();
    return;
  }
  if (button.dataset.listStatus !== undefined) {
    const selected = filtersForList(selectedListId()).statuses;
    if (!button.dataset.listStatus) selected.clear();
    else if (selected.has(button.dataset.listStatus)) selected.delete(button.dataset.listStatus);
    else selected.add(button.dataset.listStatus);
    render();
    return;
  }
  if (button.dataset.listGenre !== undefined) {
    const selected = filtersForList(selectedListId()).genres;
    if (!button.dataset.listGenre) selected.clear();
    else if (selected.has(button.dataset.listGenre)) selected.delete(button.dataset.listGenre);
    else selected.add(button.dataset.listGenre);
    render();
    return;
  }
  if (button.dataset.addListShows) {
    const list = lists.find((entry) => entry.id === button.dataset.addListShows);
    if (!list) return;
    $("#list-members-id").value = list.id;
    $("#list-members-query").value = "";
    $("#list-members-title").textContent = `Shows in ${list.name}`;
    listMemberSelection = new Set(list.entries.map((entry) => entry.showId));
    renderMemberOptions(list, shows, "", listMemberSelection);
    $("#list-members-dialog").showModal();
    return;
  }
  if (button.id === "manage-show-lists") {
    const show = shows.find((entry) => entry.id === selectedId);
    if (!show) return;
    $("#show-lists-id").value = String(show.id);
    $("#show-lists-title").textContent = `Lists for ${show.name}`;
    renderShowListOptions(show, lists);
    $("#show-lists-dialog").showModal();
    return;
  }
  if (button.dataset.createListFromShow !== undefined) {
    pendingListShowId = Number($("#show-lists-id").value);
    $("#show-lists-dialog").close();
    renderListDialog();
    enhanceSelects($("#list-dialog"));
    $("#list-dialog").showModal();
    return;
  }
  if (button.id === "delete-list") {
    const id = $("#list-id").value;
    const list = lists.find((entry) => entry.id === id);
    if (!list || !confirm(`Delete ${list.name}? Its shows will stay in your library.`)) return;
    button.disabled = true;
    try {
      await api(`/api/lists/${encodeURIComponent(id)}`, { method: "DELETE" });
      lists = lists.filter((entry) => entry.id !== id);
      $("#list-dialog").close();
      if (selectedListId() === id) history.replaceState(null, "", "#lists");
      render();
      toast("List deleted. Your shows were not changed.");
    } catch (error) {
      report(error);
    } finally {
      button.disabled = false;
    }
    return;
  }
  if (button.dataset.clearRating === "show-rating")
    return save({ rating: null }, "Show rating cleared.");
  if (button.dataset.clearRating === "season-rating")
    return save(
      { seasonRating: { season: selectedSeason, rating: null } },
      "Season rating cleared.",
    );
  if (button.id === "toggle-watchlist") {
    const show = shows.find((s) => s.id === selectedId);
    const watchlist = !inWatchlist(show);
    return save(
      { watchlist },
      watchlist
        ? "Added to watchlist. Status and progress kept."
        : "Removed from watchlist. Status and progress kept.",
    );
  }
  if (button.id === "load-more") return searchDialog.loadMore();
  if (button.id === "reset-filters") {
    libraryFilters.selectedStatuses.clear();
    libraryFilters.selectedGenres.clear();
    libraryFilters.watchlistOnly = false;
    saveLibraryFilters();
    $("#library-query").value = "";
    $("#rating-filter").value = "";
    render();
    return;
  }
  if (button.dataset.add || button.dataset.watchlistAdd) {
    const id = Number(button.dataset.add || button.dataset.watchlistAdd);
    const watchlistOnly = Boolean(button.dataset.watchlistAdd);
    return searchDialog.add(id, watchlistOnly);
  }
  if (button.dataset.through)
    return save(
      {
        progress: {
          action: "through",
          season: selectedSeason,
          episode: Number(button.dataset.through),
          watched: true,
        },
      },
      "Progress saved.",
    );
  if (button.dataset.rewatch) {
    return save({ rewatch: { action: "increment", season: selectedSeason,
      episode: Number(button.dataset.rewatch) } }, "Rewatch recorded.");
  }
  if (button.dataset.editRewatch) {
    if (mutationPending) return;
    const show = shows.find((entry) => entry.id === selectedId);
    const episode = show.episodes.find((entry) => entry.season_number === selectedSeason &&
      entry.episode_number === Number(button.dataset.editRewatch));
    if (!episode || !show.watched.includes(episodeKey(episode))) return;
    rewatchEditor = { showId: selectedId, season: selectedSeason, episode: episode.episode_number };
    $("#rewatch-episode-name").textContent = `${episodeCode(episode)} · ${episode.name}`;
    $("#rewatch-count").value = episodeRewatches(show, episodeKey(episode));
    button.closest("details").open = false;
    $("#rewatch-dialog").showModal();
    $("#rewatch-count").focus();
    $("#rewatch-count").select();
    return;
  }
  if (button.id === "mark-season" || button.id === "clear-season")
    return save(
      {
        progress: {
          action: "season",
          season: selectedSeason,
          watched: button.id === "mark-season",
        },
      },
      button.id === "mark-season"
        ? "Aired episodes in this season marked watched."
        : "Season progress cleared.",
    );
  if (button.id === "refresh-show") {
    return refreshManually(selectedId);
  }
  if (button.id === "remove-show") {
    const id = selectedId;
    const show = shows.find((s) => s.id === id);
    const tracked = inLibrary(show);
    const keepsWatchlist = tracked && inWatchlist(show);
    // Removing All Shows data keeps the record only when Watchlist still needs it.
    const prompt = tracked
      ? `Remove ${show.name} from All Shows? This clears its status, ratings, and episode progress.${keepsWatchlist ? " It will remain on your Watchlist." : ""}`
      : `Remove ${show.name} from your saved shows?`;
    if (!confirm(prompt)) return;
    button.disabled = true;
    try {
      if (keepsWatchlist) {
        const updated = await api(`/api/shows/${id}`, {
          method: "PATCH",
          body: { tracked: false },
        });
        shows = shows.map((s) => (s.id === id ? updated : s));
      } else {
        await api(`/api/shows/${id}`, { method: "DELETE" });
        shows = shows.filter((s) => s.id !== id);
      }
      $("#show-dialog").close();
      render();
      toast(
        keepsWatchlist
          ? "Removed from All Shows and kept on your Watchlist."
          : "Show removed from your library.",
      );
    } catch (error) {
      report(error);
      button.disabled = false;
    }
  }
});

// Native control changes update filters or persist show-level fields.
// Apply filter, sort, rating, membership, rank, and progress changes from delegated controls.
document.addEventListener("change", (event) => {
  const el = event.target;
  // Window changes redraw cached releases and keep focus on the custom selector.
  if (el.id === "upcoming-window") {
    upcomingDays = upcomingWindow(el.value);
    try {
      localStorage.setItem("next-episode:upcoming-window", String(upcomingDays));
    } catch {
      // This session's choice remains usable when browser storage is blocked.
    }
    render();
    $("#upcoming-window").closest(".custom-select")?.querySelector(".custom-select-trigger")?.focus();
    return;
  }
  // Read checkboxes persist through the guarded API.
  if (el.dataset.readUpdate) {
    if (!el.checked) return;
    return markUpdateRead(Number(el.dataset.readUpdate), el.dataset.updateId);
  }
  if (el.dataset.listSort) {
    const list = lists.find((entry) => entry.id === el.dataset.listSort);
    if (!list) return;
    el.disabled = true;
    api(`/api/lists/${encodeURIComponent(list.id)}`, {
      method: "PATCH",
      body: {
        name: list.name,
        description: list.description,
        ordered: list.ordered,
        sort: el.value,
      },
    })
      .then((updated) => {
        lists = lists.map((entry) => (entry.id === list.id ? updated : entry));
        render();
        toast("Display order saved.");
      })
      .catch((error) => {
        report(error);
        el.disabled = false;
      });
  }
  if (el.dataset.listFilter) {
    filtersForList(selectedListId())[el.dataset.listFilter] = el.value;
    render();
  }
  if (el.id === "list-ordered")
    $("#list-form").classList.toggle("ranked-editing", el.checked);
  if (el.classList.contains("list-edit-rank")) {
    const rows = [...$("#list-edit-show-options").querySelectorAll(".list-edit-show")];
    const row = el.closest(".list-edit-show");
    const destination = Math.max(0, Math.min(rows.length - 1, Number(el.value) - 1));
    const reference = rows.filter((candidate) => candidate !== row)[destination];
    if (reference) reference.before(row);
    else $("#list-edit-show-options").append(row);
    refreshEditRanks();
    row.querySelector(".list-edit-rank")?.focus();
  }
  if (["rating-filter", "sort"].includes(el.id)) render();
  if (el.id === "season-select") {
    selectedSeason = Number(el.value);
    renderShow();
    $("#season-select").focus();
  }
  if (el.dataset.ratingKind === "show-rating")
    save({ rating: Number(el.value) }, "Show rating saved.");
  if (el.dataset.ratingKind === "season-rating")
    save(
      {
        seasonRating: {
          season: selectedSeason,
          rating: Number(el.value),
        },
      },
      "Season rating saved.",
    );
  if (el.id === "show-status")
    save({ statusOverride: el.value || null }, "Status saved.");
  if (el.dataset.episode)
    save({
      progress: {
        action: "episode",
        season: selectedSeason,
        episode: Number(el.dataset.episode),
        watched: el.checked,
      },
    });
});
// Filter metadata rows or redraw a personal list when its title-search field changes.
document.addEventListener("input", (event) => {
  if (event.target.id === "show-info-query") {
    $("#show-info-list").scrollTop = 0;
    renderShowInfo();
    return;
  }
  const input = event.target.closest("[data-list-query]");
  if (!input) return;
  filtersForList(input.dataset.listQuery).query = input.value;
  const cursor = input.selectionStart;
  render();
  const replacement = document.querySelector(
    `[data-list-query="${CSS.escape(input.dataset.listQuery)}"]`,
  );
  replacement?.focus();
  replacement?.setSelectionRange(cursor, cursor);
});

// Save exact repeat corrections through the same guarded show mutation flow.
$("#rewatch-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!rewatchEditor || mutationPending) return;
  const count = Number($("#rewatch-count").value);
  if (!Number.isSafeInteger(count) || count < 0 || count >= Number.MAX_SAFE_INTEGER) return;
  const editor = { ...rewatchEditor };
  const dialog = $("#rewatch-dialog");
  dialog.dataset.saving = "true";
  dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = true; });
  try {
    const updated = await save({ rewatch: { action: "set", season: editor.season,
      episode: editor.episode, count } }, "Rewatch count saved.", editor.showId);
    if (updated) dialog.close();
  } finally {
    dialog.dataset.saving = "false";
    dialog.querySelectorAll("button, input").forEach((control) => { control.disabled = false; });
    if (dialog.open) $("#rewatch-count").focus();
  }
});
// Returning from corrections restores focus to the recreated episode's options control.
$("#rewatch-dialog").addEventListener("close", () => {
  if (rewatchEditor?.showId === selectedId && rewatchEditor.season === selectedSeason)
    document.getElementById(`rewatch-options-${rewatchEditor.episode}`)?.focus({ preventScroll: true });
  rewatchEditor = null;
});
// An in-flight correction cannot be dismissed before its result is known.
$("#rewatch-dialog").addEventListener("cancel", (event) => {
  if ($("#rewatch-dialog").dataset.saving === "true") event.preventDefault();
});
// Save metadata first, then reconcile edited membership and manual ranks.
// Save list metadata and edited member order, then reconcile the returned list state.
$("#list-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#list-id").value;
  const submit = $("#list-dialog-submit");
  const payload = {
    name: $("#list-name").value,
    description: $("#list-description").value,
    ordered: $("#list-ordered").checked,
    sort:
      !id || String($("#list-ordered").checked) !== $("#list-ordered").dataset.original
        ? $("#list-ordered").checked
          ? "manual"
          : "added-oldest"
        : lists.find((list) => list.id === id)?.sort || "added-oldest",
  };
  submit.disabled = true;
  try {
    let saved = await api(id ? `/api/lists/${encodeURIComponent(id)}` : "/api/lists", {
      method: id ? "PATCH" : "POST",
      body: payload,
    });
    if (id) {
      const showIds = [
        ...$("#list-edit-show-options").querySelectorAll(
          'input[name="existingShowId"]',
        ),
      ].map((input) => Number(input.value));
      saved = await api(`/api/lists/${encodeURIComponent(id)}/items`, {
        method: "PUT",
        body: { showIds },
      });
    }
    lists = id
      ? lists.map((list) => (list.id === id ? saved : list))
      : [...lists, saved];
    if (!id && pendingListShowId) {
      const updated = await api(`/api/lists/${encodeURIComponent(saved.id)}/items`, {
        method: "PUT",
        body: { showIds: [pendingListShowId] },
      });
      lists = lists.map((list) => (list.id === saved.id ? updated : list));
    }
    $("#list-dialog").close();
    render();
    if ($("#show-dialog").open) renderShow();
    toast(id ? "List changes saved." : "List created.");
  } catch (error) {
    report(error);
  } finally {
    pendingListShowId = null;
    submit.disabled = false;
  }
});
// Filter the membership picker without losing pending checkbox selections.
$("#list-members-query").addEventListener("input", () => {
  const list = lists.find((entry) => entry.id === $("#list-members-id").value);
  if (list) renderMemberOptions(list, shows, $("#list-members-query").value, listMemberSelection);
});
// Track pending membership changes independently of the filtered checkbox markup.
$("#list-members-options").addEventListener("change", (event) => {
  if (event.target.name !== "showId") return;
  const id = Number(event.target.value);
  event.target.checked ? listMemberSelection.add(id) : listMemberSelection.delete(id);
});
// Save selected membership while preserving existing member order and appending new shows.
$("#list-members-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#list-members-id").value;
  // Search filtering never drops selections that are temporarily out of view.
  const list = lists.find((entry) => entry.id === id);
  if (!list) return;
  // Retain existing ranks; newly selected shows append in library order.
  const existingIds = list.entries.map((entry) => entry.showId);
  const existing = new Set(existingIds);
  const showIds = [
    ...existingIds.filter((showId) => listMemberSelection.has(showId)),
    ...shows.filter((show) => listMemberSelection.has(show.id) && !existing.has(show.id)).map((show) => show.id),
  ];
  try {
    const updated = await api(`/api/lists/${encodeURIComponent(id)}/items`, { method: "PUT", body: { showIds } });
    lists = lists.map((list) => (list.id === id ? updated : list));
    $("#list-members-dialog").close();
    render();
    toast("List shows saved.");
  } catch (error) { report(error); }
});
// Save the selected show's list memberships and redraw both list and show views.
$("#show-lists-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const showId = Number($("#show-lists-id").value);
  const listIds = [...$("#show-lists-options").querySelectorAll('input[name="listId"]:checked')].map((input) => input.value);
  try {
    lists = await api(`/api/shows/${showId}/lists`, { method: "PUT", body: { listIds } });
    $("#show-lists-dialog").close();
    render();
    renderShow();
    toast("List memberships saved.");
  } catch (error) { report(error); }
});

// Ranked order changes only inside Edit List and persists with the form save.
// Renumber editable list positions after rows are moved or removed.
function refreshEditRanks() {
  const rows = [...$("#list-edit-show-options").querySelectorAll(".list-edit-show")];
  rows.forEach((row, index) => {
    const input = row.querySelector(".list-edit-rank");
    input.value = String(index + 1);
    input.max = String(rows.length);
  });
}
$("#library-query").addEventListener("input", render);
// The static overview input retains its value and focus across renders/navigation.
$("#lists-query").addEventListener("input", render);
// Clear the overview search, redraw all lists, and return focus to the search field.
$("#clear-lists-search").addEventListener("click", () => {
  $("#lists-query").value = "";
  render();
  $("#lists-query").focus();
});
// Each transparent half-star target previews its value until the pointer leaves.
document.addEventListener("pointerover", (event) => {
  const input = event.target.closest("[data-rating-kind]");
  if (input) previewRating(input.closest(".rating-control"), Number(input.value));
});
// Restore saved star fills when the pointer leaves a rating target.
document.addEventListener("pointerout", (event) => {
  const input = event.target.closest("[data-rating-kind]");
  if (!input) return;
  const control = input.closest(".rating-control");
  const nextInput = event.relatedTarget?.closest?.("[data-rating-kind]");
  if (nextInput?.closest(".rating-control") === control) return;
  previewRating(control, control.dataset.value ? Number(control.dataset.value) : null);
});

// Global keyboard controls close custom filters and open Add a show.
document.addEventListener("keydown", (event) => {
  const thumbMenu = document.activeElement?.closest(".continue-watch-actions");
  if (event.key === "Escape" && thumbMenu) {
    event.preventDefault();
    setThumbMenu(thumbMenu, false);
    thumbMenu.querySelector(".next-watched")?.focus();
    return;
  }
  const rewatchMenu = $(".rewatch-options[open]");
  if (event.key === "Escape" && rewatchMenu && !$("#rewatch-dialog").open) {
    event.preventDefault();
    rewatchMenu.open = false;
    rewatchMenu.querySelector("summary").focus();
    return;
  }
  const openFilter = $(".library-controls .status-filter[open]");
  const openSeasonOptions = matchMedia("(max-width: 800px)").matches
    ? $(".season-options[open]")
    : null;
  const openDisclosure = openFilter || openSeasonOptions;
  if (event.key === "Escape" && openDisclosure) {
    openDisclosure.open = false;
    openDisclosure.querySelector("summary").focus();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchDialog.open();
  }
});
// A fresh pointer or keyboard entry makes a previously dismissed rating bar available again.
function resetThumbMenuDismissal(event) {
  const wrapper = event.target.closest?.(".continue-watch-actions");
  if (wrapper && (!event.relatedTarget || !wrapper.contains(event.relatedTarget)))
    wrapper.classList.remove("thumb-menu-dismissed");
}
document.addEventListener("pointerover", resetThumbMenuDismissal);
document.addEventListener("focusin", resetThumbMenuDismissal);
// Apply hash navigation and start the destination page at the top.
window.addEventListener("hashchange", () => applyRoute({ scroll: true }));

// Keep season actions expanded on desktop and collapsed after crossing to mobile.
matchMedia("(max-width: 800px)").addEventListener("change", (event) => {
  const seasonOptions = $(".season-options");
  if (seasonOptions) seasonOptions.open = !event.matches;
});

// A click on a dialog backdrop closes it without intercepting panel clicks.
for (const dialog of document.querySelectorAll("dialog"))
  // Dismiss a backdrop click outside the panel unless a dialog save is in progress.
  dialog.addEventListener("click", (event) => {
    if (dialog.dataset.saving === "true") return;
    if (event.target !== dialog) return;
    const r = dialog.getBoundingClientRect();
    if (
      event.clientX < r.left ||
      event.clientX > r.right ||
      event.clientY < r.top ||
      event.clientY > r.bottom
    )
      dialog.close();
  });

// Closing by Escape, backdrop, or button consistently returns to the overview opener.
$("#show-info-dialog").addEventListener("close", () => {
  showInfoOrder = null;
  $("#open-show-info").focus({ preventScroll: true });
});

// Static guidance renders independently of library loading and refreshes.
renderHelp($("#help-view"));

// Startup renders saved data first, then refreshes a bounded stale-metadata queue.
// Load the saved library, apply the route, and refresh a bounded queue of stale metadata.
async function boot() {
  try {
    const value = await api("/api/library");
    ({ shows, lists } = value);
    feedDate = today();
    render();
    applyRoute({ scroll: true });
    // Refresh failures stop the batch while leaving saved progress and ratings usable.
    for (const show of metadataRefreshQueue(shows)) {
      // Recheck saved eligibility before each request from the captured startup queue.
      const current = shows.find((entry) => entry.id === show.id);
      if (!current || !metadataRefreshQueue([current]).length) continue;
      try {
        await refreshShow(show.id, false);
      } catch (error) {
        toast(
          "Your saved library is ready. Show information could not refresh; try again when online.",
        );
        break;
      }
    }
  } catch (error) {
    $("#empty").hidden = false;
    $("#empty").innerHTML =
      `<h2>Your library couldn’t load.</h2><p>${esc(error.message)}</p><button id="retry-load">Try again</button>`;
    $("#retry-load").addEventListener("click", boot);
  }
}
// Reconcile cached air dates and visible refresh timing; visibility covers suspended timers.
setInterval(() => { if (!document.hidden) { syncFeedDate(); renderShowInfo(); } }, 60_000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) { syncFeedDate(); renderShowInfo(); } });
boot();
