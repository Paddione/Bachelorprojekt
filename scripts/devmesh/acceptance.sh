#!/usr/bin/env bash
# Abnahme-Gate vor dem k3d-Abbau [T900145]. It has no destructive side effect.
set -euo pipefail

CLUSTER="${K3D_CLUSTER:-mentolder-dev}"
SRC_CTX="k3d-${CLUSTER}"
NS="${K3D_NS:-workspace}"
BACKUP_ROOT="${DEVMESH_BACKUP_ROOT:-$HOME/backups}"
STAMP="${DEVMESH_BACKUP_DATE:-$(date +%F)}"
BACKUP_DIR="${BACKUP_ROOT}/${SRC_CTX}-${STAMP}"
HEALTH_CMD="${DEVMESH_HEALTH_CMD:-task devmesh:status}"
COMPARE_CMD="${DEVMESH_COMPARE_CMD:-bash scripts/devmesh/migrate-from-k3d.sh compare}"
DBS="${DEVMESH_DUMP_DBS:-pocket_id website}"

fail() { echo "devmesh:acceptance FAIL: $*" >&2; exit 1; }

echo "[1/3] Health-Gate: ${HEALTH_CMD}"
bash -c "$HEALTH_CMD" || fail "Health-Gate von devmesh nicht gruen"
echo "[2/3] Migrationsvergleich: ${COMPARE_CMD}"
bash -c "$COMPARE_CMD" || fail "Migrationsvergleich (SP-3) nicht bestanden"
echo "[3/3] Dump nach ${BACKUP_DIR} (30 Tage aufbewahren)"
mkdir -p "$BACKUP_DIR"
for db in $DBS; do
  out="${BACKUP_DIR}/${db}.dump"
  kubectl --context "$SRC_CTX" -n "$NS" exec deploy/shared-db -- \
    pg_dump -U postgres -Fc "$db" > "$out" || fail "pg_dump ${db} fehlgeschlagen"
  [ -s "$out" ] || fail "Dump ${out} ist leer"
done
date -u +%FT%TZ > "${BACKUP_DIR}/ACCEPTANCE_OK"
echo "devmesh:acceptance OK — ${BACKUP_DIR}"
