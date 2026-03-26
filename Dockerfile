# ──────────────────────────────────────────────────────────────────────────────
# Stage 1 — Build the React client
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS client-build

WORKDIR /build/client

COPY client/package*.json ./
RUN npm ci --legacy-peer-deps

COPY client/ ./
RUN npm run build

# ──────────────────────────────────────────────────────────────────────────────
# Stage 2 — Production server image
# ──────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine

# Build tools needed by better-sqlite3 (native addon) and sharp (libvips)
RUN apk add --no-cache python3 make g++ vips-dev

WORKDIR /app

# Copy server deps manifest and install production deps only,
# then rebuild native addons for this Alpine/Linux target
COPY server/package*.json ./server/
RUN cd server && npm ci --omit=dev
RUN cd server && npm rebuild better-sqlite3 sharp

# Copy server source
COPY server/ ./server/

# Copy the client build output from stage 1
COPY --from=client-build /build/client/dist ./client/dist

# Persistent data lives in named volumes (see docker-compose.yml)
VOLUME ["/app/server/uploads", "/app/server/localchat.db"]

# HTTP  — main app + admin dashboard
EXPOSE 3000
# HTTPS — WebRTC calls (required on non-localhost devices)
EXPOSE 3443

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
