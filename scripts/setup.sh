#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# setup.sh — Homeoffice MVP Pre-Flight Check & Setup
# ═══════════════════════════════════════════════════════════════════
# Prüft und richtet alles ein was vor dem ersten "docker compose up"
# erledigt sein muss:
#
#   1. Betriebssystem erkennen
#   2. Docker installiert + läuft
#   3. Docker Compose v2 verfügbar
#   4. Aktueller User in docker-Gruppe (kein sudo nötig)
#   5. Ports 80, 443, 10000 frei
#   6. .env vorhanden und alle Pflichtfelder gesetzt
#   7. Secrets auf Placeholder prüfen
#   8. DuckDNS-Token Format validieren
#   9. Datenpfade + acme.json mit chmod 600 anlegen
#  10. Volume-Mount-Dateien + Ausführbarkeit prüfen
#  11. docker compose config validieren (dry-run)
#
# Verwendung:
#   chmod +x scripts/setup.sh
#   ./scripts/setup.sh          # Interaktiv: fragt bei Problemen nach
#   ./scripts/setup.sh --fix    # Versucht Probleme automatisch zu beheben
#   ./scripts/setup.sh --check  # Nur prüfen, nichts ändern
# ═══════════════════════════════════════════════════════════════════

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${COMPOSE_DIR}/.env"
COMPOSE_FILE="${COMPOSE_DIR}/docker-compose.yml"

# ── Farben ───────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'

PASS=0; WARN=0; FAIL=0
FIX_MODE=false
CHECK_ONLY=false

for arg in "$@"; do
  case "$arg" in
    --fix)   FIX_MODE=true ;;
    --check) CHECK_ONLY=true ;;
    -h|--help)
      echo "Verwendung: $0 [--fix|--check]"
      echo "  --fix    Versucht Probleme automatisch zu beheben"
      echo "  --check  Nur prüfen, keine Änderungen"
      exit 0 ;;
  esac
done

ok()   { echo -e "  ${GREEN}✓${NC} $*"; ((PASS++)) || true; }
warn() { echo -e "  ${YELLOW}⚠${NC}  $*"; ((WARN++)) || true; }
fail() { echo -e "  ${RED}✗${NC} $*"; ((FAIL++)) || true; }
info() { echo -e "  ${BLUE}→${NC} $*"; }
header() {
  echo ""
  echo -e "${BOLD}${CYAN}▶ $*${NC}"
  echo -e "${CYAN}$(printf '─%.0s' $(seq 1 $((${#1}+2))))${NC}"
}
ask() {
  $CHECK_ONLY && return 1
  echo -en "  ${YELLOW}▶${NC} $* [j/N] "
  read -r answer
  [[ "${answer,,}" == "j" ]]
}

# ═══════════════════════════════════════════════════════════════════
# 1. OS erkennen
# ═══════════════════════════════════════════════════════════════════
header "Betriebssystem"

OS_TYPE="linux"
if [[ -n "${WSL_DISTRO_NAME:-}" ]] || grep -qi microsoft /proc/version 2>/dev/null; then
  OS_TYPE="wsl"
  ok "WSL2 erkannt (${WSL_DISTRO_NAME:-unknown})"
  info "Docker Desktop für Windows muss installiert + WSL-Integration aktiviert sein"
elif [[ "$OSTYPE" == "darwin"* ]]; then
  OS_TYPE="macos"
  ok "macOS erkannt"
  info "Docker Desktop für Mac muss installiert sein"
else
  ok "Linux erkannt ($(uname -r))"
fi

# ═══════════════════════════════════════════════════════════════════
# 2. Docker
# ═══════════════════════════════════════════════════════════════════
header "Docker"

if command -v docker &>/dev/null; then
  DOCKER_VERSION=$(docker --version 2>/dev/null | grep -oP '\d+\.\d+\.\d+' | head -1)
  ok "Docker gefunden: v${DOCKER_VERSION}"
