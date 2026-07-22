// plan.js – Wochenplan-Ansicht: Laden, Rendern, Interaktion (Bearbeiten/Nur-Lesen)

import "./mock.js"; // aktiviert sich nur bei ?mock=1
import { api, setEditToken } from "./api.js";
import { renderGrid, getPxPerMinute } from "./grid.js";
import { createCardElement } from "./card.js";
import { initDragDrop } from "./dragdrop.js";
import { initCardDialog, openCardDialog } from "./dialog.js";
import { createScheduleSettingsForm } from "./scheduleform.js";
import { openMenu } from "./menu.js";
import { showToast } from "./toast.js";
import { rememberPlan } from "./storage.js";
import { floor15, clamp } from "./util.js";
import { icons } from "./icons.js";

// ---- URL-Parameter und Modus bestimmen -------------------------------------

const params = new URLSearchParams(location.search);
const shareParam = params.get("share");
const idParam = params.get("id");
const tokenParam = params.get("token");
const readOnly = Boolean(shareParam) || !tokenParam;

// ---- Zustand ----------------------------------------------------------------

let schedule = null;
let cards = [];

// ---- DOM-Referenzen ----------------------------------------------------------

const els = {
  gridContainer: document.getElementById("grid-container"),
  titleInput: document.getElementById("plan-title"),
  readonlyBadge: document.getElementById("readonly-badge"),
  addBtn: document.getElementById("add-card-btn"),
  exportBtn: document.getElementById("export-btn"),
  settingsBtn: document.getElementById("settings-btn"),
  settingsDialog: document.getElementById("settings-dialog"),
  settingsForm: document.getElementById("settings-form"),
  settingsContainer: document.getElementById("sd-settings"),
  settingsSave: document.getElementById("sd-save"),
  settingsCancel: document.getElementById("sd-cancel"),
  settingsClose: document.getElementById("settings-dialog-close"),
  bgFile: document.getElementById("sd-bg-file"),
  bgPick: document.getElementById("sd-bg-pick"),
  bgRemove: document.getElementById("sd-bg-remove"),
  bgPreview: document.getElementById("sd-bg-preview"),
  popupEnabled: document.getElementById("sd-popup-enabled"),
  popupText: document.getElementById("sd-popup-text"),
  infoDialog: document.getElementById("info-dialog"),
  infoHeading: document.getElementById("info-dialog-heading"),
  infoText: document.getElementById("info-dialog-text"),
  shareBtn: document.getElementById("share-btn"),
  shareDialog: document.getElementById("share-dialog"),
  shareEditRow: document.getElementById("share-edit-row"),
  shareEditInput: document.getElementById("share-edit-url"),
  shareViewInput: document.getElementById("share-view-url"),
  shareCloseBtns: document.querySelectorAll("[data-close-share]"),
};

// ---- Hilfsfunktionen ----------------------------------------------------------

const getCard = (id) => cards.find((c) => c.id === id);

/** Liegt die Karte im aktuellen Raster (Tag + Zeitfenster)? Sonst wird sie ausgeblendet. */
function fitsGrid(card) {
  const { startHour, endHour, days } = schedule.settings;
  return (
    card.day >= 0 &&
    card.day < days.length &&
    card.startMinutes >= startHour * 60 &&
    card.startMinutes + card.durationMinutes <= endHour * 60
  );
}

/** Alles neu rendern (Grid + Karten). Einfach und robust. */
function renderAll() {
  const { dayCols } = renderGrid(els.gridContainer, schedule);
  for (const card of cards) {
    if (!fitsGrid(card)) continue; // außerhalb des Rasters – bleibt gespeichert, wird ausgeblendet
    const col = dayCols[card.day];
    const el = createCardElement(card, {
      schedule,
      readOnly,
      onToggleCollapse: toggleCollapse,
      onMenu: openCardMenu,
    });
    col.append(el);
    // Passt der Inhalt nicht in die Slot-Höhe (kurzer Termin), darf die Karte
    // über ihr Zeitfenster hinauswachsen – so bleibt die Beschreibung lesbar.
    updateGrow(el);
    // Bilder skalieren auf Kartenbreite und laden verzögert ⇒ nach dem Laden neu messen
    el.querySelectorAll("img").forEach((img) => {
      if (!img.complete) img.addEventListener("load", () => updateGrow(el), { once: true });
    });
  }
}

