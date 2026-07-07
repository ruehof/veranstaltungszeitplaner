# Veranstaltungszeitplaner – Produktions-Image
# Build-Kontext ist die Projektwurzel (Backend + Frontend werden gemeinsam eingepackt,
# weil der Server ../frontend/public statisch ausliefert).
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /app/backend

# Erst nur die Paketdefinitionen kopieren, damit der npm-Layer gecacht bleibt,
# solange sich die Abhängigkeiten nicht ändern.
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

COPY backend/ ./
COPY frontend/ /app/frontend/

# data/ (JSON-Datei-Store) und uploads/ müssen dem unprivilegierten Nutzer gehören,
# damit Volumes darauf gemountet werden können.
RUN mkdir -p data uploads && chown -R node:node /app

USER node

EXPOSE 3000

CMD ["node", "server.js"]
