// dump.js – Komplettes Plan-Backup inkl. Bilddateien als ZIP (Export/Import).
// Ergänzt den bestehenden reinen JSON-Export (index.js/plan.js, ohne Bilder) um
// eine Variante, die zusätzlich alle referenzierten Bilder (Kartenbilder, Plan-
// Hintergrund, Packlisten-Fotos) als echte Dateien mitliefert. Import legt einen
// NEUEN, eigenständigen Plan an (eigene Links, eigene Bild-Dateien auf dem
// Ziel-Server) – funktioniert daher auch als Umzug auf einen anderen Server.
// Rein clientseitig: nutzt nur bereits vorhandene API-Routen (Plan anlegen, Bild
// hochladen, Karte anlegen) – keine serverseitigen Änderungen nötig.

import { api, setEditToken } from "./api.js";
import { createZip, readZip } from "./zip.js";

const DUMP_FORMAT = "veranstaltungszeitplaner-dump";

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function extOf(name) {
  const m = /\.[a-zA-Z0-9]+$/.exec(name);
  return m ? m[0].toLowerCase() : "";
}

/** uploads/<datei> -> images/<datei> (Pfad innerhalb des ZIP). */
function zipRefFor(imageUrl) {
  if (!imageUrl) return null;
  const base = imageUrl.split("/").pop();
  return base ? `images/${base}` : null;
}

function collectImageUrls(schedule, cards) {
  const urls = new Set();
  if (schedule.settings.backgroundImage) urls.add(schedule.settings.backgroundImage);
  for (const card of cards) {
    if (card.imageUrl) urls.add(card.imageUrl);
    for (const item of card.packingList || []) {
      if (item.imageUrl) urls.add(item.imageUrl);
    }
  }
  return urls;
}

/**
 * Plan komplett als ZIP herunterladen: Einstellungen, Karten, Packlisten UND alle
 * referenzierten Bilder als echte Dateien (im Gegensatz zum reinen JSON-Export).
 * Funktioniert in beiden Modi (Bearbeiten/Nur-Lesen) – lädt die Bilder einfach über
 * ihre bereits öffentlich erreichbaren uploads/-URLs.
 * @returns {Promise<{imagesTotal:number, imagesFailed:number}>}
 */