function updateGrow(el) {
  if (el.scrollHeight > el.clientHeight + 1) el.classList.add("grow");
}

/** Fehlerseite bei ungültigem Link / Ladefehler. */
function showFatal(message) {
  const main = document.getElementById("plan-main");
  main.innerHTML = "";
  const box = document.createElement("div");
  box.className = "fatal-box";
  const heading = document.createElement("h2");
  heading.textContent = "Plan konnte nicht geladen werden";
  const text = document.createElement("p");
  text.textContent = message;
  const back = document.createElement("a");
  back.className = "btn btn-primary";
  back.href = "index.html";
  back.textContent = "Zur Startseite";
  box.append(heading, text, back);
  main.append(box);
}

// ---- Karten-Aktionen ----------------------------------------------------------

/** Ein-/Ausklappen; im Nur-Lese-Modus nur lokal, sonst per PATCH speichern. */
function toggleCollapse(card) {
  card.collapsed = !card.collapsed;
  renderAll();
  if (readOnly) return;
  api.patchCard(schedule.id, card.id, { collapsed: card.collapsed }).catch((err) => {
    card.collapsed = !card.collapsed;
    renderAll();
    showToast(err.message);
  });
}

/** Stummschalten/Aktivieren (optimistisch mit Rücknahme bei Fehler). */
function toggleMute(card) {
  const previous = card.muted;
  card.muted = !card.muted;
  renderAll();
  api.patchCard(schedule.id, card.id, { muted: card.muted }).catch((err) => {
    card.muted = previous;
    renderAll();
    showToast(err.message);
  });
}

/** Karte duplizieren (POST …/duplicate). */
async function duplicateCard(card) {
  try {
    const copy = await api.duplicateCard(schedule.id, card.id);
    cards.push(copy);
    renderAll();
    showToast("Termin dupliziert.", "success");
  } catch (err) {
    showToast(err.message);
  }
}

/** Karte löschen (mit Bestätigung). */
async function deleteCard(card) {
  const sure = confirm(`Termin „${card.title}" wirklich löschen?`);
  if (!sure) return;
  try {
    await api.deleteCard(schedule.id, card.id);
    cards = cards.filter((c) => c.id !== card.id);
    renderAll();
    showToast("Termin gelöscht.", "success");
  } catch (err) {
    showToast(err.message);
  }
}

/** Dreipunkt-Menü der Karte öffnen. */
function openCardMenu(card, anchor) {
  openMenu(anchor, [
    { label: "Bearbeiten", icon: icons.edit, onClick: () => openCardDialog(card) },
    { label: "Duplizieren", icon: icons.duplicate, onClick: () => duplicateCard(card) },
    {
      label: card.muted ? "Aktivieren" : "Stummschalten",
      icon: card.muted ? icons.unmute : icons.mute,
      onClick: () => toggleMute(card),
    },
    { label: "Löschen", icon: icons.trash, danger: true, onClick: () => deleteCard(card) },
  ]);
}

// ---- Drag & Drop Commits --------------------------------------------------------

/** Nach Drag: Tag/Start speichern; bei Fehler zurückspringen. */
function commitMove(card, day, startMinutes) {
  const previous = { day: card.day, startMinutes: card.startMinutes };
  card.day = day;
  card.startMinutes = startMinutes;
  renderAll();
  api
    .patchCard(schedule.id, card.id, { day, startMinutes })
    .then((updated) => Object.assign(card, updated))
    .catch((err) => {
      Object.assign(card, previous);
      renderAll();
      showToast(err.message);
    });
}

