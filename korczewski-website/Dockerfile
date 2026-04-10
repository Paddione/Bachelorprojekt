# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

RUN apk add --no-cache gettext

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG PROD_DOMAIN
ARG BRAND_NAME
ARG CONTACT_EMAIL
ARG CONTACT_PHONE
ARG CONTACT_CITY
ARG CONTACT_NAME
ARG LEGAL_STREET
ARG LEGAL_ZIP
ARG LEGAL_JOBTITLE
ARG LEGAL_CHAMBER
ARG LEGAL_UST_ID
ARG LEGAL_WEBSITE
ENV PROD_DOMAIN=$PROD_DOMAIN
ENV BRAND_NAME=$BRAND_NAME
ENV CONTACT_EMAIL=$CONTACT_EMAIL
ENV CONTACT_PHONE=$CONTACT_PHONE
ENV CONTACT_CITY=$CONTACT_CITY
ENV CONTACT_NAME=$CONTACT_NAME
ENV LEGAL_STREET=$LEGAL_STREET
ENV LEGAL_ZIP=$LEGAL_ZIP
ENV LEGAL_JOBTITLE=$LEGAL_JOBTITLE
ENV LEGAL_CHAMBER=$LEGAL_CHAMBER
ENV LEGAL_UST_ID=$LEGAL_UST_ID
ENV LEGAL_WEBSITE=$LEGAL_WEBSITE
RUN find src -type f \( -name "*.astro" -o -name "*.ts" -o -name "*.js" -o -name "*.svelte" -o -name "*.css" \) -exec sh -c 'envsubst "\$PROD_DOMAIN \$BRAND_NAME \$CONTACT_EMAIL \$CONTACT_PHONE \$CONTACT_CITY \$CONTACT_NAME \$LEGAL_STREET \$LEGAL_ZIP \$LEGAL_JOBTITLE \$LEGAL_CHAMBER \$LEGAL_UST_ID \$LEGAL_WEBSITE" < "$1" > "$1.tmp" && mv "$1.tmp" "$1"' _ {} \;

RUN npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

ENV HOST=0.0.0.0
ENV PORT=4321
EXPOSE 4321

CMD ["node", "./dist/server/entry.mjs"]