export async function exportPlanDump(schedule, cards) {
  const imageUrls = collectImageUrls(schedule, cards);
  const files = [];
  let imagesFailed = 0;

  for (const url of imageUrls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = new Uint8Array(await response.arrayBuffer());
      files.push({ name: zipRefFor(url), data });
    } catch {
      imagesFailed++;
    }
  }
  const included = new Set(files.map((f) => f.name));
  const refIfIncluded = (imageUrl) => {
    const ref = zipRefFor(imageUrl);
    return ref && included.has(ref) ? ref : null;
  };

  const manifest = {
    format: DUMP_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    title: schedule.title,
    settings: { ...schedule.settings, backgroundImage: refIfIncluded(schedule.settings.backgroundImage) },
    cards: cards.map((c) => ({
      title: c.title,
      description: c.description,
      imageUrl: refIfIncluded(c.imageUrl),
      color: c.color,
      bgColor: c.bgColor ?? null,
      textColor: c.textColor ?? null,
      transparency: c.transparency ?? null,
      packingList: (c.packingList || []).map((item) => ({
        text: item.text,
        packed: Boolean(item.packed),
        unpacked: Boolean(item.unpacked),
        imageUrl: refIfIncluded(item.imageUrl),
      })),
      day: c.day,
      startMinutes: c.startMinutes,
      durationMinutes: c.durationMinutes,
      collapsed: c.collapsed,
      muted: c.muted,
    })),
  };

  files.unshift({
    name: "manifest.json",
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
  });

  const blob = await createZip(files);
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  const safeTitle = schedule.title.replace(/[\\/:*?"<>|]+/g, "").trim() || "wochenplan";
  link.download = safeTitle + ".zip";
  link.click();
  URL.revokeObjectURL(link.href);

  return { imagesTotal: imageUrls.size, imagesFailed };
}

/**
 * ZIP-Datei (aus exportPlanDump) importieren: legt einen NEUEN Plan mit eigenen
 * Links an und lädt alle enthaltenen Bilder unter neuen Dateinamen hoch.
 * @returns {Promise<{schedule, cardsTotal, cardsFailed, imagesTotal, imagesFailed}>}
 */
export async function importPlanDump(file) {
  const entries = await readZip(await file.arrayBuffer());
  const entryMap = new Map(entries.map((e) => [e.name, e.data]));

  const manifestBytes = entryMap.get("manifest.json");
  if (!manifestBytes) {
    throw new Error("Die ZIP-Datei enthält keine manifest.json.");
  }
  let manifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
  } catch {
    throw new Error("manifest.json in der ZIP-Datei ist kein gültiges JSON.");
  }
  if (
    !manifest ||
    manifest.format !== DUMP_FORMAT ||
    typeof manifest.title !== "string" ||
    typeof manifest.settings !== "object" ||
    !Array.isArray(manifest.cards)
  ) {
    throw new Error('Das ist keine gültige Wochenplan-ZIP-Datei (mit "Als ZIP exportieren" erstellt?).');
  }

  const { backgroundImage: bgRef, ...restSettings } = manifest.settings;
  const schedule = await api.createSchedule({
    title: manifest.title,
    settings: { ...restSettings, backgroundImage: null },
  });
  setEditToken(schedule.editToken);

  const neededRefs = new Set();
  if (bgRef) neededRefs.add(bgRef);
  for (const card of manifest.cards) {
    if (card.imageUrl) neededRefs.add(card.imageUrl);
    for (const item of card.packingList || []) {
      if (item.imageUrl) neededRefs.add(item.imageUrl);
    }
  }

  const imageMap = new Map();
  let imagesFailed = 0;
  for (const ref of neededRefs) {
    const bytes = entryMap.get(ref);
    const mime = MIME_BY_EXT[extOf(ref)];
    if (!bytes || !mime) {
      imagesFailed++;
      continue;
    }
    try {
      const uploadFile = new File([bytes], ref.split("/").pop(), { type: mime });
      const result = await api.uploadImage(schedule.id, uploadFile);
      imageMap.set(ref, result.url);
    } catch {
      imagesFailed++;
    }
  }

  if (bgRef && imageMap.has(bgRef)) {
    await api.patchSchedule(schedule.id, {
      settings: { ...restSettings, backgroundImage: imageMap.get(bgRef) },
    });
  }

  let cardsFailed = 0;
  for (const card of manifest.cards) {
    try {
      await api.createCard(schedule.id, {
        title: typeof card.title === "string" && card.title.trim() ? card.title : "Ohne Titel",
        description: typeof card.description === "string" ? card.description : "",
        imageUrl: card.imageUrl && imageMap.has(card.imageUrl) ? imageMap.get(card.imageUrl) : null,
        color: typeof card.color === "string" ? card.color : null,
        bgColor: typeof card.bgColor === "string" ? card.bgColor : null,
        textColor: typeof card.textColor === "string" ? card.textColor : null,
        transparency: typeof card.transparency === "number" ? card.transparency : null,
        packingList: Array.isArray(card.packingList)
          ? card.packingList
              .filter((item) => item && typeof item.text === "string" && item.text.trim())
              .map((item) => ({
                text: item.text.trim(),
                packed: Boolean(item.packed),
                unpacked: Boolean(item.unpacked),
                imageUrl: item.imageUrl && imageMap.has(item.imageUrl) ? imageMap.get(item.imageUrl) : null,
              }))
          : [],
        day: card.day,
        startMinutes: card.startMinutes,
        durationMinutes: card.durationMinutes,
        collapsed: Boolean(card.collapsed),
        muted: Boolean(card.muted),
      });
    } catch {
      cardsFailed++;
    }
  }

  return {
    schedule,
    cardsTotal: manifest.cards.length,
    cardsFailed,
    imagesTotal: neededRefs.size,
    imagesFailed,
  };
}
