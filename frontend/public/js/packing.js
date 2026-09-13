// packing.js – Packliste einer Terminkarte: Editor (Bearbeitungsmodus, add/rename/
// löschen/sortieren) und Abhak-Ansicht "Packen" (eingepackt/ausgepackt, in beiden Modi).

import { icons } from "./icons.js";
import { showToast } from "./toast.js";
import { openMenu } from "./menu.js";

/** Zufällige, rein clientseitige id für neue Einträge (der Server vergibt beim
 *  Speichern ohnehin eine eigene id – diese dient nur als React-freier DOM-Key). */
function makeLocalId() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

// Obergrenze für Einträge – muss zum Server-Limit in backend/src/lib/validate.js
// (MAX_PACKING_ITEMS) passen, damit ein Import nicht erst beim Speichern mit
// einem 400-Fehler scheitert.
const MAX_PACKING_ITEMS = 100;
const MAX_PACKING_ITEM_TEXT = 200;

// ---- Editor (nur Bearbeitungsmodus, Teil des Termin-Dialogs) ------------------------

let editorDlg, editorHeading, editorList, editorAddBtn, editorDoneBtn, editorCloseBtn;
let editorDuplicateBtn, editorImportBtn, editorImportFile, editorExportBtn;
let editorItems = [];
let editorOnChange = null;
let editorFileBase = "packliste";
let editorUploadImage = null;
let editorGetDuplicateCandidates = null;
let dragSrcId = null;

/**
 * Editor-Dialog einmalig verdrahten.
 * @param {object} options  { uploadImage(file) => Promise<{url}> } – für Eintrags-Fotos
 */
export function initPackingEditor(options) {
  editorUploadImage = options.uploadImage;
  editorDlg = document.getElementById("packing-editor-dialog");
  editorHeading = document.getElementById("packing-editor-heading");
  editorList = document.getElementById("packing-editor-list");
  editorAddBtn = document.getElementById("packing-editor-add");
  editorDoneBtn = document.getElementById("packing-editor-done");
  editorCloseBtn = document.getElementById("packing-editor-close");
  editorDuplicateBtn = document.getElementById("packing-editor-duplicate");
  editorImportBtn = document.getElementById("packing-editor-import");
  editorImportFile = document.getElementById("packing-editor-import-file");
  editorExportBtn = document.getElementById("packing-editor-export");

  editorAddBtn.addEventListener("click", addItem);
  editorDoneBtn.addEventListener("click", () => editorDlg.close());
  editorCloseBtn.addEventListener("click", () => editorDlg.close());
  editorDuplicateBtn.addEventListener("click", onDuplicateClick);
  editorImportBtn.addEventListener("click", () => editorImportFile.click());
  editorImportFile.addEventListener("change", onImportFile);
  editorExportBtn.addEventListener("click", exportList);
}

/**
 * Packlisten-Editor öffnen.
 * @param {Array} list         bisherige Einträge ({id, text, packed, unpacked, imageUrl})
 * @param {function} onChange  wird bei jeder Änderung mit der aktuellen Liste aufgerufen
 * @param {string} [cardTitle] Termin-Titel, für Dialog-Überschrift und Export-Dateiname
 * @param {function} [getDuplicateCandidates] () => Array<{title, packingList}> – andere
 *   Termine desselben Plans mit nicht-leerer Packliste, für "Übernehmen von…"
 */
