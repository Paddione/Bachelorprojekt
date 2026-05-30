---
title: Fleet Stage 2 — DNS Cutover & Brand Consolidation Implementation Plan
ticket_id: T000338
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Fleet Stage 2 — DNS Cutover & Brand Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the offline, CI-tested mechanism (a surgical ipv64 A-record cutover/rollback script + tasks + tests + a stale-IP fix + an operator runbook) to flip both brands' live traffic onto the unified `fleet` cluster, mentolder-first.

**Architecture:** A single `scripts/fleet-dns-cutover.sh` drives three sub-commands (`plan`/`cutover`/`rollback`) over the ipv64.net Bearer REST API. It updates **only** a fixed allowlist of A-record prefixes (`@`, `*`, `livekit`, `stream`, `turn`) — mail records (MX/TXT/CNAME) are structurally unreachable. `cutover` captures current values into a rollback state file before applying; `rollback` restores from it. Two `Taskfile.yml` tasks route it per brand via `env-resolve.sh`. The actual live cutover is performed by an operator following `docs/fleet-stage2-cutover-runbook.md` (gated on Stage 1 + operator assets); this plan ships the reusable mechanism, not the live flip.

**Tech Stack:** Bash, ipv64.net REST API (Bearer `IPV64_API_KEY`), `curl`, `jq`, BATS (bats-support/bats-assert), go-task, kustomize env files.

**Spec:** `docs/superpowers/specs/2026-05-30-fleet-stage2-dns-cutover-design.md`
**Branch:** `feature/fleet-stage2-dns-cutover`

---

## File Map

| Action | File | Responsibility |
|---|---|---|
| Modify | `environments/fleet-mentolder.yaml` | Replace stale gekko `TURN_PUBLIC_IP` / `LIVEKIT_PIN_IP` with pk-hetzner-4 `204.168.244.104` |
| Create | `scripts/fleet-dns-cutover.sh` | Surgical ipv64 A-record cutover/rollback; mail-record-safe by construction |
| Create | `tests/unit/fleet-dns-cutover.bats` | Asserts change-set safety (A-only, allowlisted prefixes, correct IPs), dry-run output, rollback fidelity |
| Modify | `Taskfile.yml` | `fleet:dns:cutover` + `fleet:dns:rollback` tasks (ENV-routed per brand) |
| Modify | `environments/schema.yaml` | (only if a new var is referenced — see Task 1; expected: no change) |
| Create | `docs/fleet-stage2-cutover-runbook.md` | Operator runbook: prereq gate → freeze/sync → flip → soak → korczewski handover → rollback |

**Reference files (read, do not modify):**
- `prod-korczewski/ddns-updater.yaml` — the proven ipv64 REST request shape (DELETE then POST, `praefix`/`type=A`/`content`).
- `tests/unit/backup-restore-namespace.bats` — the BATS style used in this repo (bats-support/bats-assert, `setup()` sourcing).
- `scripts/env-resolve.sh` — sourced (never executed) to export `PROD_DOMAIN`, `LIVEKIT_PIN_IP`, etc.

---

## Task 1: Fix stale gekko IPs in `environments/fleet-mentolder.yaml`

The fleet-mentolder env still carries mentolder-standalone (gekko) IPs for the LiveKit/TURN pin. After cutover, `livekit`/`stream`/`turn` for mentolder must resolve to pk-hetzner-4 (`204.168.244.104`). This is also the value `fleet-dns-cutover.sh` reads for the service-subdomain pin, so it must be correct before the script is meaningful.

**Files:**
- Modify: `environments/fleet-mentolder.yaml`
- Test: `tests/unit/fleet-dns-cutover.bats` (first test added here; expanded in Task 3)

- [x] **Step 1: Confirm the current stale values**

Run: `grep -nE 'TURN_PUBLIC_IP|LIVEKIT_PIN_IP' environments/fleet-mentolder.yaml`
Expected: both show a non-pk IP (e.g. `178.104.169.206` and/or `46.225.125.59`) — the values to replace.

- [x] **Step 2: Write the failing test**

Create `tests/unit/fleet-dns-cutover.bats` with this first test:

