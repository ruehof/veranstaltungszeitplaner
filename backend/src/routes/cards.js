import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { randomId } from "../lib/ids.js";
import { sanitizeCardInput, validateCardPosition } from "../lib/validate.js";
import { deleteUploadIfUnreferenced } from "../lib/uploadFiles.js";
import { requireEditToken } from "./auth.js";

// Routen für Terminkarten eines Plans.
export function createCardRoutes({ storage, uploadDir }) {
  const router = Router();
  const auth = requireEditToken(storage);

  // Karte im Plan nachschlagen; unbekannt oder falscher Plan ⇒ 404.
  async function getCardOr404(scheduleId, cardId) {
    const card = await storage.getCard(scheduleId, cardId);
    if (!card) {
      throw new HttpError(404, "Karte nicht gefunden.");
    }
    return card;
  }

  // POST /api/schedules/:id/cards – Karte anlegen. Antwort 201: vollständige Karte.
  router.post(
    "/schedules/:id/cards",
    auth,
    asyncHandler(async (req, res) => {
      const fields = sanitizeCardInput(req.body, { partial: false });
      validateCardPosition(req.schedule.settings, fields);
      const now = new Date().toISOString();
      const card = {
        id: randomId(12),
        scheduleId: req.schedule.id,
        ...fields,
        createdAt: now,
        updatedAt: now,
      };
      await storage.createCard(card);
      res.status(201).json(card);
    })
  );

  // PATCH /api/schedules/:id/cards/:cardId – Teilupdate (Position, Texte, muted, collapsed, …).
  router.patch(
    "/schedules/:id/cards/:cardId",
    auth,
    asyncHandler(async (req, res) => {
      const existing = await getCardOr404(req.schedule.id, req.params.cardId);
      const fields = sanitizeCardInput(req.body, { partial: true });
      // Raster-Regeln gegen den zusammengeführten Zustand prüfen
      validateCardPosition(req.schedule.settings, { ...existing, ...fields });
      fields.updatedAt = new Date().toISOString();
      const card = await storage.updateCard(req.schedule.id, existing.id, fields);
      // Wurde das Bild ersetzt oder entfernt, verwaiste Upload-Datei aufräumen
      if (fields.imageUrl !== undefined && existing.imageUrl && existing.imageUrl !== fields.imageUrl) {
        const cards = await storage.getCards(req.schedule.id);
        await deleteUploadIfUnreferenced(uploadDir, existing.imageUrl, cards);
      }
      res.json(card);
    })
  );

  // POST /api/schedules/:id/cards/:cardId/duplicate – Karte duplizieren
  // (gleiche Position, Titel + " (Kopie)"). Antwort 201: neue Karte.
  router.post(
    "/schedules/:id/cards/:cardId/duplicate",
    auth,
    asyncHandler(async (req, res) => {
      const original = await getCardOr404(req.schedule.id, req.params.cardId);
      const now = new Date().toISOString();
      const copy = {
        ...original,
        id: randomId(12),
        title: `${original.title} (Kopie)`,
        createdAt: now,
        updatedAt: now,
      };
      await storage.createCard(copy);
      res.status(201).json(copy);
    })
  );

  // DELETE /api/schedules/:id/cards/:cardId – Karte löschen. Antwort 204.
  // Das Upload-Bild wird mit gelöscht, sofern keine andere Karte des Plans es referenziert.
  router.delete(
    "/schedules/:id/cards/:cardId",
    auth,
    asyncHandler(async (req, res) => {
      const card = await getCardOr404(req.schedule.id, req.params.cardId);
      await storage.deleteCard(req.schedule.id, card.id);
      if (card.imageUrl) {
        const remaining = await storage.getCards(req.schedule.id);
        await deleteUploadIfUnreferenced(uploadDir, card.imageUrl, remaining);
      }
      res.status(204).end();
    })
  );

  return router;
}