else
  fail "Docker nicht gefunden"
  if $FIX_MODE && [[ "$OS_TYPE" == "linux" ]]; then
    info "Installiere Docker..."
    curl -fsSL https://get.docker.com | sh
    ok "Docker installiert"
  else
    info "Installation: https://docs.docker.com/engine/install/"
    info "Schnell-Install (Linux): curl -fsSL https://get.docker.com | sh"
  fi
fi

# Docker Daemon läuft?
if command -v docker &>/dev/null; then
  if docker info &>/dev/null 2>&1; then
    ok "Docker Daemon läuft"
  else
    fail "Docker Daemon nicht erreichbar"
    if [[ "$OS_TYPE" == "linux" ]]; then
      info "Starten mit: sudo systemctl start docker"
      if $FIX_MODE && ask "Docker jetzt starten?"; then
        sudo systemctl start docker && ok "Docker gestartet" || fail "Konnte Docker nicht starten"
      fi
    elif [[ "$OS_TYPE" == "wsl" || "$OS_TYPE" == "macos" ]]; then
      info "Docker Desktop starten und WSL-Integration prüfen"
    fi
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# 3. Docker Compose v2
# ═══════════════════════════════════════════════════════════════════
header "Docker Compose"

COMPOSE_CMD=""
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || docker compose version | grep -oP '\d+\.\d+\.\d+' | head -1)
  COMPOSE_CMD="docker compose"
  # Mindestversion 2.0
  COMPOSE_MAJOR=$(echo "$COMPOSE_VERSION" | cut -d. -f1)
  if [[ "$COMPOSE_MAJOR" -ge 2 ]]; then
    ok "Docker Compose v2 gefunden: v${COMPOSE_VERSION}"
  else
    fail "Docker Compose v1 gefunden (${COMPOSE_VERSION}) — v2 benötigt"
    info "Update: https://docs.docker.com/compose/migrate/"
  fi
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
  LEGACY_VER=$(docker-compose version --short 2>/dev/null || echo "unbekannt")
  fail "Nur docker-compose v1 (${LEGACY_VER}) gefunden — 'docker compose' (Plugin) benötigt"
  info "Update: sudo apt install docker-compose-plugin"
  if $FIX_MODE && [[ "$OS_TYPE" == "linux" ]] && ask "Docker Compose Plugin jetzt installieren?"; then
    sudo apt-get install -y docker-compose-plugin && \
      COMPOSE_CMD="docker compose" && ok "Docker Compose v2 installiert"
  fi
else
  fail "Docker Compose nicht gefunden"
  info "Installation: sudo apt install docker-compose-plugin"
  if $FIX_MODE && [[ "$OS_TYPE" == "linux" ]] && ask "Jetzt installieren?"; then
    sudo apt-get install -y docker-compose-plugin && \
      COMPOSE_CMD="docker compose" && ok "Docker Compose v2 installiert"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# 4. Docker-Gruppe
# ═══════════════════════════════════════════════════════════════════
header "Docker-Gruppe (kein sudo)"

CURRENT_USER="${USER:-$(whoami)}"
if [[ "$OS_TYPE" == "macos" ]]; then
  ok "macOS — kein sudo für Docker nötig"
elif groups "$CURRENT_USER" 2>/dev/null | grep -q '\bdocker\b'; then
  ok "User '$CURRENT_USER' ist in der docker-Gruppe"
else
  fail "User '$CURRENT_USER' ist NICHT in der docker-Gruppe (sudo nötig)"
  info "Lösung: sudo usermod -aG docker $CURRENT_USER && newgrp docker"
  if $FIX_MODE && [[ "$OS_TYPE" != "wsl" ]] && ask "User zur docker-Gruppe hinzufügen?"; then
    sudo usermod -aG docker "$CURRENT_USER"
    ok "User hinzugefügt — bitte neu einloggen oder 'newgrp docker' ausführen"
    warn "Aktuelle Shell braucht noch sudo — nach Re-Login nicht mehr"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# 5. Ports prüfen
