export const $ = (selector) => document.querySelector(selector);

// Accessible custom-select enhancement
let openSelect;
let selectId = 0;

function closeSelect(wrapper, restoreFocus = false) {
  if (!wrapper) return;
  const trigger = wrapper.querySelector(".custom-select-trigger");
  wrapper.querySelector(".custom-select-menu").hidden = true;
  trigger.setAttribute("aria-expanded", "false");
  wrapper.classList.remove("open");
  if (openSelect === wrapper) openSelect = null;
  if (restoreFocus) trigger.focus();
}

function syncSelect(wrapper) {
  const select = wrapper.querySelector("select");
  const trigger = wrapper.querySelector(".custom-select-trigger");
  const menu = wrapper.querySelector(".custom-select-menu");
  const selected = select.options[select.selectedIndex] || select.options[0];
  const selectedText = selected?.textContent || "Select";
  trigger.querySelector("span").textContent = selectedText;
  trigger.setAttribute("aria-label", `${trigger.dataset.label}: ${selectedText}`);
  trigger.disabled = select.disabled;
  // Rebuild from the native options so programmatic updates remain authoritative.
  menu.replaceChildren(
    ...Array.from(select.options, (option) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "custom-select-option";
      item.setAttribute("role", "option");
      item.setAttribute("aria-selected", String(option.selected));
      item.disabled = option.disabled;
      item.dataset.value = option.value;
      item.innerHTML = `<i aria-hidden="true">${option.selected ? "✓" : ""}</i><span></span>`;
      item.querySelector("span").textContent = option.textContent;
      item.addEventListener("click", () => {
        select.value = option.value;
        select.dispatchEvent(new Event("change", { bubbles: true }));
        closeSelect(wrapper, true);
      });
      return item;
    }),
  );
}

function openCustomSelect(wrapper) {
  if (openSelect && openSelect !== wrapper) closeSelect(openSelect);
  syncSelect(wrapper);
  const trigger = wrapper.querySelector(".custom-select-trigger");
  const menu = wrapper.querySelector(".custom-select-menu");
  menu.hidden = false;
  trigger.setAttribute("aria-expanded", "true");
  wrapper.classList.add("open");
  openSelect = wrapper;
  menu.querySelector('[aria-selected="true"]')?.focus();
}

export function enhanceSelects(root = document) {
  root.querySelectorAll("select").forEach((select) => {
    // Render cycles reuse existing wrappers and only resynchronize their contents.
    const existing = select.closest(".custom-select");
    if (existing) return syncSelect(existing);
    const wrapper = document.createElement("span");
    wrapper.className = "custom-select";
    select.before(wrapper);
    wrapper.append(select);
    select.classList.add("custom-select-native");
    select.tabIndex = -1;
    select.setAttribute("aria-hidden", "true");
    const menuId = `custom-select-${++selectId}`;
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.setAttribute("aria-controls", menuId);
    trigger.dataset.label =
      select.getAttribute("aria-label") ||
        select.closest("label")?.querySelector(".field-label, .sr-only")
          ?.textContent ||
      "Choose an option";
    trigger.innerHTML = '<span></span><i aria-hidden="true"></i>';
    const menu = document.createElement("span");
    menu.id = menuId;
    menu.className = "custom-select-menu";
    menu.setAttribute("role", "listbox");
    menu.hidden = true;
    wrapper.append(trigger, menu);
    syncSelect(wrapper);
    select.addEventListener("focus", () => trigger.focus());
    select.addEventListener("change", () => syncSelect(wrapper));
    trigger.addEventListener("click", () => {
      if (menu.hidden) openCustomSelect(wrapper);
      else closeSelect(wrapper);
    });
    wrapper.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        return closeSelect(wrapper, true);
      }
      if (menu.hidden && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        return openCustomSelect(wrapper);
      }
      if (!menu.hidden && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        // Keyboard movement wraps between enabled options like a native listbox.
        event.preventDefault();
        const items = [...menu.querySelectorAll(".custom-select-option:not(:disabled)")];
        const current = items.indexOf(document.activeElement);
        const next = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : event.key === "ArrowDown" ? (current + 1) % items.length : (current - 1 + items.length) % items.length;
        items[next]?.focus();
      }
    });
  });
}

document.addEventListener("click", (event) => {
  if (openSelect && !event.target.closest(".custom-select")) closeSelect(openSelect);
});

// Safe display and media formatting
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

// Dates without a time are interpreted locally to avoid timezone date shifts.
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

// Transient feedback
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
