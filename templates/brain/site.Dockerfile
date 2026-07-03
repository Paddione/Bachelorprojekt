FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npx quartz build

FROM ghcr.io/paddione/workspace-static-server:latest
COPY --from=builder /app/dist /public
EXPOSE 8787
CMD ["static-web-server", "--host", "0.0.0.0", "--port", "8787", "/public"]
