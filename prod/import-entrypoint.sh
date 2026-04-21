#!/bin/sh
# Substituiert Umgebungsvariablen in realm-workspace.json
# und startet Keycloak mit --import-realm
#
# Production-Variante: substituiert alle ${VAR} Platzhalter, die das
# Realm-Template referenziert. Die Liste muss vollständig sein, weil
# kc.sh start --import-realm den Realm nur beim ersten Start einliest.
# Wenn hier eine Variable fehlt, landet ihr literaler ${VAR}-String in
# der KC-Datenbank und Auth-Flows scheitern später mit
# "Invalid client credentials".
set -e

TEMPLATE="/opt/keycloak/realm-template/realm-workspace.json"
OUTPUT="/opt/keycloak/data/import/realm-workspace.json"

mkdir -p "$(dirname "$OUTPUT")"

# Alle ${VAR} Referenzen im JSON durch aktuelle Env-Werte ersetzen (sed-basiert)
cp "$TEMPLATE" "$OUTPUT"
for var in \
    \
    NEXTCLOUD_OIDC_SECRET \
    VAULTWARDEN_OIDC_SECRET \
    CLAUDE_CODE_OIDC_SECRET \
    WEBSITE_OIDC_SECRET \
    DOCS_OIDC_SECRET \
    NC_DOMAIN \
    BILLING_DOMAIN \
    VAULT_DOMAIN \
    AI_DOMAIN \
    WEB_DOMAIN \
    DOCS_DOMAIN \
    PROD_DOMAIN; do
  eval val="\${${var}:-}"
  if [ -z "$val" ]; then
    echo "[import-entrypoint] WARNUNG: ${var} ist nicht gesetzt!"
  else
    sed -i "s|\${${var}}|${val}|g" "$OUTPUT"
  fi
done

# Sanity check: keine unaufgelösten ${...} Platzhalter mehr im Output
if grep -q '\${[A-Z_]*}' "$OUTPUT"; then
  echo "[import-entrypoint] FEHLER: Unaufgelöste Platzhalter im Realm-JSON:" >&2
  grep -o '\${[A-Z_]*}' "$OUTPUT" | sort -u >&2
  exit 1
fi

echo "[import-entrypoint] Realm JSON generiert: $OUTPUT"

# Original Keycloak Entrypoint aufrufen
exec /opt/keycloak/bin/kc.sh start --import-realm "$@"
