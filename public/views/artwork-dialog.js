import { api } from "../api.js";
import { artworkOptions } from "../model.js";
import { $, esc, image } from "../ui.js";

const BATCH_SIZE = 24;

// Create the artwork picker with transient options and independent pending image choices.
export function createArtworkDialog({ onSaved }) {
  const dialog = $("#artwork-dialog");
  let show, kind = "poster", options, pending, visible, controller;
  let generation = 0, loading = false, saving = false, loadError = "";

  // Rendering replaces only choices; the static footer and dialog retain focus.
  // Render the active artwork tab, thumbnail batch, request status, and save controls.
  function render() {
    dialog.querySelectorAll("[data-artwork-tab]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.artworkTab === kind));
      button.disabled = saving;
    });
    const items = options?.[kind] || [];
    const chosen = pending[kind];
    const current = show[`${kind}Override`];
    const choices = items.slice(0, visible[kind]);
    // Keep an older saved choice selectable even if TMDB no longer lists it.
    if (current && !choices.some((item) => item.file_path === current))
      choices.unshift({ file_path: current, saved: true });
    // Render one accessible artwork choice with its thumbnail and available metadata.
    const tile = (path, label, value, item = {}) => {
      const src = image(path, kind === "poster" ? "w185" : "w300");
      return `<label class="artwork-choice"><input type="radio" name="artwork-choice" value="${esc(value || "")}" aria-label="${esc(label)}"${(chosen || "") === (value || "") ? " checked" : ""}${saving ? " disabled" : ""}><span class="artwork-thumbnail">${src ? `<img src="${src}" alt="" loading="lazy">` : ""}<span class="artwork-image-fallback"${src ? " hidden" : ""}>${src ? "Image unavailable" : "No image"}</span></span><strong>${esc(label)}</strong>${item.width && item.height ? `<small>${item.width} × ${item.height}${item.iso_639_1 ? ` · ${esc(item.iso_639_1)}` : " · No language"}</small>` : ""}</label>`;
    };
    $("#artwork-options").dataset.kind = kind;
    $("#artwork-options").innerHTML = tile(show[`${kind}_path`], "Use TMDB default", null) +
      choices.map((item, index) => tile(item.file_path,
        item.saved ? "Saved selection" : `${kind === "poster" ? "Poster" : "Backdrop"} ${index + 1}`,
        item.file_path, item)).join("");
    $("#artwork-status").innerHTML = loading ? "Loading artwork…" : loadError
      ? `${esc(loadError)} <button type="button" data-artwork-retry>Try again</button>`
      : items.length ? `${items.length} ${kind === "poster" ? "posters" : "backdrops"} available. Choose one or use the TMDB default.`
      : `No alternate ${kind === "poster" ? "posters" : "backdrops"} available.`;
    $("#artwork-more").hidden = loading || visible[kind] >= items.length;
    $("#artwork-more").disabled = saving;
    dialog.querySelectorAll("[data-close]").forEach((button) => { button.disabled = saving; });
    $("#artwork-save").disabled = saving || loading ||
      ["poster", "backdrop"].every((type) => pending[type] === (show[`${type}Override`] || null));
    $("#artwork-save").textContent = saving ? "Saving…" : "Save changes";
  }

  // One request supplies both tabs. Closing aborts it and invalidates late results.
  // Fetch both image collections once and discard results after the picker closes or reloads.
  async function load() {
    controller?.abort();
    controller = new AbortController();
    const request = ++generation;
    loading = true;
    loadError = "";
    render();
    try {
      const result = await api(`/api/shows/${show.id}/images`, { signal: controller.signal });
      if (request !== generation || !dialog.open) return;
      options = {
        poster: artworkOptions(result.posters, "poster"),
        backdrop: artworkOptions(result.backdrops, "backdrop"),
      };
    } catch (error) {
      if (request !== generation || !dialog.open) return;
      loadError = error.message || "Could not load artwork. Try again.";
    } finally {
      if (request === generation && dialog.open) {
        loading = false;
        render();
      }
    }
  }

  // Selection changes stay local until the form saves both independent choices.
  dialog.addEventListener("click", (event) => {
    if (saving) return;
    const tab = event.target.closest("[data-artwork-tab]");
    if (tab) {
      kind = tab.dataset.artworkTab;
      render();
      $(".artwork-body").scrollTop = 0;
    }
    if (event.target.closest("[data-artwork-retry]")) load();
    if (event.target.closest("#artwork-more")) {
      visible[kind] += BATCH_SIZE;
      render();
    }
  });
  // Keep the chosen image pending and enable saving only when a choice has changed.
  dialog.addEventListener("change", (event) => {
    if (saving || event.target.name !== "artwork-choice") return;
    pending[kind] = event.target.value || null;
    $("#artwork-save-error").hidden = true;
    $("#artwork-save").disabled = loading ||
      ["poster", "backdrop"].every((type) => pending[type] === (show[`${type}Override`] || null));
  });
  // Replace a failed image thumbnail with its unavailable-image fallback.
  dialog.addEventListener("error", (event) => {
    if (event.target.tagName !== "IMG") return;
    event.target.hidden = true;
    event.target.nextElementSibling.hidden = false;
  }, true);
  // Save both pending choices together and retain selections if the request fails.
  $("#artwork-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (saving || loading || $("#artwork-save").disabled) return;
    saving = true;
    dialog.dataset.saving = "true";
    $("#artwork-save-error").hidden = true;
    render();
    try {
      const updated = await api(`/api/shows/${show.id}`, {
        method: "PATCH",
        body: { posterOverride: pending.poster, backdropOverride: pending.backdrop },
      });
      onSaved(updated);
      dialog.close();
    } catch (error) {
      $("#artwork-save-error").textContent = error.message || "Could not save artwork. Try again.";
      $("#artwork-save-error").hidden = false;
    } finally {
      saving = false;
      delete dialog.dataset.saving;
      if (dialog.open) render();
    }
  });
  // Prevent Escape from dismissing the picker while a save is in flight.
  dialog.addEventListener("cancel", (event) => { if (saving) event.preventDefault(); });
  // Abort loading, discard transient options, and return focus to Change artwork.
  dialog.addEventListener("close", () => {
    ++generation;
    controller?.abort();
    options = null;
    show = null;
    $("#artwork-options").replaceChildren();
    $("#change-artwork")?.focus({ preventScroll: true });
  });

  return {
    // Initialize the picker from saved artwork choices and begin loading alternate images.
    open(currentShow) {
      show = currentShow;
      kind = "poster";
      options = null;
      pending = { poster: show.posterOverride || null, backdrop: show.backdropOverride || null };
      visible = { poster: BATCH_SIZE, backdrop: BATCH_SIZE };
      $("#artwork-show-name").textContent = show.name;
      $("#artwork-save-error").hidden = true;
      dialog.showModal();
      $(".artwork-body").scrollTop = 0;
      load();
    },
  };
}
