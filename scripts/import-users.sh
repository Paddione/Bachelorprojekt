#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# Keycloak User Import Script
# ═══════════════════════════════════════════════════════════════════
# Importiert User aus CSV oder LDIF in Keycloak über die Admin REST API.
# Erstellt fehlende Gruppen automatisch.
#
# Voraussetzungen:
#   - curl, jq (apt install curl jq)
#   - Keycloak läuft und ist erreichbar
#
# Verwendung:
#   ./import-users.sh --csv users.csv
#   ./import-users.sh --ldif users.ldif
#   ./import-users.sh --csv users.csv --url https://auth.example.com --admin admin
#
# CSV-Format (erste Zeile = Header):
#   username,email,display_name,groups,first_name,last_name
#   anna.schmidt,anna@example.com,Anna Schmidt,"workspace_users;admins",Anna,Schmidt
#   max.mueller,max@example.com,Max Müller,workspace_users,Max,Müller
#
# LDIF-Format: Standard LDAP LDIF (objectClass: inetOrgPerson)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────
KC_URL="${KC_URL:-}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:-}"
KC_REALM="workspace"
MODE=""
INPUT_FILE=""
DEFAULT_GROUP="workspace_users"
DEFAULT_PASSWORD="ChangeMe123!"   # User müssen beim ersten Login ändern
DRY_RUN=false

# ── Farben ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }

# ── Hilfe ────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Verwendung: $0 [Optionen]

Optionen:
  --csv FILE        CSV-Datei importieren (Format siehe oben)
  --ldif FILE       LDIF-Datei importieren
  --url URL         Keycloak URL (Standard: aus KC_URL oder KC_DOMAIN)
                    z.B. https://bachelorprojekt-auth.duckdns.org
  --admin USER      Keycloak Admin-User (Standard: admin)
  --pass PASS       Keycloak Admin-Passwort (oder KEYCLOAK_ADMIN_PASSWORD setzen)
  --realm REALM     Keycloak Realm (Standard: workspace)
  --group GROUP     Standard-Gruppe für alle User (Standard: workspace_users)
  --dry-run         Zeigt was importiert würde, ohne es zu tun
  -h, --help        Diese Hilfe

Beispiele:
  # Lokales Keycloak
  ./import-users.sh --csv users.csv --url https://localhost:8443

  # Remote Keycloak
  ./import-users.sh --csv users.csv --url https://auth.example.com --pass geheim

  # Nur anzeigen was passieren würde
  ./import-users.sh --csv users.csv --dry-run
EOF
  exit 0
}

# ── Argumente parsen ─────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --csv)   MODE="csv";  INPUT_FILE="$2"; shift 2 ;;
    --ldif)  MODE="ldif"; INPUT_FILE="$2"; shift 2 ;;
    --url)   KC_URL="$2"; shift 2 ;;
    --admin) KC_ADMIN="$2"; shift 2 ;;
    --pass)  KC_PASS="$2"; shift 2 ;;
    --realm) KC_REALM="$2"; shift 2 ;;
    --group) DEFAULT_GROUP="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    -h|--help) usage ;;
    *) error "Unbekannte Option: $1"; usage ;;
  esac
done

# ── Validierung ──────────────────────────────────────────────────────
[[ -z "$MODE" ]] && { error "Bitte --csv oder --ldif angeben."; usage; }
[[ -z "$INPUT_FILE" || ! -f "$INPUT_FILE" ]] && { error "Datei nicht gefunden: $INPUT_FILE"; exit 1; }
command -v curl &>/dev/null || { error "curl nicht gefunden (apt install curl)"; exit 1; }
command -v jq   &>/dev/null || { error "jq nicht gefunden (apt install jq)"; exit 1; }

# URL ermitteln
if [[ -z "$KC_URL" ]]; then
  if [[ -n "${KC_DOMAIN:-}" ]]; then
    KC_URL="https://${KC_DOMAIN}"
  else
    error "Keycloak-URL nicht gesetzt. Verwende --url oder setze KC_URL / KC_DOMAIN."
    exit 1
  fi
fi

# Passwort abfragen wenn nicht gesetzt
if [[ -z "$KC_PASS" ]]; then
  read -rsp "Keycloak Admin-Passwort für '$KC_ADMIN': " KC_PASS
  echo
