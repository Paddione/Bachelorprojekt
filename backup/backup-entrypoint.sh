#!/bin/sh
# ═══════════════════════════════════════════════════════════════════
# backup-entrypoint.sh — rclone Backup zu Filen.io und/oder SMB
# ═══════════════════════════════════════════════════════════════════
# Läuft als Cron-Container (täglich 02:00 UTC).
# Targets sind optional — fehlende Konfiguration wird übersprungen.
#
# Backup-Quellen (aus STORAGE_PATH):
#   - mattermost/      Uploads & Plugins
#   - nextcloud/       Nutzerdateien
#   - traefik/         SSL-Zertifikate
#
# Plus DB-Dumps (via separate pg_dump calls zum Live-Container):
#   - keycloak-db, mattermost-db, nextcloud-db, lldap-db
# ═══════════════════════════════════════════════════════════════════
set -e

RCLONE_CONFIG="/tmp/rclone.conf"
BACKUP_SRC="${STORAGE_PATH:-/data}"
TIMESTAMP=$(date +%Y-%m-%d)
TARGETS_CONFIGURED=0

# ── rclone Config generieren ─────────────────────────────────────────

> "$RCLONE_CONFIG"

# Filen.io
if [ -n "${FILEN_EMAIL:-}" ] && [ -n "${FILEN_PASSWORD:-}" ]; then
  cat >> "$RCLONE_CONFIG" << EOF
[filen]
type = filen
email = ${FILEN_EMAIL}
password = ${FILEN_PASSWORD}
EOF
  TARGETS_CONFIGURED=$((TARGETS_CONFIGURED + 1))
  echo "[backup] Filen.io konfiguriert: ${FILEN_EMAIL}"
fi

# SMB
if [ -n "${SMB_HOST:-}" ] && [ -n "${SMB_SHARE:-}" ]; then
  cat >> "$RCLONE_CONFIG" << EOF
[smb]
type = smb
host = ${SMB_HOST}
port = ${SMB_PORT:-445}
user = ${SMB_USER:-guest}
pass = ${SMB_PASS:-}
domain = ${SMB_DOMAIN:-WORKGROUP}
EOF
  TARGETS_CONFIGURED=$((TARGETS_CONFIGURED + 1))
  echo "[backup] SMB konfiguriert: //${SMB_HOST}/${SMB_SHARE}"
fi

# Kein Target → beenden
if [ "$TARGETS_CONFIGURED" -eq 0 ]; then
  echo "[backup] Keine Backup-Targets konfiguriert (FILEN_EMAIL oder SMB_HOST fehlen) — übersprungen."
  exit 0
fi

echo "[backup] Starte Backup — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
echo "[backup] Backup-Quelle: ${BACKUP_SRC}"

RCLONE="rclone --config=${RCLONE_CONFIG} --stats=30s --stats-one-line"

# ── Backup-Funktion ──────────────────────────────────────────────────
backup_to() {
  local remote="$1"   # z.B. "filen:homeoffice-mvp" oder "smb:backup/homeoffice-mvp"
  echo ""
  echo "[backup] → ${remote}"

  # Datei-Backups
  for dir in mattermost nextcloud traefik; do
    local src="${BACKUP_SRC}/${dir}"
    [ -d "$src" ] || continue
    echo "[backup]   Sync: ${dir}/ → ${remote}/files/${dir}/"
    $RCLONE sync "$src" "${remote}/files/${dir}/" \
      --exclude "*.log" \
      --exclude "*.tmp" \
      2>&1 | grep -v "^$" || true
  done

  echo "[backup]   Dateien abgeschlossen"
}

# ── Filen.io Backup ──────────────────────────────────────────────────
if [ -n "${FILEN_EMAIL:-}" ] && [ -n "${FILEN_PASSWORD:-}" ]; then
  FILEN_DEST="filen:${FILEN_REMOTE_PATH:-homeoffice-mvp}"
  backup_to "$FILEN_DEST"
fi

# ── SMB Backup ───────────────────────────────────────────────────────
if [ -n "${SMB_HOST:-}" ] && [ -n "${SMB_SHARE:-}" ]; then
  SMB_DEST="smb:${SMB_SHARE}/${SMB_REMOTE_PATH:-homeoffice-mvp}"
  backup_to "$SMB_DEST"
fi

echo ""
echo "[backup] ✓ Backup abgeschlossen — $(date -u '+%Y-%m-%d %H:%M:%S UTC')"
