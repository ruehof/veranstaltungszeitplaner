// scheduleform.js – gemeinsames Formular für Plan-Einstellungen
// (Tages-Vorauswahlen, Datumsbereich von–bis, Start-/Endstunde).
// Wird von der Startseite (Plan erstellen) und dem Einstellungen-Dialog
// (Plan bearbeiten) verwendet.

import { WEEKDAY_KEYS, parseISODate, addDays, daySpan } from "./util.js";

/** Obergrenze für Tagesspalten – muss zum Backend passen (validate.js MAX_DAYS). */
export const MAX_DAYS = 31;

/** Tages-Vorauswahlen. Sa–Sa/So–So sind 8-Tage-Wochen (z. B. Freizeiten mit An-/Abreise). */
const PRESETS = [
  { key: "workweek", label: "Mo–Fr", days: ["Mo", "Di", "Mi", "Do", "Fr"] },
  { key: "fullweek", label: "Mo–So", days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] },
  { key: "weekend", label: "Sa–So", days: ["Sa", "So"] },
  { key: "satsat", label: "Sa–Sa", days: ["Sa", "So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"] },
  { key: "sunsun", label: "So–So", days: ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] },
];

const sameDays = (a, b) => a.length === b.length && a.every((d, i) => d === b[i]);

/**
 * Formularfelder in den Container rendern.
 * @param {HTMLElement} container
 * @param {object} opts { idPrefix } – eindeutiges Präfix je Einbindung (z. B. "cf", "sd")
 * @returns {{ setValues(settings), getValues(): settings }}
 *   getValues() wirft bei ungültiger Eingabe einen Error mit deutscher Meldung.
 */
export function createScheduleSettingsForm(container, { idPrefix = "sf" } = {}) {
  const radioName = idPrefix + "-days";

  // Ausgangswerte für den Fall "Auswahl unverändert lassen" (Bearbeiten-Dialog)
  let originalDays = PRESETS[0].days;

  container.innerHTML = "";

  // -- Tage: Vorauswahlen + Datumsbereich ------------------------------------
  const daysField = document.createElement("fieldset");
  daysField.className = "field";
  const legend = document.createElement("legend");
  legend.className = "field-label";
  legend.textContent = "Tage";
  const radioRow = document.createElement("div");
  radioRow.className = "radio-row";

  const radios = {};
  const addRadio = (key, labelText) => {
    const label = document.createElement("label");
    label.className = "radio-option";
    const input = document.createElement("input");
    input.type = "radio";
    input.name = radioName;
    input.value = key;
    const span = document.createElement("span");
    span.textContent = labelText;
    label.append(input, span);
    radioRow.append(label);
    radios[key] = input;
    return input;
  };
  for (const preset of PRESETS) addRadio(preset.key, preset.label);
  addRadio("daterange", "Datum von–bis");
  radios.workweek.checked = true;

  // Datumsfelder (aktiv bei Auswahl "Datum von–bis"; Eingabe wählt die Option automatisch)
  const dateRow = document.createElement("div");
  dateRow.className = "field-row date-range-row";
  const makeDateField = (labelText) => {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.className = "field-label";
    span.textContent = labelText;
    const input = document.createElement("input");
    input.type = "date";
    input.addEventListener("input", () => {
      radios.daterange.checked = true;
    });
    label.append(span, input);
    dateRow.append(label);
    return input;
  };
  const dateFrom = makeDateField("Datum von");
  const dateTo = makeDateField("Datum bis");

  daysField.append(legend, radioRow, dateRow);
  container.append(daysField);

  // -- Uhrzeiten: Von/Bis -----------------------------------------------------
  const hourRow = document.createElement("div");
  hourRow.className = "field-row";
  const makeHourField = (labelText, first, last, selected) => {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.className = "field-label";
    span.textContent = labelText;
    const select = document.createElement("select");
    for (let h = first; h <= last; h++) {
      const option = document.createElement("option");
      option.value = String(h);
      option.textContent = String(h).padStart(2, "0") + ":00";
      if (h === selected) option.selected = true;
      select.append(option);
    }
    label.append(span, select);
    hourRow.append(label);
    return select;
  };
  const startSelect = makeHourField("Uhrzeit von", 0, 23, 6);
  const endSelect = makeHourField("Uhrzeit bis", 1, 24, 20);
  container.append(hourRow);

  // -- API ---------------------------------------------------------------------

  /** Felder aus vorhandenen Settings vorbelegen (Bearbeiten-Dialog). */
  function setValues(settings) {
    originalDays = [...settings.days];
    startSelect.value = String(settings.startHour);
    endSelect.value = String(settings.endHour);
    dateFrom.value = "";
    dateTo.value = "";
    for (const input of Object.values(radios)) input.checked = false;

    if (settings.startDate) {
      const from = parseISODate(settings.startDate);
      radios.daterange.checked = true;
      if (from) {
        dateFrom.value = settings.startDate;
        dateTo.value = toISO(addDays(from, settings.days.length - 1));
      }
      return;
    }
    const preset = PRESETS.find((p) => sameDays(p.days, settings.days));
    if (preset) radios[preset.key].checked = true;
    // Kein Preset passt (frei konfigurierte Tage): keine Auswahl – beim Speichern
    // bleiben die Tage unverändert, solange der Nutzer nichts anklickt.
  }

  /** Eingaben prüfen und als Settings-Objekt liefern (wirft bei Fehlern). */
  function getValues() {
    const startHour = parseInt(startSelect.value, 10);
    const endHour = parseInt(endSelect.value, 10);
    if (startHour >= endHour) {
      throw new Error("„Uhrzeit von“ muss vor „Uhrzeit bis“ liegen.");
    }

    const checked = container.querySelector(`input[name='${radioName}']:checked`);
    const mode = checked ? checked.value : null;

    if (mode === "daterange") {
      const from = parseISODate(dateFrom.value);
      const to = parseISODate(dateTo.value);
      if (!from || !to) {
        throw new Error("Bitte beide Datumsfelder (von und bis) ausfüllen.");
      }
      if (to < from) {
        throw new Error("„Datum bis“ darf nicht vor „Datum von“ liegen.");
      }
      const span = daySpan(from, to);
      if (span > MAX_DAYS) {
        throw new Error(`Der Zeitraum darf höchstens ${MAX_DAYS} Tage umfassen.`);
      }
      const days = [];
      for (let i = 0; i < span; i++) days.push(WEEKDAY_KEYS[addDays(from, i).getDay()]);
      return { startHour, endHour, days, startDate: dateFrom.value };
    }

    const preset = PRESETS.find((p) => p.key === mode);
    if (preset) {
      return { startHour, endHour, days: [...preset.days], startDate: null };
    }
    // Keine Auswahl (nur möglich im Bearbeiten-Fall mit frei konfigurierten Tagen)
    return { startHour, endHour, days: [...originalDays], startDate: null };
  }

  return { setValues, getValues };
}

/** Date als "JJJJ-MM-TT" (lokal, ohne Zeitzonen-Verschiebung). */
function toISO(date) {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}
