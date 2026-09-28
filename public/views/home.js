import { inLibrary, matchesTab, progress, watchStatus } from "../model.js";
import { $, episodeCode, esc, image, poster } from "../ui.js";

export function renderHome(shows, mutationPending) {
  const tracked = shows.filter((show) => matchesTab(show, "All"));
  const watching = shows.filter((show) => matchesTab(show, "Watching")).length;
  const completed = shows.filter((show) => matchesTab(show, "Completed")).length;
  const rated = tracked.filter((show) => show.rating);
  $("#stats").innerHTML =
    `<div class="stat"><i aria-hidden="true">▶</i><strong>${tracked.length}</strong><span>Tracked shows</span></div><div class="stat"><i aria-hidden="true">◉</i><strong>${watching}</strong><span>Watching</span></div><div class="stat"><i aria-hidden="true">✓</i><strong>${completed}</strong><span>Completed</span></div><div class="stat"><i aria-hidden="true">★</i><strong>${rated.length ? (rated.reduce((sum, show) => sum + show.rating, 0) / rated.length).toFixed(1) : "—"}</strong><span>Average rating</span></div>`;

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
    .slice(0, 3);
  $("#continue-section").hidden = !continuing.length;
  $("#continue-list").innerHTML = continuing
    .map((show) => {
      const showProgress = progress(show);
      const next = showProgress.next;
      const backdrop = image(show.backdrop_path, "w780");
      return `<article class="continue-card"><button class="continue-open" data-show="${show.id}" aria-label="Open ${esc(show.name)}">${backdrop ? `<img class="continue-backdrop" src="${backdrop}" alt="" loading="lazy">` : poster(show, "continue-backdrop", "w342")}<span class="continue-copy"><strong>${esc(show.name)}</strong><small>${episodeCode(next)} · ${esc(next.name)}</small><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="${showProgress.done} of ${showProgress.total} aired episodes watched"></progress></span></button><button class="next-watched" data-next="${show.id}" aria-label="Mark ${esc(show.name)} ${episodeCode(next)} watched"${mutationPending ? " disabled" : ""}>✓<span>Watched</span></button></article>`;
    })
    .join("");
}
