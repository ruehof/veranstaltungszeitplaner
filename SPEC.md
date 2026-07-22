# Veranstaltungszeitplaner – Spezifikation

WebApp zum Erstellen und Freigeben von Wochenplänen. Horizontale Achse: Wochentage (Mo–So),
vertikale Achse: Uhrzeiten (Standard 06:00–20:00) im 15-Minuten-Raster. Termine werden als
Karten platziert (Drag & Drop), enthalten Bild + Textbeschreibung, sind ein-/ausklappbar und
haben ein Dreipunkt-Menü (Löschen, Stummschalten, Duplizieren). Optik angelehnt an Trello-Karten.

## Technologie-Entscheidungen

- **Backend:** Node.js ≥ 18, Express. Kein Build-Schritt.
- **Datenbank:** MongoDB (Treiber: `mongodb`). Fallback für lokale Entwicklung ohne MongoDB:
  einfacher JSON-Datei-Store unter `backend/data/db.json`, aktiv wenn `MONGODB_URI` nicht gesetzt ist.
  Beide Implementierungen hinter einer gemeinsamen Storage-Schnittstelle (`backend/src/storage/`).
- **Frontend:** Vanilla HTML/CSS/JS (ES-Module), kein Framework, kein Bundler.
  Wird vom Express-Server statisch ausgeliefert (`frontend/public/`).
- **Hosting-Ziel:** Debian Linux, systemd-Dienst oder Docker Compose, Apache oder nginx
  als Reverse Proxy (Apache-Variante für Server, auf denen bereits Apache läuft).
- **Bild-Uploads:** `multer`, Ablage unter `backend/uploads/`, ausgeliefert unter `/uploads/<datei>`.

## Ordnerstruktur

```
Veranstaltungszeitplaner/
├── SPEC.md                  ← dieses Dokument
├── README.md                ← Überblick, Quickstart (Doku-Agent)
├── backend/                 ← Backend-Agent
│   ├── package.json
│   ├── server.js            ← Einstiegspunkt
│   ├── .env.example         ← PORT, MONGODB_URI, UPLOAD_DIR
│   └── src/
│       ├── routes/          ← API-Routen
│       ├── storage/         ← storage.js (Interface), mongo.js, jsonfile.js
│       └── ...
├── frontend/                ← Frontend-Agent
│   └── public/
│       ├── index.html       ← Startseite: Plan anlegen / Plan öffnen
│       ├── plan.html        ← Wochenplan-Ansicht (Grid + Karten)
│       ├── css/
│       └── js/
└── deploy/                  ← Deployment-Agent
    ├── DEPLOYMENT.md        ← Schritt-für-Schritt-Anleitung Debian
    ├── veranstaltungszeitplaner.service
    ├── apache-example.conf  ← Reverse Proxy, falls bereits Apache läuft
    └── nginx-example.conf   ← Reverse Proxy, falls kein anderer Webserver läuft
```

Der Express-Server liefert `../frontend/public` als statische Dateien aus (Pfad relativ zu
`backend/server.js`, per `path.join(__dirname, "..", "frontend", "public")`).

## Datenmodell

### Schedule (Wochenplan)

