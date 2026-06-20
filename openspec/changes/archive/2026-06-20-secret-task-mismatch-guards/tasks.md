# Tasks: secret-task-mismatch-guards

Mirrors `docs/superpowers/plans/2026-06-19-secret-task-mismatch-guards.md`. One task per
finding (#1…#9) in severity order (HIGH #1/#2 first), plus a final verification task.
Each task is TDD: failing BATS test first, then implementation. #1 and #8 ship their
RED tests in `tests/unit/secret-task-guards.bats` already.

## 1. `#1` HIGH — fail-closed SealedSecret decrypt-wait helper
- [ ] Confirm pre-existing RED `#1` tests (`tests/unit/secret-task-guards.bats:58-86`); run `bats … -f '#1'` → FAIL
- [ ] Create `scripts/wait-for-sealed-secret.sh` (`--context/--namespace/--secret/--timeout`, `${KUBECTL:-kubectl}`, fail-closed timeout with stale-cert diagnosis)
- [ ] `chmod +x`; rerun `#1` tests → PASS
- [ ] Replace the inline `for i in $(seq 1 30)` loop in `Taskfile.yml` `workspace:deploy` (2430-2434) with a fail-closed helper call (net-neutral)
- [ ] Commit

## 2. `#2` HIGH — keycloak-sync fail-closed in non-dev
- [ ] Write RED `#2` tests for `kc_should_fail_closed` (prod→CLOSED, dev→OPEN, `KEYCLOAK_SYNC_SOFT=1`→OPEN)
- [ ] Add `kc_should_fail_closed`/`kc_skip_or_die` + `--_test-source` seam to `scripts/keycloak-sync.sh`
- [ ] Replace the four warn-then-`exit 0` SKIPs (rollout 53-57, HTTP 70-73, token 93-99) with `kc_skip_or_die`
- [ ] Replace the warn-only `FAILED>0` summary (252-255) with a non-dev hard-fail
- [ ] Rerun `#2` → PASS; commit

## 3. `#3` MED — env-seal live cert-fingerprint guard (Budget-0 file: net-zero)
- [ ] Write RED `#3` tests for `--_test-cert-compare` (identical→0, drift→1)
- [ ] Add `compare_cert_fingerprints` + `--reuse-cert` + `--_test-cert-compare` to `scripts/env-seal.sh`
- [ ] Wire the live-cert drift check into the cert-reuse branch (324-334), fail-closed unless `--reuse-cert`; unreachable cluster → explicit warning
- [ ] Verify `wc -l scripts/env-seal.sh` ≤ 520; rerun `#3` → PASS; commit

## 4. `#4` MED — chain sync-db-passwords into db:restore (Budget-0 file: net-zero)
- [ ] Write RED `#4` tests (guidance mentions `sync-db-passwords`; `db:restore` chains the task)
- [ ] Rewrite restore-complete guidance in `scripts/backup-restore.sh` (311-315) net-zero to point at `sync-db-passwords`
- [ ] Chain `workspace:sync-db-passwords` into `workspace:db:restore` (1935-1947) and `recovery:restore-table` (1874-1881)
- [ ] Verify `wc -l scripts/backup-restore.sh` ≤ 1037; rerun `#4` → PASS; commit

## 5. `#5` MED — chain env:seal after app-install secret processing
- [ ] Write RED `#5` test (app-install references `env-seal.sh`/`sealed mirror stale`)
- [ ] Add reseal chain after `process-oidc.mjs` in `scripts/app-install.sh` (75-77); non-dev fail-closed, dev soft; override `APP_INSTALL_SKIP_SEAL=1`
- [ ] Rerun `#5` → PASS; commit

## 6. `#6` MED — secrets:sync reconcile reminder + secrets:sync:full
- [ ] Write RED `#6` tests (reminder string; `secrets:sync:full` exists)
- [ ] Add un-reconciled-workload reminder to `secrets:sync` (1371-1386)
- [ ] Add `secrets:sync:full` companion (apply → sync-db-passwords → rollout restart)
- [ ] Rerun `#6` → PASS; commit

## 7. `#7` MED — rotate-tokens annotation + fail-loud reminder
- [ ] Write RED `#7` test (token-version annotation present)
- [ ] Stamp `claude-code/token-version` annotation on `mcp-auth-proxy` after rollout (3508-3535)
- [ ] Make the re-setup reminder fail-loud on stderr (boxed, version-bearing)
- [ ] Rerun `#7` → PASS; commit

## 8. `#8` LOW — ci-dummy-secrets fail-closed precondition
- [ ] Confirm pre-existing RED `#8` tests (`tests/unit/secret-task-guards.bats:28-56`); run `bats … -f '#8'` → FAIL
- [ ] Add CI/dev-only guard + prod-context refusal (`${KUBECTL:-kubectl}`) to `scripts/ci-dummy-secrets.sh`; write no files on refusal
- [ ] Rerun `#8` → PASS; confirm S4 reference; commit

## 9. `#9` LOW — keycloak-sync loud website-secrets warning + co-rotation note
- [ ] Write RED `#9` tests (keycloak-sync warns on empty `WEBSITE_OIDC_SECRET`; `env:seal` desc notes co-rotation)
- [ ] Add loud stderr warning to `build_kv_map` website-secrets fetch (130-134) keeping stdout KV-map unchanged
- [ ] Add co-rotation note to `env:seal` task `desc` (2178-2186)
- [ ] Rerun `#9` → PASS; commit

## 10. Final verification + inventory + OpenSpec gate
- [ ] `bats tests/unit/secret-task-guards.bats` → all `#1`…`#9` green
- [ ] `task test:changed` → green
- [ ] `task freshness:regenerate`
- [ ] `task test:inventory` (tests changed → regenerate + commit `website/src/data/test-inventory.json`)
- [ ] `task freshness:check` → S1 (budget-0 files unchanged) / S2 / S3 / S4 / baseline all green
- [ ] `task test:openspec` (`bash scripts/openspec.sh validate`) → `openspec validate: OK`
- [ ] Commit regenerated artifacts