export function openPackingEditor(list, onChange, cardTitle, getDuplicateCandidates) {
  editorItems = (list || []).map((item) => ({ ...item, imageUrl: item.imageUrl ?? null }));
  editorOnChange = onChange;
  editorGetDuplicateCandidates = getDuplicateCandidates || null;
  editorHeading.textContent = cardTitle ? `Packliste – ${cardTitle}` : "Packliste";
  editorFileBase = (cardTitle || "").replace(/[\\/:*?"<>|]+/g, "").trim() || "packliste";
  renderEditorList();
  editorDlg.showModal();
}

/** "Übernehmen von…": Menü mit anderen Terminen dieses Plans, die eine Packliste haben. */
function onDuplicateClick() {
  const candidates = (editorGetDuplicateCandidates ? editorGetDuplicateCandidates() : []) || [];
  if (candidates.length === 0) {
    showToast("Keine anderen Packlisten in diesem Plan vorhanden.", "info");
    return;
  }
  openMenu(
    editorDuplicateBtn,
    candidates.map((candidate) => ({
      label: candidate.title,
      onClick: () => appendItems(candidate.packingList, "übernommen"),
    }))
  );
}

/** Aktuelle Liste als JSON-Datei herunterladen (Vorlage zur Wiederverwendung). */
function exportList() {
  const data = {
    format: "veranstaltungszeitplaner-packliste",
    version: 1,
    items: editorItems.map((item) => ({ text: item.text })),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = editorFileBase + ".json";
  link.click();
  URL.revokeObjectURL(link.href);
}

/** Packliste aus einer zuvor exportierten JSON-Datei zur aktuellen Liste hinzufügen
 *  (nichts wird überschrieben, importierte Einträge starten immer unangehakt). */
async function onImportFile() {
  const file = editorImportFile.files && editorImportFile.files[0];
  editorImportFile.value = "";
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    showToast("Das ist keine gültige JSON-Datei.");
    return;
  }
  if (!data || !Array.isArray(data.items)) {
    showToast("Das ist keine gültige Packlisten-Datei (JSON-Export erwartet).");
    return;
  }
  appendItems(data.items, "importiert");
}

/** Einträge (aus einer Datei oder einer anderen Karte) an die aktuelle Liste anhängen –
 *  nichts wird überschrieben, übernommene Einträge starten immer unangehakt. Fremde
 *  Bild-URLs werden übernommen (dieselbe Upload-Datei, gültig auf demselben Server). */
function appendItems(rawItems, verb) {
  let added = 0;
  let skipped = 0;
  for (const raw of rawItems || []) {
    if (editorItems.length >= MAX_PACKING_ITEMS) {
      skipped++;
      continue;
    }
    const text = raw && typeof raw.text === "string" ? raw.text.trim() : "";
    if (!text || text.length > MAX_PACKING_ITEM_TEXT) {
      skipped++;
      continue;
    }
    editorItems.push({
      id: makeLocalId(),
      text,
      packed: false,
      unpacked: false,
      imageUrl: raw && typeof raw.imageUrl === "string" ? raw.imageUrl : null,
    });
    added++;
  }
  renderEditorList();

  if (added === 0) {
    showToast(`Keine gültigen Einträge zum Übernehmen gefunden.`);
  } else if (skipped > 0) {
    showToast(`${added} Einträge ${verb}, ${skipped} übersprungen.`, "info");
  } else {
    showToast(`${added} Einträge ${verb}.`, "success");
  }
}

function emitChange() {
  if (editorOnChange) editorOnChange(editorItems.map((item) => ({ ...item })));
}

function addItem() {
  const item = { id: makeLocalId(), text: "", packed: false, unpacked: false, imageUrl: null };
  editorItems.push(item);
  renderEditorList();
  const row = editorList.querySelector(`[data-id="${item.id}"]`);
  if (row) startEditRow(row, item);
}

function renderEditorList() {
  editorList.innerHTML = "";
  editorItems.forEach((item) => editorList.append(buildEditorRow(item)));
  editorExportBtn.disabled = editorItems.length === 0;
  emitChange();
}

function buildEditorRow(item) {
  const li = document.createElement("li");
  li.className = "packing-editor-row";
  li.draggable = true;
  li.dataset.id = item.id;

  const handle = document.createElement("span");
  handle.className = "packing-drag-handle";
  handle.title = "Ziehen zum Sortieren";
  handle.innerHTML = icons.dragHandle;
  li.append(handle);

  const photoInput = document.createElement("input");
  photoInput.type = "file";
  photoInput.accept = "image/jpeg,image/png,image/webp,image/gif";
  photoInput.hidden = true;
  photoInput.addEventListener("change", () => onPhotoPicked(item, photoInput));
  li.append(photoInput);

  if (item.imageUrl) {
    const thumbWrap = document.createElement("span");
    thumbWrap.className = "packing-editor-thumb-wrap";

    const thumb = document.createElement("img");
    thumb.className = "packing-editor-thumb";
    thumb.src = item.imageUrl;
    thumb.alt = "";
    thumbWrap.append(thumb);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "packing-editor-thumb-remove";
    removeBtn.title = "Foto entfernen";
    removeBtn.innerHTML = icons.close;
    removeBtn.addEventListener("click", () => {
      item.imageUrl = null;
      renderEditorList();
    });
    thumbWrap.append(removeBtn);

    li.append(thumbWrap);
  }

  const text = document.createElement("span");
  text.className = "packing-editor-text";
  text.textContent = item.text || "(ohne Titel)";
  li.append(text);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "packing-editor-input";
  input.maxLength = 200;
  input.hidden = true;
  li.append(input);

  const photoBtn = document.createElement("button");
  photoBtn.type = "button";
  photoBtn.className = "icon-btn";
  photoBtn.title = item.imageUrl ? "Foto ändern" : "Foto hinzufügen";
  photoBtn.innerHTML = icons.camera;
  photoBtn.addEventListener("click", () => photoInput.click());
  li.append(photoBtn);

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "icon-btn";
  editBtn.title = "Bearbeiten";
  editBtn.innerHTML = icons.edit;
  editBtn.addEventListener("click", () => startEditRow(li, item));
  li.append(editBtn);

  const delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "icon-btn";
  delBtn.title = "Löschen";
  delBtn.innerHTML = icons.trash;
  delBtn.addEventListener("click", () => {
    editorItems = editorItems.filter((i) => i.id !== item.id);
    renderEditorList();
  });
  li.append(delBtn);

  li.addEventListener("dragstart", (event) => {
    dragSrcId = item.id;
    li.classList.add("dragging");
    event.dataTransfer.effectAllowed = "move";
  });
  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
    dragSrcId = null;
  });
  li.addEventListener("dragover", (event) => {
    if (!dragSrcId || dragSrcId === item.id) return;
    event.preventDefault();
    const rect = li.getBoundingClientRect();
    const before = event.clientY - rect.top < rect.height / 2;
    li.classList.toggle("drop-before", before);
    li.classList.toggle("drop-after", !before);
  });
  li.addEventListener("dragleave", () => {
    li.classList.remove("drop-before", "drop-after");
  });
  li.addEventListener("drop", (event) => {
    event.preventDefault();
    const before = li.classList.contains("drop-before");
    li.classList.remove("drop-before", "drop-after");
    if (!dragSrcId || dragSrcId === item.id) return;
    reorderItems(dragSrcId, item.id, before);
  });

  return li;
}

