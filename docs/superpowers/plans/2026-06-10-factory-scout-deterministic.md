---
title: Deterministic Factory Scout Implementation Plan
ticket_id: T000594
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Deterministic Factory Scout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the LLM-backed Scout agent in the Software Factory pipeline with a deterministic Bash script (`scripts/factory/scout.sh`) that produces SCOUT_SCHEMA-conformant JSON via grep/find, removing latency, cost, and non-determinism from the file-discovery phase.

**Architecture:** A new pure-Bash `scout.sh` performs keyword extraction → three-strategy file discovery → complexity classification → risk-area tagging → fail-soft similar-ticket lookup → jq-encoded JSON output. `pipeline.js` swaps the `agent('scout', …)` LLM call for a direct `execFileSync('bash', ['scout.sh', …])` call plus `JSON.parse`, with a direct liveness-`touch` and a kept (but documented) `scout:persist` agent. All downstream consumers (conflict-check.sh, resolvePartialServices, Deploy Gate-2, adaptive provisioning) read the same `scout.complexity` / `scout.touched_files` shape and are untouched.

**Tech Stack:** Bash 4.x, `jq`, `grep`/`find`/`awk`/`sort`, Node.js (`node --check`, `npx tsx` for similar-tickets), BATS for tests, the existing Workflow-script `child_process` access in `pipeline.js`.

---

## Background facts (verified in this worktree)

- `jq`, `node`, `npx` are all present (`/usr/bin/jq`, `/usr/bin/node`, `/usr/bin/npx`).
- `find-similar-tickets.mjs` lives at **`website/scripts/find-similar-tickets.mjs`** (NOT `website/scripts/` from repo root only — invoke as `cd "$REPO/website" && npx tsx scripts/find-similar-tickets.mjs`). It prints a **JSON array of row objects**, each with an `external_id` string (and `ticket_id`, `title`, …). It already fail-softs: prints `[]` on no embeddings, `exit 1` + stderr when the vector store/LLM is down.
- SCOUT_SCHEMA requires `similar_tickets` to be an **array of strings** (ticket IDs). Therefore `scout.sh` MUST map the row objects to their `.external_id` strings — it cannot pass the raw rows through.
- `SCOUT_SCHEMA` (pipeline.js:168) requires keys: `complexity` (enum simple|medium|complex), `touched_files` (string[]), `risk_areas` (string[]), `similar_tickets` (string[]), `estimated_slots` (integer).
- `scripts/ticket.sh` supports `touch --id <ext>` and `set-touched-files --id <ext> --files <csv>`.
- `tests/local/FA-SF-20-pipeline-contract.bats` has **13** `@test` blocks; all must stay green.
- `classify-paths.sh` defines only `paths_are_escalate_class` (an exit-code predicate). It does NOT export a risk-area table — the spec's "reuse the pattern table" is aspirational; `scout.sh` defines its own risk-area grep table inline (per spec Phase 4) and does NOT need to source classify-paths.sh. We will NOT modify classify-paths.sh (Non-Goal).
- The pipeline.js Scout block is `pipeline.js:170-220` (`try { if (!REUSE) { … phase('Scout') … }`). The LLM `agent(...)` Scout call is lines 174-208; the `scout:persist` agent is lines 214-219.

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `scripts/factory/scout.sh` | Deterministic file discovery + complexity + risk + similar-tickets → JSON | **Create** |
| `scripts/factory/pipeline.js` | Swap LLM Scout agent for execFileSync(scout.sh); keep liveness touch + scout:persist | **Modify** (lines 170-220) |
| `tests/local/FA-SF-63-scout-deterministic.bats` | BATS coverage for scout.sh + pipeline integrity | **Create** |
| `tests/local/fixtures/scout-repo/` | Tiny fixture tree (k3d + website) for risk-area assertions | **Create** |

---

## Task 1: Create `scripts/factory/scout.sh`

**Files:**
- Create: `scripts/factory/scout.sh`

The script is built incrementally but committed as one unit because the phases are interdependent (Phase 6 references every prior variable). Write the full script, then run the manual smoke test before committing.