```bash
#!/usr/bin/env bats
# Unit tests for the fleet DNS cutover mechanism.

setup() {
  load 'lib/bats-support/load'
  load 'lib/bats-assert/load'
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
}

@test "fleet-mentolder env pins livekit/turn to pk-hetzner-4 (not gekko)" {
  run grep -E 'LIVEKIT_PIN_IP|TURN_PUBLIC_IP' "$REPO_ROOT/environments/fleet-mentolder.yaml"
  assert_success
  assert_output --partial '204.168.244.104'
  refute_output --partial '46.225.125.59'
  refute_output --partial '178.104.169.206'
}
```

- [x] **Step 3: Run the test to verify it fails**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: FAIL — output still contains a gekko IP / lacks `204.168.244.104`.

- [x] **Step 4: Apply the fix**

Edit `environments/fleet-mentolder.yaml`: set both vars to the pk-hetzner-4 public IP. Keep surrounding comments; only change the IP values.

```yaml
  TURN_PUBLIC_IP: "204.168.244.104"   # pk-hetzner-4 (fleet) — was gekko placeholder
  LIVEKIT_PIN_IP: "204.168.244.104"   # pk-hetzner-4 (fleet) — livekit/stream/turn pin
```

- [x] **Step 5: Run the test to verify it passes**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: PASS (1 test).

- [x] **Step 6: Commit**

```bash
git add environments/fleet-mentolder.yaml tests/unit/fleet-dns-cutover.bats
git commit -m "fix(fleet): pin mentolder livekit/turn to pk-hetzner-4 [stage2]"
```

---

## Task 2: `fleet-dns-cutover.sh` — change-set model + `plan` (dry-run)

Build the script's record model and dry-run first (no network). This is where mail-record safety is enforced structurally: the change set is generated only from a fixed prefix allowlist, type always `A`.

**Files:**
- Create: `scripts/fleet-dns-cutover.sh`
- Test: `tests/unit/fleet-dns-cutover.bats`

- [x] **Step 1: Write the failing tests** (append to `tests/unit/fleet-dns-cutover.bats`)

```bash
@test "plan: mentolder change set is A-records only, allowlisted prefixes, correct IPs" {
  run env PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  # root + wildcard get all three fleet node IPs
  assert_output --partial 'A|@|204.168.244.104'
  assert_output --partial 'A|@|37.27.251.38'
  assert_output --partial 'A|@|62.238.23.79'
  assert_output --partial 'A|*|62.238.23.79'
  # service subdomains pin to LIVEKIT_PIN_IP (pk-4)
  assert_output --partial 'A|livekit|204.168.244.104'
  assert_output --partial 'A|stream|204.168.244.104'
  assert_output --partial 'A|turn|204.168.244.104'
}

@test "plan: change set NEVER contains mail or non-A records" {
  run env PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  refute_output --partial 'MX'
  refute_output --partial 'TXT'
  refute_output --partial 'CNAME'
  refute_output --partial 'mailbox'
  refute_output --partial 'tutanota'
  refute_output --partial '_dmarc'
  refute_output --partial '_domainkey'
  refute_output --partial 'mta-sts'
  refute_output --partial 'spf'
  # every emitted change line must start with "A|"
  while IFS= read -r line; do
    [[ "$line" == CHANGE:* ]] || continue
    [[ "${line#CHANGE: }" == A\|* ]] || { echo "non-A change: $line"; return 1; }
  done <<< "$output"
}

@test "plan: korczewski pins service subdomains to pk-hetzner-6" {
  run env PROD_DOMAIN=korczewski.de LIVEKIT_PIN_IP=37.27.251.38 \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_success
  assert_output --partial 'A|livekit|37.27.251.38'
  assert_output --partial 'A|@|204.168.244.104'
}

@test "fails loudly when required env vars are missing" {
  run env -u PROD_DOMAIN -u LIVEKIT_PIN_IP \
    bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" plan
  assert_failure
  assert_output --partial 'not set'
}
```

- [x] **Step 2: Run to verify they fail**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: FAIL — `scripts/fleet-dns-cutover.sh` does not exist.

- [x] **Step 3: Create the script with `plan`/change-set logic**

