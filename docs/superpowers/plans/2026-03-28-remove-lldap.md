# Remove LLDAP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove LLDAP and its database from the Homeoffice MVP stack, making Keycloak the sole source of truth for user management.

**Architecture:** Keycloak's built-in user store replaces LLDAP. No service in the stack uses LDAP directly — Mattermost and Nextcloud both authenticate via Keycloak OIDC. The user import script is rewritten to use Keycloak's Admin REST API instead of LLDAP's GraphQL API.

**Tech Stack:** Docker Compose, Keycloak 24.0 Admin REST API, Bash, PowerShell

**Spec:** `docs/superpowers/specs/2026-03-28-remove-lldap-design.md`

---

## File Structure

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `docker-compose.yml` | Remove lldap + lldap-db services, volume, Keycloak deps |
| Modify | `.env.example` | Remove LLDAP vars, update subdomain count 5→4 |
| Modify | `realm-homeoffice.json` | Remove LDAP Federation component |
| Modify | `scripts/import-entrypoint.sh` | Remove LLDAP vars from sed substitution |
| Rewrite | `scripts/import-users.sh` | Keycloak Admin REST API instead of LLDAP GraphQL |
| Modify | `scripts/migrate.sh` | Replace LLDAP connection config with Keycloak |
| Modify | `scripts/lib/export.sh` | Replace export_lldap_users with export_keycloak_users |
| Modify | `scripts/setup.sh` | Remove LLDAP secrets, domain, validation |
| Modify | `scripts/setup-windows.ps1` | Same removals as setup.sh |
| Modify | `scripts/check-connectivity.sh` | Remove LLDAP from service list |
| Modify | `scripts/backup-entrypoint.sh` | Remove lldap-db from comment |
| Modify | `tests/local/NFA-07.sh` | Remove LLDAP image assertion |
| Modify | `docs/requirements/NFA_requirements.json` | Remove LLDAP from license list |
| Modify | `docs/requirements/FA_requirements.json` | Update user management criteria |

---

### Task 1: Remove LLDAP from Docker Compose

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Remove lldap-db-data volume**

In `docker-compose.yml`, remove `lldap-db-data:` from the volumes block (line 28). The volumes block should become:

```yaml
volumes:
  keycloak-db-data:
  mattermost-db-data:
  nextcloud-db-data:
  nextcloud-app:
```

- [ ] **Step 2: Remove lldap-db service**

Remove the entire `lldap-db` service (lines 88-106):

```yaml
  # ── LLDAP Datenbank ──────────────────────────────────────────────
  lldap-db:
    image: postgres:16-alpine
    ...entire service...
```

- [ ] **Step 3: Remove lldap service**

Remove the entire `lldap` service (lines 107-131):

```yaml
  # ── LLDAP (Lightweight LDAP) ────────────────────────────────────
  lldap:
    image: lldap/lldap:stable
    ...entire service...
```

- [ ] **Step 4: Update Keycloak service — remove lldap dependency and env vars**

In the `keycloak` service, remove the LLDAP-related env vars and the `lldap` dependency.

Remove these three environment variables from the keycloak service:
```yaml
      LLDAP_BASE_DOMAIN: ${LLDAP_BASE_DOMAIN}
      LLDAP_BASE_TLD: ${LLDAP_BASE_TLD}
      LLDAP_LDAP_USER_PASS: ${LLDAP_LDAP_USER_PASS}
```

Change the `depends_on` block from:
```yaml
    depends_on:
      keycloak-db:
        condition: service_healthy
      lldap:
        condition: service_started
```

To:
```yaml
    depends_on:
      keycloak-db:
        condition: service_healthy
```

- [ ] **Step 5: Validate compose file**

Run: `docker compose -f /home/patrick/Bachelorprojekt/docker-compose.yml config --quiet`
Expected: No errors (exit code 0)

- [ ] **Step 6: Verify no LLDAP references remain**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/docker-compose.yml`
Expected: `0` (no matches)

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml
git commit -m "infra: remove lldap and lldap-db from docker-compose

Keycloak becomes the sole user store. Removes lldap service,
lldap-db service, lldap-db-data volume, and LLDAP env vars
from the Keycloak service."
```

---

### Task 2: Remove LDAP Federation from Keycloak Realm

**Files:**
- Modify: `realm-homeoffice.json`
- Modify: `scripts/import-entrypoint.sh`

- [ ] **Step 1: Remove LDAP Federation component from realm JSON**

In `realm-homeoffice.json`, remove the entire `components` block (lines 128-168). The file should end after the clients array:

