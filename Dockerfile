# ─────────────────────────────────────────────
# Stage 1 — Build Vue frontend
# ─────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─────────────────────────────────────────────
# Stage 2 — Production (Express + Chromium)
# ─────────────────────────────────────────────
FROM node:20-slim AS runner

# Chromium + dépendances système
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libgbm1 \
    --no-install-recommends \
  && rm -rf /var/lib/apt/lists/*

# Puppeteer utilise le Chromium système (pas de téléchargement)
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
ENV NODE_ENV=production
ENV PORT=3099

WORKDIR /app

# Dépendances prod uniquement
COPY package*.json ./
RUN npm ci --omit=dev

# Frontend buildé + serveur
COPY --from=builder /app/dist ./dist
COPY server.mjs ./

# Utilisateur non-root
RUN useradd -m appuser && chown -R appuser:appuser /app
USER appuser

EXPOSE 3099

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://localhost:3099/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "server.mjs"]
