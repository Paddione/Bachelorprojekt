#!/bin/sh
# Substituiert Umgebungsvariablen in realm-homeoffice.json
# und startet Keycloak mit --import-realm
set -e

TEMPLATE="/opt/keycloak/realm-template/realm-homeoffice.json"
OUTPUT="/opt/keycloak/data/import/realm-homeoffice.json"

mkdir -p "$(dirname "$OUTPUT")"

# Alle ${VAR} Referenzen im JSON durch aktuelle Env-Werte ersetzen
envsubst < "$TEMPLATE" > "$OUTPUT"

echo "[import-entrypoint] Realm JSON generiert: $OUTPUT"

# Original Keycloak Entrypoint aufrufen
exec /opt/keycloak/bin/kc.sh start --import-realm "$@"
