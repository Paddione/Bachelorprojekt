#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# migrate.sh — Workspace MVP Migration Assistant
# ═══════════════════════════════════════════════════════════════════
# Interaktives Menü zum Importieren und Exportieren von Daten:
#   - Microsoft Teams (GDPR-Export) → Nextcloud
#   - Google Workspace (Takeout-Export) → Nextcloud
#   - Benutzer (CSV oder LDIF → Keycloak)
#   - Selektiver Datenexport → ZIP-Archiv
#
# Läuft lokal auf dem Rechner des Users (nicht auf dem Server).
#
# Voraussetzungen:
#   - bash 4+, curl, jq, python3, unzip
#   - Netzwerkzugang zu den Workspace-Diensten
#
# Verwendung:
#   chmod +x migrate.sh
#   ./migrate.sh
#   ./migrate.sh --dry-run          # Vorschau ohne Änderungen
#   ./migrate.sh --no-scan          # Keinen lokalen Scan ausführen
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Libraries laden ──────────────────────────────────────────────────
source "${SCRIPT_DIR}/lib/scan.sh"
source "${SCRIPT_DIR}/lib/slack-import.sh"
source "${SCRIPT_DIR}/lib/teams-import.sh"
source "${SCRIPT_DIR}/lib/nextcloud-api.sh"
source "${SCRIPT_DIR}/lib/google-import.sh"
source "${SCRIPT_DIR}/lib/export.sh"

# ── Globals ──────────────────────────────────────────────────────────
WORKDIR="${TMPDIR:-/tmp}/workspace-migrate-$$"
mkdir -p "$WORKDIR"
trap 'rm -rf "$WORKDIR"' EXIT

DRY_RUN=false
NO_SCAN=false

# ── Farben & UI & Helpers laden ──────────────────────────────────────
source "${SCRIPT_DIR}/migrate-lib.sh"

# ── Argumente ────────────────────────────────────────────────────────
for arg in "$@"; do
  case "$arg" in
    --dry-run)  DRY_RUN=true ;;
    --no-scan)  NO_SCAN=true ;;
    -h|--help)
      echo "Verwendung: $0 [--dry-run] [--no-scan]"
      echo "  --dry-run   Zeigt was importiert würde, ohne Änderungen"
      echo "  --no-scan   Überspringe lokalen System-Scan"
      exit 0 ;;
  esac
done

# ── Verbindungs-Config ───────────────────────────────────────────────
CFG_FILE="${SCRIPT_DIR}/.migrate-config"

# ── Scan-Ergebnisse ──────────────────────────────────────────────────
SCAN_RESULTS=()


# ── Import-Flows ─────────────────────────────────────────────────────
flow_teams() {
  header "📹 Microsoft Teams Import"
  echo ""
  echo "Empfohlen: GDPR-Datenexport"
  echo "  → myaccount.microsoft.com → Datenschutz → Daten herunterladen"
  echo "  → Wähle: Teams Chat, Dateien, Kalender, Kontakte"
  echo "  → Download als ZIP → hier angeben"
  echo ""
  echo "Alternativ: Lokaler Teams-Cache (nur Nachrichten, unvollständig)"
  echo ""

  local source
  source=$(pick_source "teams") || return 1
  [[ -z "$source" ]] && return 1

  echo ""
  info "Quelle: $source"
  echo ""

  [[ -z "$NC_URL" ]] && ask_connection_config

  echo -e "${BOLD}Was soll importiert werden?${NC}"
  echo "  [1] Dateien/Kalender/Kontakte → Nextcloud"
  echo "  [2] Vorschau (was wird importiert?)"
  echo ""
  prompt "Auswahl [1]:"; read -r choice
  choice="${choice:-1}"

  case "$choice" in
    2) DRY_RUN=true ;;
  esac

  local nc_url="" nc_user="" nc_pass=""
  nc_url="$NC_URL"; nc_user="$NC_ADMIN"; nc_pass="$NC_PASS"

  run_teams_import "$source" "" "" "" "$nc_url" "$nc_user" "$nc_pass"

  $DRY_RUN || success "Teams-Import abgeschlossen!"
  $DRY_RUN && info "DRY-RUN beendet — keine Änderungen vorgenommen"
}

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

  # shellcheck disable=SC2097,SC2098,SC2046
  KC_URL="$KC_URL" KC_ADMIN="$KC_ADMIN" KEYCLOAK_ADMIN_PASSWORD="$KC_PASS" \
    "${SCRIPT_DIR}/import-users.sh" "--${mode}" "$file_path" \
    --url "$KC_URL" --admin "$KC_ADMIN" --pass "$KC_PASS" \
    $( $DRY_RUN && echo "--dry-run" || true )
}

