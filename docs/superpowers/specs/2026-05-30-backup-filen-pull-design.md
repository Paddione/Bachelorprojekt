# Design Spec — Filen-Pull for Fresh-Cluster Restore

**Date:** 2026-05-30
**Branch:** `feature/backup-filen-pull`
**Scope decision:** Pull-into-`backup-pvc`-only (composable with existing restore tasks)

## Problem

On a freshly-deployed cluster (e.g. a rebuilt korczewski), the in-cluster
`backup-pvc` is a brand-new empty volume. Both restore paths
(`scripts/backup-restore.sh restore` for DBs and `pvc-restore` for file data)
read **only** from `backup-pvc` at `/backups/<timestamp>/`. The only off-site
copy of the backups lives in Filen cloud, and the backup pipeline is
**one-way**: `k3d/backup-cronjob.yaml` and `k3d/pvc-backup-cronjob.yaml` upload
to Filen via `@filen/cli`, but **no path exists to download them back**.

Result: after a fresh deploy you cannot restore content — `list`/`pvc-list`
return nothing because `backup-pvc` is empty. This is fresh-deploy blocker #1
from the 2026-05-30 korczewski dry run.

## Goal

Add a `filen-pull <timestamp>` capability that downloads the encrypted archive
directory for a given timestamp from Filen into the in-cluster `backup-pvc`,
so the operator can then run the **existing** restore tasks unchanged:

```bash
task workspace:backup:filen-pull -- <timestamp> ENV=korczewski
#   → archives land in backup-pvc:/backups/<timestamp>/
task workspace:db:restore  -- all <timestamp> ENV=korczewski
task workspace:pvc:restore -- all <timestamp> ENV=korczewski
```

## Non-Goals (explicitly out of scope)

- **No one-shot pull+restore chaining.** Download and restore stay separate so
  the operator keeps the mandatory scale-down safety step before restore.
- **No remote-list command.** Discovering which timestamps exist in Filen is
  done out-of-band (Filen web/desktop app, or `@filen/cli ls` manually). The
  command requires an explicit `<timestamp>` argument. *(Documented limitation;
  candidate follow-up.)*
- **No new credentials or storage.** Reuse `workspace-secrets` `FILEN_EMAIL` /
  `FILEN_PASSWORD` and the `backup-config` `FILEN_DEFAULT_UPLOAD_PATH`.
- **No change to the backup (upload) side.**

## Design

Mirror the existing `filen-upload` container exactly, inverted to download.

### New subcommand: `scripts/backup-restore.sh filen-pull <timestamp> [--remote-path <path>]`

Spawns a one-shot `Job` (consistent with the existing `pvc-restore` Job pattern
already in `backup-restore.sh`) that:

1. Mounts `backup-pvc` at `/backups` **writable** (upload mounts it read-only —
   pull must write).
2. Image `node:22-alpine`, `npm install -g @filen/cli` (identical to upload).
3. Resolves the remote base path: `--remote-path` flag wins, else read the
   `backup-config` ConfigMap key `FILEN_DEFAULT_UPLOAD_PATH` (korczewski=`/Backup`,
   mentolder per its own patch). Inject it into the Job as an env var resolved by
   the script before apply.
4. Auth + download:
   ```sh
   filen --email "$FILEN_EMAIL" --password "$FILEN_PASSWORD" \
     download "<remote-path>/<timestamp>/" "/backups/<timestamp>/"
   ```
   *(Verify exact `@filen/cli` download arg order during implementation —
   `filen download <cloud> <local>`; the upload step uses `upload <local> <cloud>`.)*
5. Fail loudly (non-zero exit) if `FILEN_EMAIL`/`FILEN_PASSWORD` are unset or the
   download fails — unlike the upload container which warns-and-continues, the
   pull is the operator's explicit DR action and must surface failure.
6. Wait for Job completion, stream logs, report the landing path.

### Taskfile task: `workspace:backup:filen-pull`

ENV-aware wrapper mirroring `workspace:pvc:restore` (sources `env-resolve.sh`,
adds `--context $ENV_CONTEXT` for non-dev, passes `{{.CLI_ARGS}}`). Lives next to
the other `workspace:backup:*` tasks (~line 1017–1047 of `Taskfile.yml`).

### Security / namespace

- Job runs in `$WORKSPACE_NAMESPACE` (workspace / workspace-korczewski).
- Non-root securityContext consistent with the existing restore Job
  (runAsNonRoot, drop ALL caps, seccomp RuntimeDefault).
- `BACKUP_PASSPHRASE` is **not** needed here — pull only moves the still-encrypted
  archives; decryption happens later inside the existing restore Job.

## Acceptance Criteria

- [ ] `task workspace:backup:filen-pull -- <ts> ENV=korczewski` downloads
      `<ts>/` from Filen into `backup-pvc:/backups/<ts>/`.
- [ ] Afterwards `bash scripts/backup-restore.sh pvc-list` (and `list`) show the
      pulled timestamp.
- [ ] Missing `<timestamp>` arg → usage error, non-zero exit.
- [ ] Missing Filen creds or failed download → non-zero exit with clear message
      (no silent success).
- [ ] BATS test covers: usage/arg-validation, correct Job manifest
      (writable backup-pvc mount, node:22-alpine, resolved remote path), and the
      help text lists `filen-pull`.
- [ ] `usage()` in `backup-restore.sh` documents `filen-pull`.
- [ ] `task test:all` green.

## Test Strategy

Pure-bash unit test (BATS) — no live Filen/cluster. Stub `kubectl` with a fake
binary on `PATH` (existing pattern in the repo) and assert the rendered Job
manifest + arg validation. Add under `tests/unit/` alongside existing
backup-restore coverage if present; otherwise a new `backup-restore-filen-pull.bats`.
