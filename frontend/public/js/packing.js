// packing.js – Packliste einer Terminkarte: Editor (Bearbeitungsmodus, add/rename/
// löschen/sortieren) und Abhak-Ansicht "Packen" (eingepackt/ausgepackt, in beiden Modi).

import { icons } from "./icons.js";
import { showToast } from "./toast.js";

/** Zufällige, rein clientseitige id für neue Einträge (der Server vergibt beim
 *  Speichern ohnehin eine eigene id – diese dient nur als React-freier DOM-Key). */
function makeLocalId() {
  return "p" + Math.random().toString(36).slice(2, 10);
}

// ---- Editor (nur Bearbeitungsmodus, Teil des Termin-Dialogs) ------------------------

let editorDlg, editorList, editorAddBtn, editorDoneBtn, editorCloseBtn;
let editorItems = [];
let editorOnChange = null;
let dragSrcId = null;

/** Editor-Dialog einmalig verdrahten. */
export function initPackingEditor() {
  editorDlg = document.getElementById("packing-editor-dialog");
  editorList = document.getElementById("packing-editor-list");
  editorAddBtn = document.getElementById("packing-editor-add");
  editorDoneBtn = document.getElementById("packing-editor-done");
  editorCloseBtn = document.getElementById("packing-editor-close");

  editorAddBtn.addEventListener("click", addItem);
  editorDoneBtn.addEventListener("click", () => editorDlg.close());
  editorCloseBtn.addEventListener("click", () => editorDlg.close());
}

/**
 * Packlisten-Editor öffnen.
 * @param {Array} list        bisherige Einträge ({id, text, packed, unpacked})
 * @param {function} onChange wird bei jeder Änderung mit der aktuellen Liste aufgerufen
 */
export function openPackingEditor(list, onChange) {
  editorItems = (list || []).map((item) => ({ ...item }));
  editorOnChange = onChange;
  renderEditorList();
  editorDlg.showModal();
}

function emitChange() {
  if (editorOnChange) editorOnChange(editorItems.map((item) => ({ ...item })));
}

function addItem() {
  const item = { id: makeLocalId(), text: "", packed: false, unpacked: false };
  editorItems.push(item);
  renderEditorList();
  const row = editorList.querySelector(`[data-id="${item.id}"]`);
  if (row) startEditRow(row, item);
}

function renderEditorList() {
  editorList.innerHTML = "";
  editorItems.forEach((item) => editorList.append(buildEditorRow(item)));
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

/** Abhak-Dialog einmalig verdrahten. */
export function initPackingCheck() {
  checkDlg = document.getElementById("packing-check-dialog");
  checkHeading = document.getElementById("packing-check-heading");
  checkList = document.getElementById("packing-check-list");
  checkDoneBtn = document.getElementById("packing-check-done");
  checkCloseBtn = document.getElementById("packing-check-close");

  checkDoneBtn.addEventListener("click", () => checkDlg.close());
  checkCloseBtn.addEventListener("click", () => checkDlg.close());
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

  const text = document.createElement("span");
  text.className = "packing-check-text";
  text.textContent = item.text;
  li.append(text);

  li.append(buildCheckOption(item, "packed", "Eingepackt", onToggle));
  li.append(buildCheckOption(item, "unpacked", "Ausgepackt", onToggle));

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
