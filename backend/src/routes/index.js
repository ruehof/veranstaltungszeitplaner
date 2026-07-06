import { Router } from "express";
import { createScheduleRoutes } from "./schedules.js";
import { createCardRoutes } from "./cards.js";
import { createUploadRoutes } from "./uploads.js";

// Bündelt alle API-Routen (werden in server.js unter /api eingehängt).
export function createApiRouter({ storage, uploadDir }) {
  const router = Router();
  router.use(createScheduleRoutes({ storage, uploadDir }));
  router.use(createCardRoutes({ storage, uploadDir }));
  router.use(createUploadRoutes({ storage, uploadDir }));
  return router;
}
