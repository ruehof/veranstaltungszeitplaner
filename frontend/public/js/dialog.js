// dialog.js – Termin-Dialog (<dialog>) zum Anlegen und Bearbeiten von Karten

import { minutesToHHMM, CARD_COLORS, CARD_BG_COLORS, DAY_NAMES } from "./util.js";
import { showToast } from "./toast.js";

let config = null; // { getSchedule, uploadImage(file), onSubmit(payload, existingCard) }
let dlg, form, fields;
let currentCard = null; // beim Bearbeiten die Original-Karte, sonst null
let currentImageUrl = null;
let uploading = false;

/** Dialog initialisieren (einmalig nach DOM-Aufbau aufrufen). */
export function initCardDialog(options) {
  config = options;
  dlg = document.getElementById("card-dialog");
  form = document.getElementById("card-form");
  fields = {
    heading: document.getElementById("card-dialog-heading"),
    title: document.getElementById("cd-title"),
    description: document.getElementById("cd-desc"),
    imageInput: document.getElementById("cd-image"),
    imagePick: document.getElementById("cd-image-pick"),
    imageRemove: document.getElementById("cd-image-remove"),
    imagePreview: document.getElementById("cd-image-preview"),
    colors: document.getElementById("cd-colors"),
    bgColors: document.getElementById("cd-bgcolors"),
    day: document.getElementById("cd-day"),
    start: document.getElementById("cd-start"),
    duration: document.getElementById("cd-duration"),
    save: document.getElementById("cd-save"),
    cancel: document.getElementById("cd-cancel"),
    close: document.getElementById("card-dialog-close"),
  };

  buildColorSwatches();

  fields.imagePick.addEventListener("click", () => fields.imageInput.click());
  fields.imageInput.addEventListener("change", onImagePicked);
  fields.imageRemove.addEventListener("click", () => setImage(null));
  fields.cancel.addEventListener("click", () => dlg.close());
  fields.close.addEventListener("click", () => dlg.close());
  fields.start.addEventListener("change", () => rebuildDurationOptions());

  form.addEventListener("submit", onSubmit);
}

/** Farbfelder (Radio-Buttons mit Farbmuster) für Farbleiste und Hintergrund aufbauen.
 *  Für den Hintergrund stehen die Pastelltöne UND die kräftige Farbleisten-Palette zur Wahl. */
function buildColorSwatches() {
  buildSwatches(fields.colors, "cd-color", CARD_COLORS);
  buildSwatches(fields.bgColors, "cd-bgcolor", [...CARD_BG_COLORS, ...CARD_COLORS]);
}

function buildSwatches(containerEl, name, colors) {
  containerEl.innerHTML = "";
  colors.forEach((color, index) => {
    const label = document.createElement("label");
    label.className = "color-swatch";
    label.title = color.label;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = name;
    input.value = color.value;
    if (index === 0) input.defaultChecked = true;

    const chip = document.createElement("span");
    chip.className = "color-chip";
    chip.style.background = color.value || "#ffffff"; // leerer value = Weiß (Standard)

    label.append(input, chip);
    containerEl.append(label);
  });
}

/** Tag-/Start-/Dauer-Auswahl aus den Plan-Einstellungen füllen. */
function buildTimeOptions(schedule) {
  const { startHour, endHour, days } = schedule.settings;

  fields.day.innerHTML = "";
  days.forEach((dayKey, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = DAY_NAMES[dayKey] || dayKey;
    fields.day.append(option);
  });

  fields.start.innerHTML = "";
  for (let m = startHour * 60; m <= endHour * 60 - 15; m += 15) {
    const option = document.createElement("option");
    option.value = String(m);
    option.textContent = minutesToHHMM(m);
    fields.start.append(option);
  }
}

/** Dauer-Optionen abhängig von der gewählten Startzeit (bis Rasterende). */
function rebuildDurationOptions(preferred) {
  const schedule = config.getSchedule();
  const endMinutes = schedule.settings.endHour * 60;
  const start = parseInt(fields.start.value, 10);
  const maxDuration = endMinutes - start;
  const wanted = preferred ?? parseInt(fields.duration.value, 10) ?? 60;

  fields.duration.innerHTML = "";
  for (let d = 15; d <= maxDuration; d += 15) {
    const option = document.createElement("option");
    option.value = String(d);
    const hours = Math.floor(d / 60);
    const minutes = d % 60;
    option.textContent =
      (hours ? hours + " Std." : "") + (hours && minutes ? " " : "") + (minutes ? minutes + " Min." : "");
    fields.duration.append(option);
  }
  const clampedWanted = Math.min(Number.isFinite(wanted) ? wanted : 60, maxDuration);
  fields.duration.value = String(Math.max(15, Math.floor(clampedWanted / 15) * 15));
}

