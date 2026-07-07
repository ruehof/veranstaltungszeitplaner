# Veranstaltungszeitplaner

WebApp zum Erstellen und Freigeben von Wochenplänen. Termine werden als Karten
(Trello-artige Optik) in einem Wochenraster platziert und lassen sich bequem per
Drag & Drop verschieben.

## Funktionen

- **Wochenplan Mo–So**: Horizontale Achse = Wochentage, vertikale Achse = Uhrzeiten
  (Standard 06:00–20:00 Uhr) im **15-Minuten-Raster**.
- **Terminkarten** mit Titel, Uhrzeit, farbiger Kopfleiste, Bild und mehrzeiliger
  Beschreibung.
- **Drag & Drop**: Karten greifen und verschieben (auch zwischen Tagen), Einrasten
  am 15-Minuten-Raster; Dauer per Griff am unteren Kartenrand ändern.
- **Ein-/ausklappbar**: Bild und Beschreibung lassen sich pro Karte ein- und
  ausklappen (Zustand wird gespeichert).
- **Dreipunkt-Menü** pro Karte: Duplizieren, Stummschalten/Aktivieren
  (stummgeschaltete Karten werden ausgegraut dargestellt), Löschen (mit Bestätigung),
  Bearbeiten.
- **Freigabe per Link**:
  - *Bearbeitungslink* (mit geheimem Token) – volle Bearbeitung,
  - *Nur-Lese-Link* (Share-ID) – nur Ansehen.
  Kein Login nötig; der Zugriffsschutz erfolgt ausschließlich über unerratbare Links.
- **Bild-Uploads** (JPG/PNG/WebP/GIF, max. 5 MB) direkt im Termin-Dialog.

## Technologie-Stack

| Ebene | Technologie |
|---|---|
| Backend | Node.js ≥ 18, Express (kein Build-Schritt) |
| Datenbank | MongoDB (Treiber `mongodb`) – **oder** JSON-Datei-Fallback ohne MongoDB |
| Frontend | Vanilla HTML/CSS/JS (ES-Module), kein Framework, kein Bundler |
| Bild-Uploads | `multer`, Ablage unter `backend/uploads/` |
| Hosting | Debian Linux, systemd-Dienst **oder** Docker Compose, optional nginx als Reverse Proxy |

Der Express-Server liefert das Frontend (`frontend/public/`) statisch mit aus –
es läuft also alles über einen einzigen Prozess und Port.

## Ordnerstruktur

```
Veranstaltungszeitplaner/
├── SPEC.md                  ← Spezifikation (Architektur, API, Konventionen)
├── README.md                ← dieses Dokument
├── Dockerfile               ← Produktions-Image (App + Frontend)
├── docker-compose.yml       ← App + MongoDB als Container
├── backend/
│   ├── package.json
│   ├── server.js            ← Einstiegspunkt
│   ├── .env.example         ← PORT, MONGODB_URI, UPLOAD_DIR
│   └── src/
│       ├── routes/          ← API-Routen
│       └── storage/         ← storage.js (Interface), mongo.js, jsonfile.js
├── frontend/
│   └── public/
│       ├── index.html       ← Startseite: Plan anlegen / Plan öffnen
│       ├── plan.html        ← Wochenplan-Ansicht (Grid + Karten)
│       ├── css/
│       └── js/
└── deploy/
    ├── DEPLOYMENT.md        ← Schritt-für-Schritt-Anleitung für Debian
    ├── veranstaltungszeitplaner.service
    └── nginx-example.conf
```

## Quickstart (lokal)

Voraussetzung: [Node.js](https://nodejs.org/) ≥ 18. Die Befehle sind auf
Windows (PowerShell/CMD), macOS und Linux identisch:

```bash
cd backend
npm install
npm start
```

Anschließend im Browser öffnen: **http://localhost:3000**

### Ohne MongoDB (Standard)

Es ist **keine MongoDB nötig**: Ist die Umgebungsvariable `MONGODB_URI` nicht
gesetzt, nutzt die App automatisch einen einfachen JSON-Datei-Store unter
`backend/data/db.json`. Das ist ideal für lokale Entwicklung und kleine
Installationen.

### Mit MongoDB

1. `backend/.env.example` nach `backend/.env` kopieren.
2. In `.env` die Verbindungs-URL eintragen, z. B.:

   ```
   PORT=3000
   MONGODB_URI=mongodb://127.0.0.1:27017/veranstaltungszeitplaner
   ```

3. Server neu starten (`npm start`).

### Mit Docker

Alternativ startet `docker compose up -d --build` in der Projektwurzel die App
zusammen mit einer MongoDB in Containern (erreichbar unter
http://localhost:3000, Daten in Docker-Volumes). Details – auch zur Variante
ohne MongoDB – stehen in der [docker-compose.yml](docker-compose.yml) und in
[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md), Abschnitt 10.

## API-Kurzreferenz

Alle Routen liegen unter `/api`, Bodies und Antworten sind JSON.
Bearbeitende Zugriffe erfordern den Header `X-Edit-Token: <editToken>`.

| Methode | Pfad | Beschreibung |
|---|---|---|
| POST | `/api/schedules` | Wochenplan anlegen |
| GET | `/api/schedules/:id` | Plan + Karten abrufen |
| GET | `/api/share/:shareId` | Nur-Lese-Zugriff (ohne editToken) |
| PATCH | `/api/schedules/:id` | Titel/Settings ändern |
| DELETE | `/api/schedules/:id` | Plan inkl. Karten und Bildern löschen |
| POST | `/api/schedules/:id/cards` | Terminkarte anlegen |
| PATCH | `/api/schedules/:id/cards/:cardId` | Karte ändern (Position, Text, `muted`, `collapsed`, …) |
| POST | `/api/schedules/:id/cards/:cardId/duplicate` | Karte duplizieren |
| DELETE | `/api/schedules/:id/cards/:cardId` | Karte löschen |
| POST | `/api/schedules/:id/uploads` | Bild hochladen (`multipart/form-data`, Feld `image`) |

Die vollständige API-Spezifikation inkl. Datenmodell und Validierungsregeln
steht in [SPEC.md](SPEC.md).

## Hosting / Produktivbetrieb

Eine ausführliche Schritt-für-Schritt-Anleitung für den Betrieb auf einem
Debian-Server (Node.js, MongoDB, systemd, nginx, HTTPS mit Let's Encrypt,
Backups, Updates) findet sich in
[deploy/DEPLOYMENT.md](deploy/DEPLOYMENT.md).
