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

# T9: pvc-backup wires up all three data sources [T000317]
# The orchestrator pod's top-level volumes only carry the backup-pvc and the
# nextcloud direct mount; vaultwarden+docuseal appear as *-backup-clone names
# inside the embedded mounter Job spec (in the orchestrator args string).
CJ_SPEC=$(kubectl get cronjob pvc-backup -n "$NAMESPACE" -o yaml 2>/dev/null || echo "")
assert_contains "$CJ_SPEC" "nextcloud-data-pvc"            "SA-07" "T9a" "pvc-backup mountet nextcloud-data-pvc direkt (co-located)"
assert_contains "$CJ_SPEC" "vaultwarden-data-backup-clone" "SA-07" "T9b" "pvc-backup nutzt vaultwarden Clone-PVC"
assert_contains "$CJ_SPEC" "docuseal-data-backup-clone"    "SA-07" "T9c" "pvc-backup nutzt docuseal Clone-PVC"

# T10: backup-restore.sh supports pvc-restore subcommand
RESTORE_HELP=$(bash "${SCRIPT_DIR}/../scripts/backup-restore.sh" --help 2>&1 || true)
assert_contains "$RESTORE_HELP" "pvc-restore" "SA-07" "T10" "backup-restore.sh unterstützt pvc-restore Subcommand"

# T11: Data PVCs used by pvc-backup must use Longhorn in prod overlay
# (local-path PVCs are node-pinned RWO — backup pod cannot mount PVCs from different nodes)
# This is a manifest-level test: checks kustomize build output, no cluster access needed.
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
KUSTOMIZE_OUT=$(kustomize build "${PROJECT_DIR}/prod-fleet/mentolder" 2>/dev/null)
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
    "Datei-PVC ${pvc} nutzt Longhorn in prod-fleet/mentolder (aktuell: ${SC}) [T000317]"
done

# T12: pvc-backup must NOT mount the live Longhorn data PVCs directly [T000317]
# Verified 2026-05-30: mounting a live Longhorn RWO PVC in the backup pod
# deadlocks on FailedAttachVolume Multi-Attach when the owning app pod runs on a
# different node (the backup pod is pinned to nextcloud's node via podAffinity,
# but docuseal/vaultwarden may run elsewhere). The fix clones each Longhorn data
# PVC (CSI dataSource) and mounts the placement-independent clone instead.
# nextcloud-data is EXEMPT: it is on local-path (no clone/snapshot support) and
# is correctly co-located with the nextcloud pod via podAffinity, so its direct
# RO mount shares the volume on the same node without contention.
# This is a static manifest test (no cluster access needed).
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
BACKUP_VOL_CLAIMS=$(python3 -c "
import yaml
with open('${PROJECT_DIR}/k3d/pvc-backup-cronjob.yaml') as f:
    cj = yaml.safe_load(f)
vols = cj['spec']['jobTemplate']['spec']['template']['spec'].get('volumes', [])
claims = [v.get('persistentVolumeClaim', {}).get('claimName', '') for v in vols]
print(' '.join(c for c in claims if c))
" 2>/dev/null || echo "PARSE_ERROR")

# Only the Longhorn-backed PVCs must be clone-mounted; nextcloud (local-path) is exempt.
for live_pvc in vaultwarden-data-pvc docuseal-data-pvc; do
  if echo "$BACKUP_VOL_CLAIMS" | grep -qw "$live_pvc"; then
    HAS_LIVE="yes"
  else
    HAS_LIVE="no"
  fi
  assert_eq "$HAS_LIVE" "no" "SA-07" "T12-${live_pvc}" \
    "pvc-backup mountet die Live-Longhorn-PVC ${live_pvc} NICHT direkt (Clone-basiert, kein Multi-Attach) [T000317]"
done

# T13: orchestrator RBAC objects are declared in the base kustomization [T000317]
PROJECT_DIR="${PROJECT_DIR:-$(cd "${SCRIPT_DIR}/.." && pwd)}"
RBAC_OUT=$(kustomize build "${PROJECT_DIR}/k3d" 2>/dev/null)
for kind_name in "ServiceAccount/pvc-backup" "Role/pvc-backup" "RoleBinding/pvc-backup"; do
  KIND="${kind_name%/*}"; NAME="${kind_name#*/}"
  FOUND=$(echo "$RBAC_OUT" | python3 -c "
import sys, yaml
for d in yaml.safe_load_all(sys.stdin):
    if d and d.get('kind')=='${KIND}' and d.get('metadata',{}).get('name')=='${NAME}':
        print('yes'); break
else:
    print('no')
" 2>/dev/null || echo "ERROR")
  assert_eq "$FOUND" "yes" "SA-07" "T13-${KIND}" "pvc-backup ${KIND} im base kustomize build vorhanden [T000317]"
done
