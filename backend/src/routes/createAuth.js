// Optionaler Passwortschutz fürs Anlegen neuer Pläne (Startseite + POST /api/schedules).
// Schützt NICHT bestehende Pläne – Bearbeitungs- und Freigabelinks funktionieren
// unabhängig davon weiter, damit eingeladene Personen nicht zusätzlich ein
// Server-Passwort brauchen. Nur wer NEUE Pläne anlegen bzw. die Startseite sehen
// will, muss sich damit ausweisen (HTTP Basic Auth, Nutzername wird ignoriert).
export function createCreateAuthMiddleware(password) {
  return (req, res, next) => {
    if (!password) return next(); // Funktion ist aus, solange CREATE_PASSWORD nicht gesetzt ist
    if (hasValidPassword(req.get("Authorization"), password)) return next();
    res.set("WWW-Authenticate", 'Basic realm="Veranstaltungszeitplaner"');
    res.status(401).send("Passwort erforderlich, um neue Pläne anzulegen.");
  };
}

function hasValidPassword(authorizationHeader, password) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Basic ")) return false;
  let decoded;
  try {
    decoded = Buffer.from(authorizationHeader.slice(6), "base64").toString("utf8");
  } catch {
    return false;
  }
  // "Nutzername:Passwort" – der Nutzername wird nicht geprüft, nur das Passwort.
  const separatorIndex = decoded.indexOf(":");
  const providedPassword = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
  return providedPassword === password;
}