Create `scripts/fleet-dns-cutover.sh`:

```bash
#!/usr/bin/env bash
# fleet-dns-cutover.sh — surgically flip a brand's cluster A-records onto the
# fleet nodes via the ipv64.net Bearer REST API, with rollback-state capture.
#
# Touches ONLY A records for the fixed prefix allowlist (@, *, livekit, stream,
# turn). It never references MX / TXT / CNAME (mail) records, so email keeps
# working across the cutover — this safety is structural, not conditional.
#
# Usage (env vars come from `source scripts/env-resolve.sh <env>`):
#   PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
#       bash scripts/fleet-dns-cutover.sh plan       # dry-run, prints change set
#   ... IPV64_API_KEY=xxx fleet-dns-cutover.sh cutover    # capture state + apply
#   ... IPV64_API_KEY=xxx fleet-dns-cutover.sh rollback   # restore from state file
set -euo pipefail

# Fleet node public IPs — root (@) and wildcard (*) round-robin across all three.
FLEET_NODE_IPS=("204.168.244.104" "37.27.251.38" "62.238.23.79")
# A-record prefix allowlist. "" = root @, "*" = wildcard. NO mail prefixes, ever.
ROOTLIKE_PREFIXES=("" "*")
SERVICE_PREFIXES=("livekit" "stream" "turn")

IPV64_API="${IPV64_API:-https://ipv64.net/api}"
STATE_DIR="${FLEET_DNS_STATE_DIR:-/tmp}"

require() { [ -n "${!1:-}" ] || { echo "ERROR: $1 not set" >&2; exit 1; }; }

# Emit the full set of A records to set, one per line, as TYPE|PREFIX|IP.
# A "@" prefix is printed for the root (empty praefix) for human readability;
# apply_change() maps "@" back to the empty praefix the ipv64 API expects.
build_change_set() {
  require PROD_DOMAIN
  require LIVEKIT_PIN_IP
  local p ip
  for p in "${ROOTLIKE_PREFIXES[@]}"; do
    local label="${p:-@}"
    for ip in "${FLEET_NODE_IPS[@]}"; do echo "A|${label}|${ip}"; done
  done
  for p in "${SERVICE_PREFIXES[@]}"; do echo "A|${p}|${LIVEKIT_PIN_IP}"; done
}

cmd_plan() {
  echo "DNS cutover plan for ${PROD_DOMAIN} (DRY-RUN — no API calls):"
  local line
  while IFS= read -r line; do echo "CHANGE: ${line}"; done < <(build_change_set)
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    plan)     cmd_plan ;;
    cutover)  cmd_cutover ;;
    rollback) cmd_rollback ;;
    *) echo "usage: $0 {plan|cutover|rollback}" >&2; exit 2 ;;
  esac
}

main "$@"
```

Note: `cmd_cutover` / `cmd_rollback` are added in Task 3. Add temporary stubs so `main` parses:

```bash
cmd_cutover() { echo "not implemented yet" >&2; exit 3; }
cmd_rollback() { echo "not implemented yet" >&2; exit 3; }
```

Place the two stubs **above** `main`. Make the script executable: `chmod +x scripts/fleet-dns-cutover.sh`.

- [x] **Step 4: Run to verify the plan tests pass**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: PASS (Task 1 test + the 4 new plan tests = 5).

- [x] **Step 5: Commit**

```bash
git add scripts/fleet-dns-cutover.sh tests/unit/fleet-dns-cutover.bats
git commit -m "feat(fleet): dns-cutover change-set model + dry-run plan [stage2]"
```

---

## Task 3: `cutover` + `rollback` apply logic (fake-curl tested)

Add the ipv64 REST apply (DELETE then POST per record, mirroring `prod-korczewski/ddns-updater.yaml`), rollback-state capture, and `rollback` restore. Tests fake `curl` on `PATH` so no network is touched.

**Files:**
- Modify: `scripts/fleet-dns-cutover.sh`
- Test: `tests/unit/fleet-dns-cutover.bats`

- [x] **Step 1: Write the failing tests** (append)

