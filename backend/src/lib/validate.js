import { HttpError } from "./httpError.js";

// Standard-Einstellungen laut SPEC.md
export const DEFAULT_SETTINGS = Object.freeze({
  startHour: 6,
  endHour: 20,
  days: Object.freeze(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]),
  startDate: null,
  popupEnabled: false,
  popupText: "",
  backgroundImage: null,
});

// Obergrenze für den Popup-Erläuterungstext
export const MAX_POPUP_TEXT = 5000;

// Obergrenze für die Anzahl Tagesspalten (z. B. Datumsbereich von–bis)
export const MAX_DAYS = 31;

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// "YYYY-MM-DD" mit echtem Kalender-Check (Date normalisiert z. B. den 32. still).
function isValidIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T00:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Prüft und normalisiert die Plan-Einstellungen; fehlende Felder werden mit Defaults gefüllt.
export function validateSettings(input) {
  if (input === undefined || input === null) {
    return { ...DEFAULT_SETTINGS, days: [...DEFAULT_SETTINGS.days] };
  }
  if (!isPlainObject(input)) {
    throw new HttpError(400, "settings muss ein Objekt sein.");
  }
  const startHour = input.startHour ?? DEFAULT_SETTINGS.startHour;
  const endHour = input.endHour ?? DEFAULT_SETTINGS.endHour;
  const days = input.days ?? [...DEFAULT_SETTINGS.days];
  const startDate = input.startDate ?? DEFAULT_SETTINGS.startDate;
  const popupEnabled = input.popupEnabled ?? DEFAULT_SETTINGS.popupEnabled;
  const popupText = input.popupText ?? DEFAULT_SETTINGS.popupText;
  const backgroundImage = input.backgroundImage ?? DEFAULT_SETTINGS.backgroundImage;

  if (!Number.isInteger(startHour) || startHour < 0 || startHour > 23) {
    throw new HttpError(400, "settings.startHour muss eine ganze Zahl zwischen 0 und 23 sein.");
  }
  if (!Number.isInteger(endHour) || endHour < 1 || endHour > 24) {
    throw new HttpError(400, "settings.endHour muss eine ganze Zahl zwischen 1 und 24 sein.");
  }
  if (startHour >= endHour) {
    throw new HttpError(400, "settings.startHour muss kleiner als settings.endHour sein.");
  }
  if (
    !Array.isArray(days) ||
    days.length === 0 ||
    !days.every((d) => typeof d === "string" && d.trim() !== "")
  ) {
    throw new HttpError(400, "settings.days muss eine nicht-leere Liste von Tagesnamen sein.");
  }
  if (days.length > MAX_DAYS) {
    throw new HttpError(400, `settings.days darf höchstens ${MAX_DAYS} Tage enthalten.`);
  }
  if (startDate !== null && !isValidIsoDate(startDate)) {
    throw new HttpError(400, "settings.startDate muss null oder ein Datum im Format JJJJ-MM-TT sein.");
  }
  if (typeof popupEnabled !== "boolean") {
    throw new HttpError(400, "settings.popupEnabled muss true oder false sein.");
  }
  if (typeof popupText !== "string" || popupText.length > MAX_POPUP_TEXT) {
    throw new HttpError(400, `settings.popupText muss ein Text mit höchstens ${MAX_POPUP_TEXT} Zeichen sein.`);
  }
  if (backgroundImage !== null && typeof backgroundImage !== "string") {
    throw new HttpError(400, "settings.backgroundImage muss ein Text (URL) oder null sein.");
  }
  return { startHour, endHour, days: [...days], startDate, popupEnabled, popupText, backgroundImage };
}

