---
title: "health-goals-scan-streamline — Implementation Plan"
ticket_id: T002107
domains: [scripts, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-goals-scan-streamline — Implementation Plan

_Ticket: T002107 · Design: `openspec/changes/health-goals-scan-streamline/design.md` (D1–D4)_

Implements the four design decisions verbatim: D1 format-preserving cell-parser whitelist and
D2 `--drift` mode in `scripts/health-goals-update.sh`; D3 a new `scripts/health-goals-llm-fill.sh`
against the T002102 unified LLM gateway; D4 Taskfile targets + `goals.md` doc + BATS coverage.
`scripts/health-goals-check.sh` stays untouched (471 of 500 lines, only 29 lines of S1 headroom
— Design "Verworfen #2").

## File Structure

```
Changed:
  scripts/health-goals-update.sh                     # D1 whitelist parser + D2 --drift mode
  Taskfile.yml                                        # D4 health:goals:drift + health:goals:llm-fill
  .claude/lib/goals.md                               # D4 Mess-Werkzeug doc (triggers freshness regen)
  tests/spec/health-goals.bats                        # D1/D2/D3 @test blocks (Parent-Spec = health-goals)
  openspec/changes/health-goals-scan-streamline/specs/health-goals.md  # delta: REQ-005/006/007
  website/src/data/test-inventory.json               # regenerated after test additions

New:
  scripts/health-goals-llm-fill.sh                   # D3 LLM candidate fill via gateway (report-only default)
```

### S1 budget (effective threshold − live `wc -l`, per `plan-quality-gates.md`)

| `path` | ist | budget |
| --- | --- | --- |
| `scripts/health-goals-update.sh` | 215 | 285 |

- `scripts/health-goals-llm-fill.sh` — new `.sh` file, S1 limit 500, full 500-line headroom (target
  well under it; single-responsibility script).
- `scripts/health-goals-check.sh` — 471 of 500 lines, only 29 lines of headroom; **not modified**.
- `Taskfile.yml` (`.yml`), `tests/spec/health-goals.bats` (`.bats`) and `.claude/lib/goals.md` (`.md`)
  are not S1-gated extensions — no line budget applies.

### Contracts referenced (from `intel.json`, real symbols only)

- `scripts/health-goals-update.sh::PY-main` — Python heredoc; `row_re` matches
  `| **G-ID** | Ziel | Aktuell | Target | Messung |`; `bare_int_re` (line 108) is today's only accepted
  cell shape; non-matches go to `skipped_format`; rewrite writes `lines[i]` at line 146.
- `scripts/health-goals-update.sh::seams` — env seams: a pre-filled `HG_VALUES_FILE` is used verbatim
  (lines 39–45); `HG_GOALS_FILE` overrides `.claude/lib/goals.md` (line 33). These are the BATS seams.
- `scripts/health-goals-check.sh::row` — appends `"<id> <actual> <cmp> <target>"` to `HG_VALUES_FILE`;
  SKIP goals (`actual="-"`) are never appended → candidate set for llm-fill = generated-IDs minus
  `HG_VALUES_FILE`-IDs.
- `scripts/gen-goals-data.mjs::output` — emits `website/src/lib/goals-data.generated.json`:
  `Array<HealthGoal>` with a parsed `current` for **all** goals incl. Priority A/B (parser SSOT,
  REQ-HEALTH-GOALS-002). This is the join source for D2/D3.
- Unified-LLM-Gateway (T002102) — `POST http://localhost:18235/v1/chat/completions` (OpenAI-compatible),
  `GET /v1/models`; `scripts/llm-proxy/server.mjs` serialises requests per backend and caps `max_tokens`
  — the client needs no own parallelism/budget control.
- `HG_VALUES_FILE` line format — `"<G-ID> <actual:int> <cmp:le|ge|eq> <target:int>"`; only measured
  (non-SKIP) goals appear.

---

## Task 1 — D1: format-preserving cell-parser whitelist (RED → GREEN)

**Files:** `scripts/health-goals-update.sh`, `tests/spec/health-goals.bats`

Extend the Python heredoc so the Priority-C rewrite recognises the whitelist formats from design D1 in
addition to `bare_int_re`, preserving each format on rewrite. Add a per-format matcher that yields both
the old numeric token (for the "no change" short-circuit at line 144) and a rewrite template for the new
Aktuell cell. Representative addition (fenced — illustrative, not the literal diff):

```python
# after bare_int_re (line 108) — ordered whitelist; first match wins.
FMT_MATCHERS = [
    ("bare",    re.compile(r'^\s*([+-]?\d+)\s*(?:✓|⚠)?\s*$'),
                lambda v, m: f"{v} {m}"),
    ("percent", re.compile(r'^\s*([+-]?\d+)\s*%\s*(?:✓|⚠)?\s*$'),
                lambda v, m: f"{v} % {m}"),
    ("exit",    re.compile(r'^\s*Exit\s+([+-]?\d+)\s*(?:✓|⚠)?\s*$'),
                lambda v, m: f"Exit {v} {m}"),
    ("unit",    re.compile(r'^\s*~?\s*([+-]?\d+)\s*([A-Za-zÄÖÜäöü]+)\s*(?:✓|⚠)?\s*$'),
                lambda v, m, u: f"{v} {u} {m}"),          # leading ~ dropped on rewrite
    ("frac",    re.compile(r'^\s*([+-]?\d+)\s*/\s*([+-]?\d+)\s*(?:✓|⚠)?\s*$'),
                lambda v, m, d: f"{v}/{d} {m}"),           # numerator = actual, denom retained
    ("na",      re.compile(r'^\s*n/a\s*(?:✓|⚠)?\s*$'),
                lambda v, m: f"{v} {m}"),                  # backfill once measured
]
# old_val for the "unchanged" short-circuit: the numeric capture group (None for n/a → always writes).
```

Wire it in where `bare_int_re` is used (lines 132–146): iterate `FMT_MATCHERS`; on the first match,
compute `marker` from the existing `le/ge/eq` comparison and build the new Aktuell cell from the
template; if no matcher matches, append to `skipped_format` (unchanged fail-safe). Keep the whole-line
rewrite shape `f"| **{gid}** |{ziel_cell}| {new_aktuell} |{target_cell}|{rest_cell}|\n"`.

**RED step — add failing BATS tests first.** Append to `tests/spec/health-goals.bats` (Parent-Spec is
`health-goals`; do not create a ticket-numbered file). Each test uses the `HG_GOALS_FILE` /
`HG_VALUES_FILE` seams with a tiny fixture:

```bash
# tests/spec/health-goals.bats — D1 whitelist (T002107)
setup_hg() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  UPD="$REPO_ROOT/scripts/health-goals-update.sh"
  WORK="$(mktemp -d)"
  GOALS="$WORK/goals.md"; VALUES="$WORK/values"
}
teardown_hg() { rm -rf "$WORK"; }

@test "health-goals-update D1: percent cell keeps its % suffix (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-PCT01** | Prozent-Gate | 90 % ✓ | 95 | `echo 95` |
MD
  printf 'G-PCT01 95 ge 95\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -E '\| 95 % (✓|⚠) \|' "$GOALS"
  [ "$status" -eq 0 ]
  teardown_hg
}

@test "health-goals-update D1: fraction cell updates numerator, keeps denominator (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-FRC01** | Bruch-Gate | 0/34 ✓ | 0 | `echo 3` |
MD
  printf 'G-FRC01 3 le 0\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -E '\| 3/34 (✓|⚠) \|' "$GOALS"
  [ "$status" -eq 0 ]
  teardown_hg
}

@test "health-goals-update D1: non-whitelisted cell stays fail-safe skipped (T002107)" {
  setup_hg
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-ELT01** | Qualitativ | Elite | 0 | `echo Elite` |
MD
  printf 'G-ELT01 0 le 0\n' > "$VALUES"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" run bash "$UPD"
  [ "$status" -eq 0 ]
  run grep -F 'Elite' "$GOALS"
  [ "$status" -eq 0 ]  # Zelle unverändert — Elite bleibt stehen (skipped_format)
  teardown_hg
}
```

Run them against the current branch — the percent/fraction cells fail `bare_int_re` today and land in
`skipped_format`, so the cell is never rewritten:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
# expected: FAIL (red — the D1 whitelist parser is not yet implemented; percent/fraction rows stay skipped)
```

**GREEN step.** Implement the whitelist matchers above, then re-run the same command — the percent and
fraction assertions now match the rewritten cells and the `Elite` row stays skipped.

## Task 2 — D2: `--drift` read-only report mode

**Files:** `scripts/health-goals-update.sh`

Add a `--drift` flag to the argument loop (alongside `--dry-run`/`--full`/`--suggest-tickets`, lines
25–31). In `--drift` mode:

1. Run the measurement pass as today to populate `HG_VALUES_FILE` (reusing the existing seam so a
   pre-filled fixture file is honoured).
2. Read the documented `current` per goal ID from `website/src/lib/goals-data.generated.json`
   (`jq`/python `json`), NOT by re-parsing `goals.md` — the parser SSOT stays `gen-goals-data.mjs`.
3. Join by goal ID; per goal print `<id>: dokumentiert <current> · gemessen <actual> [DRIFT]` when the
   two diverge, grouped by priority. Always exit `0`; never write `goals.md`.
4. Staleness guard: if `goals-data.generated.json` mtime is older than `.claude/lib/goals.md`, print a
   warning naming the JSON file (mtime compare via `stat`/`[ file1 -ot file2 ]`) instead of joining
   silently.

Gate this behind an early branch so the existing write path is completely bypassed in `--drift` mode
(reuses the measurement + Python join; no change to the D1 write logic).

**BATS coverage.** Append a drift test using the seams plus a fixture generated-JSON:

```bash
@test "health-goals-update D2: --drift reports divergence and never writes goals.md (T002107)" {
  setup_hg
  GEN="$WORK/goals-data.generated.json"
  cat > "$GOALS" <<'MD'
# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-DRF01** | Drift-Gate | 5 ✓ | 0 | `echo 8` |
MD
  printf '[{"id":"G-DRF01","priority":"C","current":"5"}]\n' > "$GEN"
  printf 'G-DRF01 8 le 0\n' > "$VALUES"
  before="$(md5sum "$GOALS")"
  HG_GOALS_FILE="$GOALS" HG_VALUES_FILE="$VALUES" HG_GEN_JSON="$GEN" \
    run bash "$UPD" --drift
  [ "$status" -eq 0 ]
  [[ "$output" == *"G-DRF01"* && "$output" == *"DRIFT"* ]]
  after="$(md5sum "$GOALS")"
  [ "$before" = "$after" ]  # goals.md byte-for-byte unchanged
  teardown_hg
}
```

Add an `HG_GEN_JSON` seam (default `website/src/lib/goals-data.generated.json`) so the test can point at
a fixture, mirroring the existing `HG_GOALS_FILE`/`HG_VALUES_FILE` seam convention. Run the file to
confirm green:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
```

## Task 3 — D3: `scripts/health-goals-llm-fill.sh` (new)

**Files:** `scripts/health-goals-llm-fill.sh`

New script, report-only by default, wired to the T002102 gateway. Structure:

- Arg loop: `--apply`, `--strict`, `--only=ID,ID`, `-h/--help`; `set -euo pipefail`; `cd` to repo root.
- Candidate set: measure once into a temp `HG_VALUES_FILE` (or honour a pre-supplied one via the same
  seam), read IDs from `website/src/lib/goals-data.generated.json`
  (seam `HG_GEN_JSON`), subtract the `HG_VALUES_FILE` IDs → candidates; narrow by `--only` when given.
- Per candidate: one `curl` (with `--max-time`) to
  `${HG_LLM_URL:-http://localhost:18235/v1}/chat/completions`, model `${HG_LLM_MODEL:-bonsai}`, expecting
  strict JSON `{id,value,unit,confidence,evidence,reproducible_cmd_suggestion}`. Parse failure → list the
  goal as `unfillable`, no retry. Prompt context = the goal's `goals.md` section (title, "Was"-paragraph,
  base measurement) from the fixture/SSOT.