fi

# ── Auth-Token holen ─────────────────────────────────────────────────
info "Verbinde mit Keycloak: $KC_URL"
TOKEN_RESPONSE=$(curl -s -X POST "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -d "client_id=admin-cli" \
  -d "username=${KC_ADMIN}" \
  -d "password=${KC_PASS}" \
  -d "grant_type=password" 2>&1)

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.access_token // empty' 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  error "Login fehlgeschlagen. Antwort: $TOKEN_RESPONSE"
  exit 1
fi
success "Authentifiziert als '$KC_ADMIN'"

# ── Hilfsfunktionen ──────────────────────────────────────────────────

kc_get() {
  curl -s -H "Authorization: Bearer ${TOKEN}" "${KC_URL}/admin/realms/${KC_REALM}${1}"
}

kc_post() {
  local endpoint="$1" data="$2"
  curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$data" \
    -w "\n%{http_code}" \
    "${KC_URL}/admin/realms/${KC_REALM}${endpoint}"
}

kc_put() {
  local endpoint="$1" data="$2"
  curl -s -X PUT \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$data" \
    -w "\n%{http_code}" \
    "${KC_URL}/admin/realms/${KC_REALM}${endpoint}"
}

# Gruppe erstellen falls nicht vorhanden, gibt Gruppen-ID zurück
ensure_group() {
  local group="$1"
  [[ -z "$group" ]] && return

  # Existierende Gruppe suchen
  local existing
  existing=$(kc_get "/groups?search=${group}&exact=true" | jq -r '.[0].id // empty' 2>/dev/null)
  if [[ -n "$existing" ]]; then
    echo "$existing"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Würde Gruppe erstellen: $group"
    echo "dry-run-id"
    return
  fi

  local response http_code body
  response=$(kc_post "/groups" "{\"name\":\"${group}\"}")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "201" || "$http_code" == "409" ]]; then
    # 201 = created, 409 = already exists (race condition)
    local gid
    gid=$(kc_get "/groups?search=${group}&exact=true" | jq -r '.[0].id // empty' 2>/dev/null)
    if [[ -n "$gid" ]]; then
      [[ "$http_code" == "201" ]] && success "Gruppe erstellt: $group"
      echo "$gid"
      return
    fi
  fi

  warn "Gruppe konnte nicht erstellt werden: $group (HTTP $http_code)"
  echo ""
}

# User erstellen
create_user() {
  local username="$1" email="$2" first_name="$3" last_name="$4"

  if $DRY_RUN; then
    warn "[DRY-RUN] Würde User erstellen: $username ($email)"
    return 0
  fi

  local payload
  payload=$(jq -n \
    --arg u "$username" \
    --arg e "$email" \
    --arg fn "$first_name" \
    --arg ln "$last_name" \
    '{username: $u, email: $e, firstName: $fn, lastName: $ln, enabled: true}')

  local response http_code body
  response=$(kc_post "/users" "$payload")
  http_code=$(echo "$response" | tail -1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "201" ]]; then
    # Passwort setzen
    local user_id
    user_id=$(kc_get "/users?username=${username}&exact=true" | jq -r '.[0].id // empty')
    if [[ -n "$user_id" ]]; then
      kc_put "/users/${user_id}/reset-password" \
        "{\"type\":\"password\",\"value\":\"${DEFAULT_PASSWORD}\",\"temporary\":true}" > /dev/null
    fi
    success "User erstellt: $username"
    return 0
  elif [[ "$http_code" == "409" ]]; then
    warn "User existiert bereits: $username — übersprungen"
    return 0
  else
    local err
    err=$(echo "$body" | jq -r '.errorMessage // empty' 2>/dev/null)
    error "Fehler beim Erstellen von '$username': ${err:-HTTP $http_code}"
    return 1
  fi
}

# User zu Gruppe hinzufügen
add_to_group() {
  local username="$1" group_id="$2"
  [[ -z "$group_id" || "$group_id" == "dry-run-id" ]] && return
  $DRY_RUN && return

  local user_id
  user_id=$(kc_get "/users?username=${username}&exact=true" | jq -r '.[0].id // empty')
  [[ -z "$user_id" ]] && { warn "User nicht gefunden: $username"; return; }

  kc_put "/users/${user_id}/groups/${group_id}" '{}' > /dev/null
}