# ═══════════════════════════════════════════════════════════════════
header "Port-Verfügbarkeit"

check_port() {
  local port="$1" proto="${2:-tcp}" label="$3"
  local in_use=false

  if command -v ss &>/dev/null; then
    ss -lnp${proto:0:1} 2>/dev/null | grep -q ":${port} " && in_use=true
  elif command -v netstat &>/dev/null; then
    netstat -ln${proto:0:1} 2>/dev/null | grep -q ":${port} " && in_use=true
  elif command -v lsof &>/dev/null; then
    lsof -i "${proto}:${port}" &>/dev/null && in_use=true
  fi

  if $in_use; then
    local proc=""
    proc=$(ss -lnp${proto:0:1} 2>/dev/null | grep ":${port} " | grep -oP 'users:\(\("[^"]+' | head -1 | cut -d'"' -f2 || true)
    fail "Port ${port}/${proto} belegt${proc:+ (${proc})} — $label"
    info "Belegenden Prozess beenden oder docker-compose.yml Port anpassen"
  else
    ok "Port ${port}/${proto} frei — $label"
  fi
}

check_port 80   tcp  "HTTP / Let's Encrypt"
check_port 443  tcp  "HTTPS"
check_port 10000 udp "Jitsi JVB"

# ═══════════════════════════════════════════════════════════════════
# 6. .env Datei
# ═══════════════════════════════════════════════════════════════════
header ".env Datei"

if [[ ! -f "$ENV_FILE" ]]; then
  fail ".env nicht gefunden: $ENV_FILE"
  if $FIX_MODE && ask ".env aus .env.example erstellen?"; then
    cp "${COMPOSE_DIR}/.env.example" "$ENV_FILE"
    ok ".env erstellt — bitte Werte ausfüllen"
    warn "Alle CHANGE_ME_* und DEIN_* Werte müssen noch gesetzt werden"
  else
    info "Erstellen mit: cp .env.example .env"
  fi
else
  ok ".env gefunden"
fi

# ═══════════════════════════════════════════════════════════════════
# 7. Pflichtfelder + Placeholder prüfen
# ═══════════════════════════════════════════════════════════════════
header ".env Inhalt"

REQUIRED_VARS=(
  MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN
  DUCKDNS_TOKEN DUCKDNS_SUBDOMAINS
  JVB_ADVERTISE_IPS JITSI_XMPP_SUFFIX
  ACME_EMAIL
  KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD
  MATTERMOST_DB_PASSWORD MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET
  NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD
  LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS LLDAP_DB_PASSWORD
  LLDAP_BASE_DOMAIN LLDAP_BASE_TLD
  JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD
)

PLACEHOLDERS=("CHANGE_ME" "DEIN_" "your@" "xxxxxxxx" "NACH_KEYCLOAK" "DEIN_NEUER_TOKEN")

