import {
  artworkPath,
  inLibrary,
  matchesTab,
  progress,
  topRatedShows,
  watchStatus,
} from "../model.js";
import { $, episodeCode, esc, image, poster, stars } from "../ui.js";

// Render library totals, eligible Continue Watching cards, and top-rated favorites.
export function renderHome(shows, mutationPending) {
  // Overview cards summarize tracked membership rather than Watchlist overlap.
  const tracked = shows.filter((show) => matchesTab(show, "All"));
  const watching = shows.filter((show) => matchesTab(show, "Watching")).length;
  const completed = shows.filter((show) => matchesTab(show, "Completed")).length;
  const rated = tracked.filter((show) => show.rating);
  $("#stats").innerHTML =
    `<div class="stat"><i aria-hidden="true">▶</i><strong>${tracked.length}</strong><span>Tracked shows</span></div><div class="stat"><i aria-hidden="true">◉</i><strong>${watching}</strong><span>Watching</span></div><div class="stat"><i aria-hidden="true">✓</i><strong>${completed}</strong><span>Completed</span></div><div class="stat"><i aria-hidden="true">★</i><strong>${rated.length ? (rated.reduce((sum, show) => sum + show.rating, 0) / rated.length).toFixed(1) : "—"}</strong><span>Average rating</span></div>`;

  // Continue Watching favors recent progress, then recently added shows.
  const continuing = shows
    .filter(
      (show) =>
        inLibrary(show) &&
        watchStatus(show) === "Watching" &&
        progress(show).next,
    )
    .sort(
      (a, b) =>
        (b.lastWatchedAt || "").localeCompare(a.lastWatchedAt || "") ||
        (b.addedAt || "").localeCompare(a.addedAt || "") ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 4);

  // Each card resolves its next aired episode and current completion ratio.
  $("#continue-section").hidden = !continuing.length;
  $("#continue-list").innerHTML = continuing
    .map((show) => {
      const showProgress = progress(show);
      const next = showProgress.next;
      const backdrop = image(artworkPath(show, "backdrop"), "w780");
      return `<article class="continue-card"><button class="continue-open" data-show="${show.id}" aria-label="Open ${esc(show.name)}">${backdrop ? `<img class="continue-backdrop" src="${backdrop}" alt="" loading="lazy">` : poster(show, "continue-backdrop", "w342")}<span class="continue-copy"><strong>${esc(show.name)}</strong><small>${episodeCode(next)} · ${esc(next.name)}</small><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="${showProgress.done} of ${showProgress.total} aired episodes watched"></progress></span></button><button class="next-watched" data-next="${show.id}" aria-label="Mark ${esc(show.name)} ${episodeCode(next)} watched"${mutationPending ? " disabled" : ""}>✓<span>Watched</span></button></article>`;
    })
    .join("");

  // Favorites stay visible on Home even when no shows currently need attention.
  const topRated = topRatedShows(shows);
  $("#home-top-rated-grid").innerHTML = topRated.length
    ? topRated
        .map(
          (show) =>
            `<button class="stats-show" data-show="${show.id}" aria-label="Open ${esc(show.name)}, rated ${show.rating} out of 5">${poster(show, "", "w342")}<span><strong>${esc(show.name)}</strong>${stars(show.rating)}</span></button>`,
        )
        .join("")
    : '<div class="stats-empty stats-empty-wide"><strong>No rated shows yet.</strong><span>Rate a show and your favorites will appear here.</span></div>';
}
