import {
  artworkPath,
  inLibrary,
  matchesTab,
  progress,
  topRatedShows,
  watchStatus,
  latestUpdates,
} from "../model.js";
import { $, displayDate, episodeCode, esc, image, poster, stars } from "../ui.js";

// Render one current update per show with separate source and read-state labels.
function renderUpdates(shows, mutationPending, { includeActivity = true, expanded = false, pendingActivity = null } = {}) {
  const entries = latestUpdates(shows, includeActivity);
  const unread = entries.filter((show) => !show.latestUpdate.readAt).length;
  $("#updates-unread").textContent = unread ? `${unread} unread` : "";
  // Keep the selected value visible while saving; feed filtering changes only on success.
  $("#include-activity").checked = pendingActivity ?? includeActivity;
  $("#include-activity").disabled = mutationPending;
  $("#updates-more").hidden = entries.length <= 10;
  $("#updates-more").textContent = expanded ? "Show less" : "Show more";
  $("#updates-more").setAttribute("aria-expanded", String(expanded));
  $("#updates-list").innerHTML = entries.length ? entries.slice(0, expanded ? entries.length : 10).map((show) => {
    const entry = show.latestUpdate;
    const prominent = entry.source === "external" && watchStatus(show) !== "Dropped";
    const source = entry.source === "external" ? "Show update" : "Your activity";
    const transition = entry.type !== "status" && entry.before !== entry.after ? `${entry.before} → ${entry.after}` : "";
    return `<article class="update-entry${prominent ? " update-external" : ""}${entry.readAt ? " update-read" : ""}">
      <button class="update-show" data-show="${show.id}" aria-label="Open ${esc(show.name)}">${poster(show, "update-poster", "w92")}</button>
      <div class="update-copy"><div class="update-meta"><span class="update-source">${source}</span><time datetime="${esc(entry.detectedAt)}">${esc(displayDate(entry.detectedAt, true))}</time>${entry.readAt ? '<span class="update-read-label">Read</span>' : '<span class="update-unread-label">Unread</span>'}</div>
        <button class="update-title" data-show="${show.id}">${esc(show.name)}</button>
        <p>${esc(entry.message)}</p>${transition ? `<small>${esc(transition)}</small>` : ""}
      </div>
      ${entry.readAt ? "" : `<button class="update-mark-read" data-read-update="${show.id}" data-update-id="${esc(entry.id)}" aria-label="Mark ${esc(show.name)} update as read"${mutationPending ? " disabled" : ""}>Mark as read</button>`}
    </article>`;
  }).join("") : '<div class="updates-empty">No recent updates. Show news and status changes will appear here.</div>';
}

// Render library totals, eligible Continue Watching cards, and top-rated favorites.
export function renderHome(shows, mutationPending, updateOptions) {
  renderUpdates(shows, mutationPending, updateOptions);
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
