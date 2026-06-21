# ── Build stage ───────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY mentolder-web/package.json mentolder-web/pnpm-lock.yaml mentolder-web/.npmrc mentolder-web/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY mentolder-web/ .

# VITE_* vars are baked into the JS bundle at build time.
# Pass VITE_FORMSPREE_ENDPOINT via --build-arg (GitHub Actions secret).
# When empty, ContactForm falls back to a mailto: link.
ARG VITE_FORMSPREE_ENDPOINT=""
ENV VITE_FORMSPREE_ENDPOINT=${VITE_FORMSPREE_ENDPOINT}

RUN pnpm run build

# ── Runtime stage ─────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime

COPY mentolder-web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