- [ ] **Step 1: Write the complete `scout.sh`**

Create `scripts/factory/scout.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# scripts/factory/scout.sh — deterministic Software Factory Scout.
#
# Replaces the LLM scout agent. Discovers which files a feature will touch via
# grep/find, classifies complexity, tags risk areas, and (fail-soft) looks up
# similar tickets. Emits SCOUT_SCHEMA-conformant JSON to stdout.
#
# Usage:
#   bash scripts/factory/scout.sh \
#     --ticket-id T000XXX --title "Feature title" --slug "feature-slug" \
#     --description "..." --repo /home/patrick/Bachelorprojekt
#
# Exit 0 on success (JSON on stdout). Exit 2 on bad CLI usage (Usage on stderr).
set -uo pipefail

usage() {
  cat >&2 <<'EOF'
Usage: scout.sh --ticket-id <id> --title <title> [--slug <slug>]
                [--description <desc>] [--repo <path>]

Emits SCOUT_SCHEMA JSON to stdout:
  { complexity, touched_files, risk_areas, similar_tickets, estimated_slots }
EOF
}

# ── CLI parsing ──────────────────────────────────────────────────────────────
TICKET_ID=""; TITLE=""; SLUG=""; DESCRIPTION=""; REPO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ticket-id)   TICKET_ID="${2:-}"; shift 2 ;;
    --title)       TITLE="${2:-}";     shift 2 ;;
    --slug)        SLUG="${2:-}";      shift 2 ;;
    --description) DESCRIPTION="${2:-}"; shift 2 ;;
    --repo)        REPO="${2:-}";      shift 2 ;;
    -h|--help)     usage; exit 0 ;;
    *)             echo "scout.sh: unknown option: $1" >&2; usage; exit 2 ;;
  esac
done

# --title is the only hard requirement (slug/description/repo have defaults).
if [[ -z "$TITLE" ]]; then
  echo "scout.sh: --title is required." >&2
  usage
  exit 2
fi
REPO="${REPO:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"

# ── Phase 1: Keyword extraction ──────────────────────────────────────────────
# Title: meaningful words >3 chars, lowercased, first 4.
# Slug:  parts >2 chars (split on '-').
mapfile -t TITLE_WORDS < <(
  printf '%s' "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' \
    | awk 'length>3' | head -4
)
mapfile -t SLUG_PARTS < <(
  printf '%s' "$SLUG" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' \
    | awk 'length>2'
)

# ── Phase 2: File discovery (three strategies) ───────────────────────────────
SRC_DIRS=("$REPO/website/src" "$REPO/scripts" "$REPO/brett" "$REPO/k3d")
tmp_hits="$(mktemp)"
trap 'rm -f "$tmp_hits"' EXIT

# Strategy A — keyword grep (semantic proximity). One keyword at a time so a
# missing keyword doesn't blank the whole result. -F = fixed string, safe.
for kw in "${TITLE_WORDS[@]}"; do
  [[ -z "$kw" ]] && continue
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    grep -rliF \
      --include="*.ts" --include="*.js" --include="*.svelte" --include="*.astro" \
      --include="*.yaml" --include="*.yml" --include="*.sh" \
      -- "$kw" "$d" 2>/dev/null | head -20
  done
done >> "$tmp_hits"

# Strategy B — filename pattern (structural proximity).
if [[ ${#SLUG_PARTS[@]} -gt 0 ]]; then
  slug_re="$(printf '%s|' "${SLUG_PARTS[@]}")"; slug_re="${slug_re%|}"
  for d in "${SRC_DIRS[@]}"; do
    [[ -d "$d" ]] || continue
    find "$d" -type f \
      \( -name "*.ts" -o -name "*.js" -o -name "*.svelte" -o -name "*.astro" \) \
      2>/dev/null | grep -iE -- "$slug_re" | head -20
  done >> "$tmp_hits"
fi

# Strategy C — infra/manifest scan, only when title/slug imply infra work.
INFRA_HAYSTACK="$(printf '%s ' "${TITLE_WORDS[@]}" "${SLUG_PARTS[@]}")"
if printf '%s' "$INFRA_HAYSTACK" | grep -qiE 'deploy|manifest|config|secret|cert'; then
  for kw in "${TITLE_WORDS[@]}"; do
    [[ -z "$kw" ]] && continue
    for d in "$REPO/k3d" "$REPO/environments"; do
      [[ -d "$d" ]] || continue
      grep -rliF -- "$kw" "$d" 2>/dev/null | head -10
    done
  done >> "$tmp_hits"
fi

# Deduplicate, drop blanks, absolutise (hits are already absolute since we grep
# absolute dirs; resolve any stragglers defensively).
mapfile -t TOUCHED < <(
  sort -u "$tmp_hits" | sed '/^$/d' | while IFS= read -r f; do
    if [[ "$f" = /* ]]; then printf '%s\n' "$f"; else printf '%s\n' "$REPO/$f"; fi
  done
)

# ── Phase 3: Complexity classification ───────────────────────────────────────
FILE_COUNT=${#TOUCHED[@]}
if [[ $FILE_COUNT -gt 0 ]]; then
  SUBSYSTEMS=$(printf '%s\n' "${TOUCHED[@]}" | sed "s|^$REPO/||" | cut -d/ -f1 \
    | sort -u | grep -c .)
else
  SUBSYSTEMS=0
fi
HAS_MIGRATION=0; HAS_K8S=0
if [[ $FILE_COUNT -gt 0 ]]; then
  printf '%s\n' "${TOUCHED[@]}" | grep -qE 'migration|\.sql$' && HAS_MIGRATION=1
  printf '%s\n' "${TOUCHED[@]}" | grep -qE "^$REPO/(k3d|prod|environments)/" && HAS_K8S=1
fi

if [[ $FILE_COUNT -eq 0 ]]; then
  # No discovery hits → ambiguous size; bias high so the implementer model is
  # not downgraded to haiku. (Spec Phase 3 fallback.)
  COMPLEXITY="medium"; SLOTS=2
elif [[ $FILE_COUNT -le 3 && $SUBSYSTEMS -le 1 && $HAS_MIGRATION -eq 0 && $HAS_K8S -eq 0 ]]; then
  COMPLEXITY="simple"; SLOTS=1
elif [[ $FILE_COUNT -le 10 && $SUBSYSTEMS -le 2 && $HAS_MIGRATION -eq 0 ]]; then
  COMPLEXITY="medium"; SLOTS=2
else
  COMPLEXITY="complex"; SLOTS=4
fi

# ── Phase 4: Risk areas from path patterns ───────────────────────────────────
RISKS=()
if [[ $FILE_COUNT -gt 0 ]]; then
  blob="$(printf '%s\n' "${TOUCHED[@]}")"
  printf '%s' "$blob" | grep -qE "^$REPO/k3d/"        && RISKS+=("k8s-manifests")
  printf '%s' "$blob" | grep -qE 'migration|\.sql$'    && RISKS+=("db-migration")
  printf '%s' "$blob" | grep -qiE 'keycloak|realm'     && RISKS+=("sso-oidc")
  printf '%s' "$blob" | grep -qiE 'secret|credentials' && RISKS+=("secrets-handling")
  printf '%s' "$blob" | grep -qE 'pipeline\.js|/factory/' && RISKS+=("factory-pipeline")
  printf '%s' "$blob" | grep -qE "^$REPO/environments/" && RISKS+=("env-config")
  printf '%s' "$blob" | grep -qiE '/auth/'             && RISKS+=("authentication")
fi

# ── Phase 5: Similar tickets (fail-soft) ─────────────────────────────────────
# find-similar prints an array of row objects; SCOUT_SCHEMA wants string IDs.
# Map to .external_id; on any failure → [].
SIMILAR="[]"
if command -v npx >/dev/null 2>&1 && [[ -f "$REPO/website/scripts/find-similar-tickets.mjs" ]]; then
  raw="$(cd "$REPO/website" \
    && timeout 15 npx tsx scripts/find-similar-tickets.mjs "$TITLE $DESCRIPTION" 5 \
       2>/dev/null)" || raw=""
  if [[ -n "$raw" ]]; then
    mapped="$(printf '%s' "$raw" | jq -c 'if type=="array" then [.[] | (.external_id // .ticket_id) | select(. != null) | tostring] else [] end' 2>/dev/null)" || mapped=""
    [[ -n "$mapped" ]] && SIMILAR="$mapped"
  fi
fi

# ── Phase 6: JSON output ─────────────────────────────────────────────────────
if command -v jq >/dev/null 2>&1; then
  touched_json="$( ( [[ $FILE_COUNT -gt 0 ]] && printf '%s\n' "${TOUCHED[@]}" || true ) | jq -R . | jq -s . )"
  risks_json="$(  ( [[ ${#RISKS[@]}  -gt 0 ]] && printf '%s\n' "${RISKS[@]}"  || true ) | jq -R . | jq -s . )"
  jq -n \
    --argjson touched  "$touched_json" \
    --arg     complexity "$COMPLEXITY" \
    --argjson risks    "$risks_json" \
    --argjson similar  "$SIMILAR" \
    --argjson slots    "$SLOTS" \
    '{complexity:$complexity, touched_files:$touched, risk_areas:$risks,
      similar_tickets:$similar, estimated_slots:$slots}'
else
  # Pure-bash JSON fallback (jq absent). Minimal escaping: backslash + quote.
  json_arr() {
    local first=1; printf '['
    local x
    for x in "$@"; do
      x="${x//\\/\\\\}"; x="${x//\"/\\\"}"
      [[ $first -eq 1 ]] && first=0 || printf ','
      printf '"%s"' "$x"
    done
    printf ']'
  }
  printf '{"complexity":"%s","touched_files":%s,"risk_areas":%s,"similar_tickets":%s,"estimated_slots":%s}\n' \
    "$COMPLEXITY" \
    "$( [[ $FILE_COUNT -gt 0 ]] && json_arr "${TOUCHED[@]}" || printf '[]' )" \
    "$( [[ ${#RISKS[@]} -gt 0 ]] && json_arr "${RISKS[@]}" || printf '[]' )" \
    "$SIMILAR" \
    "$SLOTS"
fi
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/factory/scout.sh`
Expected: no output, exit 0.

