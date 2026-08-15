# syntax=docker/dockerfile:1
# VideoVault — Library (Vite-Client + Express-Server) for the Fleet platform.
# Build-Context = Repo-Root (~/Bachelorprojekt), so that @videovault-player alias
# can reach the vendored packages/videovault-player.
# Base: node:20-bookworm-slim (native ffprobe + build-essential for canvas).

# ── Build stage ───────────────────────────────────────────────
FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates curl python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# Shared player package first (source-only, consumed via alias)
COPY packages/videovault-player/ /packages/videovault-player/

# Dependency manifests + build configs
COPY components/VideoVault/package*.json ./
COPY components/VideoVault/tsconfig.json ./
COPY components/VideoVault/vite.config.ts ./
COPY components/VideoVault/tailwind.config.cjs ./
COPY components/VideoVault/postcss.config.js ./

RUN --mount=type=cache,target=/root/.npm npm install -g npm@11 && npm install --legacy-peer-deps

# Sources
COPY components/VideoVault/shared/ ./shared/
COPY components/VideoVault/client/ ./client/
COPY components/VideoVault/server/ ./server/
COPY components/VideoVault/scripts/ ./scripts/
COPY components/VideoVault/drizzle.config.ts ./

# prebuild copies ffmpeg-core to client/public/ffmpeg, then vite+esbuild
RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────
FROM node:24-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
     ca-certificates curl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY --from=build /app/shared/ ./shared/
COPY components/VideoVault/package*.json ./
RUN --mount=type=cache,target=/root/.npm npm install -g npm@11 && npm install --legacy-peer-deps --omit=dev

COPY --from=build /app/dist ./dist
COPY components/VideoVault/migrations/ ./migrations/
COPY components/VideoVault/scripts/ ./scripts/
COPY components/VideoVault/drizzle.config.ts ./

RUN mkdir -p /app/uploads && chown node:node /app/uploads

EXPOSE 5000
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://localhost:5000/api/health || exit 1

CMD ["npm", "run", "start"]
