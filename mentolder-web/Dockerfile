# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10 --activate

COPY mentolder-web/ .

# VITE_* vars are baked into the JS bundle at build time.
# Pass VITE_FORMSPREE_ENDPOINT via --build-arg (GitHub Actions secret).
# When empty, ContactForm falls back to a mailto: link.
ARG VITE_FORMSPREE_ENDPOINT=""
ENV VITE_FORMSPREE_ENDPOINT=${VITE_FORMSPREE_ENDPOINT}

# Origin of the Astro website the SPA reuses for auth + homepage persistence
# (cross-origin, same-site). Baked at build time; empty → same-origin relative
# requests. Set by build-mentolder-web.yml to https://web.mentolder.de.
ARG VITE_WEBSITE_ORIGIN=""
ENV VITE_WEBSITE_ORIGIN=${VITE_WEBSITE_ORIGIN}

RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile && pnpm run build

# ── Runtime stage ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY mentolder-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
