# Stage 1: build Vite client bundle
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY public ./public
COPY vite.config.ts tsconfig.json tsconfig.client.json tsconfig.server.json ./
RUN npm run build

# Stage 2: runtime (tsx server + built client)
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
COPY --from=builder /app/dist/client ./dist/client
USER node
EXPOSE 3000
CMD ["npm", "start"]
