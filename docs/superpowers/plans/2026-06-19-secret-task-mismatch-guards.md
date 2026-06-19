---
title: Secret-Task Mismatch-Guards Implementation Plan
ticket_id: T000951
domains: [infra, security, db, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Secret-Task Mismatch-Guards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every secret-mutating `task`/script action fail-closed (loud abort with diagnosis) instead of silently leaving the six secret-consistency levels in drift.

**Architecture:** Two problem classes from the spec — (A) chained reconcilers that fail OPEN inside `workspace:deploy`, and (B) lightweight secret paths (`secrets:sync`, `db:restore`, `app-install`, `ci-dummy`) that never call the reconcilers. We harden nine concrete gaps. Inline Taskfile loops are extracted into pure, sourcable, `KUBECTL`-overridable helper scripts so the guards are BATS-observable; every new hard-fail ships a documented soft-override env flag for emergencies.

**Tech Stack:** Bash (`set -euo pipefail`), go-task `Taskfile.yml`, BATS (`tests/unit/*.bats`), `kubectl`/`kubeseal`, Node ESM (`scripts/*.mjs`), OpenSpec (`openspec/`).

## Global Constraints

- **No silent fallback.** Fail-closed = loud abort with diagnosis on stderr + non-zero exit; never continue with a substitute value (mirrors the bge-m3/Voyage fail-closed doctrine).
- **Happy-path / dev not degraded.** All new guards gate on `non-dev` (`ENV != dev`); `ENV=dev` and local k3d flows stay frictionless. Timeouts are generous (raise the timeout, never lower a default).
- **Every new hard-fail has a documented soft-override env flag** for emergencies (named per task).
- **Idempotent.** Re-running any hardened action is stable (no double-reseal drift, no restart storm).
- **Agentic-first.** Inline Taskfile heredoc logic is extracted into sourcable helpers with `${KUBECTL:-kubectl}` / `${KUBESEAL:-kubeseal}` overrides for fakes — never opaque heredocs.
- **S2 — pure helpers.** New `scripts/*.sh` helpers are pure modules: no sourcing of DB/API layers, no import cycles.
- **S3 — no brand-domain literals.** Never hardcode `*.mentolder.de` / `*.korczewski.de`; resolve via `env-resolve.sh` exports (`PROD_DOMAIN`, `ENV_CONTEXT`, `WORKSPACE_NAMESPACE`).
- **S4 — no orphans.** Every new script is referenced from Taskfile/another script/test; every new `.bats` is wired into `test:unit` or allowlisted.

## File Structure

| File | Responsibility | Created/Modified |
|------|----------------|------------------|
| `scripts/wait-for-sealed-secret.sh` | Pure helper: poll until a Secret exists in a ns, fail-closed on timeout with stale-cert diagnosis (#1) | **Create** |
| `Taskfile.yml` | Call helpers; chain reconcilers into `db:restore`/`secrets:sync`/`app-install`; token-version annotation (#1,#4,#5,#6,#7) | Modify |
| `scripts/keycloak-sync.sh` | non-dev fail-closed on readiness/token/FAILED; loud website-secrets warning (#2,#9) | Modify |
| `scripts/env-seal.sh` | Live cert-fingerprint vs `CERT_FILE` compare; `--reuse-cert` override; `--_test-cert-compare` seam (#3) | Modify (Budget 0) |
| `scripts/backup-restore.sh` | Restore guidance points at `sync-db-passwords` (#4) | Modify (Budget 0) |
| `scripts/ci-dummy-secrets.sh` | Fail-closed precondition: CI/dev only, refuse prod context (#8) | Modify |
| `scripts/app-install.sh` | Chain `env:seal` (or loud "sealed mirror stale") after secret processing (#5) | Modify |
| `tests/unit/secret-task-guards.bats` | TDD coverage for all findings (already RED for #1/#8) | Modify |
| `openspec/changes/secret-task-mismatch-guards/{proposal,tasks}.md` + `specs/secret-rotation-guards.md` | OpenSpec delta | Modify |

### Pre-flight S1 budget (the load-bearing gate)

`effective_threshold = max(static_limit, baseline.metric)`; `budget = threshold − wc -l`. Computed via `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh residual_budget <path>`:

| `path` | ist | budget |
|--------|-----|--------|
| `scripts/wait-for-sealed-secret.sh` | 0 | 500 |
| `scripts/keycloak-sync.sh` | 255 | 245 |
| `scripts/ci-dummy-secrets.sh` | 8 | 492 |
| `scripts/app-install.sh` | 97 | 403 |
| `scripts/register-secret.mjs` | 75 | 425 |
| `scripts/env-seal.sh` | 520 | 0 |
| `scripts/backup-restore.sh` | 1037 | 0 |

Two **Budget-0** files (`env-seal.sh` baselined 520, `backup-restore.sh` baselined 1037) are already frozen above their `.sh` limit — their tasks MUST be net-zero or shrink (see #3/#4 for the net-neutral strategy; no cosmetic line-pulling). Not in the numeric table because they are **S1-ungated** (no `.bats`/`.yml` entry in `gates.yaml` s1.limits): `tests/unit/secret-task-guards.bats` (`.bats`, threshold 0, unconstrained for line count) and `Taskfile.yml` (`.yml`, threshold 0, unconstrained); plan-lint computes a negative residual for ungated extensions, so they are deliberately excluded from the budget assertion. Treat `keycloak-sync.sh` net additions as ≤ ~120 lines to stay well under its 245 budget.

---

## Task 1: `#1` HIGH — fail-closed SealedSecret decrypt-wait helper

**Files:**
- Create: `scripts/wait-for-sealed-secret.sh`
- Modify: `Taskfile.yml:2430-2434` (replace the inline `for i in $(seq 1 30)` decrypt-wait loop in `workspace:deploy`)
- Test: `tests/unit/secret-task-guards.bats` (#1 tests ALREADY EXIST and are RED — lines 58-86)

**Interfaces:**
- Produces: `scripts/wait-for-sealed-secret.sh --context <c> --namespace <ns> --secret <name> --timeout <s>`; exit 0 once the Secret is present, exit 1 on timeout. Reads `${KUBECTL:-kubectl}`. Consumed by `workspace:deploy` and by Task 4's `db:restore` chain (indirectly, via `sync-db-passwords`).

- [ ] **Step 1: Confirm the pre-existing failing tests** (no new test to write — the spec ships these RED)

The flagship tests already exist in `tests/unit/secret-task-guards.bats:60-86`:
- `#1 wait-for-sealed-secret helper exists and is executable`
- `#1 wait-for-sealed-secret EXITS NON-ZERO when the secret never decrypts` (fake kubectl exits 1)
- `#1 wait-for-sealed-secret EXITS ZERO once the secret is present` (fake kubectl exits 0)

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#1'`
Expected: FAIL — `scripts/wait-for-sealed-secret.sh` does not exist yet (the `-f '#1'` filter selects the three `#1` cases).

- [ ] **Step 3: Create the helper**

```bash
#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# wait-for-sealed-secret.sh — fail-closed wait for a controller-decrypted Secret
# ═══════════════════════════════════════════════════════════════════
# Replaces the inline `for i in $(seq 1 30)` loop in workspace:deploy. The old
# loop ran WITHOUT a failure check: a stale sealing cert → the SealedSecret never
# decrypts → loop exits 0 → ghcr-PAT/workspace-secrets stay empty → keycloak/
# sync-db SKIP on an empty Secret → deploy reports "green" with no credentials.
# This helper FAILS CLOSED on timeout with a stale-cert diagnosis.
#
# Usage:
#   scripts/wait-for-sealed-secret.sh --context <c> --namespace <ns> \
#       --secret <name> --timeout <seconds>
#
# KUBECTL override (tests inject a fake): KUBECTL=/path/to/fake-kubectl
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

KUBECTL="${KUBECTL:-kubectl}"
CONTEXT="" ; NAMESPACE="" ; SECRET="" ; TIMEOUT="90"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --context)   CONTEXT="$2";   shift 2 ;;
    --namespace) NAMESPACE="$2"; shift 2 ;;
    --secret)    SECRET="$2";    shift 2 ;;
    --timeout)   TIMEOUT="$2";   shift 2 ;;
    *) echo "wait-for-sealed-secret: unknown arg: $1" >&2; exit 2 ;;
  esac
done

[[ -n "$NAMESPACE" ]] || { echo "wait-for-sealed-secret: --namespace required" >&2; exit 2; }
[[ -n "$SECRET"    ]] || { echo "wait-for-sealed-secret: --secret required"    >&2; exit 2; }

ctx_flag=()
[[ -n "$CONTEXT" ]] && ctx_flag=(--context "$CONTEXT")

echo "Waiting up to ${TIMEOUT}s for Secret '${SECRET}' in ns '${NAMESPACE}' to be decrypted..."
deadline=$(( $(date +%s) + TIMEOUT ))
while :; do
  if "$KUBECTL" "${ctx_flag[@]}" get secret "$SECRET" -n "$NAMESPACE" >/dev/null 2>&1; then
    echo "✓ Secret '${SECRET}' present in ns '${NAMESPACE}'."
    exit 0
  fi
  if (( $(date +%s) >= deadline )); then
    {
      echo "✗ FAIL: Secret '${SECRET}' never appeared in ns '${NAMESPACE}' within ${TIMEOUT}s."
      echo "  The SealedSecret did not decrypt — most likely a STALE sealing cert"
      echo "  (the controller keypair rotated, e.g. after a cluster reset)."
      echo "  Fix: task env:fetch-cert ENV=<env> && task env:seal ENV=<env>, then re-deploy."
    } >&2
    exit 1
  fi
  sleep 2
done
```

- [ ] **Step 4: Make it executable**

Run: `chmod +x scripts/wait-for-sealed-secret.sh`

- [ ] **Step 5: Run the #1 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#1'`
Expected: PASS (all three `#1` cases green; the timeout case fails fast against the `--timeout 2` fake).

- [ ] **Step 6: Wire the helper into `workspace:deploy`, removing the inline loop (net-neutral on Taskfile)**

In `Taskfile.yml`, inside the non-dev branch of `workspace:deploy`, replace the inline loop currently at lines 2430-2434:

```yaml
            echo "Waiting for SealedSecret to be decrypted..."
            for i in $(seq 1 30); do
              kubectl --context "$ENV_CONTEXT" get secret workspace-secrets -n "${_ws_ns}" &>/dev/null && break
              sleep 1
            done
```

with a fail-closed call to the helper:

```yaml
            if ! bash scripts/wait-for-sealed-secret.sh \
                 --context "$ENV_CONTEXT" --namespace "${_ws_ns}" \
                 --secret workspace-secrets --timeout 90; then
              echo "Aborting deploy: workspace-secrets is not present — refusing to continue without credentials." >&2
              exit 1
            fi
```

(The helper replaces 5 inline lines with ~6 — net Taskfile delta ≈ 0; `Taskfile.yml` is S1-ungated regardless.)

- [ ] **Step 7: Verify the Taskfile still parses (dry-run)**

Run: `task workspace:deploy --dry-run ENV=dev 2>&1 | head -5`
Expected: no parse error (the dev branch does not touch the helper; this only confirms the YAML is well-formed). A non-zero exit purely from missing dev cluster context is acceptable — assert only that there is **no** `yaml:` / `template:` parse error in the output.

- [ ] **Step 8: Commit**

```bash
git add scripts/wait-for-sealed-secret.sh Taskfile.yml tests/unit/secret-task-guards.bats
git commit -m "fix(secrets): fail-closed SealedSecret decrypt-wait helper [T000951]"
```

**Acceptance:** fail-closed (timeout → exit 1, deploy aborts); idempotent (re-run is a no-op once the Secret exists); soft-override = none needed (raising `--timeout` is the escape hatch — a generous 90s default keeps slow cold-decrypts legitimate). Guardrail: dev branch untouched; no silent break.

---

## Task 2: `#2` HIGH — keycloak-sync fail-closed in non-dev

**Files:**
- Modify: `scripts/keycloak-sync.sh:55-57, 70-73, 93-99, 252-256` (turn the four `exit 0` / warn-only SKIP points into non-dev hard-fails)
- Test: `tests/unit/secret-task-guards.bats` (new `#2` cases)

**Interfaces:**
- Consumes: `ENV` (from `env-resolve.sh`), the existing `FAILED` counter (line 147-255).
- Produces: env flag `KEYCLOAK_SYNC_SOFT=1` (soft-override) and a sourcable decision helper `kc_should_fail_closed` so the policy is offline-testable.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #2: keycloak-sync.sh must fail-closed in non-dev ────────────────
KC_SYNC="${PROJECT_DIR}/scripts/keycloak-sync.sh"

@test "#2 kc_should_fail_closed is TRUE for a prod brand without soft-override" {
  run env -u KEYCLOAK_SYNC_SOFT bash -c \
    'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=mentolder kc_should_fail_closed && echo CLOSED'
  assert_output --partial CLOSED
}

@test "#2 kc_should_fail_closed is FALSE for ENV=dev (dev ergonomics)" {
  run bash -c 'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=dev kc_should_fail_closed && echo CLOSED || echo OPEN'
  assert_output --partial OPEN
}

@test "#2 kc_should_fail_closed is FALSE when KEYCLOAK_SYNC_SOFT=1 (override)" {
  run bash -c 'source "'"$KC_SYNC"'" --_test-source 2>/dev/null; ENV=mentolder KEYCLOAK_SYNC_SOFT=1 kc_should_fail_closed && echo CLOSED || echo OPEN'
  assert_output --partial OPEN
}
```

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#2'`
Expected: FAIL — `--_test-source` flag and `kc_should_fail_closed` do not exist yet.

- [ ] **Step 3: Add the decision helper + a sourcing seam near the top of `keycloak-sync.sh`**

After the colour/log helpers (around line 48), add:

```bash
# ── Fail-closed policy (offline-testable) ─────────────────────────────
# Non-dev runs (deploy step) must abort on an incomplete sync; dev stays soft.
# Soft-override KEYCLOAK_SYNC_SOFT=1 downgrades hard-fails to warnings (notfall).
kc_should_fail_closed() {
  [[ "${ENV:-dev}" != "dev" && "${KEYCLOAK_SYNC_SOFT:-0}" != "1" ]]
}
kc_skip_or_die() {  # $1 = human reason
  if kc_should_fail_closed; then
    err "FAIL (fail-closed): $1"
    err "Override für Notfälle: KEYCLOAK_SYNC_SOFT=1 task keycloak:sync ENV=${ENV}"
    exit 1
  fi
  warn "$1 — Sync wird übersprungen (dev/soft)."
  exit 0
}

# Test seam: `source keycloak-sync.sh --_test-source` defines functions then returns
# before any cluster I/O, so BATS can unit-test the policy offline.
[[ "${1:-}" == "--_test-source" ]] && return 0 2>/dev/null || true
```

- [ ] **Step 4: Replace the four warn-then-`exit 0` SKIP points with `kc_skip_or_die`**

Rollout-not-ready (lines 53-57):
```bash
if ! kubectl $CONTEXT_FLAG rollout status deployment/keycloak \
     -n "$KC_NAMESPACE" --timeout=300s 2>/dev/null; then
  kc_skip_or_die "Keycloak nicht bereit nach 5min"
fi
```
HTTP-not-ready (lines 70-73):
```bash
if [[ $KC_READY -eq 0 ]]; then
  kc_skip_or_die "Keycloak HTTP-Endpunkt antwortet nicht"
fi
```
Admin-token-missing (lines 93-99) — keep the drift diagnosis, then fail-closed:
```bash
if [[ -z "$ADMIN_TOKEN" ]]; then
  warn "Passwort-Drift erkannt: workspace-secrets-Passwort stimmt nicht mit dem live admin-User überein."
  warn "Lösung: task keycloak:sync-admin-password ENV=${ENV}"
  kc_skip_or_die "Admin-Token nicht erhältlich"
fi
```

- [ ] **Step 5: Add a post-PUT verify — non-zero exit if any client/group failed**

Replace the warn-only summary tail (lines 252-255) with a fail-closed gate:

```bash
if [[ $FAILED -gt 0 ]]; then
  if kc_should_fail_closed; then
    err "FAIL (fail-closed): ${FAILED} Client(s)/Gruppe(n) konnten nicht synchronisiert werden."
    err "Override für Notfälle: KEYCLOAK_SYNC_SOFT=1 task keycloak:sync ENV=${ENV}"
    exit 1
  fi
  warn "Einige Clients konnten nicht synchronisiert werden (dev/soft)."
  warn "Manuelle Prüfung: task keycloak:sync ENV=${ENV}"
fi
```

- [ ] **Step 6: Run the #2 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#2'`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/keycloak-sync.sh tests/unit/secret-task-guards.bats
git commit -m "fix(keycloak): non-dev fail-closed on unreadiness + FAILED>0 [T000951]"
```

**Acceptance:** non-dev unready/token-missing/`FAILED>0` → exit 1 (deploy aborts); `ENV=dev` and `KEYCLOAK_SYNC_SOFT=1` stay soft. Idempotent (re-run after a real sync hits `FAILED=0` and exits 0). Guardrail: no silent SSO drift; soft-override documented in error text.

---

## Task 3: `#3` MED — env-seal live cert-fingerprint guard

**Files:**
- Modify: `scripts/env-seal.sh:320-334` (the `CERT_FILE` reuse branch) + arg parser (lines 246-258) + test-dispatch (lines 260-287)
- Test: `tests/unit/secret-task-guards.bats` (new `#3` cases)

**Budget: `scripts/env-seal.sh` ist 520 · effective threshold 520 → Budget 0.** Net-neutral strategy: the cert-compare logic is added as a small function but the existing `else` info-line branch (lines 332-334) is rewritten in place; the `--_test-cert-compare` dispatch reuses the existing test-dispatch block pattern (lines 262-287) without growing the file beyond 520. If the addition would exceed 520, extract `scan_for_dev_values`/`check_duplicate_keys`/`check_schema_completeness` is **not** allowed here (out of scope) — instead move the new `compare_cert_fingerprints` body into a sourced sibling only if needed; prefer keeping it ≤ the freed lines. Verify with `wc -l scripts/env-seal.sh` ≤ 520 before commit.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #3: env-seal cert-fingerprint compare seam ─────────────────────
ENV_SEAL="${PROJECT_DIR}/scripts/env-seal.sh"

@test "#3 env-seal --_test-cert-compare exits ZERO for identical certs" {
  printf 'CERT-A\n' > "${SANDBOX}/a.pem"
  printf 'CERT-A\n' > "${SANDBOX}/b.pem"
  run bash "$ENV_SEAL" --_test-cert-compare "${SANDBOX}/a.pem" "${SANDBOX}/b.pem"
  assert_success
}

@test "#3 env-seal --_test-cert-compare exits NON-ZERO for drifted certs" {
  printf 'CERT-A\n' > "${SANDBOX}/a.pem"
  printf 'CERT-B-DIFFERENT\n' > "${SANDBOX}/b.pem"
  run bash "$ENV_SEAL" --_test-cert-compare "${SANDBOX}/a.pem" "${SANDBOX}/b.pem"
  assert_failure
}
```

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#3'`
Expected: FAIL — `--_test-cert-compare` is an unknown option (`usage`).

- [ ] **Step 3: Add the fingerprint helper + `--reuse-cert` flag + `--_test-cert-compare` seam**

In the globals block (after line 25) add:
```bash
REUSE_CERT=false
_TEST_CERT_A=""
_TEST_CERT_B=""
```

Add a pure compare function near the other helpers (after `usage`, ~line 42):
```bash
# Compare two sealing certs by SHA-256 of their normalized PEM body.
# Returns 0 if identical, 1 if drifted. Pure — no cluster I/O.
compare_cert_fingerprints() {
  local a="$1" b="$2"
  local fa fb
  fa=$(sha256sum < "$a" | cut -d' ' -f1)
  fb=$(sha256sum < "$b" | cut -d' ' -f1)
  [[ "$fa" == "$fb" ]]
}
```

Extend the arg parser (within the `while`/`case` at lines 247-257):
```bash
    --reuse-cert)            REUSE_CERT=true; shift ;;
    --_test-cert-compare)    _TEST_CERT_A="$2"; _TEST_CERT_B="$3"; shift 3 ;;
```

Add a test-dispatch (alongside the other `_TEST_*` dispatches, ~line 262):
```bash
if [[ -n "$_TEST_CERT_A" ]]; then
  if compare_cert_fingerprints "$_TEST_CERT_A" "$_TEST_CERT_B"; then
    echo "OK: certs match"; exit 0
  else
    echo "DRIFT: certs differ"; exit 1
  fi
fi
```

- [ ] **Step 4: Wire the live-cert drift check into the reuse branch**

Replace the `else` reuse branch (lines 332-334) so a reused `CERT_FILE` is verified against the live cluster cert when reachable:

```bash
else
  info "Using existing certificate: ${CERT_FILE}"
  # Fail-closed on cert drift: a reused cert that no longer matches the live
  # controller seals UNDECRYPTABLE secrets (feeds finding #1). Override: --reuse-cert.
  if [[ "$REUSE_CERT" != "true" ]]; then
    LIVE_CERT=$(mktemp)
    if kubeseal --controller-name=sealed-secrets --controller-namespace=sealed-secrets \
         --context "$CONTEXT" --fetch-cert > "$LIVE_CERT" 2>/dev/null && [[ -s "$LIVE_CERT" ]]; then
      if ! compare_cert_fingerprints "$CERT_FILE" "$LIVE_CERT"; then
        rm -f "$LIVE_CERT"
        die "Sealing cert drift: ${CERT_FILE} != live cluster cert (context ${CONTEXT}). The controller keypair rotated. Run 'task env:fetch-cert ENV=${ENV_NAME}' then re-seal, or pass --reuse-cert to seal against the cached cert anyway."
      fi
      info "Cert fingerprint matches live cluster."
    else
      warn_unverified="Cluster nicht erreichbar — Cert-Fingerprint NICHT verifiziert; reuse von ${CERT_FILE}."
      echo "WARN: ${warn_unverified}" >&2
    fi
    rm -f "$LIVE_CERT"
  fi
fi
```

(`warn` is not defined in this script; use the explicit `echo ... >&2` for the unreachable-cluster case as shown.)

- [ ] **Step 5: Run the #3 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#3'`
Expected: PASS.

- [ ] **Step 6: Verify the budget-0 file did not grow past its freeze**

Run: `wc -l scripts/env-seal.sh`
Expected: `≤ 520`. If over, move `compare_cert_fingerprints`'s body into a one-line `sha256sum`-diff inline or trim the existing verbose info lines in the seal block to restore net-zero (no cosmetic line-merging of unrelated code).

- [ ] **Step 7: Commit**

```bash
git add scripts/env-seal.sh tests/unit/secret-task-guards.bats
git commit -m "fix(env-seal): fail-closed on sealing-cert drift, --reuse-cert override [T000951]"
```

**Acceptance:** reused cert that drifts from live cluster → `die` (exit 1) unless `--reuse-cert`; unreachable cluster → explicit "not verified" warning (not a hard fail — preserves offline sealing); idempotent. Guardrail: no undecryptable seal; soft-override `--reuse-cert`.

---

## Task 4: `#4` MED — chain `sync-db-passwords` into `db:restore`

**Files:**
- Modify: `Taskfile.yml:1935-1947` (`workspace:db:restore` — chain `workspace:sync-db-passwords` after restore, mirroring `db:start` at 1912-1913)
- Modify: `scripts/backup-restore.sh:311-315` (restore guidance points at `sync-db-passwords`, not bare `workspace:restart`)
- Test: `tests/unit/secret-task-guards.bats` (new `#4` case asserting the guidance string)

**Budget: `scripts/backup-restore.sh` ist 1037 · threshold 1037 → Budget 0.** Strategy: rewrite the existing 5-line guidance block (lines 311-315) in place — same line count (echo lines replaced 1:1). Verify `wc -l` ≤ 1037 before commit.

**Interfaces:**
- Consumes: existing `workspace:sync-db-passwords` task (already chained by `db:start` at line 1912).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #4: restore guidance must point at sync-db-passwords ────────────
BACKUP_RESTORE="${PROJECT_DIR}/scripts/backup-restore.sh"

@test "#4 backup-restore restore-complete guidance mentions sync-db-passwords" {
  run grep -n 'sync-db-passwords' "$BACKUP_RESTORE"
  assert_success
}

@test "#4 db:restore task chains workspace:sync-db-passwords" {
  run bash -c 'sed -n "/workspace:db:restore:/,/db:diagram:/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -c "workspace:sync-db-passwords"'
  assert_output --partial 1
}
```

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#4'`
Expected: FAIL — neither the guidance string nor the task chain exists yet.

- [ ] **Step 3: Rewrite the restore-complete guidance in `backup-restore.sh` (net-zero)**

Replace lines 311-315:
```bash
    echo ""
    echo "✓ Restore complete. Restart affected services:"
    for db in "${DBS[@]}"; do
      echo "  task workspace:restart -- ${db}"
    done
```
with (same 5 lines):
```bash
    echo ""
    echo "✓ Restore complete. Re-sync role passwords so new pods don't crashloop on auth drift:"
    echo "  task workspace:sync-db-passwords ENV=<env>   # postStart self-heal does NOT fire on a restore"
    echo "  then restart affected services: task workspace:restart -- ${DBS[*]}"
    echo "  (db:restore now chains sync-db-passwords automatically; this is the manual equivalent.)"
```

- [ ] **Step 4: Chain `sync-db-passwords` into `workspace:db:restore`**

In `Taskfile.yml`, after the restore command (line 1947), add a chained task call (mirrors `db:start` at 1912-1913 and `db:start`'s pattern):
```yaml
      - task: workspace:sync-db-passwords
        vars: { ENV: "{{.ENV}}" }
```
Also do the same for `recovery:restore-table` (after `Taskfile.yml:1881`) so DB restores via the recovery path re-align role PWs too:
```yaml
      - task: workspace:sync-db-passwords
        vars: { ENV: "{{.ENV}}" }
```

- [ ] **Step 5: Run the #4 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#4'`
Expected: PASS.

- [ ] **Step 6: Verify budget-0 file did not grow + Taskfile parses**

Run: `wc -l scripts/backup-restore.sh && task workspace:db:restore --dry-run ENV=dev 2>&1 | head -3`
Expected: `scripts/backup-restore.sh ≤ 1037`; no `yaml:`/`template:` parse error.

- [ ] **Step 7: Commit**

```bash
git add Taskfile.yml scripts/backup-restore.sh tests/unit/secret-task-guards.bats
git commit -m "fix(restore): chain sync-db-passwords + align guidance [T000951]"
```

**Acceptance:** restore re-aligns Postgres role PWs to `workspace-secrets` automatically (no post-restore crashloop landmine); idempotent (`sync-db-passwords` is itself idempotent); guidance text matches the chained behavior. Guardrail: no silent role-PW drift; Budget-0 file stays net-zero.

---

## Task 5: `#5` MED — chain `env:seal` after `app-install` secret processing

**Files:**
- Modify: `scripts/app-install.sh:69-75` (after `process-secrets.mjs` / `process-oidc.mjs`, chain a reseal or emit a loud "sealed mirror stale" warning)
- Test: `tests/unit/secret-task-guards.bats` (new `#5` case)

**Interfaces:**
- Consumes: `ENV`, `ENV_CONTEXT` (from `env-resolve.sh`); calls `bash scripts/env-seal.sh` (Task 3's hardened sealer).

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #5: app-install must reseal (or warn) after secret processing ───
APP_INSTALL="${PROJECT_DIR}/scripts/app-install.sh"

@test "#5 app-install references env-seal after secret processing" {
  run grep -nE 'env-seal\.sh|sealed mirror stale' "$APP_INSTALL"
  assert_success
}
```

- [ ] **Step 2: Run it to verify it FAILS**

Run: `bats tests/unit/secret-task-guards.bats -f '#5'`
Expected: FAIL — `app-install.sh` never re-seals after writing plaintext.

- [ ] **Step 3: Add the reseal chain after OIDC processing**

In `scripts/app-install.sh`, after the OIDC step (line 75) and before the Kustomize apply (line 77), add:

```bash
# 6b. Re-seal so the cluster mirror is not stale.
#     process-secrets.mjs / process-oidc.mjs only wrote PLAINTEXT + schema; the
#     committed SealedSecret would otherwise lack the new app secret until a
#     manual `task env:seal`. Fail-closed: a non-dev install that can't reseal
#     refuses to deploy a partial app (override APP_INSTALL_SKIP_SEAL=1).
if [[ "$DRY_RUN" != "true" ]]; then
  if [[ "${APP_INSTALL_SKIP_SEAL:-0}" == "1" ]]; then
    echo "⚠ APP_INSTALL_SKIP_SEAL=1 — skipping reseal; sealed mirror may be STALE for $APP_NAME."
  else
    echo "🔐 Re-sealing $ENV so the cluster mirror includes the new app secret..."
    if ! bash "$SCRIPT_DIR/env-seal.sh" --env "$ENV" --env-dir "$ROOT_DIR/environments"; then
      if [[ "$ENV" != "dev" ]]; then
        echo "❌ Reseal failed and sealed mirror is now STALE for $ENV — refusing to deploy a partial app." >&2
        echo "   Fix the seal (cert drift?), then re-run: task app:install -- $APP_NAME ENV=$ENV" >&2
        exit 1
      fi
      echo "⚠ Reseal failed (dev) — continuing; dev uses k3d/secrets.yaml, not the sealed mirror."
    fi
  fi
fi
```

- [ ] **Step 4: Run the #5 test to verify it PASSES**

Run: `bats tests/unit/secret-task-guards.bats -f '#5'`
Expected: PASS.

- [ ] **Step 5: Confirm `app-install.sh` is still under budget**

Run: `wc -l scripts/app-install.sh`
Expected: well under 500 (ist ~97 + ~18 ≈ 115; budget was 403).

- [ ] **Step 6: Commit**

```bash
git add scripts/app-install.sh tests/unit/secret-task-guards.bats
git commit -m "fix(app-install): reseal after secret processing, fail-closed in prod [T000951]"
```

**Acceptance:** non-dev install that cannot reseal aborts before deploying a partial app; dev continues (k3d uses `k3d/secrets.yaml`); idempotent (`env-seal` is idempotent — Task 3's `--reuse-cert` covers the cert-cached case). Soft-override `APP_INSTALL_SKIP_SEAL=1`. Guardrail: no app secret stuck in plaintext-only limbo.

---

## Task 6: `#6` MED — `secrets:sync` workload-reconcile awareness + `secrets:sync:full`

**Files:**
- Modify: `Taskfile.yml:1371-1386` (`secrets:sync` — after apply, list consumers + point at `sync-db-passwords`/restart)
- Create (task): `Taskfile.yml` new `secrets:sync:full` task (apply + sync-db + rollout restart)
- Test: `tests/unit/secret-task-guards.bats` (new `#6` case)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #6: secrets:sync must warn about un-reconciled workloads ────────
@test "#6 secrets:sync emits a workload-reconcile reminder" {
  run bash -c 'sed -n "/^  secrets:sync:/,/^  secrets:install-hooks:/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -ciE "sync-db-passwords|rollout restart|landmine|latent"'
  refute_output --partial 0
}

@test "#6 secrets:sync:full companion task exists" {
  run grep -c 'secrets:sync:full:' "${PROJECT_DIR}/Taskfile.yml"
  assert_output --partial 1
}
```

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#6'`
Expected: FAIL — no reminder, no `secrets:sync:full`.

- [ ] **Step 3: Add a reconcile reminder to `secrets:sync`**

In `Taskfile.yml`, inside the `secrets:sync` loop after `echo "✓ $ENV sealed secrets applied"` (line 1385), add (still inside the `for ENV` loop):
```yaml
          echo "  ⚠ Applied the SealedSecret only — workloads + Postgres still hold the OLD value (latent landmine)."
          echo "    Reconcile now: task workspace:sync-db-passwords ENV=$ENV && kubectl $CTX -n \"${WORKSPACE_NAMESPACE:-workspace}\" rollout restart deploy"
          echo "    Or run the full path in one shot: task secrets:sync:full"
```

- [ ] **Step 4: Add the `secrets:sync:full` companion task**

Add directly after the `secrets:sync` task (after line 1386):
```yaml
  secrets:sync:full:
    desc: "Apply SealedSecrets AND reconcile workloads+DB on both prod clusters (apply → sync-db-passwords → rollout restart)."
    cmds:
      - task: secrets:sync
      - task: workspace:sync-db-passwords
        vars: { ENV: "mentolder" }
      - task: workspace:sync-db-passwords
        vars: { ENV: "korczewski" }
      - |
        for ENV in mentolder korczewski; do
          source scripts/env-resolve.sh "$ENV"
          CTX="${ENV_CONTEXT:+--context $ENV_CONTEXT}"
          NS="${WORKSPACE_NAMESPACE:-workspace}"
          echo "→ Rolling consumer deployments in $ENV/$NS ..."
          kubectl $CTX -n "$NS" rollout restart deploy
        done
```

- [ ] **Step 5: Run the #6 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#6'`
Expected: PASS.

- [ ] **Step 6: Verify the Taskfile parses**

Run: `task secrets:sync:full --dry-run 2>&1 | head -5`
Expected: no `yaml:`/`template:` parse error (cluster-unreachable exit is fine).

- [ ] **Step 7: Commit**

```bash
git add Taskfile.yml tests/unit/secret-task-guards.bats
git commit -m "feat(secrets): secrets:sync reconcile reminder + secrets:sync:full companion [T000951]"
```

**Acceptance:** `secrets:sync` now loudly flags the un-reconciled workloads (no behavior change to the apply itself — backward-compatible); `secrets:sync:full` does the full reconcile in one shot and is idempotent (`sync-db-passwords` + `rollout restart` are both safe to repeat). Guardrail: lightweight path no longer silently leaves a landmine.

---

## Task 7: `#7` MED — `claude-code:rotate-tokens` fail-loud + token-version annotation

**Files:**
- Modify: `Taskfile.yml:3508-3535` (`claude-code:rotate-tokens` — make the reminder fail-loud + stamp a token-version annotation on the `mcp-auth-proxy` Deployment)
- Test: `tests/unit/secret-task-guards.bats` (new `#7` case)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #7: rotate-tokens must annotate the deployment with a token version
@test "#7 rotate-tokens stamps a token-version annotation" {
  run bash -c 'sed -n "/claude-code:rotate-tokens:/,/Website (Astro/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -ciE "token-version|annotate"'
  refute_output --partial 0
}
```

- [ ] **Step 2: Run it to verify it FAILS**

Run: `bats tests/unit/secret-task-guards.bats -f '#7'`
Expected: FAIL — no annotation today.

- [ ] **Step 3: Stamp a token-version annotation after the rollout**

In `Taskfile.yml`, after `rollout status deployment/mcp-auth-proxy` (line 3529) and before the `echo "MCP tokens rotated"` line, add:
```yaml
        TOKEN_VERSION="$(date -u +%Y%m%dT%H%M%SZ)"
        kubectl --context "${ENV_CONTEXT}" -n "$MCP_NS" annotate deployment/mcp-auth-proxy \
          "claude-code/token-version=${TOKEN_VERSION}" --overwrite
```

- [ ] **Step 4: Make the re-setup reminder fail-loud (impossible to miss)**

Replace the trailing reminder echoes (lines 3531-3535) with a boxed, version-bearing notice on stderr:
```yaml
        {
          echo "════════════════════════════════════════════════════════════════"
          echo "⚠ ACTION REQUIRED — MCP tokens rotated to version ${TOKEN_VERSION}"
          echo "  The server now ONLY accepts the NEW token. Every machine's"
          echo "  settings.json still holds the OLD token → 401 until re-setup."
          echo "  Run on EACH machine:"
          echo "    task claude-code:setup -- cluster"
          echo "    task claude-code:setup -- business"
          echo "  Verify the live version: kubectl --context ${ENV_CONTEXT} -n ${MCP_NS} \\"
          echo "    get deploy mcp-auth-proxy -o jsonpath='{.metadata.annotations.claude-code/token-version}'"
          echo "════════════════════════════════════════════════════════════════"
        } >&2
```

- [ ] **Step 5: Run the #7 test to verify it PASSES**

Run: `bats tests/unit/secret-task-guards.bats -f '#7'`
Expected: PASS.

- [ ] **Step 6: Verify the Taskfile parses**

Run: `task claude-code:rotate-tokens --dry-run ENV=mentolder 2>&1 | head -5`
Expected: no `yaml:`/`template:` parse error.

- [ ] **Step 7: Commit**

```bash
git add Taskfile.yml tests/unit/secret-task-guards.bats
git commit -m "feat(claude-code): token-version annotation + fail-loud rotate reminder [T000951]"
```

**Acceptance:** rotation stamps a queryable `claude-code/token-version` annotation `claude-code:setup` can compare against; the re-setup reminder is unmissable on stderr; idempotent (`annotate --overwrite`). Guardrail: no silent 401 surprise; the annotation is the machine-readable contract.

---

## Task 8: `#8` LOW — ci-dummy-secrets fail-closed precondition

**Files:**
- Modify: `scripts/ci-dummy-secrets.sh` (add the CI/dev/context guard)
- Test: `tests/unit/secret-task-guards.bats` (#8 tests ALREADY EXIST and are RED — lines 28-56)

**Interfaces:**
- Consumes: `CI`, `ENV` env vars; `${KUBECTL:-kubectl}` for the defense-in-depth context probe.

- [ ] **Step 1: Confirm the pre-existing failing tests**

The flagship `#8` tests already exist in `tests/unit/secret-task-guards.bats:30-56`:
- REFUSES when `ENV=mentolder` and `CI` unset (and writes NO files)
- REFUSES for `ENV=korczewski` without CI
- PROCEEDS when `CI=true`
- PROCEEDS for `ENV=dev`

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#8'`
Expected: FAIL — the script has no guard; it always writes the placeholder files.

- [ ] **Step 3: Add the fail-closed precondition**

Replace `scripts/ci-dummy-secrets.sh` with:

```bash
#!/usr/bin/env bash
set -euo pipefail
# ci-dummy-secrets.sh — writes PLACEHOLDER secret files for offline CI/kustomize
# validation. Fail-closed precondition: this MUST NOT run in a prod context, or a
# later deploy from the same tree could ship the placeholder as a real secret.
#
# Contract: proceed ONLY if CI=true OR ENV ∈ {dev, ""}. Defense-in-depth: also
# refuse if the active kube-context is a prod brand. KUBECTL override for tests.

KUBECTL="${KUBECTL:-kubectl}"
_env="${ENV:-}"
if [[ "${CI:-}" != "true" && -n "$_env" && "$_env" != "dev" ]]; then
  echo "✗ ci-dummy-secrets: refusing to write placeholder secrets (ENV=$_env, CI unset)." >&2
  echo "  This script is for offline CI/dev only. Use 'task env:seal ENV=$_env' for real secrets." >&2
  exit 1
fi
# Defense-in-depth: never run against a live prod cluster.
_ctx="$("$KUBECTL" config current-context 2>/dev/null || echo "")"
if [[ "$_ctx" == "fleet" || "$_ctx" == *mentolder* || "$_ctx" == *korczewski* ]]; then
  if [[ "$_ctx" != *k3d* ]]; then
    echo "✗ ci-dummy-secrets: active kube-context '$_ctx' looks like prod — refusing." >&2
    exit 1
  fi
fi

for f in k3d/secrets.yaml k3d/backup-secrets.yaml; do
  if [ ! -f "$f" ]; then
    name="$(basename "$f" .yaml)"
    printf 'apiVersion: v1\nkind: Secret\nmetadata:\n  name: %s\ntype: Opaque\nstringData:\n  PLACEHOLDER: ci-dummy\n' "$name" > "$f"
  fi
done
```

- [ ] **Step 4: Run the #8 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#8'`
Expected: PASS (the prod-brand cases exit 1 and write no files; CI=true and ENV=dev proceed). The tests run in a sandbox with no kubectl, so `current-context` returns empty → the context guard is a no-op there, which is correct.

- [ ] **Step 5: Confirm where the script is referenced (S4 — not an orphan)**

Run: `grep -rn 'ci-dummy-secrets' .github/ Taskfile.yml scripts/ 2>/dev/null`
Expected: at least one reference (CI workflow / task). If somehow none, that is a pre-existing orphan to note — do NOT delete the file; the guard work stands.

- [ ] **Step 6: Commit**

```bash
git add scripts/ci-dummy-secrets.sh tests/unit/secret-task-guards.bats
git commit -m "fix(ci): fail-closed guard on ci-dummy-secrets (CI/dev only, refuse prod) [T000951]"
```

**Acceptance:** refuses (exit 1, writes nothing) for a prod brand without CI and for a prod kube-context; proceeds for `CI=true` and `ENV=dev`. Idempotent (existing files are left untouched). Guardrail: dev/CI ergonomics preserved; no placeholder leaks into a prod deploy.

---

## Task 9: `#9` LOW — keycloak-sync loud warning on empty website-secrets fetch

**Files:**
- Modify: `scripts/keycloak-sync.sh:130-134` (the `website-secrets` fetch inside `build_kv_map`)
- Modify: `scripts/env-seal.sh` header comment OR `Taskfile.yml` `env:seal` desc — add a co-rotation note (doc-only, pick the Taskfile `desc` to avoid touching the budget-0 file)
- Test: `tests/unit/secret-task-guards.bats` (new `#9` case)

- [ ] **Step 1: Write the failing test**

Append to `tests/unit/secret-task-guards.bats`:

```bash
# ── Finding #9: keycloak-sync warns loudly when website-secrets fetch is empty
@test "#9 keycloak-sync warns when WEBSITE_OIDC_SECRET is missing" {
  run grep -ciE 'WEBSITE_OIDC_SECRET.*(leer|empty|fehlt|missing)|website-secrets.*(leer|empty)' "${PROJECT_DIR}/scripts/keycloak-sync.sh"
  refute_output --partial 0
}

@test "#9 env:seal desc notes website-secrets co-rotation" {
  run bash -c 'sed -n "/  env:seal:/,/  env:fetch-cert:/p" "'"${PROJECT_DIR}/Taskfile.yml"'" | grep -ciE "website-secrets|WEBSITE_OIDC"'
  refute_output --partial 0
}
```

- [ ] **Step 2: Run them to verify they FAIL**

Run: `bats tests/unit/secret-task-guards.bats -f '#9'`
Expected: FAIL — no warning, no co-rotation note.

- [ ] **Step 3: Add the loud warning to `build_kv_map`**

In `scripts/keycloak-sync.sh`, change the website-secrets fetch block (lines 130-134) to capture the result and warn on empty:
```bash
  # WEBSITE_OIDC_SECRET lives in website-secrets (website namespace), not workspace-secrets.
  # env:seal of workspace-secrets does NOT rotate it — co-rotate website-secrets separately.
  # shellcheck disable=SC2086
  _website_oidc=$(kubectl $CONTEXT_FLAG get secret website-secrets -n "${WEBSITE_NAMESPACE:-website}" \
    -o json 2>/dev/null \
    | jq -r '.data | to_entries[] | select(.key | endswith("_OIDC_SECRET")) | "\(.key)=\(.value|@base64d)"' 2>/dev/null || true)
  if [ -z "$_website_oidc" ]; then
    warn "WEBSITE_OIDC_SECRET aus website-secrets (ns ${WEBSITE_NAMESPACE:-website}) ist leer/missing — Website-SSO-Client wird NICHT mit-synchronisiert. Co-Rotation prüfen." >&2
  fi
  printf '%s\n' "$_website_oidc"
```

(Note: `warn` already echoes to stdout in this script; the `>&2` redirect routes the diagnostic to stderr so it does not pollute the KV-map captured by `$(build_kv_map)`. Keep `printf` of the value on stdout so the map still receives it.)

- [ ] **Step 4: Add the co-rotation note to the `env:seal` task description**

In `Taskfile.yml`, extend the `env:seal` `desc` (line 2179):
```yaml
    desc: "Encrypt secrets into a SealedSecret manifest. NOTE: rotates workspace-secrets only — co-rotate website-secrets (WEBSITE_OIDC_SECRET) separately."
```

- [ ] **Step 5: Run the #9 tests to verify they PASS**

Run: `bats tests/unit/secret-task-guards.bats -f '#9'`
Expected: PASS.

- [ ] **Step 6: Verify keycloak-sync.sh budget + parse**

Run: `wc -l scripts/keycloak-sync.sh`
Expected: under 500 (ist ~255 + ~6 net for #2 and #9 combined ≈ ~290; budget was 245 — well clear).

- [ ] **Step 7: Commit**

```bash
git add scripts/keycloak-sync.sh Taskfile.yml tests/unit/secret-task-guards.bats
git commit -m "fix(keycloak): loud warning on empty website-secrets + co-rotation note [T000951]"
```

**Acceptance:** empty `website-secrets` fetch → loud stderr warning naming the co-rotation gap (does not abort — the workspace-secrets sync is still valid); `env:seal` desc documents the gap. Idempotent. Guardrail: no silent half-rotation; the KV-map on stdout is unchanged.

---

## Task 10: Final verification + inventory + OpenSpec gate

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated — tests changed)
- Modify: any freshness-regenerated artifacts

- [ ] **Step 1: Run the full new-test suite once (all findings green)**

Run: `bats tests/unit/secret-task-guards.bats`
Expected: PASS — every `#1`…`#9` case green.

- [ ] **Step 2: Run targeted changed-domain tests**

Run: `task test:changed`
Expected: PASS (vitest --changed + BATS selection + quality:check for the touched files). Investigate and fix any failure before proceeding — do not skip.

- [ ] **Step 3: Regenerate freshness artifacts (test-inventory, repo-index, …)**

Run: `task freshness:regenerate`
Expected: completes; `website/src/data/test-inventory.json` now reflects the new `#2…#9` bats cases.

- [ ] **Step 4: Regenerate the test inventory explicitly (tests were added → must commit it)**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` is up to date (no further diff after `git add`).

- [ ] **Step 5: Run the CI-equivalent freshness + S1–S4 ratchet check**

Run: `task freshness:check`
Expected: PASS — S1 (no budget-0 file grew: `env-seal.sh` ≤ 520, `backup-restore.sh` ≤ 1037), S2 (no import cycles), S3 (no brand-domain literals), S4 (no orphan scripts: `wait-for-sealed-secret.sh` is referenced by `workspace:deploy`), and baseline key-count unchanged. Fix any violation (most likely a budget-0 overrun) before proceeding.

- [ ] **Step 6: Validate the OpenSpec change tree**

Run: `task test:openspec` (or `bash scripts/openspec.sh validate`)
Expected: `openspec validate: OK` — `openspec/changes/secret-task-mismatch-guards/specs/secret-rotation-guards.md` has a `## ADDED Requirements` H2 header and `### Requirement:` H3 entries; `tasks.md` mirrors this plan.

- [ ] **Step 7: Commit the regenerated artifacts**

```bash
git add website/src/data/test-inventory.json docs/ openspec/
git commit -m "chore(secrets): regenerate inventory + finalize openspec delta [T000951]"
```

**Acceptance:** `bats secret-task-guards.bats`, `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory`, and `task test:openspec` (`bash scripts/openspec.sh validate`) are ALL green. Guardrail: no red gate is left for CI to catch.

---

## Self-Review

**Spec coverage:** all nine findings map 1:1 to Tasks 1-9 in severity order (HIGH #1/#2 first), plus the mandated final verification (Task 10). #1/#8 reference the pre-existing RED tests; #2-#7/#9 each specify a new failing BATS case + its seam.

**Placeholder scan:** no `TBD/TODO/FIXME/???`/"similar to Task N" in prose; every code step shows the full code.

**Type/name consistency:** `wait-for-sealed-secret.sh` CLI (`--context/--namespace/--secret/--timeout`, `KUBECTL` override) is consistent between Task 1's helper, the pre-existing test (lines 72-84), and the `workspace:deploy` call site. `kc_should_fail_closed`/`kc_skip_or_die`/`KEYCLOAK_SYNC_SOFT` are consistent across Task 2. `compare_cert_fingerprints`/`--reuse-cert`/`--_test-cert-compare` are consistent across Task 3. `APP_INSTALL_SKIP_SEAL` (Task 5), `secrets:sync:full` (Task 6), `claude-code/token-version` (Task 7) are each used consistently.

**Budget integrity:** the two Budget-0 files (`env-seal.sh` 520, `backup-restore.sh` 1037) have explicit net-zero strategies + a `wc -l` verification step; the budget table lists only S1-gated files with plan-lint-computed numbers; `.bats`/`.yml` excluded as S1-ungated.
