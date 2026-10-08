import {
  artworkPath,
  inLibrary,
  matchesTab,
  progress,
  upcomingEpisodes,
  watchStatus,
  latestUpdates,
} from "../model.js";
import { $, displayDate, episodeCode, esc, image, infoTooltip, poster, posterGalleryCard } from "../ui.js";

// Render one current update per show with separate source and read-state labels.
function renderUpdates(shows, mutationPending, { expanded = false, pendingReadId = null } = {}) {
  const entries = latestUpdates(shows);
  $("#updates-info").innerHTML = infoTooltip("updates-help", "About updates",
    "The latest news for each show, kept for 30 days. Show updates and your activity are included. New show news replaces older entries; your activity cannot replace unread show news.", "updates-info");
  const unread = entries.filter((show) => !show.latestUpdate.readAt).length;
  $("#updates-unread").textContent = unread ? `${unread} unread` : "";
  $("#updates-unread").hidden = !unread;
  $("#updates-unread").disabled = mutationPending || !unread;
  $("#updates-unread").setAttribute("aria-label", `${unread} unread updates. Mark all as read.`);
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
      <div class="update-copy">
        <button class="update-title" data-show="${show.id}">${esc(show.name)}</button>
        <p>${esc(entry.message)}</p>${transition ? `<small>${esc(transition)}</small>` : ""}
      </div>
      <div class="update-meta"><span class="update-source">${source}</span>
        <label class="update-read-control" title="${entry.readAt ? "Read" : "Mark as read"}"><input type="checkbox" aria-label="${entry.readAt ? `${esc(show.name)} update is read` : `Mark ${esc(show.name)} update as read`}"${entry.readAt || pendingReadId === show.id ? " checked" : ""}${entry.readAt ? " disabled" : ` data-read-update="${show.id}" data-update-id="${esc(entry.id)}"${mutationPending ? " disabled" : ""}`}><span class="${entry.readAt ? "update-read-label" : "update-unread-label"}">${entry.readAt ? "Read" : "Unread"}</span></label>
        <time datetime="${esc(entry.detectedAt)}">${esc(displayDate(entry.detectedAt, true))}</time>
      </div>
    </article>`;
  }).join("") : '<div class="updates-empty">No recent updates. Show news and status changes will appear here.</div>';
}

// Render upcoming releases from cached metadata without requesting additional refreshes.
function renderUpcoming(shows, days) {
  const entries = upcomingEpisodes(shows, days);
  $("#upcoming-window").value = String(days);
  $("#upcoming-list").innerHTML = entries.length ? entries.map(({ show, episode, daysUntil }) => {
    const relative = daysUntil === 1 ? "Tomorrow" : `In ${daysUntil} days`;
    // Three lines retain the release essentials; hover and accessible text keep full details.
    const premiere = episode.episode_number === 1;
    const episodeLabel = premiere ? `Season ${episode.season_number} premiere` : episodeCode(episode);
    const fullDetails = `${show.name} · ${episodeCode(episode)} · ${episode.name || "Episode title to be announced"} · ${displayDate(episode.air_date)}`;
    const details = `<div class="card-heading"><h3>${esc(show.name)}</h3></div><div class="upcoming-copy"><span${premiere ? ' class="upcoming-premiere"' : ""}>${episodeLabel}</span></div><div class="upcoming-date"><time datetime="${episode.air_date}">${esc(displayDate(episode.air_date, false, false))}</time><span aria-hidden="true"> · </span><strong>${relative}</strong></div>`;
    return posterGalleryCard(show, details, { className: "upcoming-entry", season: episode.season_number,
      label: `Open ${fullDetails}, ${relative}`, title: fullDetails });
  }).join("") : `<div class="upcoming-empty">No episodes announced for the next ${days} days.</div>`;
}

// Render library totals, eligible Continue Watching cards, upcoming releases, and updates.
export function renderHome(shows, mutationPending, updateOptions, days = 30) {
  renderUpdates(shows, mutationPending, updateOptions);
  renderUpcoming(shows, days);
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
}
