#!/bin/sh
# Substituiert Umgebungsvariablen in realm-homeoffice.json
# und startet Keycloak mit --import-realm
#
# Hinweis: envsubst ist im Keycloak-Image (RHEL UBI9-micro) nicht
# verfügbar, daher werden die Variablen per sed ersetzt.
set -e

TEMPLATE="/opt/keycloak/realm-template/realm-homeoffice.json"
OUTPUT="/opt/keycloak/data/import/realm-homeoffice.json"

mkdir -p "$(dirname "$OUTPUT")"

# Alle ${VAR} Referenzen im JSON durch aktuelle Env-Werte ersetzen (sed-basiert)
cp "$TEMPLATE" "$OUTPUT"
for var in MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET \
           MM_DOMAIN NC_DOMAIN; do
  eval val="\${${var}:-}"
  if [ -z "$val" ]; then
    echo "[import-entrypoint] WARNUNG: ${var} ist nicht gesetzt!"
  else
    sed -i "s|\${${var}}|${val}|g" "$OUTPUT"
  fi
done

echo "[import-entrypoint] Realm JSON generiert: $OUTPUT"

# Original Keycloak Entrypoint aufrufen
exec /opt/keycloak/bin/kc.sh start --import-realm "$@"