if [[ -f "$ENV_FILE" ]]; then
  # Datei einlesen
  set -a; source "$ENV_FILE" 2>/dev/null || true; set +a

  MISSING=(); PLACEHOLDER_VARS=()

  for var in "${REQUIRED_VARS[@]}"; do
    val="${!var:-}"
    if [[ -z "$val" ]]; then
      MISSING+=("$var")
    else
      for ph in "${PLACEHOLDERS[@]}"; do
        if [[ "$val" == *"$ph"* ]]; then
          PLACEHOLDER_VARS+=("$var=${val}")
          break
        fi
      done
    fi
  done

  if [[ ${#MISSING[@]} -eq 0 ]]; then
    ok "Alle ${#REQUIRED_VARS[@]} Pflichtfelder gesetzt"
  else
    for v in "${MISSING[@]}"; do
      fail "Fehlt: $v"
    done
  fi

  if [[ ${#PLACEHOLDER_VARS[@]} -gt 0 ]]; then
    echo ""
    warn "Folgende Felder haben noch Placeholder-Werte:"
    for pv in "${PLACEHOLDER_VARS[@]}"; do
      echo -e "    ${YELLOW}•${NC} $pv"
    done
  else
    ok "Keine Placeholder-Werte gefunden"
  fi

  # DuckDNS Token Format (UUID)
  if [[ -n "${DUCKDNS_TOKEN:-}" ]]; then
    if [[ "$DUCKDNS_TOKEN" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
      ok "DuckDNS Token Format gültig"
    else
      fail "DuckDNS Token Format ungültig (erwartet: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx)"
    fi
  fi

  # E-Mail Format
  if [[ -n "${ACME_EMAIL:-}" ]]; then
    if [[ "$ACME_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
      ok "ACME E-Mail Format gültig: $ACME_EMAIL"
    else
      fail "ACME_EMAIL ungültig: $ACME_EMAIL"
    fi
  fi

  # Domain Format
  for var in MM_DOMAIN KC_DOMAIN NC_DOMAIN JITSI_DOMAIN LLDAP_DOMAIN; do
    val="${!var:-}"
    if [[ -n "$val" ]]; then
      if [[ "$val" =~ \.duckdns\.org$ ]] || [[ "$val" =~ \.[a-z]{2,}$ ]]; then
        ok "Domain OK: ${var}=${val}"
      else
        warn "Domain Format prüfen: ${var}=${val}"
      fi
    fi
  done

  # OIDC Secrets — müssen VOR dem Start gesetzt sein (Keycloak importiert sie automatisch)
  for oidc_var in MATTERMOST_OIDC_SECRET NEXTCLOUD_OIDC_SECRET; do
    val="${!oidc_var:-}"
    if [[ -z "$val" || "$val" == *"CHANGE_ME"* ]]; then
      fail "${oidc_var} nicht gesetzt — generieren mit: openssl rand -base64 32"
    else
      ok "${oidc_var} gesetzt (${#val} Zeichen)"
    fi
  done

  # STORAGE_PATH prüfen
  if [[ -n "${STORAGE_PATH:-}" ]]; then
    if [[ "$STORAGE_PATH" == /* || "$STORAGE_PATH" == ./* || "$STORAGE_PATH" == "." ]]; then
      ok "STORAGE_PATH gesetzt: $STORAGE_PATH"
    else
      warn "STORAGE_PATH ungewöhnliches Format: $STORAGE_PATH (erwartet: absoluter oder relativer Pfad)"
    fi
  else
    info "STORAGE_PATH nicht gesetzt — Standard ./data wird verwendet"
  fi

  # Backup-Targets prüfen (optional — nur Hinweis)
  BACKUP_CONFIGURED=false

  # Filen.io
  FILEN_PARTIAL=false
  [[ -n "${FILEN_EMAIL:-}" || -n "${FILEN_PASSWORD:-}" ]] && FILEN_PARTIAL=true
  if [[ -n "${FILEN_EMAIL:-}" && -n "${FILEN_PASSWORD:-}" ]]; then
    # E-Mail Format
    if [[ "$FILEN_EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
      ok "Backup: Filen.io konfiguriert (${FILEN_EMAIL})"
    else
      warn "FILEN_EMAIL Format ungültig: $FILEN_EMAIL"
    fi
    if [[ -z "${FILEN_REMOTE_PATH:-}" ]]; then
      warn "FILEN_REMOTE_PATH nicht gesetzt — Standard 'homeoffice-mvp' wird verwendet"
    else
      ok "FILEN_REMOTE_PATH: ${FILEN_REMOTE_PATH}"
    fi
    BACKUP_CONFIGURED=true
  elif $FILEN_PARTIAL; then
    warn "Filen.io unvollständig — FILEN_EMAIL und FILEN_PASSWORD müssen beide gesetzt sein"
  fi

  # SMB / NAS
  SMB_PARTIAL=false
  [[ -n "${SMB_HOST:-}" || -n "${SMB_SHARE:-}" || -n "${SMB_USER:-}" || -n "${SMB_PASS:-}" ]] && SMB_PARTIAL=true
  if [[ -n "${SMB_HOST:-}" && -n "${SMB_SHARE:-}" ]]; then
    ok "Backup: SMB konfiguriert (//${SMB_HOST}/${SMB_SHARE})"
    # Pflichtfelder wenn SMB aktiv
    if [[ -z "${SMB_USER:-}" ]]; then
      warn "SMB_USER nicht gesetzt — wird für Authentifizierung benötigt"
    else
      ok "SMB_USER: ${SMB_USER}"
    fi
    if [[ -z "${SMB_PASS:-}" ]]; then
      warn "SMB_PASS nicht gesetzt — wird für Authentifizierung benötigt"
    else
      ok "SMB_PASS gesetzt (${#SMB_PASS} Zeichen)"
    fi
    # Port prüfen
    if [[ -n "${SMB_PORT:-}" ]]; then
      if [[ "$SMB_PORT" =~ ^[0-9]+$ ]] && (( SMB_PORT >= 1 && SMB_PORT <= 65535 )); then
        ok "SMB_PORT: ${SMB_PORT}"
      else
        fail "SMB_PORT ungültig: ${SMB_PORT} (erwartet: 1–65535)"
      fi
    else
      info "SMB_PORT nicht gesetzt — Standard 445 wird verwendet"
    fi
    # Domain
    if [[ -z "${SMB_DOMAIN:-}" ]]; then
      info "SMB_DOMAIN nicht gesetzt — Standard 'WORKGROUP' wird verwendet"
    else
      ok "SMB_DOMAIN: ${SMB_DOMAIN}"
    fi
    # Remote-Pfad
    if [[ -z "${SMB_REMOTE_PATH:-}" ]]; then
      info "SMB_REMOTE_PATH nicht gesetzt — Standard 'homeoffice-mvp' wird verwendet"
    else
      ok "SMB_REMOTE_PATH: ${SMB_REMOTE_PATH}"
    fi
    BACKUP_CONFIGURED=true
  elif $SMB_PARTIAL; then
    warn "SMB unvollständig — mindestens SMB_HOST und SMB_SHARE müssen gesetzt sein"
  fi

  if ! $BACKUP_CONFIGURED; then
    warn "Backup: kein Target konfiguriert — optional, jederzeit nachrüstbar"
    info "Filen.io: FILEN_EMAIL + FILEN_PASSWORD in .env setzen"
    info "SMB/NAS:  SMB_HOST + SMB_SHARE + SMB_USER + SMB_PASS in .env setzen"
  fi

  # SMTP (optional)
  if [[ -n "${SMTP_HOST:-}" && -n "${SMTP_USER:-}" ]]; then
    ok "SMTP konfiguriert: ${SMTP_USER}@${SMTP_HOST}:${SMTP_PORT:-465}"
    if [[ -z "${SMTP_PASS:-}" ]]; then
      warn "SMTP_PASS nicht gesetzt"
    else
      ok "SMTP_PASS gesetzt (${#SMTP_PASS} Zeichen)"
    fi
    if [[ -n "${SMTP_FROM:-}" ]]; then
      if [[ "$SMTP_FROM" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
        ok "SMTP_FROM gültig: $SMTP_FROM"
      else
        warn "SMTP_FROM Format prüfen: $SMTP_FROM"
      fi
    fi
  elif [[ -n "${SMTP_HOST:-}" || -n "${SMTP_USER:-}" ]]; then
    warn "SMTP unvollständig — SMTP_HOST und SMTP_USER müssen beide gesetzt sein"
  else
    info "SMTP nicht konfiguriert — optional, für E-Mail-Benachrichtigungen"
  fi

  # Passwort-Länge prüfen (min 16 Zeichen)
  for var in KEYCLOAK_DB_PASSWORD KEYCLOAK_ADMIN_PASSWORD MATTERMOST_DB_PASSWORD \
             NEXTCLOUD_DB_PASSWORD NEXTCLOUD_ADMIN_PASSWORD LLDAP_DB_PASSWORD \
             LLDAP_JWT_SECRET LLDAP_LDAP_USER_PASS MATTERMOST_OIDC_SECRET \
             NEXTCLOUD_OIDC_SECRET JICOFO_AUTH_PASSWORD JVB_AUTH_PASSWORD; do
    val="${!var:-}"
    if [[ -n "$val" && ${#val} -lt 16 ]]; then
      warn "${var} ist kurz (${#val} Zeichen) — mindestens 16 empfohlen"
    fi
  done
fi

# ═══════════════════════════════════════════════════════════════════
# 8. Datenpfade + acme.json
# ═══════════════════════════════════════════════════════════════════
header "Datenpfade & acme.json"

STORAGE="${STORAGE_PATH:-${COMPOSE_DIR}/data}"

# Relative Pfade auflösen
[[ "$STORAGE" == "./"* ]] && STORAGE="${COMPOSE_DIR}/${STORAGE:2}"
[[ "$STORAGE" == "." ]]   && STORAGE="${COMPOSE_DIR}/data"

NEEDED_DIRS=(
  "${STORAGE}/traefik/letsencrypt"
  "${STORAGE}/mattermost"
  "${STORAGE}/nextcloud"
)

for dir in "${NEEDED_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    ok "Verzeichnis existiert: $dir"
  else
    fail "Verzeichnis fehlt: $dir"
    if $FIX_MODE && ask "Verzeichnis erstellen?"; then
      mkdir -p "$dir" && ok "Erstellt: $dir"
    else
      info "Erstellen mit: mkdir -p $dir"
    fi
  fi
done

ACME_JSON="${STORAGE}/traefik/letsencrypt/acme.json"
if [[ -f "$ACME_JSON" ]]; then
  PERMS=$(stat -c "%a" "$ACME_JSON" 2>/dev/null || stat -f "%Lp" "$ACME_JSON" 2>/dev/null)
  if [[ "$PERMS" == "600" ]]; then
    ok "acme.json vorhanden mit chmod 600"
  else
    fail "acme.json hat falsche Rechte: ${PERMS} (benötigt: 600)"
    if $FIX_MODE && ask "chmod 600 setzen?"; then
      chmod 600 "$ACME_JSON" && ok "Rechte korrigiert: chmod 600 $ACME_JSON"
    else
      info "Korrigieren mit: chmod 600 $ACME_JSON"
    fi
  fi
else
  fail "acme.json fehlt: $ACME_JSON"
  if $FIX_MODE && ask "acme.json erstellen (chmod 600)?"; then
    [[ -d "$(dirname "$ACME_JSON")" ]] || mkdir -p "$(dirname "$ACME_JSON")"
    touch "$ACME_JSON" && chmod 600 "$ACME_JSON" && ok "acme.json erstellt mit chmod 600"
  else
    info "Erstellen mit:"
    info "  touch $ACME_JSON && chmod 600 $ACME_JSON"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# 9. Volume-Mount-Dateien prüfen
# ═══════════════════════════════════════════════════════════════════
header "Volume-Mount-Dateien"

# Dateien die docker-compose.yml als Volume mountet und die existieren müssen
MOUNT_FILES=(
  "${COMPOSE_DIR}/keycloak/import-entrypoint.sh"
  "${COMPOSE_DIR}/keycloak/realm-homeoffice.json"
  "${COMPOSE_DIR}/backup/backup-entrypoint.sh"
)

for mf in "${MOUNT_FILES[@]}"; do
  if [[ -f "$mf" ]]; then
    ok "Vorhanden: ${mf##*/}"
  else
    fail "Fehlt: $mf (wird als Volume gemountet)"
  fi
done

# Entrypoint-Scripts müssen ausführbar sein
EXEC_FILES=(
  "${COMPOSE_DIR}/keycloak/import-entrypoint.sh"
  "${COMPOSE_DIR}/backup/backup-entrypoint.sh"
)

for ef in "${EXEC_FILES[@]}"; do
  if [[ -f "$ef" ]]; then
    if [[ -x "$ef" ]]; then
      ok "Ausführbar: ${ef##*/}"
    else
      fail "${ef##*/} ist nicht ausführbar (chmod +x nötig)"
      if $FIX_MODE && ask "chmod +x setzen?"; then
        chmod +x "$ef" && ok "Ausführbar gemacht: ${ef##*/}"
      else
        info "Korrigieren mit: chmod +x $ef"
      fi
    fi
  fi
done

# ═══════════════════════════════════════════════════════════════════
# 10. docker compose config validieren
# ═══════════════════════════════════════════════════════════════════
header "docker compose config"

if [[ -n "$COMPOSE_CMD" ]] && docker info &>/dev/null 2>&1; then
  cd "$COMPOSE_DIR"
  if [[ -f "$ENV_FILE" ]]; then
    COMPOSE_OUTPUT=$($COMPOSE_CMD config --quiet 2>&1) && RC=0 || RC=$?
    if [[ $RC -eq 0 ]]; then
      ok "docker compose config valide"
    else
      fail "docker compose config Fehler:"
      echo "$COMPOSE_OUTPUT" | sed 's/^/    /'
    fi
  else
    warn "Übersprungen — .env fehlt"
  fi
else
  warn "Übersprungen — Docker nicht verfügbar oder kein Compose-Command"
fi

# ═══════════════════════════════════════════════════════════════════
# 11. Netzwerk-Konnektivität (optional)
# ═══════════════════════════════════════════════════════════════════
header "Netzwerk-Konnektivität"

# DuckDNS erreichbar?
if curl -s --connect-timeout 5 "https://www.duckdns.org" -o /dev/null; then
  ok "DuckDNS erreichbar"
else
  warn "DuckDNS nicht erreichbar — Kein Internet?"
fi

# Let's Encrypt erreichbar?
if curl -s --connect-timeout 5 "https://acme-v02.api.letsencrypt.org/directory" -o /dev/null; then
  ok "Let's Encrypt API erreichbar"
else
  warn "Let's Encrypt API nicht erreichbar"
fi

# Eigene Domains auflösbar?
if [[ -n "${MM_DOMAIN:-}" ]]; then
  if host "$MM_DOMAIN" &>/dev/null 2>&1 || nslookup "$MM_DOMAIN" &>/dev/null 2>&1; then
    ok "DNS-Auflösung OK: $MM_DOMAIN"
  else
    warn "DNS-Auflösung fehlgeschlagen: $MM_DOMAIN"
    info "DuckDNS-Subdomains auf duckdns.org anlegen und Token korrekt setzen"
  fi
fi

# ═══════════════════════════════════════════════════════════════════
# Zusammenfassung
# ═══════════════════════════════════════════════════════════════════
echo ""
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "${BOLD} Ergebnis${NC}"
echo -e "${BOLD}═══════════════════════════════════════${NC}"
echo -e "  ${GREEN}✓ Bestanden:${NC}  $PASS"
echo -e "  ${YELLOW}⚠ Warnungen:${NC} $WARN"
echo -e "  ${RED}✗ Fehler:${NC}    $FAIL"
echo ""

if [[ $FAIL -eq 0 && $WARN -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  Alles bereit! Starten mit:${NC}"
  echo -e "  ${CYAN}docker compose up -d${NC}"
elif [[ $FAIL -eq 0 ]]; then
  echo -e "${YELLOW}${BOLD}  Bereit mit Warnungen. Starten mit:${NC}"
  echo -e "  ${CYAN}docker compose up -d${NC}"
  echo -e "  ${YELLOW}Warnungen oben prüfen — vor allem MATTERMOST_OIDC_SECRET${NC}"
else
  echo -e "${RED}${BOLD}  Fehler gefunden — bitte beheben bevor docker compose up.${NC}"
  echo ""
  if ! $FIX_MODE; then
    echo -e "  Automatische Behebung versuchen mit:"
    echo -e "  ${CYAN}./scripts/setup.sh --fix${NC}"
  fi
  exit 1
fi
