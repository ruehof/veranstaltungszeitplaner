// Einstiegspunkt: Express-Server für den Veranstaltungszeitplaner.
// Wählt den Speicher (MongoDB, wenn MONGODB_URI gesetzt ist, sonst JSON-Datei-Store),
// bindet die API unter /api und liefert Uploads sowie das Frontend statisch aus.
import "dotenv/config";
import express from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { createStorage } from "./src/storage/storage.js";
import { createApiRouter } from "./src/routes/index.js";
import { HttpError } from "./src/lib/httpError.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const port = Number(process.env.PORT) || 3000;
const uploadDir = path.resolve(__dirname, process.env.UPLOAD_DIR || "uploads");
const dataDir = path.join(__dirname, "data");

// Upload-Ordner bei Bedarf anlegen
fs.mkdirSync(uploadDir, { recursive: true });

const storage = await createStorage({ dataDir });

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "1mb" }));

// API-Routen
app.use("/api", createApiRouter({ storage, uploadDir }));

// Unbekannte API-Routen einheitlich als JSON-404 beantworten
app.use("/api", (req, res) => {
  res.status(404).json({ error: "API-Route nicht gefunden." });
});

// Hochgeladene Bilder
app.use("/uploads", express.static(uploadDir));

// Statisches Frontend (Pfad relativ zu backend/server.js, siehe SPEC)
app.use(express.static(path.join(__dirname, "..", "frontend", "public")));

// Zentrale Fehler-Middleware: einheitliches Format { error: "..." }
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    const message =
      err.code === "LIMIT_FILE_SIZE"
        ? "Die Datei ist zu groß (maximal 5 MB)."
        : `Upload fehlgeschlagen (${err.code}).`;
    return res.status(400).json({ error: message });
  }
  if (err.type === "entity.too.large") {
    return res.status(413).json({ error: "Anfrage zu groß (maximal 1 MB)." });
  }
  if (err instanceof SyntaxError && "body" in err) {
    return res.status(400).json({ error: "Ungültiger JSON-Body." });
  }
  console.error(err);
  res.status(500).json({ error: "Interner Serverfehler." });
});

const server = app.listen(port, () => {
  console.log(
    `Veranstaltungszeitplaner-Backend läuft auf Port ${port} (Speicher: ${storage.kind}).`
  );
});

// Sauberes Herunterfahren (systemd sendet SIGTERM)
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(async () => {
      await storage.close();
      process.exit(0);
    });
  });
}
