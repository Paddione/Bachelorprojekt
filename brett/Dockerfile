# syntax=docker/dockerfile:1
# Stage 1: build Vite client bundle
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci
COPY src ./src
COPY public ./public
COPY vite.config.ts tsconfig.json tsconfig.client.json tsconfig.server.json ./
RUN npm run build

# Stage 2: runtime (tsx server + built client)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev
COPY src ./src
COPY --from=builder /app/dist/client ./dist/client
# Vite (root: 'public') bundles only index.html + imported JS into dist/client; the
# static figure-pack/props/terrain assets fetched at runtime (/assets/...) are NOT
# emitted by the build, so ship public/assets into the served dir explicitly.
# Without this, express.static(dist/client) 404s every figure-pack asset (T000527).
COPY --from=builder /app/public/assets ./dist/client/assets
USER node
EXPOSE 3000
CMD ["npm", "start"]
