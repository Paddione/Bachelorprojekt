# Business-scoped website restore (T901022)

## Purpose

Restore the website database from a backup and prove the business scope
survived: a probe row for one business slug is seeded before the backup
and verified after the restore. The demo (`demo-business`) runs the full
loop — seed, backup, restore, verify — and prints `DEMO-OK` on success.

## Scope and limits

- Dev website database only (`website` on shared-db, namespace `workspace`
  by default).
- The restore is a destructive full-database restore (drop, recreate,
  pg_restore). The business scope adds verification scoped to one slug —
  it is NOT a partial-table restore.
- The probe table `demo_restore_probe` is owned by the demo itself, so the
  proof does not depend on application schema.

## Prerequisites

- `kubectl` context pointing at the target cluster (default: active
  context; override with `KC="kubectl --context <ctx>"`).
- Namespace selection via `NS` (default: `workspace`).
- Backup storage present: `backup-pvc` with timestamped directories and a
  working `db-backup` CronJob.

## Demo procedure

Run the end-to-end demo (default slug `demo-business`):

```bash
scripts/backup-restore-db.sh demo-business
```

With an explicit slug (lowercase letters, digits, dashes only):

```bash
scripts/backup-restore-db.sh demo-business my-slug
```

Assert the final line:

```text
DEMO-OK slug=<slug> marker=p3demo-<STAMP> ts=<TIMESTAMP>
```

`DEMO-OK` means: the probe row was seeded, a backup was taken, the
website database was restored from the newest backup, and exactly one
row for `(slug, marker)` survived the restore.

## Scoped restore procedure

Restore website from a known backup with business verification:

```bash
scripts/backup-restore.sh restore website <TIMESTAMP> business=<slug>
```

Skip the confirmation prompt with `-y`:

```bash
scripts/backup-restore.sh restore website <TIMESTAMP> business=<slug> -y
```

The scope argument is only valid with the `website` database; any other
database fails closed. After the restore, the probe count for the slug
is checked and the restore aborts when zero rows are found.

## Verification queries

Run inside a database shell against the website database:

```sql
-- rows for one business slug (expect >= 1 after a scoped restore)
SELECT business_slug, marker, created_at
  FROM demo_restore_probe
 WHERE business_slug = '<slug>'
 ORDER BY created_at DESC;

-- exact marker of one demo run (expect exactly 1 after DEMO-OK)
SELECT count(*)
  FROM demo_restore_probe
 WHERE business_slug = '<slug>' AND marker = 'p3demo-<STAMP>';

-- all slugs currently carrying probe rows
SELECT business_slug, count(*)
  FROM demo_restore_probe
 GROUP BY business_slug;
```

## Failure modes

- Marker missing (`expected exactly 1 marker row ... got 0`): the backup
  predates the seed or the restore hit the wrong database. Re-run the
  demo and check the seed job logs:
  `kubectl logs -n <ns> -l job-name=db-demo-seed-<pid>`.
- No backup directory (`no backup timestamp found`): `backup-pvc` holds
  no `YYYYMMDD-HHMMSS` directory. List with
  `scripts/backup-restore.sh list` and trigger one with
  `scripts/backup-restore.sh trigger`.
- Job timeouts (`... did not complete`): inspect the job and its pods:
  `kubectl get pods -n <ns> -l job-name=<job>` and
  `kubectl logs -n <ns> -l job-name=<job> --tail=50`.
- Scope mismatch (`no probe rows after restore`): the slug has no probe
  rows. Either the slug is wrong or the seed never ran for it — see the
  verification queries above.

## Warnings

- DATA LOSS: every restore drops and recreates the selected database.
  Current data is permanently lost. Stop affected services first.
- The `restore` command asks for an explicit `yes` confirmation unless
  `-y` is passed. The demo presets the confirmation internally because
  it restores the backup it just created.
- After completion the script prints follow-up commands: re-sync role
  passwords (`task workspace:sync-db-passwords ENV=<env>`) and restart
  affected services (`task workspace:restart -- website`). Run both —
  the postStart self-heal does not fire on a restore.