```bash
# Helper: a fake curl that logs every invocation to $CURL_LOG and prints a
# canned ipv64 get_domains response when asked to read records.
_make_fake_curl() {
  FAKE_BIN="$(mktemp -d)"
  CURL_LOG="$(mktemp)"
  cat > "$FAKE_BIN/curl" <<EOF
#!/usr/bin/env bash
echo "\$@" >> "$CURL_LOG"
# Emulate a get_domains read for rollback-state capture.
if printf '%s\n' "\$@" | grep -q 'get_domains'; then
  cat "$FIXTURE_GET_DOMAINS"
fi
exit 0
EOF
  chmod +x "$FAKE_BIN/curl"
}

@test "cutover: issues only type=A ipv64 writes for allowlisted prefixes" {
  _make_fake_curl
  FIXTURE_GET_DOMAINS="$(mktemp)"; echo '{"record_info":[]}' > "$FIXTURE_GET_DOMAINS"
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" cutover
  assert_success
  # Every write must carry type=A. No mail record type may appear.
  run grep -E 'type=MX|type=TXT|type=CNAME' "$CURL_LOG"
  assert_failure   # grep finds nothing → exit 1
}

@test "cutover: writes a rollback state file" {
  _make_fake_curl
  FIXTURE_GET_DOMAINS="$(mktemp)"; echo '{"record_info":[]}' > "$FIXTURE_GET_DOMAINS"
  env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" cutover
  [ -f "$BATS_TEST_TMPDIR/fleet-dns-rollback-mentolder.de.state" ]
}

@test "rollback: restores exactly the recorded state lines" {
  _make_fake_curl
  cat > "$BATS_TEST_TMPDIR/fleet-dns-rollback-mentolder.de.state" <<'STATE'
A|@|46.225.125.59
A|livekit|46.225.125.59
STATE
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" rollback
  assert_success
  run grep -F 'content=46.225.125.59' "$CURL_LOG"
  assert_success
}

@test "rollback: fails loudly when no state file exists" {
  _make_fake_curl
  run env PATH="$FAKE_BIN:$PATH" \
      PROD_DOMAIN=mentolder.de LIVEKIT_PIN_IP=204.168.244.104 \
      IPV64_API_KEY=testkey FLEET_DNS_STATE_DIR="$BATS_TEST_TMPDIR" \
      bash "$REPO_ROOT/scripts/fleet-dns-cutover.sh" rollback
  assert_failure
  assert_output --partial 'no rollback state'
}
```

- [x] **Step 2: Run to verify they fail**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: FAIL on the cutover/rollback tests (stubs `exit 3`).

- [x] **Step 3: Replace the stubs with real apply logic**

In `scripts/fleet-dns-cutover.sh`, replace the `cmd_cutover`/`cmd_rollback` stubs with:

