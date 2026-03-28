#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# LLDAP User Import Script
# ═══════════════════════════════════════════════════════════════════
# Importiert User aus CSV oder LDIF in LLDAP über die REST API.
# Erstellt fehlende Gruppen automatisch.
#
# Voraussetzungen:
#   - curl, jq (apt install curl jq)
#   - LLDAP läuft und ist erreichbar (lokal oder per URL)
#
# Verwendung:
#   ./import-users.sh --csv users.csv
#   ./import-users.sh --ldif users.ldif
#   ./import-users.sh --csv users.csv --url https://ldap.example.com --admin admin
#
# CSV-Format (erste Zeile = Header):
#   username,email,display_name,groups,first_name,last_name
#   anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
#   max.mueller,max@example.com,Max Müller,homeoffice_users,Max,Müller
#
# LDIF-Format: Standard LDAP LDIF (objectClass: inetOrgPerson)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────
LLDAP_URL="${LLDAP_URL:-http://localhost:17170}"
LLDAP_ADMIN="${LLDAP_ADMIN:-admin}"
LLDAP_PASS="${LLDAP_LDAP_USER_PASS:-}"
MODE=""
INPUT_FILE=""
DEFAULT_GROUP="homeoffice_users"
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
  --url URL         LLDAP URL (Standard: http://localhost:17170)
                    Bei Docker Compose: http://lldap:17170
  --admin USER      LLDAP Admin-User (Standard: admin)
  --pass PASS       LLDAP Admin-Passwort (oder LLDAP_LDAP_USER_PASS setzen)
  --group GROUP     Standard-Gruppe für alle User (Standard: homeoffice_users)
  --dry-run         Zeigt was importiert würde, ohne es zu tun
  -h, --help        Diese Hilfe

Beispiele:
  # Lokaler LLDAP-Container (Docker Compose)
  ./import-users.sh --csv users.csv --url http://localhost:17170

  # Remote LLDAP
  ./import-users.sh --ldif export.ldif --url https://ldap.example.com --pass geheim

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
    --url)   LLDAP_URL="$2"; shift 2 ;;
    --admin) LLDAP_ADMIN="$2"; shift 2 ;;
    --pass)  LLDAP_PASS="$2"; shift 2 ;;
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

# Passwort abfragen wenn nicht gesetzt
if [[ -z "$LLDAP_PASS" ]]; then
  read -rsp "LLDAP Admin-Passwort für '$LLDAP_ADMIN': " LLDAP_PASS
  echo
fi

# ── Auth-Token holen ─────────────────────────────────────────────────
info "Verbinde mit LLDAP: $LLDAP_URL"
TOKEN_RESPONSE=$(curl -s -X POST "${LLDAP_URL}/auth/simple/login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${LLDAP_ADMIN}\",\"password\":\"${LLDAP_PASS}\"}" 2>&1)

TOKEN=$(echo "$TOKEN_RESPONSE" | jq -r '.token // empty' 2>/dev/null)
if [[ -z "$TOKEN" ]]; then
  error "Login fehlgeschlagen. Antwort: $TOKEN_RESPONSE"
  exit 1
fi
success "Authentifiziert als '$LLDAP_ADMIN'"

# ── Hilfsfunktionen ──────────────────────────────────────────────────

api_get() {
  curl -s -H "Authorization: Bearer ${TOKEN}" "${LLDAP_URL}/api${1}"
}

api_post() {
  local endpoint="$1"; local data="$2"
  curl -s -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$data" \
    "${LLDAP_URL}/api${endpoint}"
}

# Gruppe erstellen falls nicht vorhanden
ensure_group() {
  local group="$1"
  [[ -z "$group" ]] && return
  local existing
  existing=$(api_get "/graphql" | jq -r --arg g "$group" '.data.groups[]? | select(.displayName==$g) | .id' 2>/dev/null || true)
  if [[ -n "$existing" ]]; then
    echo "$existing"
    return
  fi
  if $DRY_RUN; then
    warn "[DRY-RUN] Würde Gruppe erstellen: $group"
    echo "dry-run-id"
    return
  fi
  local result
  result=$(api_post "/graphql" "{\"query\":\"mutation { createGroup(name: \\\"${group}\\\") { id } }\"}")
  local gid
  gid=$(echo "$result" | jq -r '.data.createGroup.id // empty')
  if [[ -n "$gid" ]]; then
    success "Gruppe erstellt: $group (ID: $gid)"
    echo "$gid"
  else
    warn "Gruppe konnte nicht erstellt werden: $group — $result"
    echo ""
  fi
}

# User erstellen
create_user() {
  local username="$1" email="$2" display_name="$3" first_name="$4" last_name="$5"
  if $DRY_RUN; then
    warn "[DRY-RUN] Würde User erstellen: $username ($email)"
    return 0
  fi
  local result
  result=$(api_post "/graphql" "{
    \"query\": \"mutation CreateUser(\$user: CreateUserInput!) { createUser(user: \$user) { id } }\",
    \"variables\": {
      \"user\": {
        \"id\": \"${username}\",
        \"email\": \"${email}\",
        \"displayName\": \"${display_name}\",
        \"firstName\": \"${first_name}\",
        \"lastName\": \"${last_name}\",
        \"avatar\": null
      }
    }
  }")
  local uid
  uid=$(echo "$result" | jq -r '.data.createUser.id // empty')
  if [[ -n "$uid" ]]; then
    # Initial-Passwort setzen
    api_post "/graphql" "{
      \"query\": \"mutation { changeUserPassword(userId: \\\"${username}\\\", password: \\\"${DEFAULT_PASSWORD}\\\") }\"
    }" >/dev/null
    success "User erstellt: $username"
    return 0
  else
    local err
    err=$(echo "$result" | jq -r '.errors[0].message // empty')
    if echo "$err" | grep -qi "already exists\|duplicate\|conflict"; then
      warn "User existiert bereits: $username — übersprungen"
      return 0
    fi
    error "Fehler beim Erstellen von '$username': $err"
    return 1
  fi
}

# User zu Gruppe hinzufügen
add_to_group() {
  local username="$1" group_id="$2"
  [[ -z "$group_id" || "$group_id" == "dry-run-id" ]] && return
  $DRY_RUN && return
  api_post "/graphql" "{
    \"query\": \"mutation { addUserToGroup(userId: \\\"${username}\\\", groupId: ${group_id}) }\"
  }" >/dev/null
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

    if create_user "$username" "$email" "$display_name" "$first_name" "$last_name"; then
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
    if create_user "$username" "$email" "${display_name:-$username}" "${first_name:-}" "${last_name:-}"; then
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
