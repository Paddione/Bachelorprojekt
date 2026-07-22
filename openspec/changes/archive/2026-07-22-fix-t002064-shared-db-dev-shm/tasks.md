---
title: "fix-t002064-shared-db-dev-shm — Implementation Plan"
ticket_id: T002064
domains: [infra, db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-t002064-shared-db-dev-shm — Implementation Plan

_Ticket: T002064 · Spec: docs/superpowers/specs/2026-07-22-shared-db-dev-shm-design.md_

Root cause: PG16 parallel index builds (pgvector HNSW on `knowledge.chunks`) allocate dynamic
shared memory under `/dev/shm`; the containerd default of 64Mi makes `pg_restore` of the website
dump fail at `CREATE INDEX chunks_embedding_hnsw` (`could not resize shared memory segment …
64000064 bytes`). Both restore-verify AND the disaster-restore path are affected.

## File Structure

```
k3d/shared-db.yaml               # + dev-shm Volume (emptyDir medium=Memory, sizeLimit 512Mi)
                                 # + /dev/shm-Mount im postgres-Container (Base; kein S1-Limit für .yaml)
tests/spec/backup-pipeline.bats  # bereits im Stage-Commit: RED-Test /dev/shm-Mount + Regressionstest cleanup-trap
openspec/changes/fix-t002064-shared-db-dev-shm/  # dieser Plan + Delta-Spec backup-pipeline.md
```

## Task 1 — Failing-Test-Step (RED, bereits committed)

- [ ] The BATS test `shared-db mounts a Memory-backed /dev/shm in the postgres container (T002064)`
      is committed in `tests/spec/backup-pipeline.bats` and reproduces the bug on the current branch:

```bash
bats tests/spec/backup-pipeline.bats
# expected: FAIL — Test 7 ("shared-db mounts a Memory-backed /dev/shm …") ist rot,
# solange k3d/shared-db.yaml keinen dev-shm-Mount hat. Test 8 (cleanup-trap-Regression) ist grün.
```

## Task 2 — Fix-Step (GREEN): dev-shm Volume in k3d/shared-db.yaml

- [ ] In `k3d/shared-db.yaml`, shared-db Deployment: add to `spec.template.spec.volumes`:

```yaml
- name: dev-shm
  emptyDir:
    medium: Memory
    sizeLimit: 512Mi
```

- [ ] Add to the `postgres` container `volumeMounts` (NOT to the exporter sidecar):

```yaml
- name: dev-shm
  mountPath: /dev/shm
```

- [ ] Sizing-Invariante: 512Mi bleibt unter dem kleinsten wirksamen Memory-Limit des
      postgres-Containers über alle Overlays (2Gi via `prod/patch-shared-db.yaml`; Base 4Gi).
      Der prod-Patch patcht nur `containers[name=postgres].resources` per strategic-merge —
      Volume/Mount aus dem Base bleiben erhalten.
- [ ] `bats tests/spec/backup-pipeline.bats` — Test 7 ist jetzt grün (8/8 bzw. 1 skip).
- [ ] `task workspace:validate` — Kustomize-Build aller Overlays bleibt grün.

## Task 3 — Final Verification

- [ ] Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- [ ] Nach Test-Änderungen: `task test:inventory` und das aktualisierte
      `website/src/data/test-inventory.json` committen (der Stage-Commit hat das bereits erledigt;
      hier nur verifizieren, dass kein Drift verbleibt).

## Task 4 — Post-Merge: Deploy + Verify-Nachlauf (Operator)

- [ ] `task workspace:deploy ENV=mentolder` und `task workspace:deploy ENV=korczewski`
      (kurzer shared-db-Neustart; Recreate mit PVC).
- [ ] `bash scripts/backup-restore.sh list --context fleet` → neuestes Timestamp wählen, dann
      `bash scripts/backup-restore.sh verify <timestamp> website --context fleet` — muss grün
      durchlaufen und den ConfigMap `recovery-verify-status` stempeln.
- [ ] Follow-up-Chore: G-DB11-Baseline in `.claude/lib/goals.md` von n/a auf den Messwert heben
      (`task health:goals:emit` + Freshness-Commit).
