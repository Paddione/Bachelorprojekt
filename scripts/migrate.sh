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

# ── Farben & UI ──────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[✓]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[!]${NC}    $*"; }
error()   { echo -e "${RED}[✗]${NC}    $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}$*${NC}"; echo -e "${CYAN}$(printf '─%.0s' $(seq 1 ${#1}))${NC}"; }
prompt()  { echo -en "${YELLOW}▶${NC} $* "; }

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

load_config() {
  # shellcheck source=/dev/null
  [[ -f "$CFG_FILE" ]] && source "$CFG_FILE" || true
  # Defaults
  NC_URL="${NC_URL:-}"
  NC_ADMIN="${NC_ADMIN:-}"
  NC_PASS="${NC_PASS:-}"
  KC_URL="${KC_URL:-}"
  KC_ADMIN="${KC_ADMIN:-admin}"
  KC_PASS="${KC_PASS:-}"
}

save_config() {
  cat > "$CFG_FILE" << EOF
# Workspace Migration Config — gespeicherte Verbindungsdaten
NC_URL="${NC_URL}"
NC_ADMIN="${NC_ADMIN}"
KC_URL="${KC_URL}"
KC_ADMIN="${KC_ADMIN}"
# Passwörter werden nicht gespeichert
EOF
  chmod 600 "$CFG_FILE"
}

ask_connection_config() {
  header "🔧 Server-Verbindung konfigurieren"
  echo "Angaben werden für diesen Lauf gespeichert (Passwörter ausgenommen)."
  echo ""

  prompt "Nextcloud URL [${NC_URL:-https://files.example.com}]:"; read -r input
  [[ -n "$input" ]] && NC_URL="$input"

  prompt "Nextcloud Admin-User [${NC_ADMIN:-admin}]:"; read -r input
  [[ -n "$input" ]] && NC_ADMIN="$input"

  read -rsp "$(echo -e "${YELLOW}▶${NC} Nextcloud Admin-Passwort: ")" NC_PASS; echo

  echo ""
  prompt "Keycloak URL [${KC_URL:-https://auth.example.com}]:"; read -r input
  [[ -n "$input" ]] && KC_URL="$input"

  prompt "Keycloak Admin-User [${KC_ADMIN:-admin}]:"; read -r input
  [[ -n "$input" ]] && KC_ADMIN="$input"

  read -rsp "$(echo -e "${YELLOW}▶${NC} Keycloak Admin-Passwort: ")" KC_PASS; echo

  save_config
  success "Verbindungsdaten gespeichert"
}

# ── Scan-Ergebnisse ──────────────────────────────────────────────────
SCAN_RESULTS=()

run_scan() {
  header "🔍 Suche nach lokalen Datenquellen..."
  echo "Scanne: Teams, Google, Nextcloud..."
  echo ""

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    SCAN_RESULTS+=("$line")
  done < <(scan_all)

  if [[ ${#SCAN_RESULTS[@]} -eq 0 ]]; then
    warn "Keine lokalen Datenquellen gefunden."
    echo ""
    echo "Du kannst trotzdem manuell einen Pfad oder eine ZIP-Datei angeben."
  else
    success "${#SCAN_RESULTS[@]} Quellen gefunden:"
    echo ""
    for i in "${!SCAN_RESULTS[@]}"; do
      local label path
      IFS='|' read -r _ label path _ <<< "${SCAN_RESULTS[$i]}"
      echo -e "  ${BOLD}[$((i+1))]${NC} ${label}"
      echo -e "       ${CYAN}${path%|*}${NC}"
    done
  fi
}

# ── Menü ─────────────────────────────────────────────────────────────
show_main_menu() {
  echo ""
  header "🏠 Workspace MVP — Daten-Assistent"
  $DRY_RUN && warn "DRY-RUN Modus aktiv — keine Änderungen werden vorgenommen"
  echo ""
  echo -e "  ${BOLD}Importieren${NC}"
  echo -e "  ───────────"
  echo -e "  ${BOLD}[1]${NC} 📹  MS Teams      → Nextcloud"
  echo -e "  ${BOLD}[2]${NC} 🔵  Google        → Nextcloud"
  echo -e "  ${BOLD}[3]${NC} 👥  Benutzer      → Keycloak (CSV / LDIF)"
  echo ""
  echo -e "  ${BOLD}Exportieren${NC}"
  echo -e "  ───────────"
  echo -e "  ${BOLD}[4]${NC} 📦  Daten exportieren (selektiv → ZIP)"
  echo ""
  echo -e "  ${BOLD}Einstellungen${NC}"
  echo -e "  ─────────────"
  echo -e "  ${BOLD}[5]${NC} 🔧  Server-Verbindung konfigurieren"
  echo -e "  ${BOLD}[6]${NC} 🔍  Lokale Quellen scannen"
  $DRY_RUN && \
  echo -e "  ${BOLD}[d]${NC} ▶   DRY-RUN deaktivieren" || \
  echo -e "  ${BOLD}[d]${NC} 👁   DRY-RUN aktivieren (Vorschau)"
  echo -e "  ${BOLD}[0]${NC} ✗   Beenden"
  echo ""
}

# ── Quell-Auswahl ────────────────────────────────────────────────────
pick_source() {
  local filter="$1"   # "slack" | "teams" | "" (alle)
  local filtered=()

  for r in "${SCAN_RESULTS[@]}"; do
    local key
    key=$(echo "$r" | cut -d'|' -f1)
    if [[ -z "$filter" ]] || [[ "$key" == ${filter}* ]]; then
      filtered+=("$r")
    fi
  done

  if [[ ${#filtered[@]} -gt 0 ]]; then
    echo ""
    echo -e "  ${BOLD}Gefundene Quellen:${NC}"
    for i in "${!filtered[@]}"; do
      local label path
      IFS='|' read -r _ label path _ <<< "${filtered[$i]}"
      echo -e "  ${BOLD}[$((i+1))]${NC} ${label} — ${CYAN}${path%|*}${NC}"
    done
    echo -e "  ${BOLD}[m]${NC} Anderen Pfad / ZIP manuell angeben"
    echo ""
    prompt "Auswahl:"; read -r sel

    if [[ "$sel" =~ ^[0-9]+$ ]] && [[ "$sel" -ge 1 ]] && [[ "$sel" -le "${#filtered[@]}" ]]; then
      local chosen="${filtered[$((sel-1))]}"
      IFS='|' read -r _ _ path _ <<< "$chosen"
      echo "${path%|*}"
      return 0
    fi
  fi

  # Manuell eingeben
  echo ""
  prompt "Pfad zur ZIP-Datei oder zum Export-Verzeichnis:"; read -r manual_path
  manual_path="${manual_path//\'/}"  # Quotes entfernen
  if [[ -e "$manual_path" ]]; then
    echo "$manual_path"
  else
    error "Pfad nicht gefunden: $manual_path"
    return 1
  fi
}

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
