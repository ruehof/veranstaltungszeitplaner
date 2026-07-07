// grid.js – Aufbau des Wochenrasters (Tagesspalten, Zeitleiste, Stundenlinien)

import { minutesToHHMM, DAY_NAMES, parseISODate, addDays, formatDateDE } from "./util.js";

/** Stundenhöhe in Pixel aus der CSS-Variable --hour-height lesen. */
export function getHourHeight() {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--hour-height");
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 48;
}

/** Pixel pro Minute (abgeleitet aus der Stundenhöhe). */
export function getPxPerMinute() {
  return getHourHeight() / 60;
}

/**
 * Raster in den Container rendern.
 * @returns {{grid: HTMLElement, dayCols: HTMLElement[]}}
 */
export function renderGrid(container, schedule) {
  const { startHour, endHour, days } = schedule.settings;
  const hours = endHour - startHour;
  const hourHeight = getHourHeight();
  const bodyHeight = hours * hourHeight;

  container.innerHTML = "";

  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.setProperty("--day-count", String(days.length));

  // Ecke oben links (sticky in beide Richtungen)
  const corner = document.createElement("div");
  corner.className = "grid-corner";
  grid.append(corner);

  // Tagesköpfe (sticky oben); bei gesetztem Startdatum zeigt die zweite Zeile das Datum
  const baseDate = schedule.settings.startDate ? parseISODate(schedule.settings.startDate) : null;
  days.forEach((dayKey, index) => {
    const head = document.createElement("div");
    head.className = "day-head";
    const shortSpan = document.createElement("span");
    shortSpan.className = "day-head-short";
    shortSpan.textContent = dayKey;
    const longSpan = document.createElement("span");
    longSpan.className = "day-head-long";
    longSpan.textContent = baseDate
      ? formatDateDE(addDays(baseDate, index))
      : DAY_NAMES[dayKey] || dayKey;
    head.append(shortSpan, longSpan);
    grid.append(head);
  });

  // Zeitleiste links (sticky links)
  const timeCol = document.createElement("div");
  timeCol.className = "time-col";
  timeCol.style.height = bodyHeight + "px";
  for (let h = startHour; h <= endHour; h++) {
    const label = document.createElement("div");
    label.className = "time-label";
    label.style.top = (h - startHour) * hourHeight + "px";
    label.textContent = minutesToHHMM(h * 60);
    timeCol.append(label);
  }
  grid.append(timeCol);

  // Tagesspalten: Hintergrundlinien via CSS, Karten werden absolut hineingelegt
  const dayCols = [];
  days.forEach((dayKey, index) => {
    const col = document.createElement("div");
    col.className = "day-col";
    col.dataset.day = String(index);
    col.style.height = bodyHeight + "px";
    grid.append(col);
    dayCols.push(col);
  });

  container.append(grid);
  return { grid, dayCols };
}

/**
 * Y-Position (clientY) innerhalb einer Tagesspalte in Minuten seit Mitternacht
 * umrechnen (ohne Rundung – Aufrufer rastet selbst ein).
 */
export function clientYToMinutes(col, clientY, schedule) {
  const rect = col.getBoundingClientRect();
  const offsetY = clientY - rect.top;
  return schedule.settings.startHour * 60 + offsetY / getPxPerMinute();
}
