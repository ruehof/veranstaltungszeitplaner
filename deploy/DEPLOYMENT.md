# Deployment auf Debian 12/13

Diese Anleitung beschreibt Schritt für Schritt, wie der Veranstaltungszeitplaner
auf einem Debian-Server (Debian 12 „Bookworm" oder Debian 13 „Trixie") produktiv
betrieben wird: Node.js, MongoDB (optional), systemd-Dienst, nginx als Reverse
Proxy mit HTTPS.

Alle Befehle werden als `root` ausgeführt (oder mit vorangestelltem `sudo`).

---

## 1. Node.js ≥ 18 installieren

Die App benötigt Node.js in Version 18 oder neuer. Zwei Wege:

### Variante A: NodeSource-Repository (empfohlen, aktuelle LTS-Version)

```bash
apt update
apt install -y curl ca-certificates
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
```

(Statt `setup_22.x` kann auch eine andere aktuelle LTS-Zeile wie `setup_20.x`
verwendet werden.)

### Variante B: Debian-Paket

Debian 12 liefert Node.js 18, Debian 13 eine neuere Version – beides genügt:

```bash
apt update
apt install -y nodejs npm
```

Prüfen:

```bash
node --version   # muss >= v18 sein
```

---

## 2. MongoDB Community installieren

> **Hinweis:** Debian selbst liefert **kein** MongoDB-Paket mehr in seinen
> Repositories. MongoDB muss über das offizielle Repository von mongodb.org
> installiert werden. Wer das nicht möchte, kann die App auch **ohne MongoDB**
> betreiben – siehe Abschnitt 2b.

Offizielles MongoDB-Repository einbinden (Beispiel: MongoDB 7.0 auf Debian 12
„Bookworm"; für andere Versionen siehe die
[MongoDB-Installationsdoku](https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-debian/)):

```bash
apt install -y gnupg curl
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg

echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
https://repo.mongodb.org/apt/debian bookworm/mongodb-org/7.0 main" \
  > /etc/apt/sources.list.d/mongodb-org-7.0.list

apt update
apt install -y mongodb-org
```

MongoDB starten und beim Booten aktivieren:

```bash
systemctl enable --now mongod
systemctl status mongod
```

Standardmäßig lauscht MongoDB nur auf `127.0.0.1:27017` – das ist für dieses
Setup genau richtig (App und Datenbank auf demselben Server).

### 2b. Alternative: Ohne MongoDB (JSON-Datei-Store)

Für kleine Installationen (wenige Pläne, wenige gleichzeitige Nutzer) kann
die App komplett ohne MongoDB laufen: Ist die Umgebungsvariable `MONGODB_URI`
**nicht gesetzt**, speichert die App alle Daten in der Datei
`backend/data/db.json`.

In diesem Fall:

- Abschnitt 2 (MongoDB-Installation) überspringen.
- In der `.env` (Schritt 4) die Zeile `MONGODB_URI=...` weglassen bzw.
  auskommentieren.
- Beim Backup (Abschnitt 8) statt `mongodump` einfach die Datei
  `backend/data/db.json` sichern.

---

## 3. Systembenutzer anlegen und App installieren

Dedizierten, nicht anmeldbaren Systembenutzer anlegen:

```bash
adduser --system --group --home /opt/veranstaltungszeitplaner \
  --shell /usr/sbin/nologin veranstaltungszeitplaner
```

App-Dateien nach `/opt/veranstaltungszeitplaner` kopieren (z. B. per `scp`,
`rsync` oder `git clone`). Benötigt werden die Ordner `backend/`, `frontend/`
und `deploy/`:

```bash
mkdir -p /opt/veranstaltungszeitplaner
# Beispiel: Upload vom Arbeitsrechner aus (dort ausführen):
#   rsync -av --exclude node_modules ./Veranstaltungszeitplaner/ \
#     root@SERVER:/opt/veranstaltungszeitplaner/
```

Produktions-Abhängigkeiten installieren:

```bash
cd /opt/veranstaltungszeitplaner/backend
npm install --omit=dev
```

Verzeichnisse für Daten und Uploads anlegen:

```bash
mkdir -p /opt/veranstaltungszeitplaner/backend/data
mkdir -p /opt/veranstaltungszeitplaner/backend/uploads
```

