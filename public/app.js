import {
  progress,
  inWatchlist,
  inLibrary,
  metadataRefreshQueue,
  statuses,
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

function selectedListId() {
  return location.hash.startsWith("#lists/")
    ? decodeURIComponent(location.hash.slice(7))
    : null;
}
function listViewMode(id) {
  try {
    return localStorage.getItem(`next-episode:list-view:${id}`) === "list"
      ? "list"
      : "gallery";
  } catch {
    return "gallery";
  }
}
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
    return localStorage.getItem("next-episode:view") === "list"
      ? "list"
      : "gallery";
  } catch {
    return "gallery";
  }
})();

// Hash routing and top-level rendering
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
function render() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === viewMode));
  });
  renderHome(shows, mutationPending);
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
  enhanceSelects();
}
function openShow(id) {
  selectedId = Number(id);
  const show = shows.find((s) => s.id === selectedId);
  if (!show) return;
  selectedSeason = initialShowSeason(show);
  renderShow();
  if ($("#search-dialog").open) $("#search-dialog").close();
  if (!$("#show-dialog").open) $("#show-dialog").showModal();
}
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
  }
}

// Hover previews separate the shared fill from the difference to the saved rating.
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
async function save(body, message, id = selectedId) {
  if (mutationPending) return;
  mutationPending = true;
  const isCurrentDialog = () => selectedId === id && $("#show-dialog").open;
  const scroll = $("#show-dialog").scrollTop;
  const focused = document.activeElement;
  const focusId = focused?.id;
  const episode = focused?.dataset.episode;
  render();
  if (isCurrentDialog()) renderShow();
  try {
    const updated = await api(`/api/shows/${id}`, { method: "PATCH", body });
    shows = shows.map((s) => (s.id === id ? updated : s));
    render();
    if (message) toast(message);
  } catch (error) {
    report(error);
  } finally {
    mutationPending = false;
    render();
    if ($("#show-dialog").open) renderShow();
    if (!isCurrentDialog()) return;
    $("#show-dialog").scrollTop = scroll;
    // Recreated dialog markup receives focus by stable ID or episode number.
    const target = focusId
      ? document.getElementById(focusId)
      : episode
        ? $(`[data-episode="${episode}"]`)
        : null;
    target?.focus({ preventScroll: true });
  }
}
async function refreshShow(id, notify = true) {
  const updated = await api(`/api/shows/${id}/refresh`, { method: "POST" });
  shows = shows.map((s) => (s.id === id ? updated : s));
  render();
  if (selectedId === id && $("#show-dialog").open) renderShow();
  if (notify) toast("Show information is up to date.");
}

// Artwork owns temporary image options; the app reconciles only saved choices.
const artworkDialog = createArtworkDialog({
  onSaved(updated) {
    shows = shows.map((show) => show.id === updated.id ? updated : show);
    render();
    if (selectedId === updated.id && $("#show-dialog").open) renderShow();
    toast("Artwork saved.");
  },
});

// Search owns its paging state while the app supplies library updates and routing.
const searchDialog = createSearchDialog({
  getShows: () => shows,
  onShowAdded: (show) => {
    if (shows.some((entry) => entry.id === show.id))
      shows = shows.map((entry) => (entry.id === show.id ? show : entry));
    else shows.push(show);
    render();
  },
  onOpenShow: openShow,
});

// Delegated button actions cover content that renderers replace after each change.
document.addEventListener("click", async (event) => {
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
  if (button.dataset.close) return $(`#${button.dataset.close}`).close();
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
  if (button.dataset.show) return openShow(button.dataset.show);
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
    button.disabled = true;
    button.textContent = "Refreshing…";
    try {
      await refreshShow(selectedId);
    } catch (error) {
      report(error);
    } finally {
      renderShow();
    }
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
document.addEventListener("change", (event) => {
  const el = event.target;
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
document.addEventListener("input", (event) => {
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
// Save metadata first, then reconcile edited membership and manual ranks.
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
$("#list-members-query").addEventListener("input", () => {
  const list = lists.find((entry) => entry.id === $("#list-members-id").value);
  if (list) renderMemberOptions(list, shows, $("#list-members-query").value, listMemberSelection);
});
$("#list-members-options").addEventListener("change", (event) => {
  if (event.target.name !== "showId") return;
  const id = Number(event.target.value);
  event.target.checked ? listMemberSelection.add(id) : listMemberSelection.delete(id);
});
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
window.addEventListener("hashchange", () => applyRoute({ scroll: true }));

// Keep season actions expanded on desktop and collapsed after crossing to mobile.
matchMedia("(max-width: 800px)").addEventListener("change", (event) => {
  const seasonOptions = $(".season-options");
  if (seasonOptions) seasonOptions.open = !event.matches;
});

// A click on a dialog backdrop closes it without intercepting panel clicks.
for (const dialog of document.querySelectorAll("dialog"))
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

// Static guidance renders independently of library loading and refreshes.
renderHelp($("#help-view"));

// Startup renders saved data first, then refreshes a bounded stale-metadata queue.
async function boot() {
  try {
    ({ shows, lists } = await api("/api/library"));
    render();
    applyRoute({ scroll: true });
    // Refresh failures stop the batch while leaving saved progress and ratings usable.
    for (const show of metadataRefreshQueue(shows)) {
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
boot();
