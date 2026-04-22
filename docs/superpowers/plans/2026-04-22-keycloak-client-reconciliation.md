# Keycloak Client Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make adding/recovering OIDC clients a declarative change (edit realm JSON → redeploy) by extending `keycloak-sync-secrets.sh` to `POST` missing clients via the Admin API, without touching the one-shot `kc.sh import --override false` bootstrap.

**Architecture:** Extract pure substitution/validation helpers into `scripts/lib/keycloak-helpers.sh` so they are unit-testable with bats. Extend the main script (renamed `scripts/keycloak-sync.sh`) to read clients from the live `realm-template` ConfigMap, substitute `${VAR}` placeholders from `domain-config` + `workspace-secrets`, GET existing clients, then POST missing ones / PUT secret-only for existing. Dev-only testing in this PR; mentolder/korczewski follow in a separate PR.

**Tech Stack:** bash, `kubectl`, `curl`, `jq`, `sed`, bats-core (for unit tests), Task (go-task) for orchestration.

**Spec:** `docs/superpowers/specs/2026-04-22-keycloak-client-reconciliation-design.md`

**Branch:** `docs/keycloak-client-reconciliation-spec` (already created, spec already committed at `d4c3809`).

---

## File Structure

### Created

| Path | Purpose |
|---|---|
| `scripts/lib/keycloak-helpers.sh` | Pure bash functions: `kc_substitute_placeholders`, `kc_assert_no_placeholders`, `kc_extract_clients_from_template`. Sourced by the main script, directly tested by bats. |
| `tests/unit/keycloak-sync.bats` | bats unit tests for the three helpers above. No cluster required; uses fixtures in `$BATS_TEST_TMPDIR`. |

### Modified

| Path | Purpose |
|---|---|
| `scripts/keycloak-sync-secrets.sh` → `scripts/keycloak-sync.sh` | Renamed via `git mv`. Sources `scripts/lib/keycloak-helpers.sh`. New upsert loop: extract clients from ConfigMap, substitute placeholders, `POST` if missing / `PUT` secret if present. New summary counters: `CREATED / SECRET_UPDATED / SKIPPED / FAILED`. |
| `Taskfile.yml` (lines 1095, 1130, 1135) | Rename task `keycloak:sync-secrets` → `keycloak:sync`. Update script path. Add thin alias task `keycloak:sync-secrets` that calls `keycloak:sync` for backwards compatibility. |
| `k3d/docs-content/scripts.md` | Update section `## keycloak-sync-secrets.sh` → `## keycloak-sync.sh` and example command. |
| `k3d/docs-content/troubleshooting.md` | Update the `bash scripts/keycloak-sync-secrets.sh` snippet. |

### Unchanged (explicit)

- `k3d/realm-import-entrypoint.sh` — first-boot bootstrap stays as-is.
- `k3d/realm-workspace-dev.json`, `prod/realm-workspace-prod.json`, `prod-korczewski/realm-workspace-korczewski.json`, `prod-mentolder/realm-workspace-mentolder.json` — client shape remains the single source of truth.

---

## Task 0: Preflight — verify branch state

**Files:** none (observation only)

- [ ] **Step 1: Confirm branch + clean tree for the plan commits**

Run:
```bash
git rev-parse --abbrev-ref HEAD
git log --oneline -1
git status --short | grep -v '^ M Taskfile.yml\|^ M k3d/nextcloud.yaml' || true
```

