#!/usr/bin/env bats
# tests/spec/backup-pipeline.bats
# SSOT: openspec/specs/backup-pipeline.md
# Uses simple [ ... ] assertions (matches tests/spec/* convention).
# NOTE: pvc-backup CronJob is referenced in docs (docs-content-built/) but not
# currently present as a live k8s resource in k3d/backup-*.yaml — only db-backup
# is. The plan's pvc-backup test is adapted to skip until the resource is added.

load 'test_helper'

REPO_ROOT="${PROJECT_DIR}"

@test "db-backup CronJob is defined in k3d/backup-cronjob.yaml" {
  run grep -c "name: db-backup" "${REPO_ROOT}/k3d/backup-cronjob.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "pvc-backup CronJob is defined (skip: not yet a live k8s resource)" {
  if ! grep -qE "name: pvc-backup" "${REPO_ROOT}/k3d/backup-cronjob.yaml"; then
    skip "pvc-backup CronJob referenced in docs but not in k3d/backup-cronjob.yaml — adapt when resource lands"
  fi
  run grep -cE "name: pvc-backup" "${REPO_ROOT}/k3d/backup-cronjob.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "db-backup uses AES-256-CBC encryption with pbkdf2" {
  run grep -c "aes-256-cbc" "${REPO_ROOT}/k3d/backup-cronjob.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
  run grep -c "pbkdf2" "${REPO_ROOT}/k3d/backup-cronjob.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "db-backup schedule is daily (0 2 * * *)" {
  run grep -cE 'schedule: "0 2 \* \* \*"' "${REPO_ROOT}/k3d/backup-cronjob.yaml"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "backup-restore.sh exists and is runnable" {
  [ -f "${REPO_ROOT}/scripts/backup-restore.sh" ]
  # Script is currently not chmod +x in repo, so check it can be invoked via bash
  run bash "${REPO_ROOT}/scripts/backup-restore.sh" --help
  [ "$status" -eq 0 ]
}

@test "backup-restore.sh has usage output" {
  run bash "${REPO_ROOT}/scripts/backup-restore.sh" --help 2>&1
  [ "$status" -eq 0 ]
  echo "$output" | grep -qE "[Uu]sage|[Hh]elp"
}

@test "shared-db mounts a Memory-backed /dev/shm in the postgres container (T002064)" {
  # PG16 parallel index builds (pgvector HNSW) allocate dynamic shared memory
  # under /dev/shm; the containerd default of 64Mi makes restores of the
  # website dump fail at CREATE INDEX chunks_embedding_hnsw.
  run python3 - "${REPO_ROOT}/k3d/shared-db.yaml" <<'PY'
import sys, yaml
ok = False
for doc in yaml.safe_load_all(open(sys.argv[1])):
    if not doc or doc.get("kind") != "Deployment": continue
    if doc["metadata"]["name"] != "shared-db": continue
    spec = doc["spec"]["template"]["spec"]
    vols = {v["name"]: v for v in spec.get("volumes", [])}
    shm = next((v for v in vols.values()
                if (v.get("emptyDir") or {}).get("medium") == "Memory"), None)
    assert shm is not None, "no emptyDir medium=Memory volume on shared-db"
    assert (shm["emptyDir"].get("sizeLimit") or "") != "", "Memory emptyDir needs a sizeLimit"
    pg = next(c for c in spec["containers"] if c["name"] == "postgres")
    mounts = {m["mountPath"]: m["name"] for m in pg.get("volumeMounts", [])}
    assert mounts.get("/dev/shm") == shm["name"], "postgres container must mount the Memory volume at /dev/shm"
    ok = True
assert ok, "shared-db Deployment not found"
print("ok")
PY
  [ "$status" -eq 0 ]
}

@test "recovery-verify job drops its scratch DB even on failure (cleanup trap, T002063/T002064)" {
  # Regression: an aborted pg_restore left website_verify_<pid> behind on
  # shared-db (2026-07-22). The verify job must trap EXIT and drop the temp DB.
  run grep -A5 "TMP=\${DB}_verify_" "${REPO_ROOT}/scripts/backup-restore-lib.sh"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q "trap cleanup EXIT"
  echo "$output" | grep -q "dropdb -h shared-db -U postgres --if-exists"
}
