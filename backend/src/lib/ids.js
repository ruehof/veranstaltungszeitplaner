import crypto from "node:crypto";

// Erzeugt eine URL-sichere Zufalls-ID (crypto.randomBytes → base64url)
// mit der gewünschten Zeichenlänge (SPEC: IDs 12 Zeichen, editToken 24 Zeichen).
export function randomId(length = 12) {
  const bytes = Math.ceil((length * 3) / 4);
  return crypto.randomBytes(bytes).toString("base64url").slice(0, length);
}
