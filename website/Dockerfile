# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────────────────────
# Build context is repo root so that tests/ can be copied into the runtime stage.
FROM node:22-alpine AS build
WORKDIR /app

# T001224/T001276: website migrated to pnpm — `website/package-lock.json` was
# deleted, only `website/pnpm-lock.yaml` exists. Corepack is bundled with
# node 22, so we enable pnpm@10 (matches `.github/workflows/ci.yml` +
# `.github/workflows/build-mentolder-web.yml`).
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Copy ONLY the manifest + lockfile first so dependency layer caches cleanly.
COPY website/package.json website/pnpm-lock.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

COPY website/ .

# Cap Node.js heap to force GC before hitting kernel OOM (T000315).
# The pixi.js + Astro build is memory-hungry; without an explicit limit,
# the dev node (k3s-1) crashes with SIGSEGV or esbuild memory-corruption.
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN pnpm run build

# Prune devDependencies so the runtime stage copies only prod node_modules
# (~1.2 GB → ~600 MB). Chromium/kubectl/tests/ bleiben bewusst im Runtime-Image.
RUN pnpm install --prod

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Tools needed by test runner scripts
RUN apk add --no-cache bash curl jq && \
    KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt) && \
    KUBECTL_ARCH=$(uname -m | sed 's/x86_64/amd64/; s/aarch64/arm64/') && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${KUBECTL_ARCH}/kubectl" && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${KUBECTL_ARCH}/kubectl.sha256" && \
    echo "$(cat kubectl.sha256)  kubectl" | sha256sum -c && \
    rm kubectl.sha256 && \
    chmod +x kubectl && mv kubectl /usr/local/bin/kubectl

# Chromium for Playwright PDF generation (system install — Alpine-compatible)
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Only copy the built output (server + client assets)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY --from=build /app/src/assets ./src/assets

# Copy test suite for in-cluster test runner
COPY --chown=node:node tests ./tests
RUN chmod +x tests/runner.sh tests/lib/*.sh tests/local/*.sh 2>/dev/null || true

# Include knowledge crawler scripts for the web-crawl API route
COPY scripts/knowledge/ /app/scripts/knowledge/
RUN cd /app/scripts/knowledge && npm install --production 2>/dev/null || true

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

USER node
CMD ["node", "./dist/server/entry.mjs"]
