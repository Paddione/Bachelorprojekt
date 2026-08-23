---
title: "db-restore-verification — Implementation Plan"
ticket_id: T014544
domains: [database, infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-restore-verification — Implementation Plan

_Ticket: T014544_

## File Structure

```
k3d/backup-restore-verify-cronjob.yaml        # NEW: wöchentlicher Restore-Verify-CronJob (So 03:30)
k3d/kustomization.yaml                        # WIRE-IN: Resource-Eintrag für das neue Manifest
docs/runbooks/db-audit-playbook.md            # APPEND: Abschnitt „Restore-Verifikation (G-DB05)" + JSONL-Schema
tests/spec/db-restore-verification/restore-verify-cronjob.bats  # RED-Guard, bereits im Stage-Commit (4 Tests, rot verifiziert)
```

Disjunkte Partials (D1): keine Datei in zwei Partials. Der RED-Test liegt im
Stage-Commit vor und ist gegen den ungefixten Stand rot verifiziert.

## Partial P1 — p1-manifest (`k3d/backup-restore-verify-cronjob.yaml`, `k3d/kustomization.yaml`)

- [x] **P1.1 CronJob anlegen.** `k3d/backup-restore-verify-cronjob.yaml` nach dem
      Vorbild von `k3d/backup-cronjob.yaml` (gleiches Image `pgvector/pgvector:0.8.5-pg16`,
      gleiche Secret-Mounts aus `workspace-secrets`, fail-loud `set -euo pipefail`,
      resource requests/limits, securityContext runAsNonRoot). Schedule
      `30 3 * * 0`. Script-Kern:
      1. Jüngstes `/backups/$STAMP`-Verzeichnis ermitteln (mit `.done`-Marker).
      2. Für jede `*.dump.enc`: AES-decrypten (openssl enc -d, BACKUP_PASSPHRASE),
         `pg_restore --no-owner --no-privileges -h shared-db -U postgres -d restore_verify_<db>`.
      3. Verifikation je DB: Exit 0 UND `SELECT count(*) FROM information_schema.tables WHERE table_schema='public'` > 0.
      4. JSONL-Append nach `/backups/restore-verification.jsonl`:
         `{"stamp":…,"db":…,"status":"ok|fail","duration_s":…,"tables_restored":…}`.
      5. Cleanup (immer, auch bei Teilerfolg): `DROP DATABASE IF EXISTS restore_verify_<db>`.
      Superuser-Passwort aus `workspace-secrets:SHARED_DB_PASSWORD` (PGPASSWORD).
      Kein Schreiben auf Produktivdatenbanken; Wegwerf-DBs nur mit Prefix `restore_verify_`.

- [x] **P1.2 Wire-In.** Resource-Eintrag `backup-restore-verify-cronjob.yaml`
      in `k3d/kustomization.yaml` ergänzen.

- [x] **P1.3 Deploy-Verifikation.** `task workspace:validate` muss grün sein.

## Partial P2 — p2-docs (`docs/runbooks/db-audit-playbook.md`)

- [x] **P2.1 Runbook-Abschnitt.** In `docs/runbooks/db-audit-playbook.md` einen
      Abschnitt „Restore-Verifikation (G-DB05)" ergänzen: Zweck, Schedule,
      JSONL-Schema (Feldliste + Beispielzeile), wie man den Log manuell auswertet
      (`kubectl exec … tail /backups/restore-verification.jsonl`) und wie ein
      fehlgeschlagener Lauf zu interpretieren ist.

## Partial P3 — p3-tests (Tests-Rolle, STRUCT2)

- [x] **P3.1 Failing-Test-Step (RED).** Der Guard
      `tests/spec/db-restore-verification/restore-verify-cronjob.bats` liegt dem
      Stage-Commit bei und ist dort rot verifiziert:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/
# expected: FAIL (red — Manifest existiert vor P1 nicht; 4 Tests schlagen zuverlässig fehl)
```

- [x] **P3.2 GREEN-Nachweis.** Nach P1/P2 müssen alle 4 Tests grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-restore-verification/
```

- [x] **P3.3 Final Verification.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
