import { Router } from "express";
import { HttpError } from "../lib/httpError.js";
import { asyncHandler } from "../lib/asyncHandler.js";

// Route zum Abhaken der Packliste über den Nur-Lese-Freigabelink (OHNE editToken):
// Wer den Link kennt, darf für vorhandene Einträge NUR "packed"/"unpacked" setzen –
// Text, Reihenfolge, neue/gelöschte Einträge und alle anderen Kartenfelder bleiben
// dieser Route verwehrt (die volle Packlisten-Bearbeitung läuft weiterhin über die
// normale, editToken-geschützte Karten-PATCH-Route).
export function createPackingRoutes({ storage }) {
  const router = Router();

  router.patch(
    "/share/:shareId/cards/:cardId/packing",
    asyncHandler(async (req, res) => {
      const schedule = await storage.getScheduleByShareId(req.params.shareId);
      if (!schedule) {
        throw new HttpError(404, "Freigabelink nicht gefunden.");
      }
      const card = await storage.getCard(schedule.id, req.params.cardId);
      if (!card) {
        throw new HttpError(404, "Karte nicht gefunden.");
      }
      const items = req.body?.items;
      if (!Array.isArray(items)) {
        throw new HttpError(400, "items muss eine Liste sein.");
      }
      const updatesById = new Map(
        items.filter((entry) => entry && typeof entry.id === "string").map((entry) => [entry.id, entry])
      );
      const packingList = (card.packingList ?? []).map((item) => {
        const update = updatesById.get(item.id);
        if (!update) return item;
        return {
          ...item,
          packed: typeof update.packed === "boolean" ? update.packed : item.packed,
          unpacked: typeof update.unpacked === "boolean" ? update.unpacked : item.unpacked,
        };
      });
      const updated = await storage.updateCard(schedule.id, card.id, {
        packingList,
        updatedAt: new Date().toISOString(),
      });
      res.json({ packingList: updated.packingList });
    })
  );

  return router;
}
