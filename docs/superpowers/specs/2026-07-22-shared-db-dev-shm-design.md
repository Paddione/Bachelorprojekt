---
title: shared-db /dev/shm Memory-Mount — Restore-Verify/Restore reparieren
ticket_id: T002064
plan_ref: openspec/changes/fix-t002064-shared-db-dev-shm/tasks.md
domains: [infra, db]
status: approved
date: 2026-07-22
---

# T002064 — shared-db `/dev/shm` (64M) blockiert HNSW-Index-Build beim Restore

## Problem

Der erste G-DB11-Restore-Verify-Lauf (2026-07-22, Backup `20260722-000016`, DB `website`)
scheitert reproduzierbar:

```
pg_restore: error: could not execute query: ERROR:  could not resize shared memory segment
"/PostgreSQL.225368426" to 64000064 bytes: No space left on device
Command was: CREATE INDEX chunks_embedding_hnsw ON knowledge.chunks USING hnsw (…)
```

Der Fehler kommt vom **Server** (shared-db-Pod): PostgreSQL 16 nutzt für parallele
Index-Builds Dynamic-Shared-Memory-Segmente unter `/dev/shm`. Ohne expliziten Mount hat der
Container das containerd-Default von **64Mi** (`df -h /dev/shm` im Pod: `shm 64M`). Damit ist
nicht nur der Verify betroffen, sondern auch der **Ernstfall-Restore** (`backup-restore.sh
restore`) desselben Dumps — das website-Backup ist de facto nicht restaurierbar.

## Fix (entschieden)

`k3d/shared-db.yaml` (Base, vererbt an k3d-dev, staging, prod-fleet/mentolder+korczewski):

- Volume `dev-shm`: `emptyDir: {medium: Memory, sizeLimit: 512Mi}`
- VolumeMount `/dev/shm` **nur** im `postgres`-Container (Exporter-Sidecar mit 64Mi-Limit
  bleibt unangetastet).

**Sizing-Begründung:** Der fehlgeschlagene Build wollte ~64MB; 512Mi ist 8× Headroom und
bleibt sicher unter dem Prod-Memory-Limit von 2Gi (`prod/patch-shared-db.yaml`) — Memory-backed
emptyDir zählt gegen das Pod-cgroup-Memory. `prod/patch-shared-db.yaml` patcht nur
`containers[name=postgres].resources` per strategic-merge → kein Konflikt mit dem neuen Volume.

**Verworfen:** `PGOPTIONS='-c max_parallel_maintenance_workers=0'` nur im Verify-Job — würde
den Verify grün lügen, während der echte Restore weiterhin scheitert.

## Tests

`tests/spec/backup-pipeline.bats` (bestehende Spec-Testdatei):
1. **RED→GREEN:** shared-db mountet ein Memory-backed `/dev/shm` mit sizeLimit im
   postgres-Container (struktureller YAML-Check via python3+yaml).
2. **Regression (T002063):** der Verify-Job in `backup-restore-lib.sh` enthält den
   `trap cleanup EXIT`, der die Wegwerf-DB auch bei Abbruch dropt.

## Nachbearbeitung (nach Merge + Deploy)

1. `task workspace:deploy` für beide Brands (kurzer shared-db-Neustart, Recreate).
2. `backup-restore.sh verify <neuestes-ts> website --context fleet` → muss grün laufen und
   `recovery-verify-status` stempeln.
3. G-DB11-Baseline in `.claude/lib/goals.md` von n/a auf den Messwert heben (Follow-up-Chore).
