import fs from "node:fs";
import path from "node:path";

// JSON-Datei-Store für die lokale Entwicklung ohne MongoDB.
// Hält alle Daten im Speicher und schreibt jede Änderung atomar
// (temporäre Datei + rename) in die Datei backend/data/db.json.
export async function createJsonFileStorage(filePath) {
  let data = { schedules: [], cards: [] };

  // Vorhandenen Datenbestand laden (falls die Datei existiert und lesbar ist)
  try {
    const raw = await fs.promises.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    data = {
      schedules: Array.isArray(parsed.schedules) ? parsed.schedules : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards : [],
    };
  } catch {
    // Datei fehlt oder ist unlesbar – mit leerem Datenbestand starten
  }

  // Schreibvorgänge serialisieren, damit sich parallele Requests nicht überholen
  let writeChain = Promise.resolve();
  function persist() {
    writeChain = writeChain.then(async () => {
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
      const tmpPath = `${filePath}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf8");
      await fs.promises.rename(tmpPath, filePath); // atomarer Tausch
    });
    return writeChain;
  }

  // Kopien zurückgeben, damit Aufrufer den internen Zustand nicht mutieren können
  const clone = (value) => (value == null ? null : structuredClone(value));

  return {
    kind: "jsonfile",

    async createSchedule(schedule) {
      data.schedules.push(clone(schedule));
      await persist();
      return clone(schedule);
    },

    async getScheduleById(id) {
      return clone(data.schedules.find((s) => s.id === id) ?? null);
    },

    async getScheduleByShareId(shareId) {
      return clone(data.schedules.find((s) => s.shareId === shareId) ?? null);
    },

    async updateSchedule(id, updates) {
      const schedule = data.schedules.find((s) => s.id === id);
      if (!schedule) return null;
      Object.assign(schedule, clone(updates));
      await persist();
      return clone(schedule);
    },

    async deleteSchedule(id) {
      data.schedules = data.schedules.filter((s) => s.id !== id);
      data.cards = data.cards.filter((c) => c.scheduleId !== id);
      await persist();
    },

    async createCard(card) {
      data.cards.push(clone(card));
      await persist();
      return clone(card);
    },

    async getCards(scheduleId) {
      return data.cards.filter((c) => c.scheduleId === scheduleId).map(clone);
    },

    async getCard(scheduleId, cardId) {
      return clone(
        data.cards.find((c) => c.scheduleId === scheduleId && c.id === cardId) ?? null
      );
    },

    async updateCard(scheduleId, cardId, updates) {
      const card = data.cards.find((c) => c.scheduleId === scheduleId && c.id === cardId);
      if (!card) return null;
      Object.assign(card, clone(updates));
      await persist();
      return clone(card);
    },

    async deleteCard(scheduleId, cardId) {
      data.cards = data.cards.filter((c) => !(c.scheduleId === scheduleId && c.id === cardId));
      await persist();
    },

    async close() {
      // Laufende Schreibvorgänge zu Ende bringen
      await writeChain;
    },
  };
}
