// cardview.js – Vollansicht einer Terminkarte (reines Anzeigen, kein Bearbeiten).
// Löst das Problem, dass auf sehr kurzen Terminen (wenig Höhe im Raster) kaum
// Platz für Bild/Beschreibung ist: Klick auf das Maximieren-Symbol öffnet diese
// Karte groß in einem Dialog, egal wie kurz der Termin im Raster ist.

import { formatRange } from "./util.js";
import { appendDescription } from "./card.js";
import { icons } from "./icons.js";

let dlg, colorbar, title, time, muteBadge, image, desc, closeBtns;

/** Dialog initialisieren (einmalig nach DOM-Aufbau aufrufen, in beiden Modi). */
export function initCardViewDialog() {
  dlg = document.getElementById("card-view-dialog");
  colorbar = document.getElementById("cv-colorbar");
  title = document.getElementById("cv-title");
  time = document.getElementById("cv-time");
  muteBadge = document.getElementById("cv-mute-badge");
  image = document.getElementById("cv-image");
  desc = document.getElementById("cv-desc");
  closeBtns = document.querySelectorAll("[data-close-cardview]");

  closeBtns.forEach((btn) => btn.addEventListener("click", () => dlg.close()));
  // Klick auf den Backdrop (außerhalb des eigentlichen Dialoginhalts) schließt ebenfalls.
  dlg.addEventListener("click", (event) => {
    if (event.target === dlg) dlg.close();
  });
}

/** Vollansicht der übergebenen Karte öffnen. */
export function openCardView(card) {
  colorbar.style.background = card.color || "transparent";
  dlg.style.background = card.bgColor || "";
  dlg.style.color = card.textColor || "";

  title.textContent = card.title;
  time.textContent = formatRange(card.startMinutes, card.durationMinutes);
  // .cardview-time hat per CSS eine feste graue Farbe (für den Normalfall) – bei
  // gewählter Textfarbe hier überschreiben, sonst schlecht lesbar auf dunklem Grund.
  time.style.color = card.textColor || "";
  muteBadge.hidden = !card.muted;
  muteBadge.innerHTML = icons.mute + " Stummgeschaltet";

  if (card.imageUrl) {
    image.src = card.imageUrl;
    image.hidden = false;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
  }

  desc.innerHTML = "";
  if (card.description) {
    appendDescription(desc, card.description);
    desc.hidden = false;
  } else {
    desc.hidden = true;
  }

  dlg.showModal();
}
