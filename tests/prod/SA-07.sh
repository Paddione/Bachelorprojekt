#!/usr/bin/env bash
# SA-07: Backup — backup scripts, PVC snapshots, restore verification
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"
source "${SCRIPT_DIR}/lib/k3d.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"
DOMAIN="${PROD_DOMAIN:?PROD_DOMAIN must be set}"

# T1: PostgreSQL pg_dump works inside shared-db pod
PG_DUMP_OUT=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  pg_dump -U postgres --schema-only keycloak 2>&1 | head -5)
assert_contains "$PG_DUMP_OUT" "PostgreSQL database dump" "SA-07" "T1" "pg_dump funktioniert für Keycloak-DB"

# T2: All three databases are dumpable
for db in keycloak mattermost nextcloud; do
  DUMP_OK=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
    pg_dump -U postgres --schema-only "$db" 2>&1 | grep -c "^-- PostgreSQL database dump$" || echo "0")
  assert_eq "$DUMP_OK" "1" "SA-07" "T2-${db}" "pg_dump erfolgreich für ${db}-Datenbank"
done

# T3: PersistentVolumeClaims exist and are bound
PVCS=$(kubectl get pvc -n "$NAMESPACE" -o jsonpath='{range .items[*]}{.metadata.name}={.status.phase}{"\n"}{end}' 2>/dev/null)
if [[ -n "$PVCS" ]]; then
  PVC_COUNT=$(echo "$PVCS" | wc -l)
  assert_gt "$PVC_COUNT" 0 "SA-07" "T3a" "PVCs vorhanden im Namespace ${NAMESPACE}"

  BOUND_COUNT=$(echo "$PVCS" | grep -c "=Bound" || echo "0")
  assert_eq "$BOUND_COUNT" "$PVC_COUNT" "SA-07" "T3b" "Alle PVCs sind Bound (${BOUND_COUNT}/${PVC_COUNT})"
else
  _log_result "SA-07" "T3a" "PVCs vorhanden" "fail" "0" "Keine PVCs gefunden"
fi

# T4: CronJob or backup script exists
CRONJOBS=$(kubectl get cronjobs -n "$NAMESPACE" --no-headers 2>/dev/null | wc -l || echo "0")
BACKUP_SCRIPT="${PROJECT_DIR}/scripts/backup.sh"
if (( CRONJOBS > 0 )); then
  _log_result "SA-07" "T4" "Backup-CronJob konfiguriert" "pass" "0" "${CRONJOBS} CronJob(s) gefunden"
elif [[ -f "$BACKUP_SCRIPT" ]]; then
  _log_result "SA-07" "T4" "Backup-Script vorhanden" "pass" "0" "${BACKUP_SCRIPT}"
else
  _log_result "SA-07" "T4" "Backup-Mechanismus vorhanden" "fail" "0" "Kein CronJob und kein backup.sh gefunden"
fi

# T5: Nextcloud data directory has content (data isn't empty)
NC_FILES=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -- ls /var/www/html/data/ 2>/dev/null | wc -l || echo "0")
assert_gt "$NC_FILES" 0 "SA-07" "T5" "Nextcloud Datenverzeichnis nicht leer"

# T6: Verify pg_dumpall produces valid output (full cluster backup)
DUMPALL_CHECK=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  pg_dumpall -U postgres --globals-only 2>&1 | grep -c "^-- PostgreSQL database cluster dump$" || echo "0")
assert_eq "$DUMPALL_CHECK" "1" "SA-07" "T6" "pg_dumpall (Cluster-Backup) funktioniert"
