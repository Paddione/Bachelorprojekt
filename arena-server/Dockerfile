# syntax=docker/dockerfile:1.7
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate && pnpm install --frozen-lockfile

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate && pnpm run build && pnpm prune --prod

FROM node:20-alpine AS runtime
WORKDIR /app

# Enable pnpm for in-pod builds (arena:sync) and add procps for pkill
RUN corepack enable && corepack prepare pnpm@9.15.3 --activate && \
    apk add --no-cache procps

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src/db/migrations ./dist/db/migrations

EXPOSE 8090
USER node
CMD ["node", "dist/index.js"]