// dragdrop.js – Verschieben und Größenändern von Karten mit Pointer Events.
// Geist-Vorschau rastet am 15-Minuten-Raster und an Tagesspalten ein.

import { snap15, clamp, formatRange } from "./util.js";
import { getPxPerMinute } from "./grid.js";

const DRAG_THRESHOLD_PX = 5; // ab hier gilt die Geste als Drag, nicht als Klick

/**
 * Drag & Drop + Resize im Grid-Container aktivieren (einmalig, delegiert).
 * @param {HTMLElement} container  Scroll-Container, der das Grid enthält
 * @param {object} ctx  {
 *   isReadOnly(): boolean,
 *   getSchedule(): object,
 *   getCard(id): object|undefined,
 *   onMove(card, day, startMinutes): void,      // Commit nach Drag
 *   onResize(card, durationMinutes): void       // Commit nach Resize
 * }
 */
export function initDragDrop(container, ctx) {
  container.addEventListener("pointerdown", (event) => {
    if (ctx.isReadOnly()) return;
    if (event.button !== 0) return;

    const cardEl = event.target.closest(".card");
    if (!cardEl) return;

    if (event.target.closest(".card-resize")) {
      startResize(event, cardEl);
      return;
    }
    // Buttons, Menü etc. nicht als Drag-Griff verwenden
    if (event.target.closest("button, a, input, textarea, select")) return;
    startMove(event, cardEl);
  });

  /** Tagesspalte unter der X-Position finden (auf gültigen Bereich geklemmt). */
  function columnAt(clientX) {
    const cols = Array.from(container.querySelectorAll(".day-col"));
    if (cols.length === 0) return null;
    let index = cols.findIndex((col) => {
      const rect = col.getBoundingClientRect();
      return clientX >= rect.left && clientX < rect.right;
    });
    if (index === -1) {
      index = clientX < cols[0].getBoundingClientRect().left ? 0 : cols.length - 1;
    }
    return { col: cols[index], index };
  }

  /** Karte verschieben (Tag + Startzeit). */
  function startMove(downEvent, cardEl) {
    const card = ctx.getCard(cardEl.dataset.cardId);
    if (!card) return;
    const schedule = ctx.getSchedule();
    const { startHour, endHour } = schedule.settings;
    const pxPerMin = getPxPerMinute();

    const cardRect = cardEl.getBoundingClientRect();
    const grabOffsetY = downEvent.clientY - cardRect.top;

    let dragging = false;
    let ghost = null;
    let target = { day: card.day, startMinutes: card.startMinutes };

    // Pointer einfangen, damit die Karte auch außerhalb des Elements weiterverfolgt wird.
    // Defensiv: kann werfen, wenn der Pointer nicht (mehr) aktiv ist.
    try {
      cardEl.setPointerCapture(downEvent.pointerId);
    } catch {
      /* Drag funktioniert dank direkter Listener trotzdem */
    }

    const onPointerMove = (moveEvent) => {
      const dx = moveEvent.clientX - downEvent.clientX;
      const dy = moveEvent.clientY - downEvent.clientY;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

      if (!dragging) {
        dragging = true;
        cardEl.classList.add("dragging");
        ghost = document.createElement("div");
        ghost.className = "card-ghost";
      }

      const hit = columnAt(moveEvent.clientX);
      if (!hit) return;
      const colRect = hit.col.getBoundingClientRect();

      // Oberkante der Karte relativ zur Spalte, dann am 15-min-Raster einrasten
      const topPx = moveEvent.clientY - colRect.top - grabOffsetY;
      let minutes = startHour * 60 + snap15(topPx / pxPerMin);
      minutes = clamp(minutes, startHour * 60, endHour * 60 - card.durationMinutes);

      target = { day: hit.index, startMinutes: minutes };

      if (ghost.parentElement !== hit.col) hit.col.append(ghost);
      ghost.style.top = (minutes - startHour * 60) * pxPerMin + "px";
      ghost.style.height = card.durationMinutes * pxPerMin + "px";
      ghost.textContent = formatRange(minutes, card.durationMinutes);
      moveEvent.preventDefault();
    };

    const finish = (commit) => {
      cardEl.removeEventListener("pointermove", onPointerMove);
      cardEl.removeEventListener("pointerup", onPointerUp);
      cardEl.removeEventListener("pointercancel", onPointerCancel);
      cardEl.classList.remove("dragging");
      if (ghost) ghost.remove();
      if (
        commit &&
        dragging &&
        (target.day !== card.day || target.startMinutes !== card.startMinutes)
      ) {
        ctx.onMove(card, target.day, target.startMinutes);
      }
    };

    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);

    cardEl.addEventListener("pointermove", onPointerMove);
    cardEl.addEventListener("pointerup", onPointerUp);
    cardEl.addEventListener("pointercancel", onPointerCancel);
  }

  /** Dauer über den Griff am unteren Rand ändern. */
  function startResize(downEvent, cardEl) {
    const card = ctx.getCard(cardEl.dataset.cardId);
    if (!card) return;
    const schedule = ctx.getSchedule();
    const { endHour } = schedule.settings;
    const pxPerMin = getPxPerMinute();
    const handle = downEvent.target.closest(".card-resize");

    const originalDuration = card.durationMinutes;
    const maxDuration = endHour * 60 - card.startMinutes;
    let newDuration = originalDuration;

    downEvent.preventDefault();
    try {
      handle.setPointerCapture(downEvent.pointerId);
    } catch {
      /* siehe startMove – Resize funktioniert auch ohne Capture */
    }
    cardEl.classList.add("resizing");

    const timeEl = cardEl.querySelector(".card-time");

    const onPointerMove = (moveEvent) => {
      const dyMinutes = (moveEvent.clientY - downEvent.clientY) / pxPerMin;
      newDuration = clamp(snap15(originalDuration + dyMinutes), 15, maxDuration);
      cardEl.style.height = newDuration * pxPerMin + "px";
      if (timeEl) timeEl.textContent = formatRange(card.startMinutes, newDuration);
      moveEvent.preventDefault();
    };

    const finish = (commit) => {
      handle.removeEventListener("pointermove", onPointerMove);
      handle.removeEventListener("pointerup", onPointerUp);
      handle.removeEventListener("pointercancel", onPointerCancel);
      cardEl.classList.remove("resizing");
      if (commit && newDuration !== originalDuration) {
        ctx.onResize(card, newDuration);
      } else {
        // Zurücksetzen (Anzeige), Daten wurden nicht geändert
        cardEl.style.height = originalDuration * pxPerMin + "px";
        if (timeEl) timeEl.textContent = formatRange(card.startMinutes, originalDuration);
      }
    };

    const onPointerUp = () => finish(true);
    const onPointerCancel = () => finish(false);

    handle.addEventListener("pointermove", onPointerMove);
    handle.addEventListener("pointerup", onPointerUp);
    handle.addEventListener("pointercancel", onPointerCancel);
  }
}