```json
{
  "id": "string (12 Zeichen, URL-sicher, zufällig)",
  "title": "string",
  "editToken": "string (24 Zeichen, zufällig) – berechtigt zum Bearbeiten",
  "shareId": "string (12 Zeichen, zufällig) – Nur-Lese-Freigabelink",
  "settings": {
    "startHour": 6,
    "endHour": 20,
    "days": ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"],
    "startDate": null,
    "popupEnabled": false,
    "popupText": "",
    "backgroundImage": null
  },
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

### Card (Terminkarte)

```json
{
  "id": "string (12 Zeichen, zufällig)",
  "scheduleId": "string",
  "title": "string",
  "description": "string (mehrzeilig, Plaintext)",
  "imageUrl": "string | null  (z.B. /uploads/abc123.jpg)",
  "day": 0,
  "startMinutes": 480,
  "durationMinutes": 90,
  "color": "string | null (CSS-Farbe für Kartenleiste)",
  "bgColor": "string | null (CSS-Hintergrundfarbe des Kartenkörpers, null = Weiß)",
  "textColor": "string | null (CSS-Textfarbe der Karte, null = Standard dunkel)",
  "collapsed": false,
  "muted": false,
  "createdAt": "ISO-8601",
  "updatedAt": "ISO-8601"
}
```

Regeln:
- `settings.days`: 1–31 Tageskürzel, Duplikate erlaubt (z. B. Sa–Sa = 8 Tage von Samstag
  bis Samstag). `settings.startDate` (`"JJJJ-MM-TT"` oder null): Kalenderdatum des ersten
  Tages; wenn gesetzt, zeigen die Spaltenköpfe die konkreten Daten.
- `settings.popupEnabled`/`popupText` (max. 5000 Zeichen): Ist der Haken gesetzt und Text
  vorhanden, zeigt das Frontend beim Öffnen über den **Nur-Lese-Link** ein Erläuterungs-Popup.
- `settings.backgroundImage` (Upload-URL oder null): Hintergrundbild des Plans, füllt die
  Rasterfläche (cover); beim Ersetzen/Entfernen und Plan-Löschen räumt der Server die
  Upload-Datei auf.
- `day`: Index in `settings.days` (0 = erster Tag).
- `startMinutes`: Minuten seit Mitternacht, **Vielfaches von 15**, innerhalb `startHour*60 … endHour*60`.
- `durationMinutes`: Vielfaches von 15, min. 15. Ende darf `endHour*60` nicht überschreiten.
- Server validiert diese Regeln und rundet nicht selbst – ungültige Werte ⇒ HTTP 400.
- `muted: true` ⇒ Karte wird im Frontend ausgegraut/halbtransparent dargestellt.

## API-Vertrag (alle Routen unter `/api`)

Autorisierung zum Bearbeiten: Header `X-Edit-Token: <editToken>`.
Fehlt/falsch ⇒ 403 `{ "error": "..." }`. Alle Bodies/Antworten JSON.

| Methode | Pfad | Auth | Beschreibung |
|---|---|---|---|
| POST | `/api/schedules` | – | Plan anlegen. Body: `{title, settings?}`. Antwort 201: vollständiges Schedule inkl. `editToken`. |
| GET | `/api/schedules/:id` | Token | Plan + Karten: `{schedule, cards}`. `editToken` wird NUR bei gültigem Token mitgeliefert. |
| GET | `/api/share/:shareId` | – | Nur-Lese-Zugriff: `{schedule, cards}` OHNE `editToken`. |
| PATCH | `/api/schedules/:id` | Token | Titel/Settings ändern. Antwort: aktualisiertes Schedule. |
| DELETE | `/api/schedules/:id` | Token | Plan + zugehörige Karten + deren Upload-Bilder löschen. Antwort 204. |
| POST | `/api/schedules/:id/cards` | Token | Karte anlegen. Body: Card-Felder ohne `id/scheduleId/createdAt`. Antwort 201: Karte. |
| PATCH | `/api/schedules/:id/cards/:cardId` | Token | Teilupdate (Position, Text, `muted`, `collapsed`, …). Antwort: Karte. |
| POST | `/api/schedules/:id/cards/:cardId/duplicate` | Token | Karte duplizieren (gleiche Position, Titel + „ (Kopie)“). Antwort 201: neue Karte. |
| DELETE | `/api/schedules/:id/cards/:cardId` | Token | Karte löschen (inkl. Upload-Bild, falls kein anderer Verweis). Antwort 204. |
| POST | `/api/schedules/:id/uploads` | Token | `multipart/form-data`, Feld `image` (jpg/png/webp/gif, max 5 MB). Antwort 201: `{url}`. |

Serverfehler einheitlich als `{ "error": "beschreibung" }` mit passendem Statuscode.
404 bei unbekannter `id`/`shareId`/`cardId`.

## Frontend-Verhalten

### index.html (Startseite)
- Formular „Neuen Wochenplan erstellen“ (Titel) ⇒ POST `/api/schedules` ⇒ Weiterleitung auf
  `plan.html?id=<id>&token=<editToken>`.
- Tages-Vorauswahlen: Mo–Fr, Mo–So, Sa–So, Sa–Sa, So–So (Sa–Sa/So–So = 8-Tage-Wochen) sowie
  „Datum von–bis“ (max. 31 Tage; setzt `settings.startDate`, Tage werden aus dem Bereich
  abgeleitet). Gemeinsames Formularmodul `js/scheduleform.js`, auch im Einstellungen-Dialog.
- Hinweisbox: Bearbeitungslink + Freigabelink werden auf der Planseite angezeigt.
- Zuletzt erstellte Pläne aus `localStorage` auflisten (id, titel, token lokal merken).

### plan.html (Wochenplan)
- URL-Parameter: `id` + `token` (Bearbeitungsmodus) **oder** `share` (Nur-Lese-Modus über `/api/share/`).
- Raster: Spalten = Tage, Zeilen = Stunden (mit sichtbaren Stundenlinien, feinere 15-min-Hilfslinien),
  Zeitleiste links, Tagesköpfe oben (sticky).
- Karten absolut im Grid positioniert: `top`/`height` aus `startMinutes`/`durationMinutes` berechnet.
- **Drag & Drop** mit Pointer Events (kein HTML5-DnD): Karte greifen, Geist-Vorschau am
  15-Minuten-Raster einrasten, beim Loslassen PATCH an Server. Auch Tag-Wechsel per Drag.
- **Größe ändern:** Griff am unteren Kartenrand zieht `durationMinutes` (15-min-Raster).
- **Karte:** farbige Kopfleiste (`color`), optional eingefärbter Kartenkörper (`bgColor`,
  Palette: Pastelltöne + kräftige Farbleisten-Farben), Titel, Uhrzeit (z.B. „08:00–09:30“),
  Bild (falls vorhanden; skaliert mit festem Seitenverhältnis auf Kartenbreite, kein
  Zuschnitt), Beschreibung. Klick auf Pfeil-Icon klappt Bild+Beschreibung ein/aus
  (`collapsed` wird gespeichert). Passt der Inhalt nicht in die Slot-Höhe (kurzer Termin),
  wächst die ausgeklappte Karte über ihr Zeitfenster hinaus (CSS-Klasse `grow`), damit die
  Beschreibung lesbar bleibt.
- **Plan-Einstellungen:** Button „Einstellungen“ öffnet einen Dialog (gleiches Formularmodul
  wie die Startseite) zum nachträglichen Ändern von Tagen/Datum/Uhrzeiten per PATCH.
  Zusätzlich dort: Hintergrundbild-Upload für den Plan, Haken „Popup“ und Popup-Textfeld.
  Termine außerhalb des neuen Rasters bleiben gespeichert, werden aber ausgeblendet.
- **Dreipunkt-Menü** oben rechts auf der Karte: „Duplizieren“, „Stummschalten“/„Aktivieren“, „Löschen“
  (Löschen mit Bestätigung). Menü schließt bei Klick außerhalb.
- **Karte anlegen:** Button „+ Termin“ sowie Klick auf freie Rasterzelle ⇒ Dialog (Titel,
  Beschreibung, Bild-Upload, Farbe, Tag, Start, Dauer). Gleicher Dialog zum Bearbeiten
  (Doppelklick auf Karte oder Menüpunkt „Bearbeiten“).
- **Freigeben:** Button „Freigeben“ zeigt beide Links (Bearbeiten mit Token, Nur-Lesen mit shareId)
  mit „Kopieren“-Buttons.
- Nur-Lese-Modus: kein Drag & Drop, kein Menü, keine Buttons zum Anlegen – nur Ansehen und
  Ein-/Ausklappen (lokal). Der Logo-Link zur Startseite ist deaktiviert, damit es keinen
  Weg zur Plan-Erstellung gibt; „Exportieren“ bleibt verfügbar.
- **Beschreibung mit Links:** `https://…`-Adressen werden automatisch verlinkt, eigener
  Linktext per `[Text](https://…)`. Rendering ohne innerHTML (XSS-sicher), nur http(s),
  Links öffnen in neuem Tab (`rel="noopener noreferrer"`).
