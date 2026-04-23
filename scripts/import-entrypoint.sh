#!/bin/sh
# Substituiert Umgebungsvariablen in realm-workspace.json
# und startet Keycloak mit --import-realm
#
# Hinweis: envsubst ist im Keycloak-Image (RHEL UBI9-micro) nicht
# verfügbar, daher werden die Variablen per sed ersetzt.
#
# Wichtig: Wenn hier eine Variable fehlt, landet ihr literaler ${VAR}-
# String in der KC-Datenbank, weil kc.sh start --import-realm den
# Realm nur einmalig importiert. Spätere Auth-Flows scheitern dann
# mit "Invalid client credentials". Die Sanity-Prüfung am Ende lässt
# das Pod failen, statt einen kaputten Realm zu produzieren.
set -e

TEMPLATE="/opt/keycloak/realm-template/realm-workspace.json"
OUTPUT="/opt/keycloak/data/import/realm-workspace.json"

mkdir -p "$(dirname "$OUTPUT")"

# Alle ${VAR} Referenzen im JSON durch aktuelle Env-Werte ersetzen (sed-basiert)
cp "$TEMPLATE" "$OUTPUT"
for var in NEXTCLOUD_OIDC_SECRET \
           VAULTWARDEN_OIDC_SECRET WEBSITE_OIDC_SECRET CLAUDE_CODE_OIDC_SECRET \
           DOCS_OIDC_SECRET TRAEFIK_OIDC_SECRET \
           NC_DOMAIN WEB_DOMAIN VAULT_DOMAIN DOCS_DOMAIN TRAEFIK_DOMAIN; do
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

# KC 26 changed --import-realm to exit after import.
# Use 'import' subcommand (idempotent, skips existing realms) then 'start'.
/opt/keycloak/bin/kc.sh import --file "$OUTPUT" --override false

echo "[import-entrypoint] Realm importiert (oder bereits vorhanden). Starte KC-Server..."

exec /opt/keycloak/bin/kc.sh start "$@"