/** Foto für einen Eintrag hochladen (sofort, wie beim Kartenbild im Termin-Dialog). */
async function onPhotoPicked(item, input) {
  const file = input.files && input.files[0];
  input.value = "";
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) {
    showToast("Das Bild ist größer als 5 MB.");
    return;
  }
  try {
    const result = await editorUploadImage(file);
    item.imageUrl = result.url;
    renderEditorList();
  } catch (err) {
    showToast(err.message || "Bild-Upload fehlgeschlagen.");
  }
}

function reorderItems(srcId, targetId, before) {
  const srcIndex = editorItems.findIndex((i) => i.id === srcId);
  if (srcIndex === -1) return;
  const [moved] = editorItems.splice(srcIndex, 1);
  let targetIndex = editorItems.findIndex((i) => i.id === targetId);
  if (targetIndex === -1) targetIndex = editorItems.length;
  editorItems.splice(before ? targetIndex : targetIndex + 1, 0, moved);
  renderEditorList();
}

/** Zeile in den Bearbeiten-Zustand versetzen (Text durch Eingabefeld ersetzen). */
function startEditRow(li, item) {
  const text = li.querySelector(".packing-editor-text");
  const input = li.querySelector(".packing-editor-input");
  text.hidden = true;
  input.hidden = false;
  input.value = item.text;
  input.focus();
  input.select();

  const commit = () => {
    input.removeEventListener("blur", commit);
    input.removeEventListener("keydown", onKey);
    const value = input.value.trim();
    if (!value) {
      editorItems = editorItems.filter((i) => i.id !== item.id);
    } else {
      item.text = value;
    }
    renderEditorList();
  };
  const onKey = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      input.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      input.removeEventListener("blur", commit);
      if (!item.text.trim()) {
        editorItems = editorItems.filter((i) => i.id !== item.id);
      }
      renderEditorList();
    }
  };
  input.addEventListener("blur", commit);
  input.addEventListener("keydown", onKey);
}

// ---- Abhak-Ansicht "Packen" (eingepackt/ausgepackt, beide Modi) ---------------------