flow_google() {
  header "🔵 Google Workspace Import"
  echo ""
  echo "Benötigt: Google Takeout Export"
  echo "  → takeout.google.com → Daten herunterladen"
  echo "  → Wähle: Google Chat, Drive, Kalender, Kontakte"
  echo "  → Download als ZIP → hier angeben"
  echo ""

  local source
  source=$(pick_source "google") || return 1
  [[ -z "$source" ]] && return 1

  echo ""
  info "Quelle: $source"
  echo ""

  echo -e "${BOLD}Was soll importiert werden?${NC}"
  echo "  [1] Drive/Kalender/Kontakte → Nextcloud"
  echo "  [2] Einzeln auswählen"
  echo "  [3] Vorschau (was wird importiert?)"
  echo ""
  prompt "Auswahl [1]:"; read -r choice
  choice="${choice:-1}"

  local do_drive=true do_calendar=true do_contacts=true

  case "$choice" in
    2)
      echo ""
      prompt "Google Drive importieren? [J/n]:"; read -r a; [[ "${a,,}" == "n" ]] && do_drive=false
      prompt "Kalender importieren? [J/n]:"; read -r a; [[ "${a,,}" == "n" ]] && do_calendar=false
      prompt "Kontakte importieren? [J/n]:"; read -r a; [[ "${a,,}" == "n" ]] && do_contacts=false
      ;;
    3) DRY_RUN=true ;;
  esac

  [[ -z "$NC_URL" ]] && ask_connection_config

  local nc_url="" nc_user="" nc_pass=""
  nc_url="$NC_URL"; nc_user="$NC_ADMIN"; nc_pass="$NC_PASS"

  run_google_import "$source" false "$do_drive" "$do_calendar" "$do_contacts" \
    "" "" "" "$nc_url" "$nc_user" "$nc_pass"

  $DRY_RUN || success "Google-Import abgeschlossen!"
  $DRY_RUN && info "DRY-RUN beendet — keine Änderungen vorgenommen"
}

flow_export() {
  header "📦 Daten exportieren"
  echo ""
  echo "Exportiert ausgewählte Daten als ZIP-Archiv."
  echo "Toggle: Nummer drücken zum An-/Abwählen, [s] zum Starten."
  echo ""

  [[ -z "$NC_URL" ]] && \
    warn "Nicht alle Server konfiguriert — einige Exporte könnten fehlschlagen"

  NC_URL="${NC_URL:-}"; NC_USER="${NC_ADMIN:-}"; NC_PASS="${NC_PASS:-}"
  export NC_URL NC_USER NC_PASS

  export KC_DOMAIN KEYCLOAK_ADMIN_PASSWORD
  KC_URL="https://${KC_DOMAIN:-}"

  local compose_dir
  compose_dir="$(dirname "$SCRIPT_DIR")"
  STORAGE_PATH="${STORAGE_PATH:-${compose_dir}/data}"
  export STORAGE_PATH

  run_export

  $DRY_RUN || echo -e "  ${CYAN}Tipp: ZIP-Datei auf USB-Stick oder Cloud-Speicher sichern${NC}"
}

# ── Verbindung testen ────────────────────────────────────────────────
test_connections() {
  header "🔗 Verbindungen testen"
  echo ""

  if [[ -n "$NC_URL" ]]; then
    local nc_status
    nc_status=$(curl -s -o /dev/null -w "%{http_code}" "${NC_URL}/status.php" 2>/dev/null)
    [[ "$nc_status" == "200" ]] && success "Nextcloud:  ${NC_URL} ✓" || warn "Nextcloud:  ${NC_URL} (HTTP ${nc_status})"
  fi

  if [[ -n "$KC_URL" ]]; then
    local kc_status
    kc_status=$(curl -s -o /dev/null -w "%{http_code}" "${KC_URL}/realms/workspace/.well-known/openid-configuration" 2>/dev/null)
    [[ "$kc_status" == "200" ]] && success "Keycloak:   ${KC_URL} ✓" || warn "Keycloak:   ${KC_URL} (HTTP ${kc_status})"
  fi
  echo ""
}

# ── Hauptprogramm ────────────────────────────────────────────────────
clear
echo -e "${BOLD}${CYAN}"
cat << 'BANNER'
  ╔════════════════════════════════════════════════╗
  ║   🏠  Workspace MVP — Daten-Assistent         ║
  ║       Slack · Teams · Google · Export            ║
  ╚════════════════════════════════════════════════╝
BANNER
echo -e "${NC}"

# Deps prüfen
MISSING_DEPS=()
command -v curl    &>/dev/null || MISSING_DEPS+=("curl")
command -v jq      &>/dev/null || MISSING_DEPS+=("jq")
command -v python3 &>/dev/null || MISSING_DEPS+=("python3")
command -v unzip   &>/dev/null || MISSING_DEPS+=("unzip")
command -v zip     &>/dev/null || MISSING_DEPS+=("zip")
if [[ ${#MISSING_DEPS[@]} -gt 0 ]]; then
  error "Fehlende Abhängigkeiten: ${MISSING_DEPS[*]}"
  error "Installieren mit: sudo apt install ${MISSING_DEPS[*]}"
  exit 1
fi

load_config

# Beim ersten Start: Verbindung konfigurieren
if [[ -z "$NC_URL" ]]; then
  warn "Noch keine Server-Verbindung konfiguriert."
  ask_connection_config
fi

# Lokaler Scan
if ! $NO_SCAN; then
  run_scan
fi

# Verbindungen testen
if [[ -n "$NC_URL" ]]; then
  test_connections
fi

# Hauptmenü-Schleife
while true; do
  show_main_menu
  prompt "Auswahl:"; read -r choice

  case "$choice" in
    1) flow_teams ;;
    2) flow_google ;;
    3) flow_users ;;
    4) flow_export ;;
    5) ask_connection_config; test_connections ;;
    6) run_scan ;;
    d|D) $DRY_RUN && { DRY_RUN=false; success "DRY-RUN deaktiviert — Änderungen werden vorgenommen"; } \
                   || { DRY_RUN=true;  warn "DRY-RUN aktiviert — keine Änderungen"; } ;;
    0|q|Q) echo ""; info "Auf Wiedersehen!"; exit 0 ;;
    *) warn "Ungültige Auswahl: '$choice'" ;;
  esac

  echo ""
  prompt "Weiter... [Enter]"; read -r
done
