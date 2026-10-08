import { metadataRefreshOverview, inLibrary, watchStatus } from "../model.js";
import { $, esc, displayDate } from "../ui.js";

// Describe whole elapsed days while keeping today's successful checks easy to recognize.
function elapsedLabel(days) {
  return days === 0 ? "Less than a day ago" : `${days} ${days === 1 ? "day" : "days"} ago`;
}

// Describe eligibility without promising when a startup batch will reach this show.
function eligibilityLabel(timing) {
  if (timing.refreshedAt === null) return "Due now";
  if (timing.overdueDays > 0)
    return `Overdue by ${timing.overdueDays} ${timing.overdueDays === 1 ? "day" : "days"}`;
  if (timing.dueDays === 0) return "Due today";
  return `Due in ${timing.dueDays} ${timing.dueDays === 1 ? "day" : "days"}`;
}

// Render all saved shows independently of collection filters, preserving active-row focus.
export function renderShowInfoDialog(shows, { pendingIds, disabled, order }, now = new Date()) {
  const dialog = $("#show-info-dialog");
  const list = $("#show-info-list");
  const scroll = list.scrollTop;
  const focusedId = dialog.contains(document.activeElement) ? document.activeElement.id : null;
  const rows = metadataRefreshOverview(shows, now);
  const overdue = rows.filter(({ timing }) => timing.overdue).length;
  $("#show-info-count").textContent = `${shows.length} saved ${shows.length === 1 ? "show" : "shows"} · ${overdue} overdue`;
  // A request pins the existing order; successful checks reorder only after it finishes.
  if (order) {
    const positions = new Map(order.map((id, index) => [id, index]));
    rows.sort((a, b) => (positions.get(a.show.id) ?? Infinity) - (positions.get(b.show.id) ?? Infinity));
  }
  const query = $("#show-info-query").value.trim().toLocaleLowerCase();
  const visible = rows.filter(({ show }) => show.name.toLocaleLowerCase().includes(query));
  list.innerHTML = visible.map(({ show, timing }) => {
    const pending = pendingIds.has(show.id);
    const status = inLibrary(show) ? watchStatus(show) : "Watchlist";
    const checked = timing.refreshedAt === null ? "Never checked" :
      `<time datetime="${esc(show.refreshedAt)}">${esc(displayDate(show.refreshedAt, true))}</time> · ${elapsedLabel(timing.elapsedDays)}`;
    return `<article class="show-info-row" data-info-show="${show.id}"${pending ? ' aria-busy="true"' : ""}>
      <div class="show-info-name"><strong>${esc(show.name)}</strong><span class="muted">${esc(status)}</span></div>
      <div class="show-info-timing"><small>Last checked: ${checked}</small><small class="${timing.overdue ? "show-info-overdue" : "muted"}">${eligibilityLabel(timing)}</small></div>
      <button type="button" id="show-info-refresh-${show.id}" data-info-refresh="${show.id}" aria-label="Refresh show info for ${esc(show.name)}" aria-disabled="${disabled}" title="Refresh show info">${pending ? "Refreshing…" : "Refresh"}</button>
    </article>`;
  }).join("") || `<p class="muted show-info-empty">${shows.length ? "No shows match your search." : "No saved shows yet."}</p>`;
  // Aria-disabled keeps the refresh button focusable while the controller blocks requests.
  if (focusedId) document.getElementById(focusedId)?.focus({ preventScroll: true });
  list.scrollTop = scroll;
}
