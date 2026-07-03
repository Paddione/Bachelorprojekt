FROM node:22-slim AS builder
RUN apt-get update -qq && apt-get install -y -qq git ca-certificates >/dev/null
RUN git clone --depth 1 --branch v4.5.2 https://github.com/jackyzha0/quartz /q
WORKDIR /q
RUN npm ci
RUN rm -rf /q/content
COPY content /q/content
RUN npx quartz build
FROM ghcr.io/static-web-server/static-web-server:2-alpine
COPY --from=builder /q/public /public