- Gateway reachability: a failed connection (curl non-zero) → print a warning and `exit 0`; under
  `--strict` → `exit 1`.
- Output: report to stdout AND to `tmp/claude-scratch/health-goals-llm-fill-<date>.md`.
- `--apply`: write ONLY Priority-C "Aktuell" cells (reuse the same Priority-C row rewrite shape as
  `health-goals-update.sh`), marking the value with an `(LLM)` provenance marker; never Priority-A/B
  text; `confidence < 0.7` → always report-only even under `--apply`.

Orphan-guard (S4): the new script must be reachable from Taskfile — added in Task 4.

**BATS coverage — mock gateway (no real LLM in CI).** Use a one-shot python `http.server` fixture bound
to a localhost port and point `HG_LLM_URL` at it:

```bash
@test "health-goals-llm-fill D3: candidate set = generated-IDs minus measured-IDs (T002107)" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FILL="$REPO_ROOT/scripts/health-goals-llm-fill.sh"
  WORK="$(mktemp -d)"; GEN="$WORK/gen.json"; VALUES="$WORK/values"
  printf '[{"id":"G-A","priority":"C","current":"0"},{"id":"G-B","priority":"C","current":"0"}]\n' > "$GEN"
  printf 'G-A 0 le 0\n' > "$VALUES"   # only G-A measured → candidate = {G-B}
  # mock gateway: closed port → default exit 0 with warning (candidates still listed)
  HG_GEN_JSON="$GEN" HG_VALUES_FILE="$VALUES" HG_LLM_URL="http://127.0.0.1:1/v1" \
    run bash "$FILL"
  [ "$status" -eq 0 ]
  [[ "$output" == *"G-B"* ]]
  [[ "$output" != *"G-A"* ]] || [[ "$output" == *"G-B"* ]]
  rm -rf "$WORK"
}

@test "health-goals-llm-fill D3: unreachable gateway exits 1 under --strict (T002107)" {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FILL="$REPO_ROOT/scripts/health-goals-llm-fill.sh"
  WORK="$(mktemp -d)"; GEN="$WORK/gen.json"; VALUES="$WORK/values"
  printf '[{"id":"G-B","priority":"C","current":"0"}]\n' > "$GEN"
  printf 'G-A 0 le 0\n' > "$VALUES"
  HG_GEN_JSON="$GEN" HG_VALUES_FILE="$VALUES" HG_LLM_URL="http://127.0.0.1:1/v1" \
    run bash "$FILL" --strict
  [ "$status" -eq 1 ]
  rm -rf "$WORK"
}
```