/** Nach Resize: Dauer speichern; bei Fehler zurückspringen. */
function commitResize(card, durationMinutes) {
  const previous = card.durationMinutes;
  card.durationMinutes = durationMinutes;
  renderAll();
  api
    .patchCard(schedule.id, card.id, { durationMinutes })
    .then((updated) => Object.assign(card, updated))
    .catch((err) => {
      card.durationMinutes = previous;
      renderAll();
      showToast(err.message);
    });
}

// ---- Dialog-Anbindung ------------------------------------------------------------

function setupDialog() {
  initCardDialog({
    getSchedule: () => schedule,
    uploadImage: (file) => api.uploadImage(schedule.id, file),
    onSubmit: async (payload, existingCard) => {
      if (existingCard) {
        const updated = await api.patchCard(schedule.id, existingCard.id, payload);
        Object.assign(existingCard, updated);
      } else {
        const created = await api.createCard(schedule.id, {
          ...payload,
          collapsed: false,
          muted: false,
        });
        cards.push(created);
      }
      renderAll();
    },
  });
}

// ---- Plan-Einstellungen (Tage, Datum, Uhrzeiten) -------------------------------------

function setupSettingsDialog() {
  const settingsForm = createScheduleSettingsForm(els.settingsContainer, { idPrefix: "sd" });
  let currentBgUrl = null; // aktuell gewähltes Plan-Hintergrundbild im Dialog

  function setBgImage(url) {
    currentBgUrl = url;
    els.bgFile.value = "";
    if (url) {
      els.bgPreview.src = url;
      els.bgPreview.hidden = false;
      els.bgRemove.hidden = false;
      els.bgPick.textContent = "Anderes Bild wählen…";
    } else {
      els.bgPreview.removeAttribute("src");
      els.bgPreview.hidden = true;
      els.bgRemove.hidden = true;
      els.bgPick.textContent = "Bild wählen…";
    }
  }

  els.bgPick.addEventListener("click", () => els.bgFile.click());
  els.bgRemove.addEventListener("click", () => setBgImage(null));
  els.bgFile.addEventListener("change", async () => {
    const file = els.bgFile.files && els.bgFile.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast("Das Bild ist größer als 5 MB.");
      els.bgFile.value = "";
      return;
    }
    els.bgPick.disabled = true;
    els.settingsSave.disabled = true;
    els.bgPick.textContent = "Wird hochgeladen…";
    try {
      const result = await api.uploadImage(schedule.id, file);
      setBgImage(result.url);
    } catch (err) {
      showToast(err.message || "Bild-Upload fehlgeschlagen.");
      setBgImage(currentBgUrl);
    } finally {
      els.bgPick.disabled = false;
      els.settingsSave.disabled = false;
    }
  });

  els.settingsBtn.addEventListener("click", () => {
    settingsForm.setValues(schedule.settings);
    setBgImage(schedule.settings.backgroundImage || null);
    els.popupEnabled.checked = Boolean(schedule.settings.popupEnabled);
    els.popupText.value = schedule.settings.popupText || "";
    els.settingsDialog.showModal();
  });
  els.settingsCancel.addEventListener("click", () => els.settingsDialog.close());
  els.settingsClose.addEventListener("click", () => els.settingsDialog.close());

  els.settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    let settings;
    try {
      settings = {
        ...settingsForm.getValues(),
        popupEnabled: els.popupEnabled.checked,
        popupText: els.popupText.value,
        backgroundImage: currentBgUrl,
      };
    } catch (err) {
      showToast(err.message);
      return;
    }
    els.settingsSave.disabled = true;
    try {
      const updated = await api.patchSchedule(schedule.id, { settings });
      Object.assign(schedule, updated);
      els.settingsDialog.close();
      renderAll();
      const hidden = cards.filter((card) => !fitsGrid(card)).length;
      if (hidden > 0) {
        showToast(
          hidden === 1
            ? "1 Termin liegt außerhalb des neuen Rasters und wird ausgeblendet."
            : `${hidden} Termine liegen außerhalb des neuen Rasters und werden ausgeblendet.`,
          "info"
        );
      } else {
        showToast("Einstellungen gespeichert.", "success");
      }
    } catch (err) {
      showToast(err.message || "Einstellungen konnten nicht gespeichert werden.");
    } finally {
      els.settingsSave.disabled = false;
    }
  });
}

