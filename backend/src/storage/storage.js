// Gemeinsame Storage-Schnittstelle des Veranstaltungszeitplaners.
//
// Beide Implementierungen (mongo.js und jsonfile.js) stellen dieselben Methoden bereit:
//
//   createSchedule(schedule)                 → Schedule
//   getScheduleById(id)                      → Schedule | null
//   getScheduleByShareId(shareId)            → Schedule | null
//   updateSchedule(id, updates)              → aktualisiertes Schedule | null
//   deleteSchedule(id)                       → löscht Plan + alle zugehörigen Karten
//   createCard(card)                         → Card
//   getCards(scheduleId)                     → Card[]
//   getCard(scheduleId, cardId)              → Card | null
//   updateCard(scheduleId, cardId, updates)  → aktualisierte Card | null
//   deleteCard(scheduleId, cardId)
//   close()                                  → Verbindung schließen / Schreibvorgänge abwarten
//
// Zusätzlich trägt jede Instanz das Feld `kind` ("mongodb" | "jsonfile") für Log-Ausgaben.
import path from "node:path";
import { createMongoStorage } from "./mongo.js";
import { createJsonFileStorage } from "./jsonfile.js";

// Wählt die Implementierung: MongoDB, wenn MONGODB_URI gesetzt ist,
// sonst der JSON-Datei-Store unter backend/data/db.json (SPEC).
export async function createStorage({ dataDir }) {
  const mongoUri = process.env.MONGODB_URI;
  if (mongoUri && mongoUri.trim() !== "") {
    return createMongoStorage(mongoUri);
  }
  return createJsonFileStorage(path.join(dataDir, "db.json"));
}
