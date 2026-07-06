import { Router } from "express";
import multer from "multer";
import { HttpError } from "../lib/httpError.js";
import { randomId } from "../lib/ids.js";
import { requireEditToken } from "./auth.js";

// Erlaubte Bildtypen mit zugehöriger Dateiendung (SPEC: jpg/png/webp/gif, max. 5 MB)
const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

// Upload-Route für Kartenbilder.
export function createUploadRoutes({ storage, uploadDir }) {
  const router = Router();
  const auth = requireEditToken(storage);

  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        // Zufälliger Dateiname; Endung anhand des MIME-Typs
        cb(null, randomId(16) + ALLOWED_TYPES[file.mimetype]);
      },
    }),
    limits: { fileSize: MAX_FILE_SIZE },
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_TYPES[file.mimetype]) {
        return cb(new HttpError(400, "Nur Bilder im Format JPG, PNG, WebP oder GIF sind erlaubt."));
      }
      cb(null, true);
    },
  });

  // POST /api/schedules/:id/uploads – multipart/form-data, Feld "image". Antwort 201: {url}.
  router.post("/schedules/:id/uploads", auth, upload.single("image"), (req, res) => {
    if (!req.file) {
      throw new HttpError(400, 'Es wurde keine Datei im Feld "image" übermittelt.');
    }
    res.status(201).json({ url: `/uploads/${req.file.filename}` });
  });

  return router;
}