// ---- Kopfzeile (Titel, Buttons, Freigeben) ------------------------------------------

function setupHeader() {
  document.title = `${schedule.title} – Veranstaltungszeitplaner`;
  els.titleInput.value = schedule.title;

  // Export als JSON-Datei (im Bearbeitungs- UND Nur-Lese-Modus verfügbar)
  els.exportBtn.addEventListener("click", exportPlan);

  if (readOnly) {
    document.body.dataset.mode = "readonly";
    els.titleInput.readOnly = true;
    els.readonlyBadge.hidden = false;
    els.addBtn.hidden = true;
    els.settingsBtn.hidden = true;
    els.shareBtn.hidden = true;
    // Kein Weg zur Plan-Erstellung: Logo-Link zur Startseite deaktivieren
    const logo = document.querySelector(".app-logo");
    logo.removeAttribute("href");
    logo.removeAttribute("title");
    return;
  }
  document.body.dataset.mode = "edit";

  // Titel inline umbenennen (Enter oder Verlassen des Feldes)
  const commitTitle = () => {
    const newTitle = els.titleInput.value.trim();
    if (!newTitle) {
      els.titleInput.value = schedule.title;
      return;
    }
    if (newTitle === schedule.title) return;
    api
      .patchSchedule(schedule.id, { title: newTitle })
      .then((updated) => {
        schedule.title = updated.title;
        els.titleInput.value = updated.title;
        document.title = `${updated.title} – Veranstaltungszeitplaner`;
        rememberPlan({ id: schedule.id, title: updated.title, token: tokenParam });
      })
      .catch((err) => {
        els.titleInput.value = schedule.title;
        showToast(err.message);
      });
  };
  els.titleInput.addEventListener("blur", commitTitle);
  els.titleInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      els.titleInput.blur();
    } else if (event.key === "Escape") {
      els.titleInput.value = schedule.title;
      els.titleInput.blur();
    }
  });

  // "+ Termin"
  els.addBtn.addEventListener("click", () => {
    openCardDialog(null, {
      day: 0,
      startMinutes: schedule.settings.startHour * 60,
      durationMinutes: 60,
    });
  });

  // "Freigeben": beide Links anzeigen und kopieren
  els.shareBtn.addEventListener("click", () => {
    const base = location.origin + location.pathname;
    els.shareEditInput.value = `${base}?id=${encodeURIComponent(schedule.id)}&token=${encodeURIComponent(tokenParam)}`;
    els.shareViewInput.value = `${base}?share=${encodeURIComponent(schedule.shareId)}`;
    els.shareDialog.showModal();
  });

  els.shareCloseBtns.forEach((btn) => btn.addEventListener("click", () => els.shareDialog.close()));

  document.querySelectorAll("[data-copy-target]").forEach((button) => {
    button.addEventListener("click", async () => {
      const input = document.getElementById(button.dataset.copyTarget);
      try {
        await navigator.clipboard.writeText(input.value);
        showToast("Link kopiert.", "success");
      } catch {
        // Fallback: Text markieren, damit manuell kopiert werden kann
        input.select();
        showToast("Bitte manuell kopieren (Strg+C).", "info");
      }
    });
  });
}

// ---- Export als JSON-Datei --------------------------------------------------------------