---

## 4. .env konfigurieren

```bash
cd /opt/veranstaltungszeitplaner/backend
cp .env.example .env
nano .env
```

Inhalt (Beispiel mit MongoDB):

```
PORT=3000
MONGODB_URI=mongodb://127.0.0.1:27017/veranstaltungszeitplaner
```

Ohne MongoDB einfach die Zeile `MONGODB_URI` weglassen – dann wird der
JSON-Datei-Store verwendet.

Zum Schluss die Besitzrechte setzen:

```bash
chown -R veranstaltungszeitplaner:veranstaltungszeitplaner /opt/veranstaltungszeitplaner
chmod 600 /opt/veranstaltungszeitplaner/backend/.env
```

---

## 5. systemd-Dienst einrichten

Die mitgelieferte Unit-Datei installieren:

```bash
cp /opt/veranstaltungszeitplaner/deploy/veranstaltungszeitplaner.service \
  /etc/systemd/system/veranstaltungszeitplaner.service

systemctl daemon-reload
systemctl enable --now veranstaltungszeitplaner
systemctl status veranstaltungszeitplaner
```

Test: Die App sollte jetzt lokal antworten:

```bash
curl -I http://127.0.0.1:3000/
```

### Logs ansehen

```bash
journalctl -u veranstaltungszeitplaner -f        # live mitverfolgen
journalctl -u veranstaltungszeitplaner --since today
```

---

## 6. nginx als Reverse Proxy mit HTTPS

nginx installieren:

```bash
apt install -y nginx
```

Beispielkonfiguration übernehmen und anpassen (Domain eintragen!):

```bash
cp /opt/veranstaltungszeitplaner/deploy/nginx-example.conf \
  /etc/nginx/sites-available/veranstaltungszeitplaner.conf

nano /etc/nginx/sites-available/veranstaltungszeitplaner.conf
# -> server_name auf die eigene Domain setzen, z. B. plan.example.de

ln -s /etc/nginx/sites-available/veranstaltungszeitplaner.conf \
  /etc/nginx/sites-enabled/

nginx -t && systemctl reload nginx
```

### HTTPS mit certbot / Let's Encrypt

Voraussetzung: Die Domain (z. B. `plan.example.de`) zeigt per DNS-A/AAAA-Record
auf den Server, und Port 80/443 sind erreichbar.

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d plan.example.de
```

certbot passt die nginx-Konfiguration automatisch an (HTTPS-Server-Block,
Umleitung von HTTP auf HTTPS) und richtet die automatische
Zertifikatserneuerung ein (systemd-Timer). Erneuerung testen:

```bash
certbot renew --dry-run
```

---

## 7. Firewall (ufw)

Falls `ufw` verwendet wird, nur SSH und HTTP/HTTPS öffnen – **nicht** Port 3000
(die App soll nur über nginx erreichbar sein, sie lauscht ohnehin idealerweise
nur auf 127.0.0.1):

```bash
apt install -y ufw
ufw allow OpenSSH
ufw allow "Nginx Full"     # Port 80 + 443
ufw enable
ufw status
```

---

## 8. Backups

Regelmäßig sichern:

- **Mit MongoDB:**

  ```bash
  mongodump --db veranstaltungszeitplaner \
    --out /var/backups/veranstaltungszeitplaner/$(date +%F)
  ```

  Wiederherstellen mit `mongorestore`.

- **Ohne MongoDB (JSON-Datei-Store):** die Datei
  `/opt/veranstaltungszeitplaner/backend/data/db.json` sichern.

- **In beiden Fällen zusätzlich:** die hochgeladenen Bilder unter
  `/opt/veranstaltungszeitplaner/backend/uploads/` sichern, z. B.:

  ```bash
  tar czf /var/backups/veranstaltungszeitplaner/uploads-$(date +%F).tar.gz \
    -C /opt/veranstaltungszeitplaner/backend uploads
  ```

Tipp: Beides per Cron-Job oder systemd-Timer automatisieren und die Backups
auf einen anderen Rechner kopieren.

---

## 9. Updates einspielen

1. Neue Version der App-Dateien nach `/opt/veranstaltungszeitplaner` kopieren
   (z. B. per `rsync`). **Wichtig:** `backend/.env`, `backend/data/` und
   `backend/uploads/` dabei nicht überschreiben/löschen:

   ```bash
   # Beispiel vom Arbeitsrechner aus:
   #   rsync -av --exclude node_modules --exclude .env \
   #     --exclude data --exclude uploads \
   #     ./Veranstaltungszeitplaner/ root@SERVER:/opt/veranstaltungszeitplaner/
   ```

2. Abhängigkeiten aktualisieren und Rechte prüfen:

   ```bash
   cd /opt/veranstaltungszeitplaner/backend
   npm install --omit=dev
   chown -R veranstaltungszeitplaner:veranstaltungszeitplaner /opt/veranstaltungszeitplaner
   ```

3. Dienst neu starten und prüfen:

   ```bash
   systemctl restart veranstaltungszeitplaner
   systemctl status veranstaltungszeitplaner
   journalctl -u veranstaltungszeitplaner -n 50
   ```

---

## 10. Alternative: Betrieb mit Docker

Statt der Abschnitte 1–5 (Node.js, MongoDB, Systembenutzer, systemd) kann die
App auch komplett in Containern laufen. In der Projektwurzel liegen dafür
`Dockerfile`, `.dockerignore` und `docker-compose.yml` (App + MongoDB 7,
Daten in benannten Volumes). Die Abschnitte 6 (nginx/HTTPS) und 7 (Firewall)
gelten unverändert – der App-Container lauscht wie der systemd-Dienst nur auf
`127.0.0.1:3000`.

### Docker auf Debian installieren

Über das offizielle Docker-Repository (liefert Docker Engine inkl.
Compose-Plugin; das Debian-eigene Paket `docker.io` ist meist deutlich älter):

```bash
apt update
apt install -y ca-certificates curl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg \
  -o /etc/apt/keyrings/docker.asc

