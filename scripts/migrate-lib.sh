#!/usr/bin/env bash
# UI helpers and config logic for migrate.sh
# Extracted to scripts/migrate-lib.sh

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

info()    { echo -e "${BLUE}[INFO]${NC}  $*"; }
success() { echo -e "${GREEN}[✓]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[!]${NC}    $*"; }
error()   { echo -e "${RED}[✗]${NC}    $*" >&2; }
header()  { echo -e "\n${BOLD}${CYAN}$*${NC}"; echo -e "${CYAN}$(printf '─%.0s' $(seq 1 ${#1}))${NC}"; }
prompt()  { echo -en "${YELLOW}▶${NC} $* "; }

load_config() {
  # shellcheck source=/dev/null
  [[ -f "$CFG_FILE" ]] && source "$CFG_FILE" || true
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

pick_source() {
  local filter="$1"
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

  echo ""
  prompt "Pfad zur ZIP-Datei oder zum Export-Verzeichnis:"; read -r manual_path
  manual_path="${manual_path//\'/}"
  if [[ -e "$manual_path" ]]; then
    echo "$manual_path"
  else
    error "Pfad nicht gefunden: $manual_path"
    return 1
  fi
}

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