// Prüft die 15-Minuten-Raster-Regeln einer Karte gegen die Plan-Einstellungen.
// Der Server rundet nicht selbst – ungültige Werte führen zu HTTP 400 (SPEC).
export function validateCardPosition(settings, { day, startMinutes, durationMinutes }) {
  if (!Number.isInteger(day) || day < 0 || day >= settings.days.length) {
    throw new HttpError(
      400,
      `day muss eine ganze Zahl zwischen 0 und ${settings.days.length - 1} sein.`
    );
  }
  if (!Number.isInteger(startMinutes) || startMinutes % 15 !== 0) {
    throw new HttpError(400, "startMinutes muss eine ganze Zahl und ein Vielfaches von 15 sein.");
  }
  if (!Number.isInteger(durationMinutes) || durationMinutes % 15 !== 0 || durationMinutes < 15) {
    throw new HttpError(
      400,
      "durationMinutes muss ein Vielfaches von 15 und mindestens 15 sein."
    );
  }
  const minStart = settings.startHour * 60;
  const maxEnd = settings.endHour * 60;
  if (startMinutes < minStart || startMinutes >= maxEnd) {
    throw new HttpError(
      400,
      `startMinutes muss zwischen ${minStart} und ${maxEnd - 15} liegen (${settings.startHour}:00–${settings.endHour}:00 Uhr).`
    );
  }
  if (startMinutes + durationMinutes > maxEnd) {
    throw new HttpError(
      400,
      `Das Termin-Ende darf ${settings.endHour}:00 Uhr (${maxEnd} Minuten) nicht überschreiten.`
    );
  }
}

// Prüft und übernimmt die Kartenfelder aus dem Request-Body.
// partial = true: nur übergebene Felder prüfen (PATCH), sonst Pflichtfelder + Defaults (POST).
// Die Feinprüfung der Positionsfelder übernimmt validateCardPosition().
export function sanitizeCardInput(body, { partial = false } = {}) {
  if (!isPlainObject(body)) {
    throw new HttpError(400, "Der Request-Body muss ein JSON-Objekt sein.");
  }
  const out = {};

  if (body.title !== undefined) {
    if (typeof body.title !== "string" || body.title.trim() === "") {
      throw new HttpError(400, "title muss ein nicht-leerer Text sein.");
    }
    out.title = body.title.trim();
  } else if (!partial) {
    throw new HttpError(400, "title ist erforderlich.");
  }

  if (body.description !== undefined) {
    if (typeof body.description !== "string") {
      throw new HttpError(400, "description muss ein Text sein.");
    }
    out.description = body.description;
  } else if (!partial) {
    out.description = "";
  }

  if (body.imageUrl !== undefined) {
    if (body.imageUrl !== null && typeof body.imageUrl !== "string") {
      throw new HttpError(400, "imageUrl muss ein Text oder null sein.");
    }
    out.imageUrl = body.imageUrl;
  } else if (!partial) {
    out.imageUrl = null;
  }

  if (body.color !== undefined) {
    if (body.color !== null && typeof body.color !== "string") {
      throw new HttpError(400, "color muss ein Text (CSS-Farbe) oder null sein.");
    }
    out.color = body.color;
  } else if (!partial) {
    out.color = null;
  }

  if (body.bgColor !== undefined) {
    if (body.bgColor !== null && typeof body.bgColor !== "string") {
      throw new HttpError(400, "bgColor muss ein Text (CSS-Farbe) oder null sein.");
    }
    out.bgColor = body.bgColor;
  } else if (!partial) {
    out.bgColor = null;
  }

  if (body.textColor !== undefined) {
    if (body.textColor !== null && typeof body.textColor !== "string") {
      throw new HttpError(400, "textColor muss ein Text (CSS-Farbe) oder null sein.");
    }
    out.textColor = body.textColor;
  } else if (!partial) {
    out.textColor = null;
  }

  for (const flag of ["collapsed", "muted"]) {
    if (body[flag] !== undefined) {
      if (typeof body[flag] !== "boolean") {
        throw new HttpError(400, `${flag} muss true oder false sein.`);
      }
      out[flag] = body[flag];
    } else if (!partial) {
      out[flag] = false;
    }
  }

  for (const field of ["day", "startMinutes", "durationMinutes"]) {
    if (body[field] !== undefined) {
      out[field] = body[field];
    } else if (!partial) {
      throw new HttpError(400, `${field} ist erforderlich.`);
    }
  }

  return out;
}