```bash
# State file path for the active domain.
state_file() { echo "${STATE_DIR}/fleet-dns-rollback-${PROD_DOMAIN}.state"; }

# Map the human "@" label back to the empty praefix the ipv64 API expects.
_praefix() { [ "$1" = "@" ] && echo "" || echo "$1"; }

# Delete existing A records for a prefix, then add the new one (ipv64 has no
# atomic set). Mirrors prod-korczewski/ddns-updater.yaml.
apply_record() {
  local prefix="$1" ip="$2" px; px="$(_praefix "$prefix")"
  curl -fsS -X DELETE "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    -H "Content-Type: application/x-www-form-urlencoded" || true
  curl -fsS -X POST "${IPV64_API}" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" \
    --data-urlencode "domain=${PROD_DOMAIN}" \
    --data-urlencode "praefix=${px}" \
    --data-urlencode "type=A" \
    --data-urlencode "content=${ip}" \
    -H "Content-Type: application/x-www-form-urlencoded"
}

# Capture the current A records we are about to overwrite, into the state file.
# Best-effort read via get_domains; the runbook also records old IPs manually as
# the authoritative fallback. Writes one "A|<label>|<ip>" line per current value.
capture_rollback_state() {
  require IPV64_API_KEY
  local sf; sf="$(state_file)"
  : > "$sf"
  local resp; resp="$(curl -fsS "${IPV64_API}?get_domains" \
    -H "Authorization: Bearer ${IPV64_API_KEY}" || echo '{}')"
  # Extract A records for the allowlisted prefixes. The exact JSON path MUST be
  # confirmed against a live get_domains response (runbook prereq step); this
  # jq filter targets the documented record_info[] array.
  local p label px
  for p in "${ROOTLIKE_PREFIXES[@]}" "${SERVICE_PREFIXES[@]}"; do
    label="${p:-@}"; px="$(_praefix "$label")"
    echo "$resp" | jq -r --arg d "$PROD_DOMAIN" --arg px "$px" '
      (.record_info // [])[]?
      | select(.type=="A" and (.praefix // "")==$px)
      | "A|" + (if (.praefix // "")=="" then "@" else .praefix end) + "|" + .content
    ' >> "$sf" 2>/dev/null || true
  done
  echo "Rollback state written to $sf ($(wc -l < "$sf") records)"
}

cmd_cutover() {
  require PROD_DOMAIN; require LIVEKIT_PIN_IP; require IPV64_API_KEY
  capture_rollback_state
  local line type label ip
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || { echo "refusing non-A change: $type" >&2; exit 4; }
    apply_record "$label" "$ip"
    echo "set ${label}.${PROD_DOMAIN} A → ${ip}"
  done < <(build_change_set)
  echo "Cutover complete for ${PROD_DOMAIN}"
}

cmd_rollback() {
  require PROD_DOMAIN; require IPV64_API_KEY
  local sf; sf="$(state_file)"
  [ -s "$sf" ] || { echo "ERROR: no rollback state at $sf" >&2; exit 5; }
  local type label ip
  while IFS='|' read -r type label ip; do
    [ "$type" = "A" ] || continue
    apply_record "$label" "$ip"
    echo "restored ${label}.${PROD_DOMAIN} A → ${ip}"
  done < "$sf"
  echo "Rollback complete for ${PROD_DOMAIN}"
}
```

- [x] **Step 4: Run to verify all tests pass**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: PASS (9 tests total).

- [x] **Step 5: Commit**

```bash
git add scripts/fleet-dns-cutover.sh tests/unit/fleet-dns-cutover.bats
git commit -m "feat(fleet): dns-cutover apply + rollback over ipv64 REST [stage2]"
```

---

## Task 4: Taskfile tasks `fleet:dns:cutover` / `fleet:dns:rollback`

Wire the script into go-task, ENV-routed so the operator runs `task fleet:dns:cutover ENV=fleet-mentolder`. `env-resolve.sh` exports `PROD_DOMAIN`/`LIVEKIT_PIN_IP`; `IPV64_API_KEY` comes from the sealed secret materialised in the shell env or read from the cluster — the task passes through whatever is exported.

**Files:**
- Modify: `Taskfile.yml`
- Test: `tests/unit/fleet-dns-cutover.bats`

- [x] **Step 1: Write the failing test** (append)

```bash
@test "Taskfile declares fleet:dns:cutover and fleet:dns:rollback" {
  run grep -E '^[[:space:]]+fleet:dns:(cutover|rollback):' "$REPO_ROOT/Taskfile.yml"
  assert_success
  assert_output --partial 'fleet:dns:cutover:'
  assert_output --partial 'fleet:dns:rollback:'
}
```

- [x] **Step 2: Run to verify it fails**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats -f "Taskfile declares"`
Expected: FAIL — tasks not present.

- [x] **Step 3: Add the tasks**

In `Taskfile.yml`, add under the fleet task group (near the other `fleet:*` tasks). Both source `env-resolve.sh` (never execute it) and require an explicit `ENV`:

```yaml
  fleet:dns:cutover:
    desc: "Surgically flip a brand's cluster A-records onto the fleet nodes (ENV=fleet-mentolder|fleet-korczewski). Captures rollback state first. Mail records untouched."
    cmds:
      - |
        : "${ENV:?set ENV=fleet-mentolder or ENV=fleet-korczewski}"
        source scripts/env-resolve.sh "$ENV"
        bash scripts/fleet-dns-cutover.sh "${ACTION:-plan}"

  fleet:dns:rollback:
    desc: "Restore a brand's pre-cutover A-records from the saved rollback state (ENV=fleet-mentolder|fleet-korczewski)."
    cmds:
      - |
        : "${ENV:?set ENV=fleet-mentolder or ENV=fleet-korczewski}"
        source scripts/env-resolve.sh "$ENV"
        bash scripts/fleet-dns-cutover.sh rollback
