import {
  aired,
  episodeKey,
  inLibrary,
  inWatchlist,
  progress,
  statuses,
  watchStatus,
} from "../model.js";
import {
  $,
  badge,
  episodeCode,
  esc,
  image,
  poster,
  year,
} from "../ui.js";

function ratingOptions(value, empty = "Not rated") {
  return (
    `<option value=""${value == null ? " selected" : ""}>${empty}</option>` +
    Array.from({ length: 10 }, (_, index) => (index + 1) / 2)
      .map(
        (rating) =>
          `<option value="${rating}"${rating === value ? " selected" : ""}>${"★".repeat(Math.floor(rating))}${rating % 1 ? "½" : ""} · ${rating}</option>`,
      )
      .join("")
  );
}

export function initialShowSeason(show) {
  return (
    progress(show).next?.season_number ??
    show.seasons.find((season) => season.number > 0)?.number ??
    show.seasons[0]?.number
  );
}

export function renderShowDialog(show, selectedSeason, mutationPending) {
  const showProgress = progress(show);
  const episodes = show.episodes.filter(
    (episode) => episode.season_number === selectedSeason,
  );
  $("#show-content").innerHTML =
    `<div class="detail-hero">${image(show.backdrop_path) ? `<img class="detail-backdrop" src="${image(show.backdrop_path, "w1280")}" alt="">` : ""}<div class="detail-hero-content"><div class="detail-hero-main">${poster(show, "detail-poster")}<div class="detail-heading">${badge(watchStatus(show))}${inWatchlist(show) ? badge("Watchlist") : ""}<h2>${esc(show.name)}</h2><p>${year(show)} · ${esc(show.seriesStatus)} · ${show.seasons.filter((season) => season.number > 0).length} seasons<br>${show.genres.map((genre) => esc(genre.name)).join(" · ")}</p></div></div><p class="overview">${esc(show.overview || "No description available.")}</p></div><button class="icon-button" data-close="show-dialog" aria-label="Close show">×</button></div><div class="detail-body"><div class="detail-controls"><label class="rating-control"><span class="field-label">Your show rating</span><select id="show-rating">${ratingOptions(show.rating)}</select></label><label class="status-control"><span class="field-label">Watch status</span><select id="show-status"><option value=""${!show.statusOverride ? " selected" : ""}>Automatic · ${watchStatus({ ...show, statusOverride: null })}</option>${statuses.map((status) => `<option${show.statusOverride === status ? " selected" : ""}>${status}</option>`).join("")}</select></label><div class="refresh-control"><button id="refresh-show">↻ Refresh show info</button></div></div><div class="detail-progress"><div class="detail-progress-top"><strong>${showProgress.done ? `Last watched ${episodeCode(showProgress.last)}` : "Ready when you are"}</strong><span>${showProgress.done} of ${showProgress.total} aired episodes watched</span></div><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="Show progress"></progress><p>${showProgress.next ? `Up next: ${episodeCode(showProgress.next)} · ${esc(showProgress.next.name)}` : showProgress.upcoming ? `Next episode: ${episodeCode(showProgress.upcoming)} · ${esc(showProgress.upcoming.air_date)}` : showProgress.done ? "You have watched every currently available episode." : "Choose an episode below to set your progress."}${show.statusOverride ? " Your status is set manually; choose Automatic to follow episode progress." : ""}</p></div><div class="season-header"><label><span class="sr-only">Season</span><select id="season-select">${show.seasons.map((season) => `<option value="${season.number}"${season.number === selectedSeason ? " selected" : ""}>${esc(season.name)}</option>`).join("")}</select></label><div class="season-actions"><label><span class="sr-only">Season rating</span><select id="season-rating">${ratingOptions(show.seasonRatings[selectedSeason], "Rate season")}</select></label><button id="mark-season">✓ Mark season watched</button><button id="clear-season">Clear season</button></div></div>${selectedSeason === 0 ? '<p class="muted">Specials are optional and do not affect show completion.</p>' : ""}<div class="episode-list">${
      episodes.length
        ? episodes
            .map((episode) => {
              const watched = show.watched.includes(episodeKey(episode));
              const available = aired(episode);
              return `<div class="episode ${watched ? "watched" : ""}"><input type="checkbox" data-episode="${episode.episode_number}" aria-label="Mark ${esc(episode.name)} watched"${watched ? " checked" : ""}${!available && !watched ? " disabled" : ""}><div class="episode-name"><strong>${episode.episode_number}. ${esc(episode.name)}</strong><small>${available ? episode.air_date : episode.air_date ? `Airs ${episode.air_date}` : "Air date to be announced"}</small></div>${available ? `<button class="through" data-through="${episode.episode_number}">Watched through here</button>` : ""}</div>`;
            })
            .join("")
        : '<p class="muted">No episodes announced for this season yet.</p>'
    }</div><div class="detail-bottom"><small>Show info refreshed ${new Date(show.refreshedAt).toLocaleDateString()}. Refresh to check for new episodes.</small><button class="text-button" id="remove-show">${inLibrary(show) ? "Remove from All Shows" : "Remove saved show"}</button></div></div>`;
  if (showProgress.next) {
    $(".detail-progress").insertAdjacentHTML(
      "beforeend",
      `<button class="next-watched-detail" data-next="${show.id}">✓ Mark ${episodeCode(showProgress.next)} watched</button>`,
    );
  }
  $(".detail-controls").insertAdjacentHTML(
    "beforeend",
    `<button id="toggle-watchlist" aria-pressed="${inWatchlist(show)}" aria-label="${inWatchlist(show) ? "Remove from watchlist" : "Add to watchlist"}">${inWatchlist(show) ? "✓ Watchlist" : "＋ Watchlist"}</button>`,
  );
  const lastAired = episodes
    .filter((episode) => aired(episode))
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
      .forEach((element) => {
        element.disabled = true;
      });
}