let checkDlg, checkHeading, checkList, checkDoneBtn, checkCloseBtn;
let lightboxDlg, lightboxImage;

/** Abhak-Dialog (und die Foto-Großansicht) einmalig verdrahten. */
export function initPackingCheck() {
  checkDlg = document.getElementById("packing-check-dialog");
  checkHeading = document.getElementById("packing-check-heading");
  checkList = document.getElementById("packing-check-list");
  checkDoneBtn = document.getElementById("packing-check-done");
  checkCloseBtn = document.getElementById("packing-check-close");

  checkDoneBtn.addEventListener("click", () => checkDlg.close());
  checkCloseBtn.addEventListener("click", () => checkDlg.close());

  lightboxDlg = document.getElementById("photo-lightbox-dialog");
  lightboxImage = document.getElementById("photo-lightbox-image");
  // Kein eigener Schließen-Button nötig: Klick (auf Bild oder Rand) oder Escape schließen.
  lightboxDlg.addEventListener("click", () => lightboxDlg.close());
}

/** Foto in Großansicht öffnen (Klick auf die kleine Vorschau in der Abhak-Ansicht). */
function openPhotoLightbox(url) {
  lightboxImage.src = url;
  lightboxDlg.showModal();
}

/**
 * Abhak-Ansicht für eine Karte öffnen.
 * @param {object} card       Karte mit packingList
 * @param {function} onToggle async (itemId, patch) – patch ist {packed} oder {unpacked};
 *                             bei Ablehnung wird die Checkbox wieder zurückgesetzt
 */
export function openPackingCheck(card, onToggle) {
  checkHeading.textContent = `Packliste – ${card.title}`;
  checkList.innerHTML = "";
  (card.packingList || []).forEach((item) => {
    checkList.append(buildCheckRow(item, onToggle));
  });
  checkDlg.showModal();
}

function buildCheckRow(item, onToggle) {
  const li = document.createElement("li");
  li.className = "packing-check-row";

  // Foto + Text in einer Gruppe (kann bei wenig Platz schrumpfen/Text abschneiden) …
  const info = document.createElement("div");
  info.className = "packing-check-info";

  if (item.imageUrl) {
    const thumb = document.createElement("img");
    thumb.className = "packing-check-thumb";
    thumb.src = item.imageUrl;
    thumb.alt = "";
    thumb.title = "Foto vergrößern";
    thumb.tabIndex = 0;
    thumb.setAttribute("role", "button");
    thumb.setAttribute("aria-label", "Foto vergrößern");
    thumb.addEventListener("click", () => openPhotoLightbox(item.imageUrl));
    thumb.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPhotoLightbox(item.imageUrl);
      }
    });
    info.append(thumb);
  }

  const text = document.createElement("span");
  text.className = "packing-check-text";
  text.textContent = item.text;
  text.title = "Vollständigen Text anzeigen/verbergen";
  text.tabIndex = 0;
  text.setAttribute("role", "button");
  text.setAttribute("aria-label", "Vollständigen Text anzeigen/verbergen");
  const toggleExpanded = () => text.classList.toggle("expanded");
  text.addEventListener("click", toggleExpanded);
  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleExpanded();
    }
  });
  info.append(text);
  li.append(info);

  // … und beide Checkboxen als EINE Gruppe, die nie auseinanderreißt: bei wenig
  // Platz (schmales Fenster + Foto) wandert höchstens die ganze Gruppe in die
  // nächste Zeile, nie nur eine einzelne Checkbox.
  const options = document.createElement("div");
  options.className = "packing-check-options";
  options.append(buildCheckOption(item, "packed", "Eingepackt", onToggle));
  options.append(buildCheckOption(item, "unpacked", "Ausgepackt", onToggle));
  li.append(options);

  return li;
}

function buildCheckOption(item, field, labelText, onToggle) {
  const label = document.createElement("label");
  label.className = "packing-check-option";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(item[field]);
  input.addEventListener("change", async () => {
    const previous = item[field];
    item[field] = input.checked;
    input.disabled = true;
    try {
      await onToggle(item.id, { [field]: item[field] });
    } catch (err) {
      item[field] = previous;
      input.checked = previous;
      showToast(err.message || "Konnte nicht gespeichert werden.");
    } finally {
      input.disabled = false;
    }
  });

  label.append(input, document.createTextNode(" " + labelText));
  return label;
}
