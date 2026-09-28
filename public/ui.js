export const $ = (selector) => document.querySelector(selector);

export const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character],
  );

export const image = (path, size = "w342") =>
  path && /^\/[\w.-]+$/.test(path)
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : "";

export const year = (show) => (show.first_air_date || "").slice(0, 4);
export const episodeCode = (episode) =>
  `S${episode.season_number} E${episode.episode_number}`;

export const badge = (status) =>
  `<span class="status-badge status-${status.toLowerCase().replaceAll(" ", "-")}">${status}</span>`;

export const stars = (rating) =>
  rating
    ? `<span class="stars" aria-label="${rating} out of 5 stars">${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""}</span>`
    : '<span class="unrated">Not rated</span>';

export const poster = (show, className = "", size) =>
  image(show.poster_path, size)
    ? `<img class="${className}" src="${image(show.poster_path, size)}" alt="" loading="lazy">`
    : `<span class="poster-placeholder ${className}">${esc(show.name)}</span>`;

export function displayDate(value, includeTime = false) {
  if (!value) return "Not recorded";
  const date = new Date(includeTime ? value : `${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}

let toastTimer;
export function toast(message) {
  clearTimeout(toastTimer);
  const element = $("#toast");
  element.textContent = message;
  element.hidden = false;
  element.showPopover();
  toastTimer = setTimeout(() => {
    element.hidePopover();
    element.hidden = true;
  }, 6000);
}

export function report(error) {
  toast(error.message);
}