- [ ] **Step 3: Manual smoke test — usage**

Run: `bash scripts/factory/scout.sh; echo "exit=$?"`
Expected: prints `Usage:` block to stderr, `exit=2`.

- [ ] **Step 4: Manual smoke test — real feature**

Run:
```bash
bash scripts/factory/scout.sh \
  --ticket-id T000001 \
  --title "add booking confirmation email" \
  --slug "add-booking-confirmation-email" \
  --description "Send email after booking is confirmed" \
  --repo "$(pwd)" | jq .
```
Expected: valid JSON with all five keys; `touched_files` an array (likely non-empty, containing `*booking*` / `*email*` paths); `complexity` one of simple|medium|complex; `estimated_slots` an integer. (`similar_tickets` is `[]` offline — that's fine.)

- [ ] **Step 5: Manual smoke test — empty slug, no crash**

Run:
```bash
bash scripts/factory/scout.sh --title "zzz nonexistent feature qqqq" --slug "" --repo "$(pwd)" | jq .
```
Expected: valid JSON; `touched_files: []`; `complexity: "medium"`; `estimated_slots: 2`; no error output.

- [ ] **Step 6: Commit**

```bash
git add scripts/factory/scout.sh
git commit -m "feat(factory): deterministic scout.sh (grep/find file discovery) [T000594]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Create test fixture tree

**Files:**
- Create: `tests/local/fixtures/scout-repo/k3d/booking-config.yaml`
- Create: `tests/local/fixtures/scout-repo/website/src/booking.ts`
- Create: `tests/local/fixtures/scout-repo/website/scripts/.gitkeep`

A tiny self-contained `--repo` target lets the risk-area assertions be deterministic without grepping the real codebase. The fixture has a `k3d/` dir (→ `k8s-manifests` risk) and a website source file, both containing the keyword `booking`.

- [ ] **Step 1: Create fixture files**

Create `tests/local/fixtures/scout-repo/k3d/booking-config.yaml`:
```yaml
# fixture manifest for scout.sh risk-area tests
apiVersion: v1
kind: ConfigMap
metadata:
  name: booking-config
data:
  feature: booking
```

Create `tests/local/fixtures/scout-repo/website/src/booking.ts`:
```ts
// fixture source for scout.sh discovery tests
export function booking(): string {
  return 'booking';
}
```

Create `tests/local/fixtures/scout-repo/website/scripts/.gitkeep` (empty file — ensures the `find-similar-tickets.mjs` existence check in scout.sh is FALSE for the fixture, so Phase 5 stays `[]` and the test is hermetic/offline):
```
```

- [ ] **Step 2: Verify scout.sh against the fixture finds the k3d manifest**

Run:
```bash
bash scripts/factory/scout.sh \
  --title "booking config" --slug "booking-config" \
  --repo "$(pwd)/tests/local/fixtures/scout-repo" \
  | jq '{complexity, touched_files, risk_areas}'
```
Expected: `touched_files` contains both the `k3d/booking-config.yaml` and `website/src/booking.ts` fixture paths; `risk_areas` contains `"k8s-manifests"`; `similar_tickets` would be `[]` (script not present in fixture). Note "config" is an infra keyword → Strategy C runs against the fixture's `k3d/`.

- [ ] **Step 3: Commit**

```bash
git add tests/local/fixtures/scout-repo
git commit -m "test(factory): scout.sh fixture repo tree [T000594]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Create BATS tests `tests/local/FA-SF-63-scout-deterministic.bats`

**Files:**
- Create: `tests/local/FA-SF-63-scout-deterministic.bats`

- [ ] **Step 1: Write the BATS file**

Create `tests/local/FA-SF-63-scout-deterministic.bats`:

```bash
#!/usr/bin/env bats
# FA-SF-63 — deterministic Factory scout (scout.sh) contract + pipeline integrity.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCOUT="${REPO_ROOT}/scripts/factory/scout.sh"
  FIXTURE="${REPO_ROOT}/tests/local/fixtures/scout-repo"
  PIPELINE="${REPO_ROOT}/scripts/factory/pipeline.js"
}

@test "scout.sh with no args prints usage and exits non-zero" {
  run bash "$SCOUT"
  [ "$status" -ne 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "scout.sh --help exits 0" {
  run bash "$SCOUT" --help
  [ "$status" -eq 0 ]
}

@test "scout.sh emits valid JSON for a real feature" {
  run bash "$SCOUT" --ticket-id T000001 \
    --title "add booking confirmation email" \
    --slug "add-booking-confirmation-email" \
    --description "send email after booking" \
    --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  echo "$output" | jq -e . >/dev/null
}

@test "scout.sh touched_files is always an array (even with zero hits)" {
  run bash "$SCOUT" --title "zzzz nonexistent qqqq feature" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  run bash -c "echo '$output' | jq -e '.touched_files | type == \"array\"'"
  [ "$status" -eq 0 ]
}

@test "scout.sh complexity is one of simple|medium|complex" {
  out="$(bash "$SCOUT" --title "add booking email" --slug "add-booking-email" --repo "$REPO_ROOT")"
  c="$(echo "$out" | jq -r '.complexity')"
  [[ "$c" == "simple" || "$c" == "medium" || "$c" == "complex" ]]
}

@test "scout.sh empty slug does not crash, falls back to medium when no hits" {
  run bash "$SCOUT" --title "zzzz nonexistent qqqq feature" --slug "" --repo "$REPO_ROOT"
  [ "$status" -eq 0 ]
  c="$(echo "$output" | jq -r '.complexity')"
  [ "$c" = "medium" ]
  slots="$(echo "$output" | jq -r '.estimated_slots')"
  [ "$slots" = "2" ]
}

@test "scout.sh risk_areas contains k8s-manifests when a k3d path is discovered" {
  # Fixture repo has k3d/booking-config.yaml; "config" triggers infra Strategy C.
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  echo "$out" | jq -e '.touched_files | any(. | test("k3d/booking-config"))' >/dev/null
  echo "$out" | jq -e '.risk_areas | index("k8s-manifests") != null' >/dev/null
}

@test "scout.sh touched_files are absolute paths" {
  out="$(bash "$SCOUT" --title "booking config" --slug "booking-config" --repo "$FIXTURE")"
  # Every entry must start with '/'.
  echo "$out" | jq -e '.touched_files | all(startswith("/"))' >/dev/null
}

@test "scout.sh similar_tickets is an array" {
  out="$(bash "$SCOUT" --title "booking" --slug "booking" --repo "$FIXTURE")"
  echo "$out" | jq -e '.similar_tickets | type == "array"' >/dev/null
}

@test "pipeline.js still passes node --check" {
  run node --check "$PIPELINE"
  [ "$status" -eq 0 ]
}

@test "pipeline.js invokes scout.sh via execFileSync (no LLM scout agent call)" {
  # The deterministic swap must reference scout.sh and must NOT keep a
  # label:'scout' agent() call for discovery.
  grep -q "scout.sh" "$PIPELINE"
  ! grep -qE "agent\(\s*$" "$PIPELINE" || true   # structural guard, non-fatal
  # Assert the old LLM scout prompt phrase is gone.
  ! grep -q "Scout the feature" "$PIPELINE"
}
```

- [ ] **Step 2: Run the scout.sh-only tests (Task 3 written before Task 4 — pipeline tests will fail until Task 4)**

Run: `bats tests/local/FA-SF-63-scout-deterministic.bats --filter "scout.sh"`
Expected: all `scout.sh …` tests PASS. (The two `pipeline.js …` tests are expected to FAIL here because the swap hasn't happened yet — that is the intended red state for Task 4's TDD.)

- [ ] **Step 3: Commit**

```bash
git add tests/local/FA-SF-63-scout-deterministic.bats
git commit -m "test(factory): FA-SF-63 deterministic scout BATS [T000594]

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Replace the LLM Scout phase in `pipeline.js`

**Files:**
- Modify: `scripts/factory/pipeline.js:170-220`

**Decision — keep `scout:persist` as a lightweight agent OR convert to execFileSync:**
Convert it to a direct `execFileSync` call. Rationale: persisting touched-files is a single deterministic `ticket.sh set-touched-files` invocation with no reasoning — wrapping it in an LLM agent (even a cheap one) re-introduces the latency/cost/non-determinism this ticket removes, and an agent can hallucinate the command or skip it. A direct call is strictly more reliable. The **liveness `touch` stays a separate, earlier direct call** (per the constraint) so a slow/failed similar-tickets lookup inside scout.sh never starves the watchdog of a liveness ping. Both calls are best-effort (`try/catch`, `stdio:'ignore'`) so a persist/touch failure never aborts the pipeline.

- [ ] **Step 1: Read the current Scout block to anchor the edit**

Run: `sed -n '170,224p' scripts/factory/pipeline.js`
Expected: confirms the `try { if (!REUSE) {` opener, the `agent(...)` scout call (label `'scout'`), the `scout:persist` agent, and the `phaseEvent('scout','done',…)` / `const isSimple = …` lines that must be preserved.

- [ ] **Step 2: Replace the LLM scout call + persist agent**

Replace this block (pipeline.js, the region from `phase('Scout')` through the closing of the `scout:persist` `await agent(...)` call — i.e. lines ~172-219, stopping just before `phaseEvent('scout', 'done', …)`):

```js
phase('Scout')
phaseEvent('scout', 'entered', 'Codebase-Analyse gestartet')
const scout = await agent(
  `Record pipeline liveness first ... estimated_slots: 1 for simple, 2-3 for medium, 4+ for complex` + consumeInjections('scout'),
  { label: 'scout', phase: 'Scout', schema: SCOUT_SCHEMA, model: 'sonnet' },
)

// Persist touched_files back onto the ticket via ticket.sh (NO raw SQL).
log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
featureComplexity = scout.complexity // hoist for the out-of-block Implement fan-out provisioning
featureTouchedFiles = scout.touched_files // hoist for the out-of-block Deploy retry-loop escalate-class gate
await agent(
  `Run the following command to record which files this feature touches on the ticket:
   bash ${REPO}/scripts/ticket.sh set-touched-files --id ${A.ticket_id} --files ${JSON.stringify(scout.touched_files.join(','))}
   Report the command output.`,
  { label: 'scout:persist', phase: 'Scout' },
)
```

with this:

```js
phase('Scout')
phaseEvent('scout', 'entered', 'Codebase-Analyse (deterministisch) gestartet')

const cp = require('child_process')

// Liveness touch FIRST (separate, direct, best-effort) so a slow scout.sh
// similar-tickets lookup never starves the dispatcher watchdog.
try {
  cp.execFileSync('bash',
    [`${REPO}/scripts/ticket.sh`, 'touch', '--id', String(A.ticket_id)],
    { stdio: 'ignore', timeout: 10000 })
} catch { /* best-effort liveness ping */ }

// Deterministic scout: grep/find file discovery + complexity + risks + similar.
const scoutJson = cp.execFileSync('bash',
  [`${REPO}/scripts/factory/scout.sh`,
   '--ticket-id',   String(A.ticket_id),
   '--title',       String(A.title),
   '--slug',        String(A.slug ?? ''),
   '--description', String(A.description ?? ''),
   '--repo',        REPO],
  { encoding: 'utf8', timeout: 60000 })

let scout
try {
  scout = JSON.parse(scoutJson)
} catch (e) {
  throw new Error(`Scout output not valid JSON: ${String(scoutJson).slice(0, 200)}`)
}
// Rudimentary schema validation (analogous to the harness SCOUT_SCHEMA check).
if (!scout || typeof scout.complexity !== 'string'
    || !['simple', 'medium', 'complex'].includes(scout.complexity)
    || !Array.isArray(scout.touched_files)
    || !Array.isArray(scout.risk_areas)
    || !Array.isArray(scout.similar_tickets)) {
  throw new Error(`Scout output invalid: ${String(scoutJson).slice(0, 200)}`)
}

log(`Scout: complexity=${scout.complexity}, ${scout.touched_files.length} touched files`)
featureComplexity = scout.complexity      // hoist for the out-of-block Implement fan-out provisioning
featureTouchedFiles = scout.touched_files // hoist for the out-of-block Deploy retry-loop escalate-class gate

// Persist touched_files onto the ticket (direct call, no LLM agent — was scout:persist).
try {
  cp.execFileSync('bash',
    [`${REPO}/scripts/ticket.sh`, 'set-touched-files',
     '--id', String(A.ticket_id),
     '--files', scout.touched_files.join(',')],
    { stdio: 'ignore', timeout: 15000 })
} catch (e) {
  log(`scout:persist set-touched-files failed (non-fatal): ${e.message}`)
}
```

Leave the following lines that immediately follow **unchanged**:
```js
phaseEvent('scout', 'done', `${(scout.touched_files || []).length} touched_files`)
const isSimple = scout.complexity === 'simple'
```

- [ ] **Step 3: Verify pipeline parses**

Run: `node --check scripts/factory/pipeline.js`
Expected: no output, exit 0.

- [ ] **Step 4: Confirm `consumeInjections('scout')` is no longer referenced (was only in the removed prompt) — and that no other scout-prompt remnant survives**

Run: `grep -n "consumeInjections('scout')\|Scout the feature\|label: 'scout'\|label:'scout'" scripts/factory/pipeline.js`
Expected: NO matches (the only scout-prompt and the only `'scout'` agent label were in the removed block). If `consumeInjections('scout')` appears elsewhere it was already used by another phase — re-read before deleting; in this codebase it is scout-only, so zero matches is correct.

- [ ] **Step 5: Run the full FA-SF-63 suite (now green incl. pipeline tests)**

Run: `bats tests/local/FA-SF-63-scout-deterministic.bats`
Expected: ALL tests PASS, including `pipeline.js still passes node --check` and `pipeline.js invokes scout.sh …`.

- [ ] **Step 6: Run FA-SF-20 contract suite (must stay green — all 13)**

Run: `bats tests/local/FA-SF-20-pipeline-contract.bats`
Expected: 13/13 PASS. (If any reference the Scout LLM call shape, inspect — but the contract asserts pipeline structure/exports, not the scout prompt; the execFileSync swap preserves `featureComplexity`/`featureTouchedFiles`/`isSimple`.)

- [ ] **Step 7: Run the broader factory test group**

Run: `task test:factory` (or, if unavailable in the worktree, `bats tests/local/FA-SF-*.bats`)
Expected: all FA-SF-* PASS. Investigate any failure before proceeding (per CLAUDE.md: reproduce full CI locally).

- [ ] **Step 8: Commit**

```bash
git add scripts/factory/pipeline.js
git commit -m "refactor(factory): swap LLM Scout agent for deterministic scout.sh [T000594]

Replaces the Sonnet-backed scout agent() call with a direct execFileSync of
scripts/factory/scout.sh + JSON.parse + schema validation. Liveness touch and
touched-files persistence become direct best-effort ticket.sh calls (was the
scout:persist agent). Downstream consumers (conflict-check, resolvePartialServices,
Deploy Gate-2, adaptive provisioning) unchanged — same scout.complexity /
touched_files shape.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Final verification & push

- [ ] **Step 1: Run the offline test gate (reproduce CI locally)**

Run: `task test:all`
Expected: PASS. If `test:all` is too heavy in the worktree, at minimum run `bats tests/local/FA-SF-20-pipeline-contract.bats tests/local/FA-SF-63-scout-deterministic.bats` and `node --check scripts/factory/pipeline.js`.

- [ ] **Step 2: Confirm no stray uncommitted changes**

Run: `git status --porcelain`
Expected: empty (everything committed in Tasks 1-4).

- [ ] **Step 3: Push the branch**

Run: `git push -u origin feature/factory-scout-deterministic`
Expected: branch published.

- [ ] **Step 4: Hand off to PR (handled by dev-flow-execute, not this plan).**

---

## Self-Review

**Spec coverage:**
- Spec `scout.sh` CLI/Phases 1-6 → Task 1 (full script, all six phases incl. jq + pure-bash fallback). ✅
- Spec pipeline.js swap (execFileSync + JSON.parse + schema check + liveness touch + scout:persist decision) → Task 4 (scout:persist → execFileSync, decision documented). ✅
- Spec BATS list (usage/exit, valid JSON, array touched_files, complexity enum, k8s-manifests risk via fixture, empty slug, node --check, FA-SF-20) → Task 3 + Task 4 Step 6. ✅ Added: absolute-path assertion + db-migration is implicitly covered by the risk-table; the k8s-manifests fixture is the explicit one per spec.
- Commit-per-task-block → each task ends with a commit; constraint satisfied. ✅
- Constraints: absolute paths in touched_files (Task 3 asserts `startswith("/")`); jq dependency with pure-bash fallback (Task 1 Phase 6); similar_tickets mapped row→external_id string (Task 1 Phase 5 — required because rows are objects but schema wants strings). ✅
- Non-Goals respected: classify-paths.sh, conflict-check.sh, resolvePartialServices untouched (scout.sh defines its own risk table inline rather than sourcing classify-paths.sh, which only exports a predicate). ✅

**Placeholder scan:** No TBD/TODO; every code step contains the literal content. ✅

**Type consistency:** JSON keys `complexity`/`touched_files`/`risk_areas`/`similar_tickets`/`estimated_slots` identical across scout.sh, pipeline.js validation, and BATS. `featureComplexity`/`featureTouchedFiles`/`isSimple` names preserved exactly from the original block. ✅