Run the file:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
```

## Task 4 — D4: wiring (Taskfile targets + goals.md doc)

**Files:** `Taskfile.yml`, `.claude/lib/goals.md`

Taskfile — add two targets next to `health:goals:update` (Taskfile.yml:3225–3235), each passing
`{{.CLI_ARGS}}` through exactly like the existing target:

```yaml
  health:goals:drift:
    desc: "Read-only Drift-Report: dokumentierte current-Werte (goals-data.generated.json) vs. frische Messung. Kein Schreiben. Flags nach --."
    cmds:
      - bash scripts/health-goals-update.sh --drift {{.CLI_ARGS}}

  health:goals:llm-fill:
    desc: "LLM-gestützter Fill für deterministisch nicht abgedeckte Ziele via T002102-Gateway. Default report-only; --apply schreibt nur Prio-C-Aktuell mit (LLM)-Marker. Flags nach --."
    cmds:
      - bash scripts/health-goals-llm-fill.sh {{.CLI_ARGS}}
```

`goals.md` — extend the `# Mess-Werkzeug {#mess-werkzeug}` section (line 431) with both commands:

```bash
bash scripts/health-goals-update.sh --drift        # Drift-Report dokumentiert vs. gemessen
bash scripts/health-goals-llm-fill.sh              # LLM-Fill (report-only) für nicht abgedeckte Ziele
bash scripts/health-goals-llm-fill.sh --apply      # schreibt Prio-C-Aktuell mit (LLM)-Marker
```