- **Textfarbe:** Palette `CARD_TEXT_COLORS` (Standard dunkel, Weiß, Hellgelb, Grau sowie
  dunkle Töne); bei gesetzter `textColor` erben Titel, Zeit, Beschreibung und Icons die Farbe.
- **Export/Import:** „Exportieren“ (Planseite, beide Modi) lädt den Plan als JSON-Datei
  herunter: `{format: "veranstaltungszeitplaner", version: 1, title, settings, cards[]}`
  (Karten ohne `id`/`scheduleId`). „Plan aus JSON-Datei importieren…“ (Startseite) legt
  daraus einen NEUEN Plan mit eigenen Links an; Karten, die nicht ins Raster passen,
  werden gezählt übersprungen. Bild-URLs werden unverändert übernommen (funktionieren
  nur, solange die Uploads auf demselben Server existieren).
- Sprache der Oberfläche: **Deutsch**. Design: hell, freundlich, Trello-artige Karten mit
  abgerundeten Ecken und dezentem Schatten; Akzentfarbe Blau (#0079bf-Familie).

## Konventionen

- IDs/Tokens: `crypto.randomBytes` → base64url.
- Kein Login/Accounts in v1 – Zugriffsschutz ausschließlich über unerratbare Links (Token/shareId).
- Zeiten sind reine Wochenraster-Zeiten (kein Datum, keine Zeitzonenlogik).
- Code-Kommentare und UI-Texte auf Deutsch, Bezeichner im Code auf Englisch.
