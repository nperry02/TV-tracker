import { aired, episodeKey, progress, statuses, watchStatus } from "./model.js";

const $ = (selector) => document.querySelector(selector);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const image = (path, size = "w342") =>
  path && /^\/[\w.-]+$/.test(path)
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "";
const year = (show) => (show.first_air_date || "").slice(0, 4);
const code = (e) => `S${e.season_number} E${e.episode_number}`;
const badge = (status) =>
  `<span class="status-badge status-${status.toLowerCase().replaceAll(" ", "-")}">${status}</span>`;
const stars = (rating) =>
  rating
    ? `<span class="stars" aria-label="${rating} out of 5 stars">${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}</span>`
    : '<span class="unrated">Not rated</span>';
const poster = (s, cls = "", size) =>
  image(s.poster_path, size)
    ? `<img class="${cls}" src="${image(s.poster_path, size)}" alt="" loading="lazy">`
    : `<span class="poster-placeholder ${cls}">${esc(s.name)}</span>`;
let shows = [],
  activeTab = "All",
  selectedId = null,
  selectedSeason = null,
  mutationPending = false;
let searchRun = 0,
  toastTimer;
let searchState = {
  query: "",
  page: 0,
  totalPages: 0,
  total: 0,
  results: [],
  loading: false,
  error: "",
};
const addingShows = new Set();
async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function toast(message) {
  clearTimeout(toastTimer);
  $("#toast").textContent = message;
  $("#toast").hidden = false;
  $("#toast").showPopover();
  toastTimer = setTimeout(() => {
    $("#toast").hidePopover();
    $("#toast").hidden = true;
  }, 6000);
}
function report(error) {
  toast(error.message);
}
function ratingOptions(value, empty = "Not rated") {
  return (
    `<option value=""${value == null ? " selected" : ""}>${empty}</option>` +
    Array.from({ length: 10 }, (_, i) => (i + 1) / 2)
      .map(
        (n) =>
          `<option value="${n}"${n === value ? " selected" : ""}>${"★".repeat(Math.floor(n))}${n % 1 ? "½" : ""} · ${n}</option>`,
      )
      .join("")
  );
}
function render() {
  const counts = Object.fromEntries(
    statuses.map((status) => [
      status,
      shows.filter((s) => watchStatus(s) === status).length,
    ]),
  );
  const rated = shows.filter((s) => s.rating);
  $("#stats").innerHTML =
    `<div class="stat"><strong>${shows.length}</strong><span>In your library</span></div><div class="stat"><strong>${counts.Watching}</strong><span>Watching</span></div><div class="stat"><strong>${rated.length ? (rated.reduce((sum, s) => sum + s.rating, 0) / rated.length).toFixed(1) : "—"}<small class="stars"> ★</small></strong><span>Average rating</span></div>`;
  $("#tabs").innerHTML = ["All", ...statuses]
    .map(
      (status) =>
        `<button class="tab ${activeTab === status ? "active" : ""}" data-tab="${status}" aria-pressed="${activeTab === status}">${status === "All" ? "All shows" : status}<span class="count">${status === "All" ? shows.length : counts[status]}</span></button>`,
    )
    .join("");
  const genre = $("#genre").value;
  const genres = [
    ...new Map(
      shows.flatMap((s) => s.genres).map((g) => [String(g.id), g.name]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  $("#genre").innerHTML =
    '<option value="">All genres</option>' +
    genres
      .map(([id, name]) => `<option value="${id}">${esc(name)}</option>`)
      .join("");
  $("#genre").value = genres.some(([id]) => id === genre) ? genre : "";
  const query = $("#library-query").value.trim().toLowerCase();
  const rating = $("#rating-filter").value;
  const filtered = shows.filter(
    (s) =>
      (activeTab === "All" || watchStatus(s) === activeTab) &&
      s.name.toLowerCase().includes(query) &&
      (!$("#genre").value ||
        s.genres.some((g) => String(g.id) === $("#genre").value)) &&
      (!rating ||
        (rating === "unrated" ? !s.rating : s.rating >= Number(rating))),
  );
  filtered.sort((a, b) =>
    $("#sort").value === "title"
      ? a.name.localeCompare(b.name)
      : $("#sort").value === "rating"
        ? (b.rating || 0) - (a.rating || 0) || a.name.localeCompare(b.name)
        : b.addedAt.localeCompare(a.addedAt),
  );
  $("#result-count").textContent =
    `${filtered.length} ${filtered.length === 1 ? "show" : "shows"}${activeTab === "All" ? " in your collection" : ` · ${activeTab.toLowerCase()}`}`;
  $("#library-grid").innerHTML = filtered
    .map((s) => {
      const p = progress(s);
      return `<button class="show-card" data-show="${s.id}" aria-label="Open ${esc(s.name)}"><div class="poster-wrap">${poster(s)}${badge(watchStatus(s))}</div><div class="card-heading"><h3>${esc(s.name)}</h3><small>${year(s)}</small></div><div class="card-meta">${stars(s.rating)}<span>${p.done ? `${p.done} / ${p.total} eps` : "Not started"}</span></div><progress class="progress-track" value="${p.done}" max="${p.total || 1}" aria-label="${p.done} of ${p.total} aired episodes watched"></progress></button>`;
    })
    .join("");
  $("#empty").hidden = filtered.length > 0;
  $("#empty").innerHTML = shows.length
    ? '<span class="empty-icon">⌕</span><h2>No shows here just yet.</h2><p>Try another status or adjust your filters to find your shows.</p><button id="reset-filters">Clear filters</button>'
    : '<span class="empty-icon">▰</span><h2>A new season starts here.</h2><p>Build a home for the shows you love. Find your first show, give it a rating, and pick up right where you left off.</p><button class="primary" id="first-show">Find your first show <span aria-hidden="true">↗</span></button>';
  const continuing = shows
    .filter(
      (s) =>
        watchStatus(s) === "Watching" && s.watched.length && progress(s).next,
    )
    .slice(0, 3);
  $("#continue-section").hidden = !continuing.length;
  $("#continue-list").innerHTML = continuing
    .map((s) => {
      const next = progress(s).next;
      return `<article class="continue-card"><button class="continue-open" data-show="${s.id}" aria-label="Open ${esc(s.name)}">${poster(s, "mini-poster", "w92")}<span><strong>${esc(s.name)}</strong><small>Up next · ${code(next)}</small><small>${esc(next.name)}</small></span></button><button class="next-watched" data-next="${s.id}" aria-label="Mark ${esc(s.name)} ${code(next)} watched"${mutationPending ? " disabled" : ""}>✓<span>Watched</span></button></article>`;
    })
    .join("");
}
function openSearch() {
  renderSearch();
  $("#search-dialog").showModal();
  $("#tmdb-query").focus();
}
function search(event) {
  event.preventDefault();
  const query = $("#tmdb-query").value.trim();
  if (!query) return;
  searchState = {
    query,
    page: 0,
    totalPages: 0,
    total: 0,
    results: [],
    loading: false,
    error: "",
  };
  loadSearchPage();
}
function renderSearch() {
  const s = searchState;
  $("#search-message").textContent =
    s.error ||
    (s.loading
      ? s.page
        ? "Loading more shows…"
        : "Searching TV shows…"
      : !s.query
        ? "Search for a show to start your collection."
        : s.results.length
          ? `Showing ${s.results.length} of ${s.total} results for “${s.query}”`
          : `No shows found for “${s.query}”. Try a different title.`);
  $("#search-results").setAttribute("aria-busy", String(s.loading));
  $("#search-results").innerHTML = s.results
    .map(
      (show) =>
        `<article class="search-result">${poster(show, "mini-poster", "w92")}<div class="result-info"><h3>${esc(show.name)} <span class="year">${year(show)}</span></h3><p>${esc(show.overview || "No description available.")}</p></div>${shows.some((x) => x.id === show.id) ? `<button data-show="${show.id}">Open ↗</button>` : `<button data-add="${show.id}"${addingShows.has(show.id) ? " disabled" : ""}>${addingShows.has(show.id) ? "Adding…" : "＋ Add"}</button>`}</article>`,
    )
    .join("");
  $("#load-more").hidden = !s.page || s.page >= s.totalPages;
  $("#load-more").disabled = s.loading;
  $("#load-more").textContent = s.loading
    ? "Loading…"
    : s.error
      ? "Try loading more again"
      : "Load more shows";
}
async function loadSearchPage() {
  if (searchState.loading) return;
  const run = ++searchRun;
  const query = searchState.query;
  const page = searchState.page + 1;
  searchState.loading = true;
  searchState.error = "";
  renderSearch();
  try {
    const data = await api(
      `/api/search?q=${encodeURIComponent(query)}&page=${page}`,
    );
    if (run !== searchRun) return;
    searchState.results = [
      ...new Map(
        [...searchState.results, ...data.results].map((show) => [
          show.id,
          show,
        ]),
      ).values(),
    ];
    searchState.page = page;
    searchState.totalPages = Math.min(data.total_pages || 1, 500);
    searchState.total = data.total_results ?? searchState.results.length;
  } catch (error) {
    if (run === searchRun) searchState.error = error.message;
  } finally {
    if (run === searchRun) {
      searchState.loading = false;
      renderSearch();
    }
  }
}
function openShow(id) {
  selectedId = Number(id);
  const show = shows.find((s) => s.id === selectedId);
  if (!show) return;
  selectedSeason =
    progress(show).next?.season_number ??
    show.seasons.find((s) => s.number > 0)?.number ??
    show.seasons[0]?.number;
  renderShow();
  if ($("#search-dialog").open) $("#search-dialog").close();
  if (!$("#show-dialog").open) $("#show-dialog").showModal();
}
function renderShow() {
  const s = shows.find((x) => x.id === selectedId);
  if (!s) return;
  const p = progress(s);
  const episodes = s.episodes.filter((e) => e.season_number === selectedSeason);
  $("#show-content").innerHTML =
    `<div class="detail-hero">${image(s.backdrop_path) ? `<img class="detail-backdrop" src="${image(s.backdrop_path, "w1280")}" alt="">` : ""}${poster(s, "detail-poster")}<div class="detail-heading">${badge(watchStatus(s))}<h2>${esc(s.name)}</h2><p>${year(s)} · ${esc(s.seriesStatus)} · ${s.seasons.filter((x) => x.number > 0).length} seasons<br>${s.genres.map((g) => esc(g.name)).join(" · ")}</p></div><button class="icon-button" data-close="show-dialog" aria-label="Close show">×</button></div><div class="detail-body"><p class="overview">${esc(s.overview || "No description available.")}</p><div class="detail-controls"><label class="rating-control"><span class="field-label">Your show rating</span><select id="show-rating">${ratingOptions(s.rating)}</select></label><label class="status-control"><span class="field-label">Watch status</span><select id="show-status"><option value=""${!s.statusOverride ? " selected" : ""}>Automatic · ${watchStatus({ ...s, statusOverride: null })}</option>${statuses.map((status) => `<option${s.statusOverride === status ? " selected" : ""}>${status}</option>`).join("")}</select></label><div class="refresh-control"><button id="refresh-show">↻ Refresh show info</button></div></div><div class="detail-progress"><div class="detail-progress-top"><strong>${p.done ? `Last watched ${code(p.last)}` : "Ready when you are"}</strong><span>${p.done} of ${p.total} aired episodes watched</span></div><progress class="progress-track" value="${p.done}" max="${p.total || 1}" aria-label="Show progress"></progress><p>${p.next ? `Up next: ${code(p.next)} · ${esc(p.next.name)}` : p.upcoming ? `Next episode: ${code(p.upcoming)} · ${esc(p.upcoming.air_date)}` : p.done ? "You have watched every currently available episode." : "Choose an episode below to set your progress."}${s.statusOverride ? " Your status is set manually; choose Automatic to follow episode progress." : ""}</p></div><div class="season-header"><label><span class="sr-only">Season</span><select id="season-select">${s.seasons.map((season) => `<option value="${season.number}"${season.number === selectedSeason ? " selected" : ""}>${esc(season.name)}</option>`).join("")}</select></label><div class="season-actions"><label><span class="sr-only">Season rating</span><select id="season-rating">${ratingOptions(s.seasonRatings[selectedSeason], "Rate season")}</select></label><button id="mark-season">✓ Mark season watched</button><button id="clear-season">Clear season</button></div></div>${selectedSeason === 0 ? '<p class="muted">Specials are optional and do not affect show completion.</p>' : ""}<div class="episode-list">${
      episodes.length
        ? episodes
            .map((e) => {
              const watched = s.watched.includes(episodeKey(e));
              const available = aired(e);
              return `<div class="episode ${watched ? "watched" : ""}"><input type="checkbox" data-episode="${e.episode_number}" aria-label="Mark ${esc(e.name)} watched"${watched ? " checked" : ""}${!available && !watched ? " disabled" : ""}><div class="episode-name"><strong>${e.episode_number}. ${esc(e.name)}</strong><small>${available ? e.air_date : e.air_date ? `Airs ${e.air_date}` : "Air date to be announced"}</small></div>${available ? `<button class="through" data-through="${e.episode_number}">Watched through here</button>` : ""}</div>`;
            })
            .join("")
        : '<p class="muted">No episodes announced for this season yet.</p>'
    }</div><div class="detail-bottom"><small>Show info refreshed ${new Date(s.refreshedAt).toLocaleDateString()}. Refresh to check for new episodes.</small><button class="text-button" id="remove-show">Remove from library</button></div></div>`;
  if (p.next) {
    $(".detail-progress").insertAdjacentHTML(
      "beforeend",
      `<button class="next-watched-detail" data-next="${s.id}">✓ Mark ${code(p.next)} watched</button>`,
    );
  }
  const lastAired = episodes
    .filter((e) => aired(e))
    .sort((a, b) => a.episode_number - b.episode_number)
    .at(-1);
  if (selectedSeason > 0 && lastAired) {
    $("#mark-season").insertAdjacentHTML(
      "afterend",
      `<button data-through="${lastAired.episode_number}">Watched through this season</button>`,
    );
  }
  if (mutationPending)
    $("#show-content")
      .querySelectorAll("button:not([data-close]), input, select")
      .forEach((el) => {
        el.disabled = true;
      });
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
document.addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.close) return $(`#${button.dataset.close}`).close();
  if (button.dataset.tab) {
    activeTab = button.dataset.tab;
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
      `${show.name} · ${code(next)} marked watched.`,
      id,
    );
  }
  if (["add-show", "first-show"].includes(button.id)) return openSearch();
  if (button.id === "credits") return $("#credits-dialog").showModal();
  if (button.id === "load-more") return loadSearchPage();
  if (button.id === "reset-filters") {
    activeTab = "All";
    $("#library-query").value = "";
    $("#genre").value = "";
    $("#rating-filter").value = "";
    render();
    return;
  }
  if (button.dataset.add) {
    const id = Number(button.dataset.add);
    if (addingShows.has(id)) return;
    addingShows.add(id);
    button.disabled = true;
    button.textContent = "Adding…";
    try {
      const show = await api(`/api/shows/${button.dataset.add}`, {
        method: "POST",
      });
      if (!shows.some((s) => s.id === show.id)) shows.push(show);
      render();
      openShow(show.id);
      toast(`${show.name} added to your shows.`);
    } catch (error) {
      report(error);
    } finally {
      addingShows.delete(id);
      renderSearch();
    }
    return;
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
    if (
      !confirm(
        `Remove ${show.name} and its ratings and progress from your library?`,
      )
    )
      return;
    button.disabled = true;
    try {
      await api(`/api/shows/${id}`, { method: "DELETE" });
      shows = shows.filter((s) => s.id !== id);
      $("#show-dialog").close();
      render();
      toast("Show removed from your library.");
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
$("#search-form").addEventListener("submit", search);
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
    // Refresh stale metadata without blocking access to saved progress and ratings.
    for (const show of [...shows]) {
      if (
        Date.now() - new Date(show.refreshedAt).getTime() >
        6 * 60 * 60 * 1000
      ) {
        try {
          await refreshShow(show.id, false);
        } catch (error) {
          toast(
            "Your saved library is ready. Show information could not refresh; try again when online.",
          );
          break;
        }
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