Expected:
- Branch: `docs/keycloak-client-reconciliation-spec`
- HEAD commit: `d4c3809` (spec commit) or newer
- No unrelated staged changes (the `Taskfile.yml` + `k3d/nextcloud.yaml` lines shown in `git status` are pre-existing working-tree edits and MUST stay out of this work's commits — do not stage them).

Stop and ask the user if the branch or tree does not match.

---

## Task 1: Diagnostic baseline on dev

**Files:** none (observation only; record output in the commit message of Task 2 or in a scratch note).

**Why first:** The spec (section 4) requires confirming the live-state divergence before writing any code. If the ConfigMap clients don't match the expected set (5: `nextcloud`, `website`, `claude-code`, `vaultwarden`, `docs`), revise the plan before proceeding.

- [ ] **Step 1: Enumerate clients the pod will import (ConfigMap view)**

Run:
```bash
kubectl get cm realm-template -n workspace \
  -o jsonpath='{.data.realm-workspace\.json}' \
  | jq -r '.clients[].clientId' | sort
```

Expected output (dev):
```
claude-code
docs
nextcloud
vaultwarden
website
```

If the set differs, stop — the realm JSON may have drifted or the ConfigMap was never regenerated.

- [ ] **Step 2: Enumerate clients actually present in the live realm**

Run:
```bash
PW=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d)
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master \
  --user admin --password "$PW"
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get clients -r workspace --fields clientId \
  | jq -r '.[].clientId' | sort
```

Expected: the live realm contains fewer (or equal) clients than the ConfigMap. Clients present in the ConfigMap but missing here are exactly what the new sync path will create.

- [ ] **Step 3: Confirm single-shot import was the only import**

Run:
```bash
kubectl logs deploy/keycloak -n workspace --tail=200 | grep -iE 'import|realm' | head -30
```

Expected: one recent `Realm workspace already exists. Import skipped.` (or similar) per pod start. No repeated import attempts.

- [ ] **Step 4: Record the delta**

Write down the diff between Step 1 and Step 2 — that is the authoritative "needs creation" list for the post-implementation verification in Task 14.

---

## Task 2: Rename the script (no behavior change yet)

**Files:**
- Rename: `scripts/keycloak-sync-secrets.sh` → `scripts/keycloak-sync.sh`

- [ ] **Step 1: Git-rename the script**

Run:
```bash
git mv scripts/keycloak-sync-secrets.sh scripts/keycloak-sync.sh
```

- [ ] **Step 2: Update header and usage comments inside the script**

In `scripts/keycloak-sync.sh`, replace lines 3 and 11-13:

```bash
# keycloak-sync.sh — Sync OIDC clients + secrets → Keycloak Admin API
```

```bash
# Usage:
#   bash scripts/keycloak-sync.sh
#   ENV=mentolder bash scripts/keycloak-sync.sh
#   task keycloak:sync ENV=mentolder
```

And line 146:

```bash
  warn "Manuelle Prüfung: task keycloak:sync ENV=${ENV}"
```

- [ ] **Step 3: Syntax check**

Run: `bash -n scripts/keycloak-sync.sh`
Expected: no output, exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/keycloak-sync.sh
git commit -m "refactor(keycloak): rename keycloak-sync-secrets.sh → keycloak-sync.sh

Pure rename + comment update. Behavior unchanged. Taskfile target rename
follows in the next commit.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Create helpers library — failing test for `kc_substitute_placeholders`

**Files:**
- Create: `tests/unit/keycloak-sync.bats`
- Create: `scripts/lib/keycloak-helpers.sh` (empty for now — the failing run should report "function not found")

- [ ] **Step 1: Create empty helpers file**

```bash
cat > scripts/lib/keycloak-helpers.sh <<'EOF'
#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
# keycloak-helpers.sh — Pure helpers for keycloak-sync.sh
# Sourced; do NOT execute directly.
# ═══════════════════════════════════════════════════════════════════════
EOF
chmod +x scripts/lib/keycloak-helpers.sh
```

- [ ] **Step 2: Write the first failing bats test**

Create `tests/unit/keycloak-sync.bats`:

```bash
#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-sync.bats — Pure unit tests for scripts/lib/keycloak-helpers.sh
# ═══════════════════════════════════════════════════════════════════
# No cluster, no curl, no kubectl. Uses fixtures under BATS_TEST_TMPDIR.

load test_helper

HELPERS="${PROJECT_DIR}/scripts/lib/keycloak-helpers.sh"

setup() {
  # shellcheck disable=SC1090
  source "$HELPERS"
}

# ── kc_substitute_placeholders ──────────────────────────────────

@test "kc_substitute_placeholders replaces single \${VAR} with value" {
  run kc_substitute_placeholders 'hello ${FOO} world' 'FOO=bar'
  [ "$status" -eq 0 ]
  [ "$output" = "hello bar world" ]
}

@test "kc_substitute_placeholders replaces multiple distinct vars" {
  run kc_substitute_placeholders '${A}/${B}/${A}' 'A=x
B=y'
  [ "$status" -eq 0 ]
  [ "$output" = "x/y/x" ]
}

@test "kc_substitute_placeholders leaves unknown \${VAR} untouched" {
  run kc_substitute_placeholders 'keep ${UNKNOWN}' 'FOO=bar'
  [ "$status" -eq 0 ]
  [ "$output" = "keep \${UNKNOWN}" ]
}

@test "kc_substitute_placeholders handles values with slashes and pipes safely" {
  run kc_substitute_placeholders 'url=${URL}' 'URL=https://auth.localhost/path|q'
  [ "$status" -eq 0 ]
  [ "$output" = "url=https://auth.localhost/path|q" ]
}
```

- [ ] **Step 3: Run and confirm failure**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 4 failures — "command not found: kc_substitute_placeholders" (or similar).

---

## Task 4: Implement `kc_substitute_placeholders`

**Files:**
- Modify: `scripts/lib/keycloak-helpers.sh`

- [ ] **Step 1: Add the function**

Append to `scripts/lib/keycloak-helpers.sh`:

```bash
# kc_substitute_placeholders INPUT KV
#   Replaces every occurrence of ${NAME} in INPUT with the value of NAME
#   found in KV. KV is newline-separated KEY=VALUE pairs.
#   Uses `|` as the sed delimiter so URL-style values pass through unharmed.
#   Values containing a literal `|` would break this — callers must not pass them
#   (OIDC secrets and domain names in this project are base64/URL-safe).
kc_substitute_placeholders() {
  local input="$1"
  local kv="$2"
  local key val
  local out="$input"
  while IFS='=' read -r key val; do
    [ -z "$key" ] && continue
    # Escape &, \, | in the replacement to keep sed happy.
    local esc
    esc=$(printf '%s' "$val" | sed 's/[\&|]/\\&/g')
    out=$(printf '%s' "$out" | sed "s|\${${key}}|${esc}|g")
  done <<< "$kv"
  printf '%s' "$out"
}
```

- [ ] **Step 2: Run tests, confirm pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 4/4 pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/keycloak-helpers.sh tests/unit/keycloak-sync.bats
git commit -m "feat(keycloak-helpers): add kc_substitute_placeholders + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Failing test for `kc_assert_no_placeholders`

**Files:**
- Modify: `tests/unit/keycloak-sync.bats`

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/keycloak-sync.bats`:

```bash
# ── kc_assert_no_placeholders ───────────────────────────────────

@test "kc_assert_no_placeholders returns 0 when no \${...} present" {
  run kc_assert_no_placeholders 'fully resolved string'
  [ "$status" -eq 0 ]
}

@test "kc_assert_no_placeholders returns non-zero when \${VAR} remains" {
  run kc_assert_no_placeholders 'still has ${LEFTOVER}'
  [ "$status" -ne 0 ]
  [[ "$output" == *'LEFTOVER'* ]]
}

@test "kc_assert_no_placeholders reports all unresolved vars, sorted unique" {
  run kc_assert_no_placeholders '${B} and ${A} and ${B}'
  [ "$status" -ne 0 ]
  # Output should mention A and B exactly once each.
  [[ "$output" == *'${A}'* ]]
  [[ "$output" == *'${B}'* ]]
}
```

- [ ] **Step 2: Run, confirm new tests fail**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 3 new failures — "command not found: kc_assert_no_placeholders".

---

## Task 6: Implement `kc_assert_no_placeholders`

**Files:**
- Modify: `scripts/lib/keycloak-helpers.sh`

- [ ] **Step 1: Add the function**

Append to `scripts/lib/keycloak-helpers.sh`:

```bash
# kc_assert_no_placeholders INPUT
#   Exits non-zero (returns 1) if INPUT still contains any ${NAME} token
#   where NAME matches [A-Z0-9_]+. Prints each offending token on its own
#   line (sorted, deduped) before returning.
kc_assert_no_placeholders() {
  local input="$1"
  local leftover
  leftover=$(printf '%s' "$input" | grep -oE '\$\{[A-Z0-9_]+\}' | sort -u || true)
  if [ -n "$leftover" ]; then
    printf 'unresolved placeholders:\n%s\n' "$leftover" >&2
    # bats `run` captures both stdout and stderr into $output, so mirror to stdout.
    printf 'unresolved placeholders:\n%s\n' "$leftover"
    return 1
  fi
  return 0
}
```

- [ ] **Step 2: Run tests, confirm pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 7/7 pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/keycloak-helpers.sh tests/unit/keycloak-sync.bats
git commit -m "feat(keycloak-helpers): add kc_assert_no_placeholders + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Failing test for `kc_extract_clients_from_template`

**Files:**
- Modify: `tests/unit/keycloak-sync.bats`

- [ ] **Step 1: Append failing tests**

Append to `tests/unit/keycloak-sync.bats`:

```bash
# ── kc_extract_clients_from_template ────────────────────────────

@test "kc_extract_clients_from_template emits one client JSON per line (NDJSON)" {
  local fixture="${BATS_TEST_TMPDIR}/realm.json"
  cat > "$fixture" <<'JSON'
{
  "realm": "workspace",
  "clients": [
    {"clientId": "alpha", "secret": "${A_SECRET}"},
    {"clientId": "beta", "secret": "${B_SECRET}"}
  ]
}
JSON

  run kc_extract_clients_from_template "$fixture"
  [ "$status" -eq 0 ]
  # Expect two NDJSON lines, one per client.
  [ "$(echo "$output" | wc -l)" -eq 2 ]
  [[ "$(echo "$output" | sed -n '1p')" == *'"clientId":"alpha"'* ]]
  [[ "$(echo "$output" | sed -n '2p')" == *'"clientId":"beta"'* ]]
}

@test "kc_extract_clients_from_template emits nothing for empty clients array" {
  local fixture="${BATS_TEST_TMPDIR}/empty.json"
  cat > "$fixture" <<'JSON'
{"realm": "workspace", "clients": []}
JSON
  run kc_extract_clients_from_template "$fixture"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}
```

- [ ] **Step 2: Run, confirm failure**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 2 new failures — "command not found: kc_extract_clients_from_template".

---

## Task 8: Implement `kc_extract_clients_from_template`

**Files:**
- Modify: `scripts/lib/keycloak-helpers.sh`

- [ ] **Step 1: Add the function**

Append to `scripts/lib/keycloak-helpers.sh`:

```bash
# kc_extract_clients_from_template FILE
#   Reads the realm template JSON at FILE and prints each element of the
#   .clients[] array on its own line as compact JSON (NDJSON). Requires jq.
kc_extract_clients_from_template() {
  local file="$1"
  jq -c '.clients[]' "$file"
}
```

- [ ] **Step 2: Run tests, confirm pass**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 9/9 pass.

- [ ] **Step 3: Commit**

```bash
git add scripts/lib/keycloak-helpers.sh tests/unit/keycloak-sync.bats
git commit -m "feat(keycloak-helpers): add kc_extract_clients_from_template + tests

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Wire helpers into `keycloak-sync.sh` (source + read ConfigMap)

**Files:**
- Modify: `scripts/keycloak-sync.sh`

- [ ] **Step 1: Source the helpers and read the ConfigMap**

In `scripts/keycloak-sync.sh`, after line 22 (the `source "$SCRIPT_DIR/env-resolve.sh" ...` line), add:

```bash
# shellcheck disable=SC1091
source "$SCRIPT_DIR/lib/keycloak-helpers.sh"
```

Then, immediately after the admin-token block (currently ends at line 87), insert a new section that reads the realm-template ConfigMap to a tempfile:

```bash
# ── Realm-Template ConfigMap ─────────────────────────────────────────
REALM_TMP=$(mktemp)
trap 'rm -f "$REALM_TMP"' EXIT

# shellcheck disable=SC2086
if ! kubectl $CONTEXT_FLAG get cm realm-template -n "$KC_NAMESPACE" \
     -o jsonpath='{.data.realm-workspace\.json}' > "$REALM_TMP" 2>/dev/null \
   || [ ! -s "$REALM_TMP" ]; then
  warn "realm-template ConfigMap nicht gefunden — kann keine Clients aus Template lesen."
  warn "Fallback: reiner Secret-Sync-Modus (nur PUT für existierende Clients)."
  TEMPLATE_AVAILABLE=0
else
  TEMPLATE_AVAILABLE=1
fi
```

- [ ] **Step 2: Syntax check**

Run: `bash -n scripts/keycloak-sync.sh`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add scripts/keycloak-sync.sh
git commit -m "feat(keycloak-sync): source helpers + read realm-template ConfigMap

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Replace the CLIENT_MAP loop with a template-driven upsert loop

**Files:**
- Modify: `scripts/keycloak-sync.sh`

**Background:** The current script iterates a hardcoded `CLIENT_MAP` (lines 45-51) that maps K8s-secret keys to clientIds. We replace it with a template-driven loop that extracts each client from the ConfigMap and upserts it.

- [ ] **Step 1: Delete the hardcoded CLIENT_MAP block**

Remove lines 44-51 of `scripts/keycloak-sync.sh`:

```bash
# ── OIDC-Client-Mapping: K8s-Secret-Key → Keycloak clientId ──────────
declare -A CLIENT_MAP=(
  [NEXTCLOUD_OIDC_SECRET]="nextcloud"
  [DOCS_OIDC_SECRET]="docs"
  [VAULTWARDEN_OIDC_SECRET]="vaultwarden"
  [WEBSITE_OIDC_SECRET]="website"
  [CLAUDE_CODE_OIDC_SECRET]="claude-code"
)
```

- [ ] **Step 2: Build the KV map of substitution values**

Insert after the ConfigMap read block (Task 9, Step 1):

```bash
# ── Build KV map for ${VAR} substitution ─────────────────────────────
# Domain vars come from configmap/domain-config (same keys the pod sees).
# Secret vars (*_OIDC_SECRET) come from secret/workspace-secrets.
build_kv_map() {
  # shellcheck disable=SC2086
  kubectl $CONTEXT_FLAG get cm domain-config -n "$KC_NAMESPACE" \
    -o jsonpath='{range .data}{@}{end}' 2>/dev/null \
    | jq -r 'to_entries[] | "\(.key)=\(.value)"' 2>/dev/null || true

  # shellcheck disable=SC2086
  kubectl $CONTEXT_FLAG get secret workspace-secrets -n "$KC_NAMESPACE" \
    -o json 2>/dev/null \
    | jq -r '.data | to_entries[] | select(.key | endswith("_OIDC_SECRET")) | "\(.key)=\(.value|@base64d)"' 2>/dev/null || true
}

KV_MAP=$(build_kv_map)
if [ -z "$KV_MAP" ]; then
  warn "KV-Map leer — domain-config oder workspace-secrets nicht lesbar."
  exit 0
fi
```

- [ ] **Step 3: Replace the `for SECRET_KEY in "${!CLIENT_MAP[@]}"` loop**

Delete lines 94-138 of the current script (the entire `for SECRET_KEY in ... done` block) and replace with:

```bash
# ── Upsert clients from the realm template ───────────────────────────
CREATED=0
SECRET_UPDATED=0
SKIPPED=0
FAILED=0

if [ "$TEMPLATE_AVAILABLE" -eq 1 ]; then
  while IFS= read -r RAW_CLIENT; do
    [ -z "$RAW_CLIENT" ] && continue

    CLIENT_ID=$(printf '%s' "$RAW_CLIENT" | jq -r '.clientId')
    SUBBED=$(kc_substitute_placeholders "$RAW_CLIENT" "$KV_MAP")

    if ! kc_assert_no_placeholders "$SUBBED" > /dev/null 2>&1; then
      err "  ✗ ${CLIENT_ID}: unresolved placeholders after substitution — skipping."
      kc_assert_no_placeholders "$SUBBED" 2>&1 | sed 's/^/      /' || true
      FAILED=$((FAILED + 1))
      continue
    fi

    # Does the client already exist?
    EXISTING_UUID=$(curl -sk \
      "${KC_URL}/admin/realms/${KC_REALM}/clients?clientId=${CLIENT_ID}&search=false" \
      -H "Authorization: Bearer ${ADMIN_TOKEN}" \
      | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || true)

    if [ -z "$EXISTING_UUID" ]; then
      # Create missing client
      HTTP_STATUS=$(curl -sk \
        -o /dev/null -w "%{http_code}" \
        -X POST "${KC_URL}/admin/realms/${KC_REALM}/clients" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "$SUBBED" || echo "000")
      if [[ "$HTTP_STATUS" =~ ^2 ]]; then
        log "  + ${CLIENT_ID} (created)"
        CREATED=$((CREATED + 1))
      else
        err "  ✗ ${CLIENT_ID}: POST failed HTTP ${HTTP_STATUS}"
        FAILED=$((FAILED + 1))
      fi
    else
      # Secret-only reconciliation (presence-only policy — see design spec §3)
      SECRET_VAL=$(printf '%s' "$SUBBED" | jq -r '.secret // empty')
      if [ -z "$SECRET_VAL" ]; then
        warn "  ${CLIENT_ID}: kein .secret nach Substitution — übersprungen."
        SKIPPED=$((SKIPPED + 1))
        continue
      fi
      SECRET_JSON=$(printf '%s' "$SECRET_VAL" | sed 's/\\/\\\\/g; s/"/\\"/g')
      HTTP_STATUS=$(curl -sk \
        -o /dev/null -w "%{http_code}" \
        -X PUT "${KC_URL}/admin/realms/${KC_REALM}/clients/${EXISTING_UUID}" \
        -H "Authorization: Bearer ${ADMIN_TOKEN}" \
        -H "Content-Type: application/json" \
        -d "{\"secret\":\"${SECRET_JSON}\"}" || echo "000")
      if [[ "$HTTP_STATUS" =~ ^2 ]]; then
        log "  ✓ ${CLIENT_ID} (secret-updated)"
        SECRET_UPDATED=$((SECRET_UPDATED + 1))
      else
        err "  ✗ ${CLIENT_ID}: PUT secret failed HTTP ${HTTP_STATUS}"
        FAILED=$((FAILED + 1))
      fi
    fi
  done < <(kc_extract_clients_from_template "$REALM_TMP")
else
  warn "TEMPLATE_AVAILABLE=0 — skipping template-driven upsert (no ConfigMap)."
fi
```

- [ ] **Step 4: Update the summary line**

Replace the old `log "Sync abgeschlossen: ${UPDATED} aktualisiert, ${SKIPPED} übersprungen, ${FAILED} fehlgeschlagen."` at line 142 with:

```bash
echo ""
log "Sync abgeschlossen: ${CREATED} erstellt, ${SECRET_UPDATED} secret-aktualisiert, ${SKIPPED} übersprungen, ${FAILED} fehlgeschlagen."

if [[ $FAILED -gt 0 ]]; then
  warn "Einige Clients konnten nicht synchronisiert werden."
  warn "Manuelle Prüfung: task keycloak:sync ENV=${ENV}"
fi
```

- [ ] **Step 5: Syntax check**

Run: `bash -n scripts/keycloak-sync.sh`
Expected: exit 0.

- [ ] **Step 6: Unit tests still pass (helpers unchanged)**

Run: `./tests/unit/lib/bats-core/bin/bats tests/unit/keycloak-sync.bats`
Expected: 9/9 pass.

- [ ] **Step 7: Commit**

```bash
git add scripts/keycloak-sync.sh
git commit -m "feat(keycloak-sync): template-driven upsert (POST missing, PUT secret for existing)

Replaces the hardcoded CLIENT_MAP loop with an iteration over the live
realm-template ConfigMap. Missing clients are POSTed with all fields
substituted from domain-config + workspace-secrets. Existing clients
keep the old presence-only secret reconciliation to avoid silent
overwrite of admin-UI-applied fixes.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Rename the Taskfile target + add compat alias

**Files:**
- Modify: `Taskfile.yml` (lines 1095, 1130-1135)

- [ ] **Step 1: Update the chained call at line 1095**

Replace:

```yaml
      - task: keycloak:sync-secrets
        vars: { ENV: "{{.ENV}}" }
```

with:

```yaml
      - task: keycloak:sync
        vars: { ENV: "{{.ENV}}" }
```

- [ ] **Step 2: Rename the task definition (lines 1130-1135)**

Replace:

```yaml
  keycloak:sync-secrets:
    desc: "Sync OIDC client secrets von workspace-secrets → Keycloak Admin API (ENV=dev|mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - ENV={{.ENV}} bash scripts/keycloak-sync-secrets.sh
```

with:

```yaml
  keycloak:sync:
    desc: "Sync OIDC clients + secrets von realm-template → Keycloak Admin API (ENV=dev|mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - ENV={{.ENV}} bash scripts/keycloak-sync.sh

  keycloak:sync-secrets:
    desc: "Alias für keycloak:sync (backwards-compat, wird in Folge-PR entfernt)"
    vars:
      ENV: '{{.ENV | default "dev"}}'
    cmds:
      - task: keycloak:sync
        vars: { ENV: "{{.ENV}}" }
```

- [ ] **Step 3: Dry-run verification**

Run: `task --dry keycloak:sync ENV=dev && task --dry keycloak:sync-secrets ENV=dev`
Expected: both commands succeed (exit 0), both resolve to `bash scripts/keycloak-sync.sh` eventually.

- [ ] **Step 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(taskfile): rename keycloak:sync-secrets → keycloak:sync + compat alias

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: Update doc references

**Files:**
- Modify: `k3d/docs-content/scripts.md:169-176`
- Modify: `k3d/docs-content/troubleshooting.md:135`

- [ ] **Step 1: `scripts.md`**

In `k3d/docs-content/scripts.md`, replace line 169:

```markdown
## keycloak-sync.sh
```

And line 176:

```markdown
bash scripts/keycloak-sync.sh
```

- [ ] **Step 2: `troubleshooting.md`**

In `k3d/docs-content/troubleshooting.md`, replace line 135:

```markdown
bash scripts/keycloak-sync.sh
```

- [ ] **Step 3: Sanity grep — nothing else still references the old name**

Run:
```bash
grep -rn "keycloak-sync-secrets" \
  --include='*.sh' --include='*.yml' --include='*.yaml' --include='*.md' --include='*.bats' \
  | grep -v '^docs/superpowers/' \
  | grep -v '^k3d/docs-content/superpowers/'
```

Expected: no output (old plan/spec docs under `docs/superpowers/` are historical records and stay intact).

If anything prints, inspect and update it in this task before committing.

- [ ] **Step 4: Commit**

```bash
git add k3d/docs-content/scripts.md k3d/docs-content/troubleshooting.md
git commit -m "docs: update references to renamed keycloak-sync.sh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: Run the existing unit + manifests tests (regression gate)

**Files:** none

- [ ] **Step 1: Full local test suite**

Run: `task test:all`

Expected: all bats suites pass (including the new `keycloak-sync.bats`), manifests validate, dry-runs succeed.

If any suite fails, fix before proceeding.

- [ ] **Step 2: Shellcheck on the new + modified scripts**

Run:
```bash
shellcheck scripts/keycloak-sync.sh scripts/lib/keycloak-helpers.sh
```

Expected: no errors. Warnings that match existing patterns (SC2086 on kubectl calls) are acceptable because the script already disables them inline.

---

## Task 14: End-to-end verification on dev (primary pass criterion)

**Files:** none

- [ ] **Step 1: Invoke via the chained deploy path (proves the hook still fires)**

Run: `task workspace:deploy ENV=dev`

Watch the tail of the output for:
```
[KC-SYNC] Sync abgeschlossen: N erstellt, M secret-aktualisiert, 0 übersprungen, 0 fehlgeschlagen.
```
where `N + M == 5`. `N` is the delta recorded in Task 1 Step 4; `M` is the rest.

- [ ] **Step 2: Re-enumerate live clients**

Run:
```bash
PW=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d)
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master \
  --user admin --password "$PW"
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get clients -r workspace --fields clientId | jq -r '.[].clientId' | sort
```

Expected: all 5 of `claude-code / docs / nextcloud / vaultwarden / website` present.

- [ ] **Step 3: Spot-check secret values**

For each clientId, run:
```bash
KCID="nextcloud"  # repeat for each of the 5
SECRET_FROM_WS=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath="{.data.${KCID^^}_OIDC_SECRET}" 2>/dev/null | base64 -d)
UUID=$(kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get clients -r workspace -q clientId=$KCID --fields id | jq -r '.[0].id')
SECRET_LIVE=$(kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get "clients/$UUID/client-secret" -r workspace | jq -r '.value')
[ "$SECRET_FROM_WS" = "$SECRET_LIVE" ] && echo "  ✓ $KCID" || echo "  ✗ $KCID MISMATCH"
```

Expected: `✓` for every client (skip `claude-code` if its K8s key differs — our map uses `CLAUDE_CODE_OIDC_SECRET`, which matches `claude-code`'s uppercase form).

---

## Task 15: Regression — deleted client is recreated

**Files:** none

- [ ] **Step 1: Delete one client via admin API**

Run:
```bash
PW=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath='{.data.KEYCLOAK_ADMIN_PASSWORD}' | base64 -d)
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  config credentials --server http://localhost:8080 --realm master \
  --user admin --password "$PW"
UUID=$(kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  get clients -r workspace -q clientId=docs --fields id | jq -r '.[0].id')
kubectl exec deploy/keycloak -n workspace -- /opt/keycloak/bin/kcadm.sh \
  delete "clients/$UUID" -r workspace
```

Expected: silent success.

- [ ] **Step 2: Rerun sync**

Run: `task keycloak:sync ENV=dev`

Expected: summary shows `1 erstellt, 4 secret-aktualisiert`.

- [ ] **Step 3: Verify docs is back**

Run the Task 14 Step 2 command again. Expected: all 5 clients present.

---

## Task 16: Regression — idempotency

**Files:** none

- [ ] **Step 1: Run sync twice back-to-back**

Run:
```bash
task keycloak:sync ENV=dev
task keycloak:sync ENV=dev
```

- [ ] **Step 2: Verify second run has zero creations**

Expected second-run summary:
```
[KC-SYNC] Sync abgeschlossen: 0 erstellt, 5 secret-aktualisiert, 0 übersprungen, 0 fehlgeschlagen.
```

If `erstellt > 0` on the second run, the GET existence check is broken — stop and debug.

---

## Task 17: Open the PR

**Files:** none

- [ ] **Step 1: Push the branch**

Run: `git push -u origin docs/keycloak-client-reconciliation-spec`

- [ ] **Step 2: Open the PR**

Run:
```bash
gh pr create --title "feat(keycloak): reconcile OIDC clients via admin API (creates missing clients)" --body "$(cat <<'EOF'
## Summary
- Design spec committed under `docs/superpowers/specs/2026-04-22-keycloak-client-reconciliation-design.md`.
- Extends `scripts/keycloak-sync-secrets.sh` (renamed to `scripts/keycloak-sync.sh`) so that missing OIDC clients are POSTed to the Keycloak admin API using the live `realm-template` ConfigMap as the client source.
- Existing clients keep presence-only reconciliation (secret field only) to avoid silently overwriting operator-applied admin-UI fixes.
- New helper lib `scripts/lib/keycloak-helpers.sh` is unit-tested under `tests/unit/keycloak-sync.bats` (no cluster required).
- `k3d/realm-import-entrypoint.sh` is NOT touched — first-boot `--override false` bootstrap remains intact.

## Test plan
- [x] `task test:all` — unit + manifests + dry-run pass locally
- [x] Dev diagnostic recorded: ConfigMap had 5 clients, live realm had N < 5
- [x] `task workspace:deploy ENV=dev` — all 5 clients present after sync
- [x] Per-client secret spot-check matches workspace-secrets
- [x] Regression: deleted one client, reran sync, client recreated
- [x] Idempotency: second run reports 0 created, 5 secret-updated
- [ ] mentolder / korczewski are explicitly OUT OF SCOPE here; follow-up PR will add missing clients to their realm JSONs, then run `task keycloak:sync ENV=<env>`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

Before handing off, reviewed the plan against the spec and corrected the following inline:

- **Spec §1 "Architecture":** every row is implemented — rename (Task 2), helpers lib (Tasks 3-8), upsert logic (Tasks 9-10), Taskfile rename + alias (Task 11). ✓
- **Spec §2 "Client source of truth":** ConfigMap read is in Task 9; `sed`-based substitution with `|` delimiter is in Task 4 implementation; fail-hard check is in Task 6 + wired in Task 10 Step 3. ✓
- **Spec §3 "Sync algorithm":** every branch of the pseudocode maps to a block inside Task 10 Step 3 (POST vs PUT). Counter names (`CREATED / SECRET_UPDATED / SKIPPED / FAILED`) match the spec. ✓
- **Spec §4 "Diagnostic phase":** Task 1 runs all three commands before any code change. ✓
- **Spec §5 "Testing plan":** Tasks 14-16 cover rows 2-5 of the spec's test table; row 1 (baseline) is Task 1. ✓
- **Spec §6 "Risk & rollback":** partial-failure semantics, auth-failure early-exit, and admin permission scope are all preserved by reusing the existing token block unchanged. ✓
- **Spec §7 "Out of scope":** PR body in Task 17 repeats the mentolder/korczewski out-of-scope boundary. ✓

No placeholders, no "TBD". Function names are consistent across tasks (`kc_substitute_placeholders`, `kc_assert_no_placeholders`, `kc_extract_clients_from_template`). Counter names (`CREATED`, `SECRET_UPDATED`, `SKIPPED`, `FAILED`) and task names (`keycloak:sync`, alias `keycloak:sync-secrets`) are consistent between declaration (Task 10-11) and verification (Tasks 14-16).
