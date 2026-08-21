#!/usr/bin/env bash
# scripts/sdlc-auth-mode.sh
#
# Schaltet den Login der lokalen SDLC-Console zwischen der mitgelieferten
# Pocket ID (auth.localhost) und der PRODUKTIONS-Pocket-ID um.
#
# ── Warum das ueberhaupt noetig ist ──────────────────────────────────────────
# Ein Passkey ist eine WebAuthn-Credential und an die RP-ID der Domain
# gebunden, auf der er registriert wurde. Ein auf auth.mentolder.de angelegter
# Passkey existiert in der lokalen Pocket ID auf auth.localhost nicht — der
# Browser bietet ihn dort nicht einmal zur Auswahl an. Passkeys "kopieren" geht
# per Konstruktion nicht: der private Schluessel verlaesst den Authenticator
# nie, und die RP-ID ist Teil der Signatur.
#
# Der einzige Weg, mit einem Prod-Passkey in die localhost-Console zu kommen,
# ist deshalb, den Authorize-Schritt AUF der Prod-Domain stattfinden zu lassen
# und Pocket ID danach nach http://web.localhost/api/auth/callback
# zurueckleiten zu lassen.
#
# ── Was der prod-Modus anfasst ──────────────────────────────────────────────
# In PROD: legt genau EINEN zusaetzlichen OIDC-Client an (`website-local`) mit
#   der localhost-Callback-URL. Der Prod-`website`-Client bleibt unberuehrt —
#   deshalb ein eigener Client statt einer zusaetzlichen Callback-URL am
#   bestehenden: ein Fehlgriff hier sperrt niemanden aus web.<PROD_DOMAIN> aus,
#   und der Client laesst sich jederzeit ersatzlos loeschen.
# LOKAL: setzt ConfigMap sdlc-console-config und das Client-Secret in
#   workspace-secrets/website-secrets, dann Rollout-Restart.
#
# Der Client ist confidential (isPublic=false): ein abgefangener Auth-Code ist
# ohne das Secret nicht einloesbar.
#
# ── Verwendung ──────────────────────────────────────────────────────────────
#   scripts/sdlc-auth-mode.sh prod    [--domain mentolder.de]
#   scripts/sdlc-auth-mode.sh local
#   scripts/sdlc-auth-mode.sh status
#
# Nach jedem `task sdlc:sdlc:deploy` erneut aufrufen: der Deploy appliziert
# k3d/secrets.yaml und setzt POCKET_ID_WEBSITE_SECRET auf den Dev-Wert zurueck
# (dieselbe Mechanik, gegen die sdlc:oidc:sync im local-Modus laeuft).
set -euo pipefail

MODE="${1:-status}"
shift || true

CONTEXT="k3d-mentolder-dev"
NS="workspace"
DOMAIN="mentolder.de"
CLIENT="website-local"
CALLBACK="http://web.localhost/api/auth/callback"
SECRETS_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --context) CONTEXT="$2"; shift 2 ;;
    --namespace) NS="$2"; shift 2 ;;
    --domain) DOMAIN="$2"; shift 2 ;;
    --client) CLIENT="$2"; shift 2 ;;
    --secrets-file) SECRETS_FILE="$2"; shift 2 ;;
    -h|--help) sed -n '2,45p' "$0"; exit 0 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
: "${SECRETS_FILE:=${REPO_ROOT}/environments/.secrets/$(printf '%s' "$DOMAIN" | cut -d. -f1).yaml}"
AUTH_BASE="https://auth.${DOMAIN}"

kube() { kubectl --context "$CONTEXT" -n "$NS" "$@"; }

require_cluster() {
  if ! kube get deploy/sdlc-console >/dev/null 2>&1; then
    echo "FEHLER: deployment/sdlc-console in ${CONTEXT}/${NS} nicht gefunden." >&2
    echo "  Zuerst: task sdlc:sdlc:deploy" >&2
    exit 1
  fi
}

show_status() {
  echo "Kontext:   ${CONTEXT}/${NS}"
  kube get configmap sdlc-console-config \
    -o jsonpath='  SITE_URL:      {.data.SITE_URL}{"\n"}  Pocket ID:     {.data.POCKET_ID_FRONTEND_URL}{"\n"}  intern:        {.data.POCKET_ID_URL}{"\n"}  client_id:     {.data.POCKET_ID_CLIENT_ID}{"\n"}' \
    2>/dev/null || echo "  (ConfigMap nicht lesbar)"
}

# ── git-crypt-Guard ─────────────────────────────────────────────────────────
# Bei verschlossenem git-crypt ist die Datei Binaermuell; ein grep darauf
# liefert einfach nichts und der Fehler faellt erst als "401 vom Admin-API"
# auf. Deshalb hier explizit pruefen, was gelesen wurde.
read_secret_value() {
  local key="$1"
  if [ ! -f "$SECRETS_FILE" ]; then
    echo "FEHLER: ${SECRETS_FILE} existiert nicht." >&2
    exit 1
  fi
  local val
  val=$(grep -m1 "^${key}:" "$SECRETS_FILE" 2>/dev/null | sed -E 's/^[^:]+: *"?([^"]*)"?[[:space:]]*$/\1/') || true
  if [ -z "$val" ]; then
    echo "FEHLER: ${key} konnte aus ${SECRETS_FILE} nicht gelesen werden." >&2
    echo "  Haeufigste Ursache: git-crypt ist verschlossen (git-crypt unlock)." >&2
    exit 1
  fi
  printf '%s' "$val"
}

