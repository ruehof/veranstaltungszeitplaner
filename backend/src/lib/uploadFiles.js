import fs from "node:fs";
import path from "node:path";

// Löscht die Datei zu einer uploads/-URL aus dem Upload-Ordner (mit oder ohne
// führenden Schrägstrich – ältere Datensätze können noch die absolute Form haben).
// Fremde URLs (nicht uploads/) und bereits fehlende Dateien werden ignoriert.
export async function deleteUploadFile(uploadDir, imageUrl) {
  if (typeof imageUrl !== "string") return;
  if (!imageUrl.startsWith("uploads/") && !imageUrl.startsWith("/uploads/")) return;
  const fileName = path.basename(imageUrl); // verhindert Pfad-Ausbrüche (../)
  try {
    await fs.promises.unlink(path.join(uploadDir, fileName));
  } catch {
    // Datei existiert nicht (mehr) – kein Fehler
  }
}

// Löscht die Upload-Datei nur, wenn keine der übergebenen Karten dieselbe imageUrl referenziert.
export async function deleteUploadIfUnreferenced(uploadDir, imageUrl, remainingCards) {
  if (!imageUrl) return;
  const stillUsed = remainingCards.some((card) => card.imageUrl === imageUrl);
  if (!stillUsed) {
    await deleteUploadFile(uploadDir, imageUrl);
  }
}
