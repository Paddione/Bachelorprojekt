# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
# Source-only Player-Package zuerst (wird per Alias konsumiert)
COPY packages/videovault-player ./packages/videovault-player
COPY mediaviewer-widget/package.json mediaviewer-widget/package-lock.json ./mediaviewer-widget/
WORKDIR /app/mediaviewer-widget
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps
COPY mediaviewer-widget/ ./
ARG VITE_ALLOWED_PARENT_ORIGINS=""
ENV VITE_ALLOWED_PARENT_ORIGINS=$VITE_ALLOWED_PARENT_ORIGINS
RUN npm run build:app

# ── Runtime stage ─────────────────────────────────────────────
FROM joseluisq/static-web-server:2-alpine AS runtime
WORKDIR /public
COPY --from=build /app/mediaviewer-widget/dist/app /public
ENV SERVER_ROOT=/public \
    SERVER_PORT=8080 \
    SERVER_FALLBACK_PAGE=/public/index.html
EXPOSE 8080
USER 65534:65534
