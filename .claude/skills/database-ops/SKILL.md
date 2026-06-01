---
name: database-ops
description: Unified runbook for database operations, schema migrations, DDL ownership rules, and safe backup/restore audits.
---

> **Mishap Tracking:** As you execute this skill, maintain a running `MISHAP_LOG`.
> For every anomaly, unexpected state, broken component, security concern, or
> configuration drift you notice — even if unrelated to the current task — add
> an entry with: `type` (broken/degraded/suspicious/security/drift), `title`,
> `description`, and `component`. Invoke `mishap-tracker` at the very end.

# database-ops

This runbook covers PostgreSQL database schema migrations, permissions management, and backup/restore verification across both brands on the fleet cluster.

---

## ⚠️ Independent Shared Databases

Both brands on the fleet cluster (`workspace` for mentolder, `workspace-korczewski` for korczewski) each have their own independent `shared-db` instance. Schema migrations, DB password rotations, and backup audits must be executed explicitly on **both**.

> **Fleet Stage 3 complete (as of 2026-05-31).** The mentolder-standalone cluster has been decommissioned. Both brands (mentolder + korczewski) run on the unified **`fleet`** cluster (pk-hetzner-4/6/8 CPs + gekko-hetzner-2/3/4 workers). The old `mentolder` kubeconfig context is **DEAD** — substitute `--context fleet -n workspace`. The `korczewski` context was already dead — substitute `--context fleet -n workspace-korczewski`. Each brand has its own `shared-db` in its namespace, both at 26/26 pods.

---

## Phase 1 — Database Schema Migrations

Follow these steps to safely apply database schema updates:

### Step 1.1: Write the Migration Script
Create a migration SQL file in `scripts/datamodel/` (e.g. `scripts/datamodel/0042_add_coaching_sessions.sql`).
* Use `IF NOT EXISTS` for table/index/schema creations (idempotency).
* Wrap the migration in a transaction (`BEGIN;` ... `COMMIT;`).
* For destructive migrations, trigger a backup first: `task workspace:backup`.

Example pattern:
```sql
BEGIN;
CREATE TABLE IF NOT EXISTS coaching.sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    started_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_coaching_sessions_user_id ON coaching.sessions(user_id);
COMMIT;
```

### Step 1.2: Test on Dev Cluster
Apply the migration against the local dev database:
```bash
task workspace:psql ENV=dev -- website < scripts/datamodel/<migration>.sql
# Verify schema
task workspace:psql ENV=dev -- website -c "\d coaching.sessions"
```

### Step 1.3: Apply to Production Clusters
> **⚠️ DDL Ownership Warning:** `task workspace:psql` connects as the `website` role. For DDL on schemas where tables are owned by `postgres` (like `bachelorprojekt`, `coaching`, and `knowledge`), DDL will fail with "must be owner". You must connect as the `postgres` user directly inside the database pod:
> ```bash
> PGPOD=$(kubectl get pod -n workspace --context <env> -l app=shared-db -o name | head -1)
> kubectl exec -i "$PGPOD" -n workspace --context <env> -- psql -U postgres -d website < migration.sql
> ```

Execute the migration sequentially on both environments:
```bash
# Apply to mentolder
task workspace:psql ENV=mentolder -- website < scripts/datamodel/<migration>.sql

# Apply to korczewski brand (fleet cluster, namespace workspace-korczewski)
task workspace:psql ENV=korczewski -- website < scripts/datamodel/<migration>.sql
```

### Step 1.4: Re-grant Permissions
After creating schemas, tables, or views, default permissions may need fixing:
```bash
task workspace:fix-tickets-grants ENV=mentolder
task workspace:fix-tickets-grants ENV=korczewski
```
If manual grants are required for other service roles:
```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON <schema>.<table> TO <role>;
```

### Step 1.5: Update ER Diagram & Commit
```bash
task db:diagram
# Commit the SQL file and updated diagram files.
git add scripts/datamodel/<migration>.sql docs/db-schema-diagram.md
git commit -m "chore(db): apply migration for <description>"
```