/** Plan (Titel, Settings, Karten) als JSON-Datei herunterladen. */
function exportPlan() {
  const data = {
    format: "veranstaltungszeitplaner",
    version: 1,
    exportedAt: new Date().toISOString(),
    title: schedule.title,
    settings: schedule.settings,
    cards: cards.map((c) => ({
      title: c.title,
      description: c.description,
      imageUrl: c.imageUrl,
      color: c.color,
      bgColor: c.bgColor ?? null,
      textColor: c.textColor ?? null,
      day: c.day,
      startMinutes: c.startMinutes,
      durationMinutes: c.durationMinutes,
      collapsed: c.collapsed,
      muted: c.muted,
    })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const safeTitle = schedule.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "wochenplan";
  link.download = safeTitle + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
  showToast("Plan als JSON-Datei exportiert.", "success");
}

// ---- Erläuterungs-Popup (Nur-Lese-Link) -----------------------------------------------

/** Popup mit Erläuterungen zeigen, wenn der Plan es vorsieht (nur beim Nur-Lese-Link). */
function maybeShowInfoPopup() {
  const { popupEnabled, popupText } = schedule.settings;
  if (!shareParam || !popupEnabled || !popupText || !popupText.trim()) return;
  els.infoHeading.textContent = schedule.title;
  els.infoText.textContent = popupText; // Plaintext, Zeilenumbrüche via CSS pre-line
  document
    .querySelectorAll("[data-close-info]")
    .forEach((btn) => btn.addEventListener("click", () => els.infoDialog.close()));
  els.infoDialog.showModal();
}

// ---- Klick auf freie Rasterzelle: Termin mit vorbelegter Zeit anlegen -----------------

function setupCellClick() {
  els.gridContainer.addEventListener("click", (event) => {
    if (readOnly) return;
    const col = event.target.closest(".day-col");
    if (!col || event.target.closest(".card") || event.target.closest(".card-ghost")) return;

    const { startHour, endHour } = schedule.settings;
    const rect = col.getBoundingClientRect();
    const offsetMinutes = (event.clientY - rect.top) / getPxPerMinute();
    let startMinutes = startHour * 60 + floor15(offsetMinutes);
    startMinutes = clamp(startMinutes, startHour * 60, endHour * 60 - 15);

    openCardDialog(null, {
      day: parseInt(col.dataset.day, 10),
      startMinutes,
      durationMinutes: Math.min(60, endHour * 60 - startMinutes),
    });
  });

  // Doppelklick auf Karte: Bearbeiten
  els.gridContainer.addEventListener("dblclick", (event) => {
    if (readOnly) return;
    const cardEl = event.target.closest(".card");
    if (!cardEl) return;
    const card = getCard(cardEl.dataset.cardId);
    if (card) openCardDialog(card);
  });
}

// ---- Laden und Start ----------------------------------------------------------------

async function load() {
  try {
    let data;
    if (shareParam) {
      data = await api.getShared(shareParam);
    } else if (idParam && tokenParam) {
      setEditToken(tokenParam);
      data = await api.getSchedule(idParam);
    } else {
      throw new Error("Ungültiger Link: Es fehlt id/token oder share.");
    }
    schedule = data.schedule;
    cards = data.cards || [];

    if (!readOnly) {
      rememberPlan({ id: schedule.id, title: schedule.title, token: tokenParam });
      setupDialog();
      setupSettingsDialog();
    }
    setupHeader();
    renderAll();
    maybeShowInfoPopup();
  } catch (err) {
    showFatal(err.message || "Unbekannter Fehler.");
  }
}

// Drag & Drop und Zellklicks einmalig (delegiert) registrieren
initDragDrop(els.gridContainer, {
  isReadOnly: () => readOnly,
  getSchedule: () => schedule,
  getCard,
  onMove: commitMove,
  onResize: commitResize,
});
setupCellClick();
load();