```

Note for the operator: `fleet:dns:cutover` defaults to `ACTION=plan` (dry-run). Run `task fleet:dns:cutover ENV=fleet-mentolder ACTION=cutover` to apply. This makes the destructive action explicit — the bare task only prints the plan.

- [x] **Step 4: Run to verify the test passes + Taskfile still parses**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats -f "Taskfile declares"`
Expected: PASS.
Run: `cd /tmp/wt-fleet-stage2 && task --list >/dev/null && echo TASKFILE_OK`
Expected: `TASKFILE_OK` (no YAML parse error).

- [x] **Step 5: Commit**

```bash
git add Taskfile.yml tests/unit/fleet-dns-cutover.bats
git commit -m "feat(fleet): fleet:dns:cutover + rollback tasks (plan-by-default) [stage2]"
```

---

## Task 5: Operator runbook `docs/fleet-stage2-cutover-runbook.md`

The live cutover is performed by an operator (gated on Stage 1 + assets). This doc is the authoritative step-by-step. No code; it references the tasks built above.

**Files:**
- Create: `docs/fleet-stage2-cutover-runbook.md`

- [x] **Step 1: Write the runbook**

Create `docs/fleet-stage2-cutover-runbook.md` with these sections (fill with the concrete commands; this is the content, not a placeholder list):

```markdown
# Fleet Stage 2 — DNS Cutover Runbook

Spec: docs/superpowers/specs/2026-05-30-fleet-stage2-dns-cutover-design.md
Order: mentolder (reversible canary) → same-day soak → korczewski (irreversible).

## 0. Prerequisite gate (STOP if any fails)
- [ ] Stage 1 complete: `kubectl --context fleet get pods -n workspace` and
      `-n workspace-korczewski` all Ready.
- [ ] `environments/fleet-mentolder.yaml` TURN/LIVEKIT pin = 204.168.244.104 (Task 1).
- [ ] `IPV64_API_KEY` on fleet controls BOTH mentolder.de and korczewski.de — verify:
      `curl -fsS "https://ipv64.net/api?get_domains" -H "Authorization: Bearer $IPV64_API_KEY" | jq '.subdomains // .record_info'`
      Confirm both domains appear. **Confirm the JSON path used by
      `capture_rollback_state()` matches this real response** — adjust the jq filter
      in `scripts/fleet-dns-cutover.sh` if the live shape differs, then re-run the BATS.
- [ ] Certs pre-warmed on fleet: apply `Certificate` for `*.mentolder.de` +
      `mentolder.de` and `*.korczewski.de`; wait `READY=True`
      (`kubectl --context fleet get certificate -A`). DNS-01 works before the flip.
- [ ] Record current live A-records for both domains by hand (authoritative rollback
      fallback): run `task fleet:dns:cutover ENV=fleet-mentolder` (plan/dry-run) and
      save the dashboard values.

## 1. mentolder cutover (canary)
1. Maintenance banner up; quiesce writes on mentolder-standalone (scale app to 0 /
   DB read-only).
2. Final delta sync standalone → fleet: pg_dump of live DBs + PVC rsync; verify row
   counts / file checksums.
3. Dry-run: `task fleet:dns:cutover ENV=fleet-mentolder`. Review the CHANGE lines.
4. Apply: `task fleet:dns:cutover ENV=fleet-mentolder ACTION=cutover`.
5. Verify: `dig +short mentolder.de` returns the pk IPs; TLS serves; smoke checks.

## 2. Soak gate (same-day, active monitoring) — ALL must pass before korczewski
- [ ] `task health` + `task workspace:verify ENV=fleet-mentolder` green
- [ ] `*.mentolder.de` cert READY=True on fleet
- [ ] e2e Playwright (mentolder project) green vs the flipped domain
- [ ] `FLEET_CONTEXT=fleet bash tests/local/SA-22.sh` passes
- [ ] Manual smoke: Keycloak SSO, Nextcloud file open, chat send, LiveKit join
- [ ] No 5xx spike in fleet Traefik logs
- [ ] Mail spot-check (tutanota MX untouched)
- FAIL → `task fleet:dns:rollback ENV=fleet-mentolder`, fix, retry.

## 3. korczewski handover (irreversible — brief outage accepted)
1. Maintenance banner; final delta sync standalone → fleet (as §1.2).
2. Release :80/:443 on pk-hetzner-4/6/8: disable korczewski-standalone ingress
   (servicelb/Traefik), then enable fleet's ingress hostPort bind on the three hosts.
3. DNS cleanup: `task fleet:dns:cutover ENV=fleet-korczewski ACTION=cutover`
   (drops stray 14.249.175.67, adds pk-8 62.238.23.79, ensures wildcard).
4. Verify + smoke.

## 4. Rollback reference
- mentolder: `task fleet:dns:rollback ENV=fleet-mentolder` (restores recorded state;
  gekko never torn down — clean).
- korczewski: re-enable standalone ingress on the hosts + `task fleet:dns:rollback
  ENV=fleet-korczewski`. Recovery, not a flip-back; data written to fleet does not
  roll back.

## Out of scope (Stage 3)
Decommission standalone clusters, reclaim gekko, remove old envs/sealed-secrets.
```