---

## Phase 2 — Backup and Restore Audits

Verify that automated encrypted backups are running and restorable.

### Step 2.1: Verify Backup Configuration
Confirm the backup CronJob, PVC, and passphrase secret are set up correctly:
```bash
# Check CronJob presence (should find db-backup scheduler)
kubectl get cronjob -n <ns> --context <ctx>

# Confirm PVC is bound
kubectl get pvc backup-pvc -n <ns> --context <ctx>

# Verify backup passphrase secret size
kubectl get secret workspace-secrets -n <ns> --context <ctx> -o jsonpath='{.data.BACKUP_PASSPHRASE}' | base64 -d | wc -c
```
*Note: If you see the legacy `backup-postgres` CronJob, delete it and apply `k3d/backup-cronjob.yaml`.*

### Step 2.2: Trigger Live Backup
```bash
bash scripts/backup-restore.sh trigger --context fleet -n workspace  # mentolder brand on the fleet cluster
bash scripts/backup-restore.sh trigger --context fleet --namespace workspace-korczewski  # korczewski brand now on the fleet cluster (old --context korczewski is dead, T000340)
```
Wait for completion and verify logs. Confirm the new timestamp:
```bash
bash scripts/backup-restore.sh list --context fleet -n workspace
```

### Step 2.3: Verify Encrypted Dumps
Verify that the encrypted dumps (`.dump.enc` for `keycloak`, `nextcloud`, `vaultwarden`, `website`, and `docuseal`) are non-empty:
```bash
STAMP=<latest-timestamp>
# Run a temporary busybox pod to list files under the backups directory on backup-pvc.
```

### Step 2.4: Execute Safe Restore Test
**NEVER overwrite production data during a test.** Restore into a temporary test database, then clean it up:
1. Trigger a restore script or apply a temporary PG Job to restore the dump to `website_restore_test`.
2. Verify the restored tables match expected counts.
3. Drop the test database when complete:
   ```sql
   DROP DATABASE website_restore_test;
   ```

### Step 2.5: Filen remote-backup invariant (2FA must stay OFF)

The `filen-upload` sidecar in `k3d/backup-cronjob.yaml` and the `filen-pull` restore job in `scripts/backup-restore.sh` both shell out to the official `@filen/cli` with raw `FILEN_EMAIL` + `FILEN_PASSWORD` (sealed per-environment in `environments/sealed-secrets/{mentolder,korczewski}.yaml` (both on the fleet cluster: workspace for mentolder, workspace-korczewski for korczewski)). The CLI performs the full Filen auth-v2 flow internally — PBKDF2-200k key derivation, login-password/master-key split, `/v3/login`, master-key fetch — so we deliberately do **not** reimplement any of that crypto.

**Hard invariant: 2FA is disabled on both Filen accounts (mentolder and korczewski).** The CLI invocation passes no TOTP code, so an enabled 2FA would fail login permanently. If you rotate Filen credentials, store the *plaintext account password* (not a pre-derived hash) and keep 2FA off, then `task env:seal ENV=<env>`.

**Failure surfacing:** the upload no longer swallows errors. On failure it exits non-zero → `restartPolicy: OnFailure` retries transients in-pod → a permanent break (bad creds / 2FA enabled) escalates to a Failed Job, kept visible by `failedJobsHistoryLimit`. The local encrypted backup on `backup-pvc` is always written first and stays intact regardless of remote-upload outcome. To check the remote leg:
```bash
kubectl get jobs -n <ns> --context <ctx> -l app=db-backup   # any Failed → inspect filen-upload logs
```

---

## Phase 3 — Browsable Recovery Workflow (stage → browse → selective restore)

The new `stage`/`verify`/`restore-file`/`restore-table`/`browse`/`unstage` subcommands in `scripts/backup-restore.sh` let you inspect and selectively recover from backups **without touching live data** until you explicitly confirm.

