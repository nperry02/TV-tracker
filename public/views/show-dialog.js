import {
  artworkPath,
  aired,
  episodeKey,
  episodeRewatches,
  completeRewatches,
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
  repeatIcon,
  ellipsisIcon,
  episodeThumbButtons,
} from "../ui.js";

// Render a read-only summary whose count excludes the original viewing.
function rewatchIndicator(count, kind) {
  return count ? `<span class="rewatch-summary" data-rewatch-summary="${kind}" title="Complete rewatches of currently aired episodes" aria-label="${kind}: ${count} complete ${count === 1 ? "rewatch" : "rewatches"}">${repeatIcon}<span>${count}</span></span>` : "";
}

// Render one shared episode repeat control and its correction menu.
function rewatchControl(show, episode, watched, mutationPending) {
  const number = episode.episode_number;
  const count = episodeRewatches(show, episodeKey(episode));
  const disabled = !watched || mutationPending;
  return `<div class="episode-rewatch"><button type="button" id="rewatch-${number}" class="rewatch-button" data-rewatch="${number}" aria-label="Record rewatch of ${esc(episode.name)}; ${count} recorded" title="${watched ? "Record rewatch" : "Mark watched before recording a rewatch"}"${disabled ? " disabled" : ""}>${repeatIcon}${count ? `<span>${count}</span>` : ""}</button><details class="rewatch-options"${disabled ? " inert" : ""}><summary id="rewatch-options-${number}" aria-label="Rewatch options for ${esc(episode.name)}" title="Rewatch options">${ellipsisIcon}</summary><div class="rewatch-menu"><button type="button" data-edit-rewatch="${number}"${disabled ? " disabled" : ""}>Edit rewatch count</button></div></details></div>`;
}

// Each visible star contains two native radio targets to preserve half-star ratings.
// Render accessible half-star radio controls, saved fills, and an optional clear action.
function ratingControl(id, value, label, mutationPending, compact = false) {
  const stars = Array.from({ length: 5 }, (_, index) => {
    const half = index + 0.5;
    const whole = index + 1;
    const fill = Math.max(0, Math.min(1, (value || 0) - index)) * 100;
    const fillClass = fill === 100 ? "full" : fill === 50 ? "half" : "unfilled";
    return `<span class="rating-star ${fillClass}"><span aria-hidden="true">★</span><input id="${id}-${String(half).replace(".", "-")}" type="radio" name="${id}-option" value="${half}" data-rating-kind="${id}" aria-label="${half} out of 5 stars"${value === half ? " checked" : ""}><input id="${id}-${whole}" type="radio" name="${id}-option" value="${whole}" data-rating-kind="${id}" aria-label="${whole} out of 5 stars"${value === whole ? " checked" : ""}></span>`;
  }).join("");
  const description = value == null ? "Not rated" : `${value} out of 5`;
  return `<fieldset class="rating-control${compact ? " compact" : ""}" id="${id}" data-value="${value ?? ""}"${mutationPending ? " disabled" : ""}><legend class="field-label">${label}</legend><div class="rating-entry"><div class="star-rating" title="${description}">${stars}</div><button type="button" class="rating-clear" id="clear-${id}" data-clear-rating="${id}" aria-label="Clear rating" title="Clear rating"${value == null ? " hidden" : ""}>×</button></div><output class="sr-only">${description}</output></fieldset>`;
}

// Choose the next episode's season, falling back to the first regular or available season.
export function initialShowSeason(show) {
  // Prefer the season containing the next episode, then the first regular season.
  return (
    progress(show).next?.season_number ??
    show.seasons.find((season) => season.number > 0)?.number ??
    show.seasons[0]?.number
  );
}