api() {
  local method="$1" path="$2"; shift 2
  curl -fsS -X "$method" -H "X-API-KEY: ${API_KEY}" -H "Content-Type: application/json" \
    --connect-timeout 10 --max-time 30 "$@" "${AUTH_BASE}${path}"
}

ensure_prod_client() {
  echo "→ pruefe OIDC-Client '${CLIENT}' auf ${AUTH_BASE}"
  local existing
  existing=$(api GET "/api/oidc/clients/${CLIENT}" 2>/dev/null || true)

  local body
  body=$(printf '{"id":"%s","name":"%s","callbackURLs":["%s"],"logoutCallbackURLs":["http://web.localhost"],"isPublic":false,"pkceEnabled":false,"requiresReauthentication":false,"requiresPushedAuthorizationRequests":false}' \
    "$CLIENT" "$CLIENT" "$CALLBACK")

  if [ -n "$existing" ]; then
    api PUT "/api/oidc/clients/${CLIENT}" -d "$body" >/dev/null
    echo "  Client existiert — Callback-URL auf ${CALLBACK} gesetzt"
  else
    api POST "/api/oidc/clients" -d "$body" >/dev/null
    echo "  Client angelegt (Callback ${CALLBACK})"
  fi
}

rotate_prod_client_secret() {
  # Immer rotieren statt zu versuchen, den alten Wert zu lesen: Pocket ID gibt
  # ein Client-Secret nur EINMAL heraus, bei der Erzeugung. Fuer einen reinen
  # Entwickler-Client ist die Rotation folgenlos — er hat genau einen
  # Konsumenten, naemlich diese lokale Console.
  local gen
  gen=$(api POST "/api/oidc/clients/${CLIENT}/secret")
  local plain
  plain=$(printf '%s' "$gen" | sed -E 's/.*"secret":"([^"]+)".*/\1/')
  if [ -z "$plain" ] || [ "$plain" = "$gen" ]; then
    echo "FEHLER: Client-Secret nicht aus der Antwort lesbar: ${gen}" >&2
    exit 1
  fi
  printf '%s' "$plain"
}

apply_local_configmap() {
  local frontend="$1" internal="$2" client_id="$3"
  kube patch configmap sdlc-console-config --type merge -p "$(printf \
    '{"data":{"POCKET_ID_FRONTEND_URL":"%s","POCKET_ID_URL":"%s","POCKET_ID_CLIENT_ID":"%s","SITE_URL":"http://web.localhost"}}' \
    "$frontend" "$internal" "$client_id")" >/dev/null
}

restart_console() {
  echo "→ starte sdlc-console neu (Env wird nur beim Start gelesen)"
  kube rollout restart deploy/sdlc-console >/dev/null
  kube rollout status deploy/sdlc-console --timeout=300s
}

case "$MODE" in
  prod)
    require_cluster
    API_KEY="$(read_secret_value POCKET_ID_API_KEY)"

    if ! curl -fsS -o /dev/null --connect-timeout 10 "${AUTH_BASE}/.well-known/openid-configuration"; then
      echo "FEHLER: ${AUTH_BASE} ist nicht erreichbar." >&2
      exit 1
    fi

    ensure_prod_client
    SECRET="$(rotate_prod_client_secret)"
    echo "  Secret erzeugt (${#SECRET} Zeichen)"

    for s in workspace-secrets website-secrets; do
      if kube get secret "$s" >/dev/null 2>&1; then
        kube patch secret "$s" --type merge \
          -p "{\"stringData\":{\"POCKET_ID_WEBSITE_SECRET\":\"${SECRET}\"}}" >/dev/null
        echo "  → ${s}/POCKET_ID_WEBSITE_SECRET aktualisiert"
      fi
    done

    apply_local_configmap "$AUTH_BASE" "$AUTH_BASE" "$CLIENT"
    restart_console
    echo
    echo "✓ Console meldet sich jetzt gegen ${AUTH_BASE} an."
    echo "  Login: http://web.localhost  (NICHT sdlc.localhost — nur web.localhost"
    echo "  ist als redirect_uri registriert)."
    echo "  Dort greift dein Prod-Passkey, weil der Authorize-Schritt auf"
    echo "  auth.${DOMAIN} laeuft."
    echo "  Zurueck: scripts/sdlc-auth-mode.sh local"
    ;;

  local)
    require_cluster
    apply_local_configmap "http://auth.localhost" "http://pocket-id:1411" "website"
    echo "→ gleiche das Client-Secret der lokalen Pocket ID ab"
    "${REPO_ROOT}/scripts/sdlc-sync-oidc-secret.sh" --context "$CONTEXT" --namespace "$NS"
    echo "✓ Console meldet sich wieder gegen http://auth.localhost an."
    ;;

  status)
    show_status
    ;;

  *)
    echo "Verwendung: $0 {prod|local|status} [--domain <d>] [--context <ctx>]" >&2
    exit 2
    ;;
esac
