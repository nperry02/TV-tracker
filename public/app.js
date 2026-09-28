import {
  progress,
  inWatchlist,
  inLibrary,
  metadataRefreshQueue,
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
import { renderHome } from "./views/home.js";
import { renderLibrary } from "./views/library.js";
import {
  initialShowSeason,
  renderShowDialog,
} from "./views/show-dialog.js";
let shows = [],
  activeTab = "All",
  selectedId = null,
  selectedSeason = null,
  mutationPending = false;
let viewMode = (() => {
  try {
    return localStorage.getItem("next-episode:view") === "list"
      ? "list"
      : "gallery";
  } catch {
    return "gallery";
  }
})();
function applyRoute({ scroll = false } = {}) {
  const route = location.hash === "#stats" ? "stats" : location.hash === "#library" ? "library" : "home";
  $("#home-view").hidden = route === "stats";
  $("#stats-view").hidden = route !== "stats";
  document.querySelectorAll("[data-page]").forEach((link) =>
    link.classList.toggle("active", link.dataset.page === route),
  );
  if (route === "stats") renderStats(shows, $("#stats-content"));
  if (scroll && route === "stats") window.scrollTo({ top: 0, behavior: "auto" });
  if (scroll && route === "library")
    $("#library").scrollIntoView({ behavior: "smooth", block: "start" });
  if (scroll && route === "home") window.scrollTo({ top: 0, behavior: "smooth" });
}
function render() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.view === viewMode));
  });
  document.querySelectorAll("[data-sidebar-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.sidebarTab === activeTab);
  });
  renderHome(shows, mutationPending);
  renderLibrary(shows, activeTab, viewMode);
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
    renderShowDialog(show, selectedSeason, mutationPending);
    enhanceSelects($("#show-content"));
  }
}
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
document.addEventListener("click", async (event) => {
  const pageLink = event.target.closest("[data-page], [data-sidebar-tab]");
  if (pageLink && $("#nav-drawer").open) $("#nav-drawer").close();
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.close) return $(`#${button.dataset.close}`).close();
  if (button.dataset.tab) {
    activeTab = button.dataset.tab;
    if (location.hash !== "#library") history.pushState(null, "", "#library");
    applyRoute();
    render();
    return;
  }
  if (button.dataset.sidebarTab) {
    activeTab = button.dataset.sidebarTab;
    if (location.hash !== "#library") history.pushState(null, "", "#library");
    applyRoute();
    render();
    $("#library").scrollIntoView({ behavior: "smooth", block: "start" });
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
  if (["add-show", "first-show"].includes(button.id))
    return searchDialog.open();
  if (button.id === "nav-menu-toggle") return $("#nav-drawer").showModal();
  if (button.id === "credits") return $("#credits-dialog").showModal();
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
    activeTab = "All";
    $("#library-query").value = "";
    $("#genre").value = "";
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
document.addEventListener("change", (event) => {
  const el = event.target;
  if (["genre", "rating-filter", "sort"].includes(el.id)) render();
  if (el.id === "season-select") {
    selectedSeason = Number(el.value);
    renderShow();
    $("#season-select").focus();
  }
  if (el.id === "show-rating")
    save({ rating: el.value ? Number(el.value) : null }, "Show rating saved.");
  if (el.id === "season-rating")
    save(
      {
        seasonRating: {
          season: selectedSeason,
          rating: el.value ? Number(el.value) : null,
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
$("#library-query").addEventListener("input", render);
document.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchDialog.open();
  }
});
window.addEventListener("hashchange", () => applyRoute({ scroll: true }));
for (const dialog of document.querySelectorAll("dialog"))
  dialog.addEventListener("click", (event) => {
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
async function boot() {
  try {
    ({ shows } = await api("/api/library"));
    render();
    applyRoute({ scroll: true });
    // Refresh stale metadata without blocking access to saved progress and ratings.
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