echo "deb [arch=$(dpkg --print-architecture) \
signed-by=/etc/apt/keyrings/docker.asc] \
https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  > /etc/apt/sources.list.d/docker.list

apt update
apt install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
```

### App starten

Projektdateien auf den Server kopieren (wie in Abschnitt 3, z. B. per `rsync`
oder `git clone`), dann in der Projektwurzel:

```bash
cd /opt/veranstaltungszeitplaner
docker compose up -d --build
docker compose ps            # beide Container sollten "running/healthy" sein
curl -I http://127.0.0.1:3000/
```

**Ohne MongoDB** (JSON-Datei-Store): die auskommentierten Hinweise am Anfang
der `docker-compose.yml` befolgen (mongo-Service entfernen, `MONGODB_URI`
weglassen, `appdata`-Volume aktivieren).

### Betrieb

```bash
docker compose logs -f app                  # Logs verfolgen
docker compose down                         # stoppen (Volumes bleiben erhalten)
docker compose up -d                        # wieder starten
```

Automatischer Start nach einem Server-Neustart ist durch
`restart: unless-stopped` in der Compose-Datei abgedeckt (der Docker-Dienst
selbst ist nach der Installation per systemd aktiviert).

### Updates einspielen

```bash
cd /opt/veranstaltungszeitplaner
git pull                                    # bzw. Dateien per rsync ersetzen
docker compose up -d --build                # baut das Image neu und ersetzt den Container
```

### Backups

- **MongoDB:** Dump innerhalb des Containers erzeugen und herauskopieren:

  ```bash
  docker compose exec mongo mongodump --db veranstaltungszeitplaner \
    --archive > /var/backups/veranstaltungszeitplaner-$(date +%F).archive
  ```

  Wiederherstellen: `docker compose exec -T mongo mongorestore --archive < DATEI`.

- **Uploads** (und ggf. `appdata` beim JSON-Store) liegen in benannten
  Docker-Volumes. Sichern z. B. mit:

  ```bash
  docker run --rm -v veranstaltungszeitplaner_uploads:/daten -v /var/backups:/backup \
    alpine tar czf /backup/uploads-$(date +%F).tar.gz -C /daten .
  ```

  (Volume-Name ggf. mit `docker volume ls` prüfen – er wird aus dem
  Projektordnernamen abgeleitet.)