# ── CSV Import ───────────────────────────────────────────────────────
import_csv() {
  info "Importiere CSV: $INPUT_FILE"
  local count=0 errors=0
  local header=true

  while IFS=',' read -r username email display_name groups first_name last_name || [[ -n "$username" ]]; do
    # Header-Zeile überspringen
    if $header; then header=false; continue; fi
    # Leerzeilen überspringen
    [[ -z "$username" ]] && continue
    # Quotes entfernen
    username="${username//\"/}"; username="${username// /}"
    email="${email//\"/}"; email="${email// /}"
    display_name="${display_name//\"/}"
    groups="${groups//\"/}"
    first_name="${first_name//\"/}"
    last_name="${last_name//\"/}"

    # Default-Gruppe hinzufügen wenn groups leer
    [[ -z "$groups" ]] && groups="$DEFAULT_GROUP"

    info "Verarbeite: $username ($email)"

    if create_user "$username" "$email" "$first_name" "$last_name"; then
      # Gruppen zuweisen (semikolon-getrennt)
      IFS=';' read -ra group_list <<< "$groups"
      for grp in "${group_list[@]}"; do
        grp="${grp// /}"
        [[ -z "$grp" ]] && continue
        local gid
        gid=$(ensure_group "$grp")
        add_to_group "$username" "$gid"
        $DRY_RUN || info "  → Gruppe: $grp"
      done
      ((count++)) || true
    else
      ((errors++)) || true
    fi
  done < "$INPUT_FILE"

  echo ""
  success "CSV-Import abgeschlossen: ${count} User importiert, ${errors} Fehler"
  [[ $errors -gt 0 ]] && warn "Überprüfe die Fehlermeldungen oben."
}

# ── LDIF Import ──────────────────────────────────────────────────────
import_ldif() {
  info "Importiere LDIF: $INPUT_FILE"
  local count=0 errors=0
  local username="" email="" display_name="" first_name="" last_name="" dn=""

  flush_ldif_entry() {
    [[ -z "$username" ]] && return
    info "Verarbeite: $username ($email)"
    if create_user "$username" "$email" "${first_name:-}" "${last_name:-}"; then
      local gid
      gid=$(ensure_group "$DEFAULT_GROUP")
      add_to_group "$username" "$gid"
      ((count++)) || true
    else
      ((errors++)) || true
    fi
    username=""; email=""; display_name=""; first_name=""; last_name=""; dn=""
  }

  while IFS= read -r line || [[ -n "$line" ]]; do
    # Leerzeile = Eintrag abgeschlossen
    if [[ -z "$line" ]]; then
      flush_ldif_entry
      continue
    fi
    # Kommentare ignorieren
    [[ "$line" =~ ^# ]] && continue

    key="${line%%:*}"
    value="${line#*: }"

    case "${key,,}" in
      dn)          dn="$value" ;;
      uid)         username="$value" ;;
      mail)        email="$value" ;;
      cn)          display_name="$value" ;;
      givenname)   first_name="$value" ;;
      sn)          last_name="$value" ;;
      samaccountname) [[ -z "$username" ]] && username="$value" ;;
      userprincipalname) [[ -z "$email" ]] && email="${value%%@*}@${value#*@}" ;;
    esac
  done < "$INPUT_FILE"
  flush_ldif_entry  # letzten Eintrag verarbeiten

  echo ""
  success "LDIF-Import abgeschlossen: ${count} User importiert, ${errors} Fehler"
  [[ $errors -gt 0 ]] && warn "Überprüfe die Fehlermeldungen oben."
}

# ── Main ─────────────────────────────────────────────────────────────
echo ""
info "Standard-Gruppe: $DEFAULT_GROUP"
info "Standard-Passwort: $DEFAULT_PASSWORD  ← User müssen es beim ersten Login ändern"
$DRY_RUN && warn "DRY-RUN Modus — keine Änderungen werden vorgenommen"
echo ""

ensure_group "$DEFAULT_GROUP" > /dev/null

case "$MODE" in
  csv)  import_csv ;;
  ldif) import_ldif ;;
esac