Editing `.claude/lib/goals.md` invalidates `website/src/lib/goals-data.generated.json`
(REQ-HEALTH-GOALS-003 freshness gate) — the regeneration is run in Task 5 via `task freshness:regenerate`
before `task freshness:check`. Confirm the two new targets resolve:

```bash
bash scripts/vda.sh oracle 'run health goals drift report' --dry-run
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals.bats
```

## Task 5 — Final Verification

**Files:** `website/src/data/test-inventory.json` (regenerated), `openspec/changes/health-goals-scan-streamline/specs/health-goals.md`

Because `tests/spec/health-goals.bats` gained new `@test` blocks, regenerate and commit the test
inventory, then run the mandatory CI gates. Also validate the OpenSpec delta.

```bash
# 1. test inventory (CI fails if goals-data drifts from the committed file)
task test:inventory
git add website/src/data/test-inventory.json

# 2. OpenSpec delta validation (REQ-005/006/007 well-formed)
bash scripts/openspec.sh validate

# 3. plan-lint self-gate
bash scripts/plan-lint.sh openspec/changes/health-goals-scan-streamline/tasks.md

# 4. mandatory CI gates
task test:changed
task freshness:regenerate
task freshness:check
```

All four must be green before opening the PR. `task freshness:regenerate` re-emits
`website/src/lib/goals-data.generated.json` from the edited `.claude/lib/goals.md` so
`task freshness:check` (REQ-HEALTH-GOALS-003 + S1–S4 ratchet) passes; commit any regenerated artifacts
alongside the code.
