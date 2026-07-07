// util.js – kleine Hilfsfunktionen (Zeit, Zahlen, URL)

/** Minuten seit Mitternacht als "HH:MM" formatieren. */
export function minutesToHHMM(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

/** Zeitspanne "HH:MM–HH:MM" aus Start und Dauer. */
export function formatRange(startMinutes, durationMinutes) {
  return minutesToHHMM(startMinutes) + "–" + minutesToHHMM(startMinutes + durationMinutes);
}

/** Auf das 15-Minuten-Raster runden. */
export function snap15(minutes) {
  return Math.round(minutes / 15) * 15;
}

/** Abrunden auf das 15-Minuten-Raster (für Zellklicks). */
export function floor15(minutes) {
  return Math.floor(minutes / 15) * 15;
}

/** Wert in [min, max] begrenzen. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** true, wenn die Seite im Mock-Modus läuft (?mock=1 oder GitHub-Pages-Demo). */
export function isMockActive() {
  if (new URLSearchParams(location.search).get("mock") === "1") return true;
  return location.hostname.endsWith(".github.io");
}

/** Hängt bei aktivem Mock-Modus "mock=1" an eine (relative) URL an. */
export function withMock(url) {
  if (!isMockActive()) return url;
  return url + (url.includes("?") ? "&" : "?") + "mock=1";
}

/** Anzeigenamen für Tageskürzel. */
export const DAY_NAMES = {
  Mo: "Montag",
  Di: "Dienstag",
  Mi: "Mittwoch",
  Do: "Donnerstag",
  Fr: "Freitag",
  Sa: "Samstag",
  So: "Sonntag",
};

/** Vordefinierte Kartenfarben (Trello-Palette). */
export const CARD_COLORS = [
  { value: "#61bd4f", label: "Grün" },
  { value: "#f2d600", label: "Gelb" },
  { value: "#ff9f1a", label: "Orange" },
  { value: "#eb5a46", label: "Rot" },
  { value: "#c377e0", label: "Lila" },
  { value: "#0079bf", label: "Blau" },
  { value: "#00c2e0", label: "Türkis" },
  { value: "#ff78cb", label: "Pink" },
];
