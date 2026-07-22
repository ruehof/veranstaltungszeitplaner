// mock.js – In-Memory-Mock der API für Qualitätssicherung ohne Backend.
// Aktiv NUR bei URL-Parameter ?mock=1 oder auf GitHub Pages (*.github.io, Demo-Betrieb),
// sonst völlig wirkungslos.
// Vertragsformen exakt wie in SPEC.md (Statuscodes, {error}-Objekte, Datenmodell).
// Zustand wird in sessionStorage gehalten, damit index.html → plan.html funktioniert.

const mockEnabled =
  new URLSearchParams(location.search).get("mock") === "1" ||
  location.hostname.endsWith(".github.io");

if (mockEnabled) {
  const STORE_KEY = "vzp.mockdb";

  /** Zufällige, URL-sichere ID fester Länge (Mock-Variante von randomBytes/base64url). */
  const randomId = (length) => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let out = "";
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    for (const b of bytes) out += alphabet[b % alphabet.length];
    return out;
  };

  const nowIso = () => new Date().toISOString();

  /** Zustand laden oder mit Demo-Daten initialisieren. */
  function loadState() {
    try {
      const raw = sessionStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      /* fällt auf Seed zurück */
    }
    const created = nowIso();
    return {
      schedules: {
        "demo-plan-01": {
          id: "demo-plan-01",
          title: "Demo-Wochenplan",
          editToken: "demo-token",
          shareId: "demo-share",
          settings: {
            startHour: 8,
            endHour: 18,
            days: ["Mo", "Di", "Mi", "Do", "Fr"],
            startDate: null,
            popupEnabled: false,
            popupText: "",
            backgroundImage: null,
          },
          createdAt: created,
          updatedAt: created,
        },
      },
      cards: {
        "demo-card-001": {
          id: "demo-card-001",
          scheduleId: "demo-plan-01",
          title: "Aufwärmen & Technik",
          description: "Lauf-ABC, Mobilisation.\nDanach Technikübungen in Kleingruppen.",
          imageUrl: null,
          day: 0,
          startMinutes: 540,
          durationMinutes: 90,
          color: "#61bd4f",
          bgColor: "#eaf6e4",
          collapsed: false,
          muted: false,
          createdAt: created,
          updatedAt: created,
        },
        "demo-card-002": {
          id: "demo-card-002",
          scheduleId: "demo-plan-01",
          title: "Theorie: Trainingslehre",
          description: "Seminarraum 2, Skript mitbringen.",
          imageUrl: null,
          day: 2,
          startMinutes: 615,
          durationMinutes: 60,
          color: "#0079bf",
          bgColor: null,
          collapsed: false,
          muted: true,
          createdAt: created,
          updatedAt: created,
        },
      },
    };
  }

  let state = loadState();

  function persist() {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch {
      /* sessionStorage voll/nicht verfügbar – Mock läuft dann rein im Speicher */
    }
  }

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  const errorResponse = (status, message) => json({ error: message }, status);
  const noContent = () => new Response(null, { status: 204 });
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const cardsOf = (scheduleId) =>
    Object.values(state.cards).filter((c) => c.scheduleId === scheduleId);

  /** Kartenposition gegen das Raster des Plans validieren (wie der echte Server). */
  function validateCardPatch(schedule, card) {
    const { startHour, endHour } = schedule.settings;
    const dayCount = schedule.settings.days.length;
    if (!Number.isInteger(card.day) || card.day < 0 || card.day >= dayCount)
      return "Ungültiger Tag.";
    if (card.startMinutes % 15 !== 0 || card.startMinutes < startHour * 60)
      return "Ungültige Startzeit.";
    if (card.durationMinutes % 15 !== 0 || card.durationMinutes < 15)
      return "Ungültige Dauer.";
    if (card.startMinutes + card.durationMinutes > endHour * 60)
      return "Termin überschreitet das Rasterende.";
    if (typeof card.title !== "string" || card.title.trim() === "")
      return "Titel fehlt.";
    return null;
  }

  const realFetch = window.fetch.bind(window);

  window.fetch = async function mockFetch(input, init = {}) {
    let url = typeof input === "string" ? input : input.url;
    // api.js ruft relativ auf ("api/…", ohne führenden Schrägstrich), damit die
    // App auch unter einem Pfad-Präfix funktioniert. Für die Regex-Routen unten
    // (alle mit führendem "/api/") hier auf eine einheitliche Form normalisieren.
    if (!/^https?:\/\//.test(url) && !url.startsWith("/")) url = "/" + url;
    if (!url.startsWith("/api/")) return realFetch(input, init);

    await delay(60); // kleine, realistische Latenz
    const method = (init.method || "GET").toUpperCase();
    const headers = new Headers(init.headers || {});
    const token = headers.get("X-Edit-Token");
    const bodyOf = () => {
      try {
        return init.body ? JSON.parse(init.body) : {};
      } catch {
        return {};
      }
    };

    let m;

    // POST /api/schedules – Plan anlegen
    if (method === "POST" && /^\/api\/schedules$/.test(url)) {
      const body = bodyOf();
      if (!body.title || typeof body.title !== "string")
        return errorResponse(400, "Titel fehlt.");
      const settings = Object.assign(
        {
          startHour: 6,
          endHour: 20,
          days: ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
          startDate: null,
          popupEnabled: false,
          popupText: "",
          backgroundImage: null,
        },
        body.settings || {}
      );
      const schedule = {
        id: randomId(12),
        title: body.title,
        editToken: randomId(24),
        shareId: randomId(12),
        settings,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.schedules[schedule.id] = schedule;
      persist();
      return json(schedule, 201);
    }

    // GET /api/share/:shareId – Nur-Lese-Zugriff
    if (method === "GET" && (m = url.match(/^\/api\/share\/([^/?]+)$/))) {
      const schedule = Object.values(state.schedules).find((s) => s.shareId === m[1]);
      if (!schedule) return errorResponse(404, "Freigabelink nicht gefunden.");
      const { editToken, ...publicSchedule } = schedule;
      return json({ schedule: publicSchedule, cards: cardsOf(schedule.id) });
    }

    // /api/schedules/:id …
    if ((m = url.match(/^\/api\/schedules\/([^/?]+)$/))) {
      const schedule = state.schedules[m[1]];
      if (!schedule) return errorResponse(404, "Plan nicht gefunden.");
      if (schedule.editToken !== token)
        return errorResponse(403, "Kein gültiges Bearbeitungs-Token.");
      if (method === "GET") return json({ schedule, cards: cardsOf(schedule.id) });
      if (method === "PATCH") {
        const body = bodyOf();
        if (typeof body.title === "string" && body.title.trim() !== "")
          schedule.title = body.title.trim();
        if (body.settings) Object.assign(schedule.settings, body.settings);
        schedule.updatedAt = nowIso();
        persist();
        return json(schedule);
      }
      if (method === "DELETE") {
        for (const card of cardsOf(schedule.id)) delete state.cards[card.id];
        delete state.schedules[schedule.id];
        persist();
        return noContent();
      }
    }

    // POST /api/schedules/:id/cards – Karte anlegen
    if (method === "POST" && (m = url.match(/^\/api\/schedules\/([^/?]+)\/cards$/))) {
      const schedule = state.schedules[m[1]];
      if (!schedule) return errorResponse(404, "Plan nicht gefunden.");
      if (schedule.editToken !== token)
        return errorResponse(403, "Kein gültiges Bearbeitungs-Token.");
      const body = bodyOf();
      const card = {
        id: randomId(12),
        scheduleId: schedule.id,
        title: body.title || "",
        description: body.description || "",
        imageUrl: body.imageUrl || null,
        day: body.day ?? 0,
        startMinutes: body.startMinutes ?? schedule.settings.startHour * 60,
        durationMinutes: body.durationMinutes ?? 60,
        color: body.color || null,
        bgColor: body.bgColor || null,
        textColor: body.textColor || null,
        collapsed: Boolean(body.collapsed),
        muted: Boolean(body.muted),
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      const problem = validateCardPatch(schedule, card);
      if (problem) return errorResponse(400, problem);
      state.cards[card.id] = card;
      persist();
      return json(card, 201);
    }

    // POST /api/schedules/:id/cards/:cardId/duplicate
    if (method === "POST" && (m = url.match(/^\/api\/schedules\/([^/?]+)\/cards\/([^/?]+)\/duplicate$/))) {
      const schedule = state.schedules[m[1]];
      if (!schedule) return errorResponse(404, "Plan nicht gefunden.");
      if (schedule.editToken !== token)
        return errorResponse(403, "Kein gültiges Bearbeitungs-Token.");
      const source = state.cards[m[2]];
      if (!source || source.scheduleId !== schedule.id)
        return errorResponse(404, "Karte nicht gefunden.");
      const copy = {
        ...source,
        id: randomId(12),
        title: source.title + " (Kopie)",
        createdAt: nowIso(),
        updatedAt: nowIso(),
      };
      state.cards[copy.id] = copy;
      persist();
      return json(copy, 201);
    }

    // PATCH/DELETE /api/schedules/:id/cards/:cardId
    if ((m = url.match(/^\/api\/schedules\/([^/?]+)\/cards\/([^/?]+)$/))) {
      const schedule = state.schedules[m[1]];
      if (!schedule) return errorResponse(404, "Plan nicht gefunden.");
      if (schedule.editToken !== token)
        return errorResponse(403, "Kein gültiges Bearbeitungs-Token.");
      const card = state.cards[m[2]];
      if (!card || card.scheduleId !== schedule.id)
        return errorResponse(404, "Karte nicht gefunden.");
      if (method === "PATCH") {
        const patched = { ...card, ...bodyOf(), id: card.id, scheduleId: card.scheduleId };
        const problem = validateCardPatch(schedule, patched);
        if (problem) return errorResponse(400, problem);
        patched.updatedAt = nowIso();
        state.cards[card.id] = patched;
        persist();
        return json(patched);
      }
      if (method === "DELETE") {
        delete state.cards[card.id];
        persist();
        return noContent();
      }
    }

    // POST /api/schedules/:id/uploads – Bild "hochladen" (Objekt-URL im Browser)
    if (method === "POST" && (m = url.match(/^\/api\/schedules\/([^/?]+)\/uploads$/))) {
      const schedule = state.schedules[m[1]];
      if (!schedule) return errorResponse(404, "Plan nicht gefunden.");
      if (schedule.editToken !== token)
        return errorResponse(403, "Kein gültiges Bearbeitungs-Token.");
      const file = init.body instanceof FormData ? init.body.get("image") : null;
      if (!file) return errorResponse(400, "Kein Bild übermittelt.");
      if (file.size > 5 * 1024 * 1024) return errorResponse(400, "Bild größer als 5 MB.");
      // Hinweis: Objekt-URLs überleben keinen Seitenwechsel – für den Mock ausreichend.
      return json({ url: URL.createObjectURL(file) }, 201);
    }

    return errorResponse(404, "Unbekannte Mock-Route: " + method + " " + url);
  };

  console.info("[mock] In-Memory-API aktiv (?mock=1). Demo: plan.html?mock=1&id=demo-plan-01&token=demo-token");

  // Sichtbarer Hinweis, damit in der öffentlichen Demo klar ist, dass nichts
  // auf einem Server gespeichert wird (Daten leben nur im sessionStorage).
  document.addEventListener("DOMContentLoaded", () => {
    const banner = document.createElement("div");
    banner.textContent =
      "Demo-Modus: Daten werden nur lokal in diesem Browser-Tab gespeichert.";
    banner.style.cssText =
      "position:fixed;bottom:0;left:0;right:0;z-index:9999;" +
      "background:#f0a020;color:#1d2125;font:600 13px/1.4 system-ui,sans-serif;" +
      "text-align:center;padding:6px 12px;";
    document.body.append(banner);
  });
}

export {}; // Modul ohne Exporte – reiner Seiteneffekt bei ?mock=1
