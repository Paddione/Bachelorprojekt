#!/usr/bin/env bash
# SA-07: Backup — pg_dump, PVCs, backup readiness (k3d)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "${SCRIPT_DIR}/lib/assert.sh"

NAMESPACE="${NAMESPACE:-workspace}"

# T1: PostgreSQL pg_dump works inside shared-db pod
PG_DUMP_OUT=$(kubectl exec -n "$NAMESPACE" deploy/shared-db -- \
  pg_dump -U postgres --schema-only keycloak 2>&1 | head -5)
assert_contains "$PG_DUMP_OUT" "PostgreSQL database dump" "SA-07" "T1" "pg_dump funktioniert für Keycloak-DB"

# T2: All three databases are dumpable
for db in keycloak nextcloud; do
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

# T6: db-backup CronJob exists
CJ_COUNT=$(kubectl get cronjob db-backup -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
assert_gt "$CJ_COUNT" 0 "SA-07" "T6" "CronJob db-backup vorhanden"

# T7: filen-upload container uses @filen/cli (node:22-alpine), not rclone
FILEN_IMAGE=$(kubectl get cronjob db-backup -n "$NAMESPACE" \
  -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[?(@.name=="filen-upload")].image}' \
  2>/dev/null || echo "")
assert_contains "$FILEN_IMAGE" "node" "SA-07" "T7" "filen-upload nutzt node-Image (@filen/cli), nicht rclone (${FILEN_IMAGE})"

# T8: pvc-backup CronJob exists (backs up nextcloud-data, vaultwarden-data, docuseal-data PVCs)
PVC_CJ_COUNT=$(kubectl get cronjob pvc-backup -n "$NAMESPACE" -o name 2>/dev/null | wc -l)
assert_gt "$PVC_CJ_COUNT" 0 "SA-07" "T8" "CronJob pvc-backup vorhanden (sichert Datei-PVCs)"

# T9: pvc-backup CronJob references all three critical data PVCs as volumes
PVC_VOLS=$(kubectl get cronjob pvc-backup -n "$NAMESPACE" \
  -o jsonpath='{.spec.jobTemplate.spec.template.spec.volumes[*].persistentVolumeClaim.claimName}' \
  2>/dev/null || echo "")
assert_contains "$PVC_VOLS" "nextcloud-data-pvc"  "SA-07" "T9a" "pvc-backup sichert nextcloud-data-pvc"
assert_contains "$PVC_VOLS" "vaultwarden-data-pvc" "SA-07" "T9b" "pvc-backup sichert vaultwarden-data-pvc"
assert_contains "$PVC_VOLS" "docuseal-data-pvc"    "SA-07" "T9c" "pvc-backup sichert docuseal-data-pvc"

# T10: backup-restore.sh supports pvc-restore subcommand
RESTORE_HELP=$(bash "${SCRIPT_DIR}/../scripts/backup-restore.sh" --help 2>&1 || true)
assert_contains "$RESTORE_HELP" "pvc-restore" "SA-07" "T10" "backup-restore.sh unterstützt pvc-restore Subcommand"

# T11: Data PVCs used by pvc-backup must use Longhorn in prod overlay
# (local-path PVCs are node-pinned RWO — backup pod cannot mount PVCs from different nodes)
# This is a manifest-level test: checks kustomize build output, no cluster access needed.
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
KUSTOMIZE_OUT=$(kustomize build "${PROJECT_DIR}/prod-mentolder" 2>/dev/null)
# nextcloud-data-pvc excluded: Longhorn lacks disk headroom for 50Gi on 3 replicas (T000317)
for pvc in vaultwarden-data-pvc docuseal-data-pvc; do
  # Extract storageClassName from the built manifest for this specific PVC
  SC=$(echo "$KUSTOMIZE_OUT" \
    | python3 -c "
import sys, yaml
docs = list(yaml.safe_load_all(sys.stdin))
for d in docs:
    if d and d.get('kind')=='PersistentVolumeClaim' and d.get('metadata',{}).get('name')=='${pvc}':
        print(d.get('spec',{}).get('storageClassName','MISSING'))
        break
else:
    print('NOT_FOUND')
" 2>/dev/null || echo "ERROR")
  assert_eq "$SC" "longhorn" "SA-07" "T11-${pvc}" \
    "Datei-PVC ${pvc} nutzt Longhorn in prod-mentolder (aktuell: ${SC}) [T000317]"
done