### Runbook

**Step 3.1: Apply the recovery PVC (once per cluster)**
```bash
task recovery:prepare ENV=mentolder    # creates recovery-pvc in workspace namespace
task recovery:prepare ENV=korczewski   # creates recovery-pvc in workspace-korczewski
```

**Step 3.2: Prove a dump is restorable (non-destructive)**
```bash
task recovery:verify ENV=mentolder -- 20260530-020001 website
# Restores the dump into website_verify_<pid>, prints table counts, then drops it.
```

**Step 3.3: Stage a DB or service for inspection**
```bash
# DB: decrypts and pg_restore into <db>_recovery (live DB untouched)
task recovery:stage ENV=mentolder -- 20260530-020001 website

# Service PVC: decrypts + extracts to recovery-pvc:/recovery/<ts>/<service>/
task recovery:stage ENV=mentolder -- pvc-20260530-030001 nextcloud-files
```

**Step 3.4: Browse staged data**
```bash
# Files (filebrowser over SSO):
task recovery:browse ENV=mentolder   # prints https://recover.<domain>

# DB tables (psql into *_recovery):
kubectl exec -n workspace --context fleet deploy/shared-db -- \
  psql -U postgres -d website_recovery
```

**Step 3.5: Selective restore (requires explicit confirmation)**
```bash
# Restore one file from staging into the live PVC:
task recovery:restore-file ENV=mentolder -- pvc-20260530-030001 nextcloud-files admin/files/Doc.pdf -y

# Restore one table from dump into the live DB:
task recovery:restore-table ENV=mentolder -- 20260530-020001 website site_settings -y
```

**Step 3.6: Clean up staging**
```bash
task recovery:unbrowse ENV=mentolder          # tear down the filebrowser
task recovery:unstage ENV=mentolder -- pvc-20260530-030001 -y  # drop *_recovery DBs + clear staging dir
```

### Invariants
- `stage` and `verify` never touch live data; only `restore-file` / `restore-table` write to live volumes (and only after explicit `-y` confirmation).
- Per-service staging: always stage the service you need, not "all" — keeps `recovery-pvc` small.
- `recovery-browser.yaml` is applied on demand (not in kustomization.yaml). It requires Plan 2 (`feature/recovery-browse`) to be merged before `browse` works.
- The `browse` command fails cleanly with a clear message if `recovery-browser.yaml` is missing.

---

## Troubleshooting & Common Blockers

| Symptom | Cause | Fix |
|---|---|---|
| Migration fails with "must be owner of table" | Run via `task workspace:psql` (website role) instead of the `postgres` superuser | Connect directly to the postgres pod using the superuser credentials (`psql -U postgres`). |
| Backup trigger fails with "cronjob not found" | Name-drift: CronJob named `backup-postgres` instead of `db-backup` | Deploy `k3d/backup-cronjob.yaml` and delete the old `backup-postgres` CronJob. |
| Restore test fails: "pg_restore: exit code 1" | Schema conflicts / sequences already exist | Always restore to a fresh, temporary test database rather than an active one. |
| `db-backup` Job shows Failed but local dumps exist | `filen-upload` sidecar failed remote upload (bad `FILEN_EMAIL`/`FILEN_PASSWORD`, or 2FA was enabled on the Filen account) | Check `filen-upload` container logs. Confirm 2FA is OFF and creds are correct, re-seal (`task env:seal ENV=<env>`). Local backup on `backup-pvc` is unaffected. See Step 2.5. |

---

## Post-Execution: Mishap Report

After completing all steps in this skill, invoke `mishap-tracker` with your accumulated `MISHAP_LOG`. If no mishaps were found, `mishap-tracker` exits cleanly.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `secret-rotation` | Querschnitt — DB-Passwort-Rotation |
| `fleet-ops` | Querschnitt — Cross-Brand DB-Operationen |
| `cluster-deployment` | Voraussetzung — DB läuft im Cluster |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
