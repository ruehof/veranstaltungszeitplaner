// card.js – Aufbau einer Terminkarte (Trello-artig) als DOM-Element

import { formatRange } from "./util.js";
import { icons } from "./icons.js";
import { getPxPerMinute } from "./grid.js";

/**
 * Kartenelement erzeugen und absolut positionieren.
 * @param {object} card  Card-Datensatz gemäß SPEC.md
 * @param {object} opts  { schedule, readOnly, onToggleCollapse(card), onMenu(card, anchor), onMaximize(card) }
 */
export function createCardElement(card, opts) {
  const { schedule, readOnly } = opts;
  const pxPerMin = getPxPerMinute();
  const startHour = schedule.settings.startHour;

  const el = document.createElement("article");
  el.className = "card";
  el.dataset.cardId = card.id;
  if (card.collapsed) el.classList.add("collapsed");
  if (card.muted) el.classList.add("muted");
  el.style.top = (card.startMinutes - startHour * 60) * pxPerMin + "px";
  el.style.height = card.durationMinutes * pxPerMin + "px";
  if (card.bgColor) el.style.background = card.bgColor;
  if (card.textColor) {
    el.style.color = card.textColor;
    el.classList.add("custom-text"); // Titel/Zeit/Beschreibung/Icons erben die Farbe (CSS)
  }

  // Farbige Kopfleiste
  const colorBar = document.createElement("div");
  colorBar.className = "card-colorbar";
  if (card.color) colorBar.style.background = card.color;
  el.append(colorBar);

  // Kopfzeile: Titel + Zeit links, Buttons rechts
  const top = document.createElement("div");
  top.className = "card-top";

  const titles = document.createElement("div");
  titles.className = "card-titles";

  const titleRow = document.createElement("div");
  titleRow.className = "card-title-row";
  const title = document.createElement("h3");
  title.className = "card-title";
  title.textContent = card.title;
  titleRow.append(title);
  if (card.muted) {
    const muteIcon = document.createElement("span");
    muteIcon.className = "card-mute-icon";
    muteIcon.title = "Stummgeschaltet";
    muteIcon.innerHTML = icons.mute;
    titleRow.append(muteIcon);
  }
  titles.append(titleRow);

  const time = document.createElement("span");
  time.className = "card-time";
  time.textContent = formatRange(card.startMinutes, card.durationMinutes);
  titles.append(time);
  top.append(titles);

  const actions = document.createElement("div");
  actions.className = "card-actions";

  // Chevron: Bild + Beschreibung ein-/ausklappen
  const collapseBtn = document.createElement("button");
  collapseBtn.type = "button";
  collapseBtn.className = "icon-btn card-collapse-btn";
  collapseBtn.title = card.collapsed ? "Ausklappen" : "Einklappen";
  collapseBtn.setAttribute("aria-expanded", String(!card.collapsed));
  collapseBtn.innerHTML = icons.chevronDown;
  collapseBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    opts.onToggleCollapse(card);
  });
  actions.append(collapseBtn);

  // Maximieren: Vollansicht öffnen (v. a. für kurze Termine, bei denen auf der
  // Karte selbst kaum Platz für Bild/Beschreibung ist). In beiden Modi verfügbar.
  const maximizeBtn = document.createElement("button");
  maximizeBtn.type = "button";
  maximizeBtn.className = "icon-btn card-maximize-btn";
  maximizeBtn.title = "Vollansicht öffnen";
  maximizeBtn.innerHTML = icons.maximize;
  maximizeBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    opts.onMaximize(card);
  });
  actions.append(maximizeBtn);

  // Dreipunkt-Menü (nur im Bearbeitungsmodus)
  if (!readOnly) {
    const menuBtn = document.createElement("button");
    menuBtn.type = "button";
    menuBtn.className = "icon-btn card-menu-btn";
    menuBtn.title = "Menü";
    menuBtn.setAttribute("aria-haspopup", "menu");
    menuBtn.innerHTML = icons.dots;
    menuBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      opts.onMenu(card, menuBtn);
    });
    actions.append(menuBtn);
  }

  top.append(actions);
  el.append(top);

  // Körper: Bild + mehrzeilige Beschreibung (bei collapsed via CSS ausgeblendet)
  const body = document.createElement("div");
  body.className = "card-body";
  if (card.imageUrl) {
    const img = document.createElement("img");
    img.className = "card-image";
    img.src = card.imageUrl;
    img.alt = "";
    img.loading = "lazy";
    img.draggable = false;
    body.append(img);
  }
  if (card.description) {
    const desc = document.createElement("p");
    desc.className = "card-desc";
    appendDescription(desc, card.description); // Plaintext + Links, Zeilenumbrüche via CSS pre-line
    body.append(desc);
  }
  el.append(body);

  // Resize-Griff am unteren Rand (nur im Bearbeitungsmodus)
  if (!readOnly) {
    const resize = document.createElement("div");
    resize.className = "card-resize";
    resize.title = "Dauer ändern";
    el.append(resize);
  }

  return el;
}

/**
 * Beschreibungstext mit Links rendern – ohne innerHTML (XSS-sicher).
 * Unterstützt "[Text](https://…)" sowie automatisch verlinkte http(s)-URLs.
 * Exportiert, damit die Karten-Vollansicht (cardview.js) dieselbe Logik nutzt.
 */
export function appendDescription(container, text) {
  const linkRe = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"')\]]+)/g;
  let last = 0;
  let match;
  while ((match = linkRe.exec(text))) {
    if (match.index > last) container.append(text.slice(last, match.index));
    const a = document.createElement("a");
    a.href = match[2] || match[3]; // per Regex nur http(s)-URLs
    a.textContent = match[1] || match[3];
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    container.append(a);
    last = match.index + match[0].length;
  }
  if (last < text.length) container.append(text.slice(last));
}
