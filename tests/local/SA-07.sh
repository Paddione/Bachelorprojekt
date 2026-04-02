#!/usr/bin/env bash
# SA-07: Backup — pg_dump, PVCs, backup readiness (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-homeoffice}"

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

# T4: pg_dumpall produces valid output (full cluster backup)
DUMPALL_CHECK=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  pg_dumpall -U postgres --globals-only 2>&1 | grep -c "^-- PostgreSQL database cluster dump$" || echo "0")
assert_eq "$DUMPALL_CHECK" "1" "SA-07" "T4" "pg_dumpall (Cluster-Backup) funktioniert"

# T5: Nextcloud data directory has content
NC_FILES=$(kubectl exec -n "$NAMESPACE" deploy/nextcloud -c nextcloud -- ls /var/www/html/data/ 2>/dev/null | wc -l || echo "0")
assert_gt "$NC_FILES" 0 "SA-07" "T5" "Nextcloud Datenverzeichnis nicht leer"

# T6: db-backup CronJob exists in homeoffice namespace
CRONJOB_NAME=$(kubectl get cronjob db-backup -n "$NAMESPACE" \
  -o jsonpath='{.metadata.name}' 2>/dev/null || echo "")
assert_eq "$CRONJOB_NAME" "db-backup" "SA-07" "T6" "db-backup CronJob vorhanden"

# T7: CronJob schedule is 0 2 * * * (daily at 02:00 UTC)
CRONJOB_SCHEDULE=$(kubectl get cronjob db-backup -n "$NAMESPACE" \
  -o jsonpath='{.spec.schedule}' 2>/dev/null || echo "")
assert_eq "$CRONJOB_SCHEDULE" "0 2 * * *" "SA-07" "T7" "db-backup Schedule = '0 2 * * *' (täglich 02:00 UTC)"

# T8: backup-pvc PVC exists and is Bound
BACKUP_PVC_PHASE=$(kubectl get pvc backup-pvc -n "$NAMESPACE" \
  -o jsonpath='{.status.phase}' 2>/dev/null || echo "")
assert_eq "$BACKUP_PVC_PHASE" "Bound" "SA-07" "T8" "backup-pvc PVC ist Bound"

# T9: backup-passphrase secret exists
BACKUP_SECRET=$(kubectl get secret backup-passphrase -n "$NAMESPACE" \
  -o jsonpath='{.metadata.name}' 2>/dev/null || echo "")
assert_eq "$BACKUP_SECRET" "backup-passphrase" "SA-07" "T9" "backup-passphrase Secret vorhanden"
