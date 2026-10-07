import { api } from "../api.js";
import { inLibrary, inWatchlist } from "../model.js";
import { $, esc, poster, report, toast, year } from "../ui.js";

// Create a paged TMDB search dialog with independent query and addition state.
export function createSearchDialog({ getShows, onShowAdded, onOpenShow }) {
  // Incrementing runs prevent stale search responses from replacing newer results.
  let searchRun = 0;
  let state = {
    query: "",
    page: 0,
    totalPages: 0,
    total: 0,
    results: [],
    loading: false,
    error: "",
  };
  // IDs stay locked while either library or Watchlist addition is in flight.
  const addingShows = new Set();

  // Render search status, result actions, and pagination from the local state snapshot.
  // Render search results, membership actions, request feedback, and pagination controls.
  function render() {
    $("#search-message").textContent =
      state.error ||
      (state.loading
        ? state.page
          ? "Loading more shows…"
          : "Searching TV shows…"
        : !state.query
          ? "Search for a show to start your collection."
          : state.results.length
            ? `Showing ${state.results.length} of ${state.total} results for “${state.query}”`
            : `No shows found for “${state.query}”. Try a different title.`);
    $("#search-results").setAttribute("aria-busy", String(state.loading));
    $("#search-results").innerHTML = state.results
      .map((show) => {
        const saved = getShows().find((entry) => entry.id === show.id);
        const busy = addingShows.has(show.id);
        return `<article class="search-result">${poster(show, "mini-poster", "w92")}<div class="result-info"><h3>${esc(show.name)} <span class="year">${year(show)}</span></h3><p>${esc(show.overview || "No description available.")}</p></div><div class="search-actions">${saved && inLibrary(saved) ? `<button data-show="${show.id}">Open ↗</button>` : `<button data-add="${show.id}"${busy ? " disabled" : ""}>${busy ? "Adding…" : "＋ Add"}</button>`}<button data-watchlist-add="${show.id}"${busy || (saved && inWatchlist(saved)) ? " disabled" : ""}>${saved && inWatchlist(saved) ? "✓ Watchlist" : "＋ Watchlist"}</button>${saved && !inLibrary(saved) ? `<button data-show="${show.id}">Details ↗</button>` : ""}</div></article>`;
      })
      .join("");
    $("#load-more").hidden = !state.page || state.page >= state.totalPages;
    $("#load-more").disabled = state.loading;
    $("#load-more").textContent = state.loading
      ? "Loading…"
      : state.error
        ? "Try loading more again"
        : "Load more shows";
  }

  // Fetch the next search page, deduplicate results, and ignore superseded responses.
  async function loadMore() {
    if (state.loading) return;
    const run = ++searchRun;
    const query = state.query;
    const page = state.page + 1;
    state.loading = true;
    state.error = "";
    render();
    try {
      const data = await api(
        `/api/search?q=${encodeURIComponent(query)}&page=${page}`,
      );
      if (run !== searchRun) return;
      // TMDB pages can overlap, so merge results by stable show ID.
      state.results = [
        ...new Map(
          [...state.results, ...data.results].map((show) => [show.id, show]),
        ).values(),
      ];
      state.page = page;
      state.totalPages = Math.min(data.total_pages || 1, 500);
      state.total = data.total_results ?? state.results.length;
    } catch (error) {
      if (run === searchRun) state.error = error.message;
    } finally {
      if (run === searchRun) {
        state.loading = false;
        render();
      }
    }
  }

  // A new query resets pagination before loading its first page.
  // Start a new submitted query by clearing previous results and pagination.
  function search(event) {
    event.preventDefault();
    const query = $("#tmdb-query").value.trim();
    if (!query) return;
    state = {
      query,
      page: 0,
      totalPages: 0,
      total: 0,
      results: [],
      loading: false,
      error: "",
    };
    loadMore();
  }

  // Save a search result to the requested collection while preventing duplicate additions.
  async function add(id, watchlistOnly) {
    if (addingShows.has(id)) return;
    addingShows.add(id);
    render();
    try {
      const show = await api(`/api/shows/${id}`, {
        method: "POST",
        body: { destination: watchlistOnly ? "watchlist" : "library" },
      });
      onShowAdded(show);
      // Library additions open details; Watchlist additions keep search context.
      if (!watchlistOnly) onOpenShow(show.id);
      toast(
        `${show.name} added to your ${watchlistOnly ? "watchlist" : "shows"}.`,
      );
    } catch (error) {
      report(error);
    } finally {
      addingShows.delete(id);
      render();
    }
  }

  // Open the search dialog with its retained results and focus the query field.
  function open() {
    render();
    $("#search-dialog").showModal();
    $("#tmdb-query").focus();
  }

  $("#search-form").addEventListener("submit", search);
  return { add, loadMore, open, render };
}
