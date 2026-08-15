# syntax=docker/dockerfile:1
# ── Build stage ───────────────────────────────────────────────────────────────
# Build context is repo root so that tests/ can be copied into the runtime stage.
FROM node:24-alpine AS build
WORKDIR /app

# T001224/T001276: website migrated to pnpm — `website/package-lock.json` was
# deleted, only `website/pnpm-lock.yaml` exists. Corepack is bundled with
# node 24, so we enable pnpm@10 (matches `.github/workflows/ci.yml` +
# `.github/workflows/build-mentolder-web.yml`).
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

# Copy ONLY the manifest + lockfile + workspace config first so dependency layer caches cleanly.
# pnpm-workspace.yaml must be present alongside pnpm-lock.yaml — it contains the
# overrides section that the lockfile was generated with; omitting it causes
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH on --frozen-lockfile installs.
COPY website/package.json website/pnpm-lock.yaml website/pnpm-workspace.yaml ./
RUN --mount=type=cache,target=/pnpm/store pnpm install --frozen-lockfile

COPY website/ .

# [T002466] Lavish-Kit-Assets als ECHTE Dateien nachziehen.
# website/public/cockpit/{kit,cockpit-shell.html,reference-board.html} sind im Repo
# Symlinks nach ../../../.lavish/ — .lavish/ ist die SSOT (K1-Kit + K2-Daemon), und
# eine Kopie im Repo waere Duplikation. Im Checkout und unter `pnpm dev` loesen sie
# auf; das COPY oben kopiert aber nur den website-Teilbaum nach /app, wo das Ziel
# /.lavish/ nicht existiert. Ohne diese drei Zeilen landen tote Symlinks im dist,
# und /cockpit/kit/ liefert im Prod-Image 404, waehrend lokal alles korrekt aussieht.
# Der Build-Kontext ist das Repo-Root (build-website.yml: `context: .`), .lavish/ ist
# also verfuegbar. Die Kopien ueberschreiben die Symlinks an derselben Stelle, damit
# beide Wege — lokal ueber den Symlink, im Image ueber die Kopie — denselben Pfad
# bedienen. Guard: tests/spec/sdlc-cockpit/kit-assets-in-image.bats
COPY .lavish/kit ./public/cockpit/kit
COPY .lavish/cockpit-shell.html ./public/cockpit/cockpit-shell.html
COPY .lavish/reference-board.html ./public/cockpit/reference-board.html

# Cap Node.js heap to force GC before hitting kernel OOM (T000315).
# The pixi.js + Astro build is memory-hungry; without an explicit limit,
# the dev node (k3s-1) crashes with SIGSEGV or esbuild memory-corruption.
ENV NODE_OPTIONS=--max-old-space-size=3072
# ADR-006 Etappe 1 (T002624): BUILD_TARGET steuert die Astro-Integration
# build-target (filtert das Route-Manifest). Der Workflow reicht ihn als
# --build-arg; ohne ARG/ENV hier wird er ein stilles No-Op (T002202-Bugklasse).
# Default "prod": der lokale `pnpm build` und CI ohne Variablen bauen die
# Kunden-Website; nur das SDLC-Console-Image setzt BUILD_TARGET=sdlc.
ARG BUILD_TARGET=prod
ENV BUILD_TARGET=${BUILD_TARGET}
RUN pnpm run build

# Prune devDependencies so the runtime stage copies only prod node_modules
# (~1.2 GB → ~600 MB). Chromium/kubectl/tests/ bleiben bewusst im Runtime-Image.
RUN pnpm install --prod

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:24-alpine AS runtime
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

# Build provenance (T002202). ARG is per-stage, so these must live in the
# runtime stage — an ARG declared only in the build stage would be invisible
# here and the --build-arg values would silently become no-ops (which is
# exactly what happened to this Dockerfile once before; see build-website.yml).
# The SHA rides the image rather than a manifest: the website has three render
# paths (Flux OCI artifact, task workspace:deploy, legacy CI deploy jobs) and a
# manifest-carried value would have to be correct in all three.
ARG GIT_SHA=unknown
ARG BUILT_AT=unknown
ENV GIT_SHA=${GIT_SHA}
ENV BUILT_AT=${BUILT_AT}

# T003036: BUILD_TARGET muss in der runtime-Stage sichtbar sein, damit die
# Middleware zur Laufzeit prüfen kann, ob sie der sdlc-Build ist. ARG gilt
# pro Stage — ohne diese Wiederholung wäre das Build-Arg aus der build-Stage
# in der runtime-Stage unsichtbar (identischer Defekt wie bei GIT_SHA/BUILT_AT
# vor T002202, dokumentiert in website/CLAUDE.md).
ARG BUILD_TARGET=prod
ENV BUILD_TARGET=${BUILD_TARGET}

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

USER node
CMD ["node", "./dist/server/entry.mjs"]