Change from (after the last client's closing `}`):
```json
  ],
  "components": {
    "org.keycloak.storage.UserStorageProvider": [
      {
        "name": "lldap",
        ...entire LDAP config...
      }
    ]
  }
}
```

To:
```json
  ]
}
```

The final structure should be:
```json
{
  "realm": "homeoffice",
  ...realm settings...,
  "clients": [
    { ...mattermost client... },
    { ...nextcloud client... }
  ]
}
```

- [ ] **Step 2: Validate JSON syntax**

Run: `python3 -m json.tool /home/patrick/Bachelorprojekt/realm-homeoffice.json > /dev/null`
Expected: Exit code 0 (valid JSON)

- [ ] **Step 3: Remove LLDAP vars from import-entrypoint.sh**

In `scripts/import-entrypoint.sh`, change the variable substitution loop (line 16-17) from:

```bash
for var in MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET \
           MM_DOMAIN NC_DOMAIN \
           LLDAP_BASE_DOMAIN LLDAP_BASE_TLD LLDAP_LDAP_USER_PASS; do
```

To:

```bash
for var in MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET \
           MM_DOMAIN NC_DOMAIN; do
```

- [ ] **Step 4: Verify no LLDAP references remain in either file**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/realm-homeoffice.json /home/patrick/Bachelorprojekt/scripts/import-entrypoint.sh`
Expected: Both files show `0`

- [ ] **Step 5: Commit**

```bash
git add realm-homeoffice.json scripts/import-entrypoint.sh
git commit -m "auth: remove LDAP Federation from Keycloak realm

Remove UserStorageProvider component (LLDAP federation) from
realm-homeoffice.json. Remove LLDAP vars from import-entrypoint.sh
sed substitution loop."
```

---

### Task 3: Update .env.example

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Remove LLDAP_DOMAIN from domains section**

Remove line 17:
```
LLDAP_DOMAIN=bachelorprojekt-ldap.duckdns.org
```

- [ ] **Step 2: Update DuckDNS subdomains (5→4)**

Change comments and values. Update the comment on line 12 from referencing 5 subdomains to 4.

Change line 23 from:
```
DUCKDNS_SUBDOMAINS=bachelorprojekt-chat,bachelorprojekt-auth,bachelorprojekt-files,bachelorprojekt-meet,bachelorprojekt-ldap
```

To:
```
DUCKDNS_SUBDOMAINS=bachelorprojekt-chat,bachelorprojekt-auth,bachelorprojekt-files,bachelorprojekt-meet
```

- [ ] **Step 3: Remove entire LLDAP section**

Remove lines 57-65 (the `# ── LLDAP ──` section):

```
# ── LLDAP ────────────────────────────────────────────────────────
# Starke Zufallswerte: openssl rand -base64 32
LLDAP_JWT_SECRET=CHANGE_ME_LLDAP_JWT
LLDAP_LDAP_USER_PASS=CHANGE_ME_LLDAP_ADMIN_PASS
LLDAP_DB_PASSWORD=CHANGE_ME_LLDAP_DB
# Base DN aus deinem Projektnamen ableiten:
#   bachelorprojekt-chat.duckdns.org → LLDAP_BASE_DOMAIN=bachelorprojekt-chat, LLDAP_BASE_TLD=duckdns
LLDAP_BASE_DOMAIN=bachelorprojekt-ldap
LLDAP_BASE_TLD=duckdns
```

- [ ] **Step 4: Update header comments**

Update the header comment block (lines 6-10) to list 4 domains instead of 5. Remove the LLDAP_DOMAIN line:

```
#   LLDAP_DOMAIN → z.B. bachelorprojekt-ldap.duckdns.org
```

And update `Alle 5 Subdomains` to `Alle 4 Subdomains`.

- [ ] **Step 5: Verify no LLDAP references remain**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/.env.example`
Expected: `0`

- [ ] **Step 6: Commit**

```bash
git add .env.example
git commit -m "config: remove LLDAP vars from .env.example

Remove LLDAP_DOMAIN, LLDAP_JWT_SECRET, LLDAP_LDAP_USER_PASS,
LLDAP_DB_PASSWORD, LLDAP_BASE_DOMAIN, LLDAP_BASE_TLD.
DuckDNS subdomains reduced from 5 to 4."
```

---

### Task 4: Rewrite import-users.sh for Keycloak Admin API

**Files:**
- Rewrite: `scripts/import-users.sh`

This is the biggest change. The script currently uses LLDAP's GraphQL API. It must be rewritten to use Keycloak's Admin REST API while preserving the same CLI interface.

- [ ] **Step 1: Write the new import-users.sh**

Replace the entire content of `scripts/import-users.sh` with:

```bash
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
#   anna.schmidt,anna@example.com,Anna Schmidt,"homeoffice_users;admins",Anna,Schmidt
#   max.mueller,max@example.com,Max Müller,homeoffice_users,Max,Müller
#
# LDIF-Format: Standard LDAP LDIF (objectClass: inetOrgPerson)
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail

# ── Defaults ────────────────────────────────────────────────────────
KC_URL="${KC_URL:-}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_PASS="${KEYCLOAK_ADMIN_PASSWORD:-}"
KC_REALM="homeoffice"
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
  --url URL         Keycloak URL (Standard: aus KC_URL oder KC_DOMAIN)
                    z.B. https://bachelorprojekt-auth.duckdns.org
  --admin USER      Keycloak Admin-User (Standard: admin)
  --pass PASS       Keycloak Admin-Passwort (oder KEYCLOAK_ADMIN_PASSWORD setzen)
  --realm REALM     Keycloak Realm (Standard: homeoffice)
  --group GROUP     Standard-Gruppe für alle User (Standard: homeoffice_users)
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
```

- [ ] **Step 2: Verify no LLDAP references remain**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/scripts/import-users.sh`
Expected: `0`

- [ ] **Step 3: Verify script is syntactically valid**

Run: `bash -n /home/patrick/Bachelorprojekt/scripts/import-users.sh`
Expected: Exit code 0 (no syntax errors)

- [ ] **Step 4: Commit**

```bash
git add scripts/import-users.sh
git commit -m "feat: rewrite import-users.sh for Keycloak Admin REST API

Replace LLDAP GraphQL API with Keycloak Admin REST API.
Same CLI interface (--csv, --ldif, --dry-run).
Users are created directly in Keycloak with temporary passwords."
```

---

### Task 5: Update migrate.sh

**Files:**
- Modify: `scripts/migrate.sh`

- [ ] **Step 1: Replace LLDAP config vars with Keycloak in load_config**

In `scripts/migrate.sh`, change `load_config()` (around line 72-83). Replace:

```bash
  LLDAP_URL="${LLDAP_URL:-http://localhost:17170}"
  LLDAP_ADMIN="${LLDAP_ADMIN:-admin}"
  LLDAP_PASS="${LLDAP_PASS:-}"
```

With:

```bash
  KC_URL="${KC_URL:-}"
  KC_ADMIN="${KC_ADMIN:-admin}"
  KC_PASS="${KC_PASS:-}"
```

- [ ] **Step 2: Update save_config**

Change `save_config()` (around line 85-97). Replace:

```bash
  cat > "$CFG_FILE" << EOF
# Homeoffice Migration Config — gespeicherte Verbindungsdaten
MM_URL="${MM_URL}"
MM_ADMIN="${MM_ADMIN}"
NC_URL="${NC_URL}"
NC_ADMIN="${NC_ADMIN}"
LLDAP_URL="${LLDAP_URL}"
LLDAP_ADMIN="${LLDAP_ADMIN}"
# Passwörter werden nicht gespeichert
EOF
```

With:

```bash
  cat > "$CFG_FILE" << EOF
# Homeoffice Migration Config — gespeicherte Verbindungsdaten
MM_URL="${MM_URL}"
MM_ADMIN="${MM_ADMIN}"
NC_URL="${NC_URL}"
NC_ADMIN="${NC_ADMIN}"
KC_URL="${KC_URL}"
KC_ADMIN="${KC_ADMIN}"
# Passwörter werden nicht gespeichert
EOF
```

- [ ] **Step 3: Update ask_connection_config — replace LLDAP prompts with Keycloak**

In `ask_connection_config()` (around line 119-131), replace the LLDAP prompts:

```bash
  echo ""
  prompt "LLDAP URL [${LLDAP_URL}]:"; read -r input
  [[ -n "$input" ]] && LLDAP_URL="$input"

  prompt "LLDAP Admin-User [${LLDAP_ADMIN}]:"; read -r input
  [[ -n "$input" ]] && LLDAP_ADMIN="$input"

  read -rsp "$(echo -e "${YELLOW}▶${NC} LLDAP Admin-Passwort: ")" LLDAP_PASS; echo
```

With:

```bash
  echo ""
  prompt "Keycloak URL [${KC_URL:-https://auth.example.com}]:"; read -r input
  [[ -n "$input" ]] && KC_URL="$input"

  prompt "Keycloak Admin-User [${KC_ADMIN:-admin}]:"; read -r input
  [[ -n "$input" ]] && KC_ADMIN="$input"

  read -rsp "$(echo -e "${YELLOW}▶${NC} Keycloak Admin-Passwort: ")" KC_PASS; echo
```

- [ ] **Step 4: Update flow_users — call import-users.sh with Keycloak params**

Replace `flow_users()` (around lines 318-346):

```bash
flow_users() {
  header "👥 Benutzer-Import"
  echo ""
  echo "Unterstützte Formate:"
  echo "  CSV  — username,email,display_name,groups,first_name,last_name"
  echo "  LDIF — Standard LDAP Directory Interchange Format"
  echo ""
  echo "Beispiel-CSV: $(dirname "$0")/users-example.csv"
  echo ""

  echo "  [1] CSV importieren"
  echo "  [2] LDIF importieren"
  echo ""
  prompt "Format:"; read -r fmt

  prompt "Pfad zur Datei:"; read -r file_path
  file_path="${file_path//\'/}"
  [[ ! -f "$file_path" ]] && { error "Datei nicht gefunden: $file_path"; return 1; }

  [[ -z "$KC_PASS" ]] && { read -rsp "$(echo -e "${YELLOW}▶${NC} Keycloak Admin-Passwort: ")" KC_PASS; echo; }

  local mode
  [[ "$fmt" == "2" ]] && mode="ldif" || mode="csv"

  KC_URL="$KC_URL" KC_ADMIN="$KC_ADMIN" KEYCLOAK_ADMIN_PASSWORD="$KC_PASS" \
    "${SCRIPT_DIR}/import-users.sh" "--${mode}" "$file_path" \
    --url "$KC_URL" --admin "$KC_ADMIN" --pass "$KC_PASS" \
    $( $DRY_RUN && echo "--dry-run" || true )
}
```

- [ ] **Step 5: Update test_connections — remove LLDAP health check**

In `test_connections()` (around lines 432-454), remove the LLDAP block (lines 448-452):

```bash
  if [[ -n "$LLDAP_URL" ]]; then
    local lldap_status
    lldap_status=$(curl -s -o /dev/null -w "%{http_code}" "${LLDAP_URL}/health" 2>/dev/null)
    [[ "$lldap_status" =~ ^2 ]] && success "LLDAP:      ${LLDAP_URL} ✓" || warn "LLDAP:      ${LLDAP_URL} (HTTP ${lldap_status})"
  fi
```

Optionally, add a Keycloak check in its place:

```bash
  if [[ -n "$KC_URL" ]]; then
    local kc_status
    kc_status=$(curl -s -o /dev/null -w "%{http_code}" "${KC_URL}/realms/homeoffice/.well-known/openid-configuration" 2>/dev/null)
    [[ "$kc_status" == "200" ]] && success "Keycloak:   ${KC_URL} ✓" || warn "Keycloak:   ${KC_URL} (HTTP ${kc_status})"
  fi
```

- [ ] **Step 6: Update menu text — replace LLDAP with Keycloak**

Change the menu item text on line 176 from:
```bash
  echo -e "  ${BOLD}[4]${NC} 👥  Benutzer      → LLDAP (CSV / LDIF)"
```

To:
```bash
  echo -e "  ${BOLD}[4]${NC} 👥  Benutzer      → Keycloak (CSV / LDIF)"
```

- [ ] **Step 7: Update banner text**

Change the banner on line 463 from:
```bash
  ║       Slack · Teams · Google · Export · LLDAP   ║
```

To:
```bash
  ║       Slack · Teams · Google · Export            ║
```

- [ ] **Step 8: Update flow_export — remove LLDAP vars**

In `flow_export()` (around line 417), remove:
```bash
  export LLDAP_URL LLDAP_ADMIN LLDAP_PASS
```

- [ ] **Step 9: Verify no LLDAP references remain**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/scripts/migrate.sh`
Expected: `0`

- [ ] **Step 10: Verify script syntax**

Run: `bash -n /home/patrick/Bachelorprojekt/scripts/migrate.sh`
Expected: Exit code 0

- [ ] **Step 11: Commit**

```bash
git add scripts/migrate.sh
git commit -m "feat: update migrate.sh to use Keycloak instead of LLDAP

Replace LLDAP connection config, prompts, and health checks
with Keycloak equivalents. User import now targets Keycloak
Admin REST API via updated import-users.sh."
```

---

### Task 6: Update export.sh

**Files:**
- Modify: `scripts/lib/export.sh`

- [ ] **Step 1: Update EXPORT_MODULES array**

Change the module label on line 38 from:
```bash
  "lldap_users|LLDAP Benutzer (→ CSV + LDIF)"
```

To:
```bash
  "kc_users|Keycloak Benutzer (→ CSV + LDIF)"
```

- [ ] **Step 2: Replace export_lldap_users with export_keycloak_users**

Replace the entire `export_lldap_users()` function (lines 206-285) with:

```bash
# ── Keycloak Benutzer ───────────────────────────────────────────────
export_keycloak_users() {
  local output_dir="$1"
  mkdir -p "${output_dir}/keycloak"
  info "Exportiere Keycloak-Benutzer..."

  local kc_url="https://${KC_DOMAIN:-}"
  local kc_admin="${KC_ADMIN:-admin}"
  local kc_pass="${KC_PASS:-${KEYCLOAK_ADMIN_PASSWORD:-}}"

  if [[ -z "${KC_DOMAIN:-}" ]]; then
    warn "KC_DOMAIN nicht gesetzt — Benutzer-Export übersprungen"
    return 0
  fi

  if [[ -z "$kc_pass" ]]; then
    warn "Keycloak Admin-Passwort nicht gesetzt — Benutzer-Export übersprungen"
    return 0
  fi

  if ${DRY_RUN:-false}; then
    warn "[DRY-RUN] Würde Keycloak-Benutzer und -Gruppen exportieren"
    return 0
  fi

  local token
  token=$(curl -s -X POST "${kc_url}/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli" \
    -d "username=${kc_admin}" \
    -d "password=${kc_pass}" \
    -d "grant_type=password" 2>/dev/null | jq -r '.access_token // empty')

  if [[ -z "$token" ]]; then
    warn "Keycloak-Login fehlgeschlagen"
    return 1
  fi

  local auth="Authorization: Bearer ${token}"

  # Benutzer abrufen
  local users_json
  users_json=$(curl -s "${kc_url}/admin/realms/homeoffice/users?max=1000" \
    -H "$auth" 2>/dev/null)

  # CSV
  local csv_file="${output_dir}/keycloak/users.csv"
  echo "username,email,display_name,groups,first_name,last_name" > "$csv_file"

  local user_count=0
  echo "$users_json" | jq -c '.[]' 2>/dev/null | while read -r user; do
    local uid email fn ln
    uid=$(echo "$user" | jq -r '.username')
    email=$(echo "$user" | jq -r '.email // ""')
    fn=$(echo "$user" | jq -r '.firstName // ""')
    ln=$(echo "$user" | jq -r '.lastName // ""')
    local display_name="${fn} ${ln}"
    [[ "$display_name" == " " ]] && display_name="$uid"

    # Gruppen des Users abrufen
    local user_id
    user_id=$(echo "$user" | jq -r '.id')
    local user_groups
    user_groups=$(curl -s "${kc_url}/admin/realms/homeoffice/users/${user_id}/groups" \
      -H "$auth" 2>/dev/null | jq -r '[.[].name] | join(";")' 2>/dev/null)

    echo "\"${uid}\",\"${email}\",\"${display_name}\",\"${user_groups}\",\"${fn}\",\"${ln}\"" >> "$csv_file"
  done

  # LDIF
  local ldif_file="${output_dir}/keycloak/users.ldif"
  : > "$ldif_file"
  echo "$users_json" | jq -c '.[]' 2>/dev/null | while read -r user; do
    local uid email fn ln
    uid=$(echo "$user" | jq -r '.username')
    email=$(echo "$user" | jq -r '.email // ""')
    fn=$(echo "$user" | jq -r '.firstName // ""')
    ln=$(echo "$user" | jq -r '.lastName // ""')
    local cn="${fn} ${ln}"
    [[ "$cn" == " " ]] && cn="$uid"

    cat >> "$ldif_file" <<LDIF
dn: uid=${uid},ou=people,dc=homeoffice
objectClass: inetOrgPerson
uid: ${uid}
mail: ${email}
cn: ${cn}
givenName: ${fn}
sn: ${ln:-${uid}}

LDIF
  done

  user_count=$(echo "$users_json" | jq 'length' 2>/dev/null || echo 0)
  success "Keycloak-Benutzer exportiert: ${user_count} Benutzer → CSV + LDIF"

  # Gruppen
  local groups_json
  groups_json=$(curl -s "${kc_url}/admin/realms/homeoffice/groups" \
    -H "$auth" 2>/dev/null)
  echo "$groups_json" > "${output_dir}/keycloak/groups.json" 2>/dev/null
}
```

- [ ] **Step 3: Update the dispatch call**

Change line 391 from:
```bash
  [[ "${EXPORT_ENABLED[5]}" -eq 1 ]] && export_lldap_users "$output_dir"
```

To:
```bash
  [[ "${EXPORT_ENABLED[5]}" -eq 1 ]] && export_keycloak_users "$output_dir"
```

- [ ] **Step 4: Verify no LLDAP references remain**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/scripts/lib/export.sh`
Expected: `0`

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/export.sh
git commit -m "feat: replace LLDAP user export with Keycloak Admin API

export_lldap_users() → export_keycloak_users(). Uses Keycloak
Admin REST API to export users and groups. Output format
unchanged (CSV + LDIF + groups.json)."
```

---

### Task 7: Update setup scripts

**Files:**
- Modify: `scripts/setup.sh`
- Modify: `scripts/setup-windows.ps1`

- [ ] **Step 1: Update setup.sh — remove LLDAP secret generation**

In `scripts/setup.sh` around lines 817-820, remove LLDAP secrets. Change:

```bash
    NEXTCLOUD_ADMIN_PASSWORD=$(gen_secret); LLDAP_JWT_SECRET=$(gen_secret)
    LLDAP_LDAP_USER_PASS=$(gen_secret);    LLDAP_DB_PASSWORD=$(gen_secret)
    JICOFO_AUTH_PASSWORD=$(gen_secret);    JVB_AUTH_PASSWORD=$(gen_secret)
    ok "12 sichere Secrets generiert (je 32 Zeichen)"
```

To:

```bash
    NEXTCLOUD_ADMIN_PASSWORD=$(gen_secret)
    JICOFO_AUTH_PASSWORD=$(gen_secret);    JVB_AUTH_PASSWORD=$(gen_secret)
    ok "9 sichere Secrets generiert (je 32 Zeichen)"
```

- [ ] **Step 2: Update setup.sh — remove LLDAP domain and Base DN writes**

Remove line 828 (LLDAP_DOMAIN sed):
```bash
    sed_inplace "s|^LLDAP_DOMAIN=.*|LLDAP_DOMAIN=${PROJECT_NAME}-ldap.duckdns.org|"  "$ENV_FILE"
```

Update line 830 (DUCKDNS_SUBDOMAINS) — remove the ldap subdomain:
```bash
    sed_inplace "s|^DUCKDNS_SUBDOMAINS=.*|DUCKDNS_SUBDOMAINS=${PROJECT_NAME}-chat,${PROJECT_NAME}-auth,${PROJECT_NAME}-files,${PROJECT_NAME}-meet|" "$ENV_FILE"
```

Remove lines 834-835 (LLDAP_BASE_DOMAIN and LLDAP_BASE_TLD sed):
```bash
    sed_inplace "s|^LLDAP_BASE_DOMAIN=.*|LLDAP_BASE_DOMAIN=${PROJECT_NAME}-ldap|"    "$ENV_FILE"
    sed_inplace "s|^LLDAP_BASE_TLD=.*|LLDAP_BASE_TLD=duckdns|"                       "$ENV_FILE"
```

- [ ] **Step 3: Update setup.sh — remove LLDAP from secret write loop**

Change lines 836-838 from:
```bash
    for secret_var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
      MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD \
      LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS LLDAP_DB_PASSWORD JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
```

To:
```bash
    for secret_var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
      MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD \
      JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
```

- [ ] **Step 4: Update setup.sh — remove LLDAP from REQUIRED_VARS**

Change lines 861-868 from:
```bash
REQUIRED_VARS=(
  MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN
  DUCKDNS_TOKEN DUCKDNS_SUBDOMAINS JVB_ADVERTISE_IPS JITSI_XMPP_SUFFIX ACME_EMAIL
  KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD
  MATTERMOST_DB_PASSWORD MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET
  NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD
  LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS LLDAP_DB_PASSWORD LLDAP_BASE_DOMAIN LLDAP_BASE_TLD
  JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD
)
```

To:
```bash
REQUIRED_VARS=(
  MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN
  DUCKDNS_TOKEN DUCKDNS_SUBDOMAINS JVB_ADVERTISE_IPS JITSI_XMPP_SUFFIX ACME_EMAIL
  KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD
  MATTERMOST_DB_PASSWORD MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET
  NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD
  JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD
)
```

- [ ] **Step 5: Update setup.sh — remove LLDAP_DOMAIN from domain validation**

Change line 907 from:
```bash
  for var in MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN; do
```

To:
```bash
  for var in MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN; do
```

- [ ] **Step 6: Update setup.sh — remove LLDAP from password length check**

Change lines 970-973 from:
```bash
  for var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
             NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD LLDAP_DB_PASSWORD \
             LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS MATTERMOST_OIDC_SECRET \
             NEXTCLOUD_OIDC_SECRET JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
```

To:
```bash
  for var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
             NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD MATTERMOST_OIDC_SECRET \
             NEXTCLOUD_OIDC_SECRET JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
```

- [ ] **Step 7: Update setup.sh — remove LLDAP URL from final output**

Remove line 1125:
```bash
  echo -e "    LDAP:     ${CYAN}https://${LLDAP_DOMAIN:-?}${NC}"
```

- [ ] **Step 8: Update setup-windows.ps1 — remove LLDAP secrets**

In `scripts/setup-windows.ps1` around lines 262-263, remove:
```powershell
        NEXTCLOUD_ADMIN_PASSWORD = New-Secret; LLDAP_JWT_SECRET        = New-Secret
        LLDAP_LDAP_USER_PASS     = New-Secret; LLDAP_DB_PASSWORD       = New-Secret
```

Replace with:
```powershell
        NEXTCLOUD_ADMIN_PASSWORD = New-Secret
```

Update line 266 from `"12 Secrets generiert"` to `"9 Secrets generiert"`.

- [ ] **Step 9: Update setup-windows.ps1 — remove LLDAP domain/Base DN writes**

Remove line 276:
```powershell
    $content = $content -replace "(?m)^LLDAP_DOMAIN=.*", "LLDAP_DOMAIN=$ProjectName-ldap.duckdns.org"
```

Update line 278 (DUCKDNS_SUBDOMAINS) — remove ldap subdomain:
```powershell
    $content = $content -replace "(?m)^DUCKDNS_SUBDOMAINS=.*", "DUCKDNS_SUBDOMAINS=$ProjectName-chat,$ProjectName-auth,$ProjectName-files,$ProjectName-meet"
```

Remove lines 282-283:
```powershell
    $content = $content -replace "(?m)^LLDAP_BASE_DOMAIN=.*",  "LLDAP_BASE_DOMAIN=$ProjectName-ldap"
    $content = $content -replace "(?m)^LLDAP_BASE_TLD=.*",     "LLDAP_BASE_TLD=duckdns"
```

- [ ] **Step 10: Update setup-windows.ps1 — remove LLDAP URL from output**

Remove line 373:
```powershell
Write-Host "    LDAP:     https://$($envVars['LLDAP_DOMAIN'])" -ForegroundColor Cyan
```

- [ ] **Step 11: Verify no LLDAP references remain in either file**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/scripts/setup.sh /home/patrick/Bachelorprojekt/scripts/setup-windows.ps1`
Expected: Both show `0`

- [ ] **Step 12: Verify bash syntax**

Run: `bash -n /home/patrick/Bachelorprojekt/scripts/setup.sh`
Expected: Exit code 0

- [ ] **Step 13: Commit**

```bash
git add scripts/setup.sh scripts/setup-windows.ps1
git commit -m "config: remove LLDAP from setup scripts

Remove LLDAP secret generation, domain configuration,
env validation, and URL output from both setup.sh and
setup-windows.ps1. DuckDNS subdomains reduced 5→4."
```

---

### Task 8: Update utility scripts, tests, and requirements

**Files:**
- Modify: `scripts/check-connectivity.sh`
- Modify: `scripts/backup-entrypoint.sh`
- Modify: `tests/local/NFA-07.sh`
- Modify: `docs/requirements/NFA_requirements.json`
- Modify: `docs/requirements/FA_requirements.json`

- [ ] **Step 1: Update check-connectivity.sh — remove LLDAP from grep and services**

In `scripts/check-connectivity.sh`, change line 25 from:
```bash
eval "$(grep -E '^(MM_DOMAIN|KC_DOMAIN|NC_DOMAIN|JITSI_DOMAIN|LLDAP_DOMAIN)=' "$ENV_FILE")"
```

To:
```bash
eval "$(grep -E '^(MM_DOMAIN|KC_DOMAIN|NC_DOMAIN|JITSI_DOMAIN)=' "$ENV_FILE")"
```

Change the SERVICES array (lines 27-33) from:
```bash
SERVICES=(
  "$MM_DOMAIN|Mattermost"
  "$KC_DOMAIN|Keycloak"
  "$NC_DOMAIN|Nextcloud"
  "$LLDAP_DOMAIN|LLDAP"
  "$JITSI_DOMAIN|Jitsi"
)
```

To:
```bash
SERVICES=(
  "$MM_DOMAIN|Mattermost"
  "$KC_DOMAIN|Keycloak"
  "$NC_DOMAIN|Nextcloud"
  "$JITSI_DOMAIN|Jitsi"
)
```

- [ ] **Step 2: Update backup-entrypoint.sh — remove lldap-db from comment**

In `scripts/backup-entrypoint.sh`, change line 14 from:
```bash
#   - keycloak-db, mattermost-db, nextcloud-db, lldap-db
```

To:
```bash
#   - keycloak-db, mattermost-db, nextcloud-db
```

- [ ] **Step 3: Update NFA-07.sh — remove LLDAP image assertion**

In `tests/local/NFA-07.sh`, remove line 16:
```bash
assert_contains "$IMAGES" "lldap" "NFA-07" "T2e" "LLDAP Image vorhanden"
```

- [ ] **Step 4: Update NFA_requirements.json — remove LLDAP from license list**

In `docs/requirements/NFA_requirements.json`, change the NFA-07 `Erfüllungskriterien` field. Replace:
```
5) LLDAP (GPL v3), Traefik (MIT)
```

With:
```
5) Traefik (MIT)
```

- [ ] **Step 5: Update FA_requirements.json — update user management criteria**

In `docs/requirements/FA_requirements.json`, update FA-05:

Change `Erfüllungskriterien` — replace:
```
3) LDAP-Sync mit LLDAP funktioniert
```
With:
```
3) Benutzerverwaltung direkt in Keycloak
```

Change `Testfall` — replace:
```
T3: user.csv importieren → User erscheint in LLDAP und Keycloak\nT4: Keycloak LDAP-Sync → User kann sich per SSO einloggen
```
With:
```
T3: user.csv importieren → User erscheint in Keycloak\nT4: User in Keycloak angelegt → User kann sich per SSO einloggen
```

- [ ] **Step 6: Verify no LLDAP references remain in any of these files**

Run: `grep -ci lldap /home/patrick/Bachelorprojekt/scripts/check-connectivity.sh /home/patrick/Bachelorprojekt/scripts/backup-entrypoint.sh /home/patrick/Bachelorprojekt/tests/local/NFA-07.sh /home/patrick/Bachelorprojekt/docs/requirements/NFA_requirements.json /home/patrick/Bachelorprojekt/docs/requirements/FA_requirements.json`
Expected: All show `0`

- [ ] **Step 7: Commit**

```bash
git add scripts/check-connectivity.sh scripts/backup-entrypoint.sh \
        tests/local/NFA-07.sh \
        docs/requirements/NFA_requirements.json docs/requirements/FA_requirements.json
git commit -m "chore: remove remaining LLDAP references

Update connectivity check, backup comments, license test,
and requirements docs to reflect Keycloak-only user management."
```

---

### Task 9: Final verification

- [ ] **Step 1: Full LLDAP reference scan**

Run: `grep -rci lldap /home/patrick/Bachelorprojekt/ --include='*.sh' --include='*.yml' --include='*.json' --include='*.ps1' --include='*.env*' --include='*.md' | grep -v ':0$' | grep -v '.git/' | grep -v 'superpowers/'`
Expected: No files with non-zero counts (except the design spec in superpowers/)

- [ ] **Step 2: Validate docker-compose.yml**

Run: `docker compose -f /home/patrick/Bachelorprojekt/docker-compose.yml config --quiet`
Expected: Exit code 0

- [ ] **Step 3: Validate all JSON files**

Run:
```bash
python3 -m json.tool /home/patrick/Bachelorprojekt/realm-homeoffice.json > /dev/null
python3 -m json.tool /home/patrick/Bachelorprojekt/docs/requirements/NFA_requirements.json > /dev/null
python3 -m json.tool /home/patrick/Bachelorprojekt/docs/requirements/FA_requirements.json > /dev/null
```
Expected: All exit code 0

- [ ] **Step 4: Validate all bash scripts**

Run:
```bash
bash -n /home/patrick/Bachelorprojekt/scripts/setup.sh
bash -n /home/patrick/Bachelorprojekt/scripts/import-users.sh
bash -n /home/patrick/Bachelorprojekt/scripts/import-entrypoint.sh
bash -n /home/patrick/Bachelorprojekt/scripts/migrate.sh
bash -n /home/patrick/Bachelorprojekt/scripts/check-connectivity.sh
bash -n /home/patrick/Bachelorprojekt/scripts/backup-entrypoint.sh
bash -n /home/patrick/Bachelorprojekt/scripts/lib/export.sh
bash -n /home/patrick/Bachelorprojekt/tests/local/NFA-07.sh
```
Expected: All exit code 0

- [ ] **Step 5: Commit (if any fixes were needed)**

Only if previous steps revealed issues that needed fixing.
