# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

# Install envsubst (via gettext)
RUN apk add --no-cache gettext

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Substitute variables in all .astro, .ts, .js, .svelte, .css files
# before building the website.
ARG PROD_DOMAIN
ARG BRAND_NAME
ARG CONTACT_EMAIL
ENV PROD_DOMAIN=$PROD_DOMAIN
ENV BRAND_NAME=$BRAND_NAME
ENV CONTACT_EMAIL=$CONTACT_EMAIL
RUN find src -type f \( -name "*.astro" -o -name "*.ts" -o -name "*.js" -o -name "*.svelte" -o -name "*.css" \) -exec sh -c 'envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL" < "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# Only copy the built output (server + client assets)
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
