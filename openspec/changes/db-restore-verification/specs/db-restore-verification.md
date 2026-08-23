## ADDED Requirements

### Requirement: Weekly automated restore verification with JSONL evidence

The cluster SHALL run a weekly CronJob (`db-restore-verify`, schedule
`30 3 * * 0`) that restores the newest encrypted backup generation from the
backup PVC into disposable databases and records machine-readable evidence.
For every `*.dump.enc` in the generation it SHALL decrypt (BACKUP_PASSPHRASE),
restore via `pg_restore` into a database named `restore_verify_<db>` on
`shared-db`, and count success only when the restore exits 0 AND the restored
public schema contains at least one table. One JSONL line per database with
fields `stamp`, `db`, `status` (`ok|fail`), `duration_s`, `tables_restored`
SHALL be appended to `/backups/restore-verification.jsonl`. The job SHALL NOT
write to production databases: throwaway databases use the `restore_verify_`
prefix exclusively and are dropped after each run — including on partial
failure.

#### Scenario: Successful weekly verification run

- **GIVEN** the backup PVC holds an encrypted generation
  `YYYYMMDD-HHMMSS/` containing a valid `website.dump.enc`
- **WHEN** the `db-restore-verify` CronJob runs
- **THEN** the dump is decrypted and restored into `restore_verify_website`
- **AND** a JSONL line with `"db":"website","status":"ok"` and a positive
  `tables_restored` count is appended to `/backups/restore-verification.jsonl`
- **AND** `restore_verify_website` does not exist after the job completes

#### Scenario: Failed restore is logged and fails the job

- **GIVEN** the newest generation contains a corrupt or undecryptable dump
- **WHEN** the verification loop processes that dump
- **THEN** a JSONL line with `"status":"fail"` for that database is appended
- **AND** the job exits non-zero so the failure surfaces as a Failed Job

### Requirement: Restore verification guard in the spec test suite

The repository SHALL guard the automation structurally via
`tests/spec/db-restore-verification/restore-verify-cronjob.bats`: manifest
existence and schedule, disposable-DB prefix plus cleanup plus evidence log in
the embedded script, embedded-script bash syntax, and kustomization wire-in.

#### Scenario: Removing the automation turns the guard red

- **GIVEN** `k3d/backup-restore-verify-cronjob.yaml` exists and all 4 guard
  tests pass
- **WHEN** someone deletes the manifest or unwires it from
  `k3d/kustomization.yaml`
- **THEN** the corresponding guard test fails and names the missing piece