/** Bild im Dialogzustand setzen (URL oder null) und Vorschau aktualisieren. */
function setImage(url) {
  currentImageUrl = url;
  fields.imageInput.value = "";
  if (url) {
    fields.imagePreview.src = url;
    fields.imagePreview.hidden = false;
    fields.imageRemove.hidden = false;
    fields.imagePick.textContent = "Anderes Bild wählen…";
  } else {
    fields.imagePreview.removeAttribute("src");
    fields.imagePreview.hidden = true;
    fields.imageRemove.hidden = true;
    fields.imagePick.textContent = "Bild wählen…";
  }
}

/** Datei gewählt ⇒ sofort hochladen (POST …/uploads), URL merken. */
async function onImagePicked() {
  const file = fields.imageInput.files && fields.imageInput.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Das Bild ist größer als 5 MB.");
    fields.imageInput.value = "";
    return;
  }
  uploading = true;
  fields.save.disabled = true;
  fields.imagePick.disabled = true;
  fields.imagePick.textContent = "Wird hochgeladen…";
  try {
    const result = await config.uploadImage(file);
    setImage(result.url);
  } catch (err) {
    showToast(err.message || "Bild-Upload fehlgeschlagen.");
    setImage(currentImageUrl); // vorherigen Zustand wiederherstellen
  } finally {
    uploading = false;
    fields.save.disabled = false;
    fields.imagePick.disabled = false;
  }
}

/**
 * Dialog öffnen.
 * @param {object|null} card  Karte zum Bearbeiten oder null zum Anlegen
 * @param {object} defaults   Vorbelegung beim Anlegen, z. B. {day, startMinutes}
 */
export function openCardDialog(card = null, defaults = {}) {
  const schedule = config.getSchedule();
  currentCard = card;
  buildTimeOptions(schedule);

  const startFloor = schedule.settings.startHour * 60;

  if (card) {
    fields.heading.textContent = "Termin bearbeiten";
    fields.save.textContent = "Speichern";
    fields.title.value = card.title;
    fields.description.value = card.description || "";
    fields.day.value = String(card.day);
    fields.start.value = String(card.startMinutes);
    rebuildDurationOptions(card.durationMinutes);
    setImage(card.imageUrl || null);
    selectSwatch(fields.colors, "cd-color", card.color);
    selectSwatch(fields.bgColors, "cd-bgcolor", card.bgColor || "");
  } else {
    fields.heading.textContent = "Neuer Termin";
    fields.save.textContent = "Anlegen";
    form.reset();
    fields.title.value = "";
    fields.description.value = "";
    fields.day.value = String(defaults.day ?? 0);
    fields.start.value = String(defaults.startMinutes ?? startFloor);
    rebuildDurationOptions(defaults.durationMinutes ?? 60);
    setImage(null);
    selectSwatch(fields.colors, "cd-color", CARD_COLORS[0].value);
    selectSwatch(fields.bgColors, "cd-bgcolor", "");
  }

  dlg.showModal();
  fields.title.focus();
}

/** Farb-Radio anhand des Wertes auswählen (unbekannte Farbe ⇒ erste). */
function selectSwatch(containerEl, name, value) {
  const inputs = containerEl.querySelectorAll(`input[name='${name}']`);
  let matched = false;
  inputs.forEach((input) => {
    const hit = input.value === value;
    input.checked = hit;
    if (hit) matched = true;
  });
  if (!matched && inputs.length > 0) inputs[0].checked = true;
}

/** Formular absenden: Payload bauen, an plan.js delegieren, Dialog schließen. */
async function onSubmit(event) {
  event.preventDefault();
  if (uploading) return;

  const title = fields.title.value.trim();
  if (!title) {
    fields.title.reportValidity();
    return;
  }
  const colorInput = fields.colors.querySelector("input[name='cd-color']:checked");
  const bgInput = fields.bgColors.querySelector("input[name='cd-bgcolor']:checked");
  const payload = {
    title,
    description: fields.description.value,
    imageUrl: currentImageUrl,
    color: colorInput ? colorInput.value : null,
    bgColor: bgInput && bgInput.value ? bgInput.value : null,
    day: parseInt(fields.day.value, 10),
    startMinutes: parseInt(fields.start.value, 10),
    durationMinutes: parseInt(fields.duration.value, 10),
  };

  fields.save.disabled = true;
  try {
    await config.onSubmit(payload, currentCard);
    dlg.close();
  } catch (err) {
    showToast(err.message || "Speichern fehlgeschlagen.");
  } finally {
    fields.save.disabled = false;
  }
}