- [x] **Step 2: Commit**

```bash
git add docs/fleet-stage2-cutover-runbook.md
git commit -m "docs(fleet): stage 2 dns cutover operator runbook [stage2]"
```

---

## Task 6: Full verification sweep

**Files:** none (verification only)

- [x] **Step 1: Run the new unit suite**

Run: `cd /tmp/wt-fleet-stage2 && bats tests/unit/fleet-dns-cutover.bats`
Expected: PASS (10 tests).

- [x] **Step 2: Run the offline CI gate**

Run: `cd /tmp/wt-fleet-stage2 && task test:all`
Expected: green (BATS unit, kustomize structure, Taskfile dry-run).

- [x] **Step 3: Test-inventory check (only if a new SA/FA/NFA test ID was added)**

This plan adds a `tests/unit/*.bats` unit test (no SA/FA/NFA ID), so the inventory should be unchanged. Confirm:
Run: `cd /tmp/wt-fleet-stage2 && task test:inventory && git diff --exit-code website/src/data/test-inventory.json`
Expected: no diff. If a diff appears, commit the regenerated `test-inventory.json`.

- [x] **Step 4: Shellcheck the new script (local lint, advisory)**

Run: `cd /tmp/wt-fleet-stage2 && shellcheck scripts/fleet-dns-cutover.sh || true`
Expected: no errors (warnings acceptable). Fix any error-level findings.

- [x] **Step 5: Final commit if anything changed**

```bash
git add -A && git commit -m "chore(fleet): stage2 cutover verification fixups [stage2]" || echo "nothing to commit"
```

---

## Self-Review notes (author)

- **Spec coverage:** stale-IP fix (Task 1 ↔ spec §prereq/artifacts); cutover/rollback
  script + mail-safety + state capture (Tasks 2–3 ↔ spec §decisions 3 / §error handling);
  Taskfile pair (Task 4 ↔ spec §artifacts); runbook with freeze/sync/flip/soak/handover
  (Task 5 ↔ spec §procedure); verification (Task 6 ↔ spec §testing). The live flip,
  cert pre-warming, and final delta sync are operator runbook steps (gated), not code —
  correctly out of the buildable scope per the spec.
- **Naming consistency:** `build_change_set`, `apply_record`, `capture_rollback_state`,
  `state_file`, `cmd_cutover`/`cmd_rollback` used identically across tasks; state file
  name `fleet-dns-rollback-<domain>.state` matches between cutover (Task 3 capture) and
  rollback test/restore.
- **Known live-only unknown (flagged, not silently assumed):** the `get_domains` JSON
  path in `capture_rollback_state()` is verified against a real response in the runbook
  prereq, with the hand-recorded A-records as the authoritative rollback fallback.
