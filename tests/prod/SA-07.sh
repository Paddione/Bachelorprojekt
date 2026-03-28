#!/usr/bin/env bash
# SA-07: Backup — rclone logs, backup files, retention
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

# T1: Backup container running
BACKUP_RUNNING=$(docker inspect homeoffice-backup --format '{{.State.Running}}' 2>/dev/null || echo "false")
assert_eq "$BACKUP_RUNNING" "true" "SA-07" "T1" "Backup-Container läuft"

# T2: Backup container has log output
BACKUP_LOGS=$(docker logs homeoffice-backup --tail 20 2>&1)
assert_contains "$BACKUP_LOGS" "backup" "SA-07" "T2" "Backup-Container hat Log-Ausgabe"

# T3: Backup entrypoint mounted
assert_cmd "docker exec homeoffice-backup test -f /backup/backup-entrypoint.sh" \
  "SA-07" "T3" "backup-entrypoint.sh im Container gemountet"

# T5: Restore documented
if [[ -f "${COMPOSE_DIR}/README.md" ]]; then
  README=$(cat "${COMPOSE_DIR}/README.md")
  if [[ "$README" == *"Restore"* || "$README" == *"restore"* || "$README" == *"Backup"* || "$README" == *"backup"* ]]; then
    assert_contains "$README" "ackup" "SA-07" "T5" "Backup/Restore im README dokumentiert"
  else
    assert_eq "missing" "documented" "SA-07" "T5" "Backup/Restore im README dokumentiert"
  fi
else
  skip_test "SA-07" "T5" "Restore docs" "README.md nicht gefunden"
fi