// Render saved show details, artwork controls, ratings, list membership, and season progress.
export function renderShowDialog(show, selectedSeason, mutationPending, lists = []) {
  // Rebuild the dialog from the latest saved show snapshot after each mutation.
  const showProgress = progress(show);
  // Show the marker only while saved artwork differs from the current TMDB default.
  const customArtwork = ["poster", "backdrop"].some((kind) =>
    show[`${kind}Override`] && show[`${kind}Override`] !== show[`${kind}_path`]);
  const episodes = show.episodes.filter(
    (episode) => episode.season_number === selectedSeason,
  );
  $("#show-content").innerHTML =
    `<div class="detail-hero">${image(artworkPath(show, "backdrop")) ? `<img class="detail-backdrop" src="${image(artworkPath(show, "backdrop"), "w1280")}" alt="">` : ""}<div class="detail-hero-actions"><button id="change-artwork"${customArtwork ? ' title="Custom artwork selected"' : ""}${mutationPending ? " disabled" : ""}>Change artwork${customArtwork ? ' <span class="custom-artwork-indicator" aria-hidden="true">*</span>' : ""}</button><button class="icon-button" data-close="show-dialog" aria-label="Close show">×</button></div><div class="detail-hero-content"><div class="detail-hero-main">${poster(show, "detail-poster")}<div class="detail-heading">${badge(watchStatus(show))}${rewatchIndicator(completeRewatches(show), "Show")}${inWatchlist(show) ? badge("Watchlist") : ""}<h2>${esc(show.name)}</h2><p>${year(show)} · ${esc(show.seriesStatus)} · ${show.seasons.filter((season) => season.number > 0).length} seasons<br>${show.genres.map((genre) => esc(genre.name)).join(" · ")}</p></div></div><p class="overview">${esc(show.overview || "No description available.")}</p></div></div><div class="detail-body"><div class="detail-controls">${ratingControl("show-rating", show.rating, "Your show rating", mutationPending)}<label class="status-control"><span class="field-label">Watch status</span><select id="show-status"><option value=""${!show.statusOverride ? " selected" : ""}>Automatic · ${watchStatus({ ...show, statusOverride: null })}</option>${statuses.map((status) => `<option${show.statusOverride === status ? " selected" : ""}>${status}</option>`).join("")}</select></label></div><div class="detail-progress"><div class="detail-progress-main"><div class="detail-progress-top"><strong>${showProgress.done ? `Last watched ${episodeCode(showProgress.last)}` : "Ready when you are"}</strong><span>${showProgress.done} of ${showProgress.total} aired episodes watched</span></div><progress class="progress-track" value="${showProgress.done}" max="${showProgress.total || 1}" aria-label="Show progress"></progress><p>${showProgress.next ? `Up next: ${episodeCode(showProgress.next)} · ${esc(showProgress.next.name)}` : showProgress.upcoming ? `Next episode: ${episodeCode(showProgress.upcoming)} · ${esc(showProgress.upcoming.air_date)}` : showProgress.done ? "You have watched every currently available episode." : "Choose an episode below to set your progress."}${show.statusOverride ? " Your status is set manually; choose Automatic to follow episode progress." : ""}</p></div></div><div class="season-header"><label><span class="sr-only">Season</span><select id="season-select">${show.seasons.map((season) => `<option value="${season.number}"${season.number === selectedSeason ? " selected" : ""}>${esc(season.name)}</option>`).join("")}</select></label>${rewatchIndicator(completeRewatches(show, selectedSeason), "Season")}<div class="season-actions">${ratingControl("season-rating", show.seasonRatings[selectedSeason], "Season rating", mutationPending, true)}<button id="mark-season">✓ Mark season watched</button><button id="clear-season">Clear season</button></div></div>${selectedSeason === 0 ? '<p class="muted">Specials are optional and do not affect show completion.</p>' : ""}<div class="episode-list">${
      episodes.length
        ? episodes
            .map((episode) => {
              const watched = show.watched.includes(episodeKey(episode));
              const available = aired(episode);
              // Future episodes remain visible but cannot be newly marked watched.
              return `<div class="episode ${watched ? "watched" : ""}"><input type="checkbox" data-episode="${episode.episode_number}" aria-label="Mark ${esc(episode.name)} watched"${watched ? " checked" : ""}${!available && !watched ? " disabled" : ""}><div class="episode-name"><div class="episode-title-line"><strong>${episode.episode_number}. ${esc(episode.name)}</strong>${episodeThumbButtons(show, episode, { disabled: !watched || mutationPending })}</div><small>${available ? episode.air_date : episode.air_date ? `Airs ${episode.air_date}` : "Air date to be announced"}</small></div>${rewatchControl(show, episode, watched, mutationPending)}${available ? `<button class="through" data-through="${episode.episode_number}">Watched through here</button>` : ""}</div>`;
            })
            .join("")
        : '<p class="muted">No episodes announced for this season yet.</p>'
    }</div><div class="detail-bottom"><div class="detail-refresh"><small>Show info refreshed ${new Date(show.refreshedAt).toLocaleDateString()}.</small><button id="refresh-show">↻ Refresh show info</button><small>to update the show's details and check for new episodes.</small></div><button class="text-button" id="remove-show">${inLibrary(show) ? "Remove from All Shows" : "Remove saved show"}</button></div></div>`;

  // Narrow layouts collapse season rating and progress actions into one menu.
  const seasonActions = $(".season-actions");
  const openSeasonOptions = matchMedia("(max-width: 800px)").matches ? "" : " open";
  seasonActions.insertAdjacentHTML(
    "beforebegin",
    `<details class="season-options"${openSeasonOptions}><summary>Season options</summary></details>`,
  );
  $(".season-options").append(seasonActions);

  // Contextual actions are inserted only when their underlying progress exists.
  if (showProgress.next) {
    $(".detail-progress").insertAdjacentHTML(
      "beforeend",
      `<button class="next-watched-detail" data-next="${show.id}">✓ Mark ${episodeCode(showProgress.next)} watched</button>`,
    );
  }
  $(".detail-controls").insertAdjacentHTML(
    "beforeend",
    `<button id="toggle-watchlist" aria-pressed="${inWatchlist(show)}" aria-label="${inWatchlist(show) ? "Remove from watchlist" : "Add to watchlist"}">${inWatchlist(show) ? "✓ Watchlist" : "＋ Watchlist"}</button><button id="manage-show-lists"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h.01" /><path d="M3 12h.01" /><path d="M3 19h.01" /><path d="M8 5h13" /><path d="M8 12h13" /><path d="M8 19h13" /></svg> Manage lists${lists.some((list) => list.entries.some((entry) => entry.showId === show.id)) ? ` (${lists.filter((list) => list.entries.some((entry) => entry.showId === show.id)).length})` : ""}</button>`,
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

  // Prevent overlapping writes while leaving the close control available.
  if (mutationPending)
    $("#show-content")
      .querySelectorAll("button:not([data-close]), input, select")
      .forEach((element) => {
        element.disabled = true;
      });
}
