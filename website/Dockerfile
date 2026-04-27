# ── Build stage ───────────────────────────────────────────────────────────────
# Build context is repo root so that tests/ can be copied into the runtime stage.
FROM node:22-alpine AS build
WORKDIR /app

COPY website/package.json website/package-lock.json ./
RUN npm ci

COPY website/ .

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Tools needed by test runner scripts
RUN apk add --no-cache bash curl jq && \
    KUBECTL_VERSION=$(curl -L -s https://dl.k8s.io/release/stable.txt) && \
    curl -LO "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" && \
    chmod +x kubectl && mv kubectl /usr/local/bin/kubectl

# Only copy the built output (server + client assets)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Copy test suite for in-cluster test runner
COPY --chown=node:node tests ./tests
RUN chmod +x tests/runner.sh tests/lib/*.sh tests/local/*.sh 2>/dev/null || true

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

USER node
CMD ["node", "./dist/server/entry.mjs"]
