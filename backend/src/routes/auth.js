import { HttpError } from "../lib/httpError.js";

// Middleware: lädt den Plan (:id) und prüft das Bearbeitungs-Token aus dem Header X-Edit-Token.
// Unbekannter Plan ⇒ 404, fehlendes/falsches Token ⇒ 403 (SPEC).
// Bei Erfolg steht der Plan als req.schedule bereit.
export function requireEditToken(storage) {
  return async (req, res, next) => {
    try {
      const schedule = await storage.getScheduleById(req.params.id);
      if (!schedule) {
        throw new HttpError(404, "Plan nicht gefunden.");
      }
      const token = req.get("X-Edit-Token");
      if (!token || token !== schedule.editToken) {
        throw new HttpError(403, "Fehlendes oder ungültiges Bearbeitungs-Token.");
      }
      req.schedule = schedule;
      next();
    } catch (err) {
      next(err);
    }
  };
}
