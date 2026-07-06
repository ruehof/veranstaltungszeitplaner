import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { randomId } from "../lib/ids.js";
import { validateSettings } from "../lib/validate.js";
import { deleteUploadFile } from "../lib/uploadFiles.js";
import { requireEditToken } from "./auth.js";

// Routen für Wochenpläne (Schedules) inkl. Nur-Lese-Freigabe (/share/:shareId).
export function createScheduleRoutes({ storage, uploadDir }) {
  const router = Router();
  const auth = requireEditToken(storage);

  // POST /api/schedules – Plan anlegen (ohne Auth). Antwort 201 inkl. editToken.
  router.post(
    "/schedules",
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      if (typeof body.title !== "string" || body.title.trim() === "") {
        throw new HttpError(400, "title ist erforderlich und muss ein nicht-leerer Text sein.");
      }
      const now = new Date().toISOString();
      const schedule = {
        id: randomId(12),
        title: body.title.trim(),
        editToken: randomId(24),
        shareId: randomId(12),
        settings: validateSettings(body.settings),
        createdAt: now,
        updatedAt: now,
      };
      await storage.createSchedule(schedule);
      res.status(201).json(schedule);
    })
  );

  // GET /api/schedules/:id – Plan + Karten (Bearbeitungsmodus, editToken enthalten).
  router.get(
    "/schedules/:id",
    auth,
    asyncHandler(async (req, res) => {
      const cards = await storage.getCards(req.schedule.id);
      res.json({ schedule: req.schedule, cards });
    })
  );

  // GET /api/share/:shareId – Nur-Lese-Zugriff über den Freigabelink, OHNE editToken.
  router.get(
    "/share/:shareId",
    asyncHandler(async (req, res) => {
      const schedule = await storage.getScheduleByShareId(req.params.shareId);
      if (!schedule) {
        throw new HttpError(404, "Freigabelink nicht gefunden.");
      }
      const cards = await storage.getCards(schedule.id);
      const { editToken, ...publicSchedule } = schedule;
      res.json({ schedule: publicSchedule, cards });
    })
  );

  // PATCH /api/schedules/:id – Titel und/oder Settings ändern.
  router.patch(
    "/schedules/:id",
    auth,
    asyncHandler(async (req, res) => {
      const body = req.body ?? {};
      const updates = {};
      if (body.title !== undefined) {
        if (typeof body.title !== "string" || body.title.trim() === "") {
          throw new HttpError(400, "title muss ein nicht-leerer Text sein.");
        }
        updates.title = body.title.trim();
      }
      if (body.settings !== undefined) {
        updates.settings = validateSettings(body.settings);
      }
      updates.updatedAt = new Date().toISOString();
      const schedule = await storage.updateSchedule(req.schedule.id, updates);
      res.json(schedule);
    })
  );

  // DELETE /api/schedules/:id – Plan, alle Karten und deren Upload-Bilder löschen. Antwort 204.
  router.delete(
    "/schedules/:id",
    auth,
    asyncHandler(async (req, res) => {
      const cards = await storage.getCards(req.schedule.id);
      const imageUrls = new Set(cards.map((c) => c.imageUrl).filter(Boolean));
      for (const imageUrl of imageUrls) {
        await deleteUploadFile(uploadDir, imageUrl);
      }
      await storage.deleteSchedule(req.schedule.id);
      res.status(204).end();
    })
  );

  return router;
}
