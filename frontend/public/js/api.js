// api.js – dünner Wrapper um fetch() für den API-Vertrag aus SPEC.md.
// Pfade OHNE führenden Schrägstrich (z. B. "api/schedules", nicht "/api/schedules"):
// so lösen Browser sie relativ zur aktuellen Seite auf und die App funktioniert
// unverändert, egal ob sie am Domain-Root oder unter einem Pfad-Präfix läuft
// (z. B. hinter einem Reverse Proxy wie sportinstitut.uni-wuppertal.de/wochenplaner/).

let editToken = null;

/** Edit-Token für alle folgenden Anfragen setzen (Header X-Edit-Token). */
export function setEditToken(token) {
  editToken = token;
}

/** Interner Request-Helfer: JSON rein/raus, Fehler als Error mit Meldung. */
async function request(path, { method = "GET", body = null, isForm = false } = {}) {
  const headers = {};
  if (editToken) headers["X-Edit-Token"] = editToken;
  if (body && !isForm) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: isForm ? body : body ? JSON.stringify(body) : undefined,
    });
  } catch {
    // Netzwerkfehler (Server nicht erreichbar o. Ä.)
    throw new Error("Server nicht erreichbar. Bitte später erneut versuchen.");
  }

  if (response.status === 204) return null;

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message = data && data.error ? data.error : `Fehler ${response.status}`;
    throw new Error(message);
  }
  return data;
}

export const api = {
  /** Plan anlegen. Antwort: vollständiges Schedule inkl. editToken. */
  createSchedule: (payload) => request("api/schedules", { method: "POST", body: payload }),

  /** Plan + Karten laden (Bearbeitungsmodus, Token nötig). */
  getSchedule: (id) => request(`api/schedules/${encodeURIComponent(id)}`),

  /** Plan + Karten über den Nur-Lese-Freigabelink laden. */
  getShared: (shareId) => request(`api/share/${encodeURIComponent(shareId)}`),

  /** Titel/Settings eines Plans ändern. */
  patchSchedule: (id, patch) =>
    request(`api/schedules/${encodeURIComponent(id)}`, { method: "PATCH", body: patch }),

  /** Plan löschen. */
  deleteSchedule: (id) =>
    request(`api/schedules/${encodeURIComponent(id)}`, { method: "DELETE" }),

  /** Karte anlegen. */
  createCard: (scheduleId, card) =>
    request(`api/schedules/${encodeURIComponent(scheduleId)}/cards`, { method: "POST", body: card }),

  /** Karte teilweise aktualisieren (Position, Text, muted, collapsed, …). */
  patchCard: (scheduleId, cardId, patch) =>
    request(`api/schedules/${encodeURIComponent(scheduleId)}/cards/${encodeURIComponent(cardId)}`, {
      method: "PATCH",
      body: patch,
    }),

  /** Karte duplizieren. */
  duplicateCard: (scheduleId, cardId) =>
    request(
      `api/schedules/${encodeURIComponent(scheduleId)}/cards/${encodeURIComponent(cardId)}/duplicate`,
      { method: "POST" }
    ),

  /** Karte löschen. */
  deleteCard: (scheduleId, cardId) =>
    request(`api/schedules/${encodeURIComponent(scheduleId)}/cards/${encodeURIComponent(cardId)}`, {
      method: "DELETE",
    }),

  /** Bild hochladen (multipart/form-data, Feld "image"). Antwort: {url}. */
  uploadImage: (scheduleId, file) => {
    const formData = new FormData();
    formData.append("image", file);
    return request(`api/schedules/${encodeURIComponent(scheduleId)}/uploads`, {
      method: "POST",
      body: formData,
      isForm: true,
    });
  },
};
