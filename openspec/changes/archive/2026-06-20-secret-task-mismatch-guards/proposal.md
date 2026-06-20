# Proposal: secret-task-mismatch-guards

## Why

Secrets live in six consistency levels (plaintext → sealed → sealing-cert → live Secret →
consumer copy → running pod). A `task` action that mutates one level without pulling the
others through leaves a latent "mismatch" that only surfaces on the next pod restart
(`password authentication failed` / `Invalid client credentials`). Two problem classes
remain after the canonical `workspace:deploy` path: (A) chained reconcilers that fail
OPEN — a failed reconcile does not abort the wrapping deploy, so it reports green over a
mismatch; and (B) lightweight secret paths (`secrets:sync`, `db:restore`, `app-install`,
`ci-dummy-secrets`) that never call the reconcilers at all.

## What

Harden nine concrete gaps to fail closed (loud abort with diagnosis) while preserving
dev/CI ergonomics and adding a documented soft-override env flag per new hard-fail:

1. (HIGH) `workspace:deploy` decrypt-wait → extract to `scripts/wait-for-sealed-secret.sh`, fail-closed on timeout.
2. (HIGH) `keycloak-sync.sh` → non-dev fail-closed on unreadiness/token/`FAILED>0` (`KEYCLOAK_SYNC_SOFT=1` override).
3. (MED) `env-seal.sh` → live cert-fingerprint drift guard (`--reuse-cert` override).
4. (MED) `db:restore`/`recovery:restore-table` → chain `workspace:sync-db-passwords`.
5. (MED) `app-install.sh` → reseal after secret processing (`APP_INSTALL_SKIP_SEAL=1` override).
6. (MED) `secrets:sync` → workload-reconcile reminder + `secrets:sync:full` companion.
7. (MED) `claude-code:rotate-tokens` → token-version annotation + fail-loud reminder.
8. (LOW) `ci-dummy-secrets.sh` → fail-closed precondition (CI/dev only, refuse prod context).
9. (LOW) `keycloak-sync.sh` → loud warning on empty `website-secrets` + co-rotation note.

Spec: `docs/superpowers/specs/2026-06-19-secret-task-mismatch-guards-design.md`.
Plan: `docs/superpowers/plans/2026-06-19-secret-task-mismatch-guards.md`.

_Ticket: T000951_
