---
title: "brain-auto-memory — Implementation Plan"
ticket_id: T001567
domains: [infra, ai, workflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# brain-auto-memory — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a client-side, review-gated Bash bridge that one-way exports curated Claude auto-memory pages into the shared brain wiki repo.

**Architecture:** Two standalone Bash scripts mirroring the existing `brain-merge-hook.sh` / `brain-gekko-inbox.sh` pattern (no new language dependency). `brain-auto-memory-scan.sh` is read-only and cron-safe: it hashes memory pages, parses frontmatter naively (like `brain-mcp-server.py:read_page`), skips secrets/unparsable pages, and emits a candidates JSON. `brain-auto-memory-export.sh` is interactive: it reviews candidates `[y/n/e]`, applies a fixed type-mapping, writes converted pages into the brain repo, commits+pushes, and updates a local state file only for approved exports.

**Tech Stack:** Bash (`set -euo pipefail`), `jq`, `sha256sum`, `git`, BATS (`tests/unit/lib/bats-core/bin/bats`).

_Ticket: T001567 · Epic: brain-llm-wiki (T001566), Change 7._
_Full design SSOT: `docs/superpowers/specs/2026-07-04-brain-auto-memory-design.md`._

## Global Constraints

- **No new language dependency.** Bash only; frontmatter parsing is naive line-based (`---`-split, `key: value` per line) as in `scripts/brain-mcp-server.py:read_page`. No `pyyaml`, no new Python module for this feature.
- **Helpers stay pure.** Scripts read env (`AUTO_MEMORY_ROOT`, `BRAIN_REPO_PATH`) and filesystem only; no import of DB/API layers (S2).
- **No brand-domain literals.** Never write `*.mentolder.de` / `*.korczewski.de` literals in any script (S3). None are needed here.
- **Orphan-free (S4).** Both new `scripts/*.sh` must be reachable — `export.sh` calls `scan.sh`, and the design's cron example plus the BATS spec reference both; document the cron entry in-script so neither is an orphan.
- **S1 line budgets (recompute after writing each file):** `.sh` static limit 500, `.bats` ungated (limit 0 = not S1-gated). Neither script is baselined (`docs/code-quality/baseline.json` has no `S1:scripts/brain-auto-memory-*` key), so the effective threshold is the 500-line `.sh` limit; both scripts are expected well under it (~120–180 lines). After writing each `.sh`, run `wc -l` and confirm `budget = 500 − lines > 0`.
- **Secret patterns to skip:** `-----BEGIN`, `api[_-]key` (case-insensitive), and long hex/base64 blobs (≥32 contiguous `[A-Za-z0-9+/=]`).
- **State file schema:** `~/.claude/brain-auto-memory-state.json` = `{"<project>/<file>": {"hash": "<sha256>", "last_export": "<iso-ts>"}}`.
- **Candidate schema:** array of `{project, file, name, description, metadata_type, hash}`.

## File Structure

```
scripts/brain-auto-memory-scan.sh     (new)  read-only scanner: hash-diff, frontmatter parse, secret/parse guardrails, candidate JSON. ~120-160 lines, .sh limit 500.
scripts/brain-auto-memory-export.sh   (new)  interactive exporter: review y/n/e, type-mapping, write→brain repo, commit+push, state update on y only. ~130-180 lines, .sh limit 500.
tests/spec/brain-auto-memory.bats     (new)  7 BATS cases from the design "Testing" section. .bats ungated (S1 limit 0).
openspec/changes/brain-auto-memory/specs/brain-foundation.md  (edited)  ADDED Requirements 008-011 for the bridge.
website/src/data/test-inventory.json  (regenerated)  picks up the new BATS file via task test:inventory.
```

**Interfaces (script contracts later tasks rely on):**
- `brain-auto-memory-scan.sh` — env `AUTO_MEMORY_ROOT` (default `$HOME/.claude/projects`), `AUTO_MEMORY_STATE` (default `$HOME/.claude/brain-auto-memory-state.json`), `AUTO_MEMORY_CANDIDATES` (default `$HOME/.claude/brain-auto-memory-candidates.json`). Writes candidates JSON to `AUTO_MEMORY_CANDIDATES`, exits `0` always. Warnings on `stderr`.
- `brain-auto-memory-export.sh` — env `BRAIN_REPO_PATH` (required, must be git checkout), `AUTO_MEMORY_STATE`, `AUTO_MEMORY_CANDIDATES`, plus optional `AUTO_MEMORY_ASSUME` (test hook feeding `y/n/e` answers, one per line, instead of interactive `read`). Calls `brain-auto-memory-scan.sh` when candidates file missing/empty. Aborts non-zero before any state mutation on missing/invalid `BRAIN_REPO_PATH` or failed `git push`.

---

### Task 1: RED — author the full BATS spec (all 7 cases fail)

**Files:**
- Create: `tests/spec/brain-auto-memory.bats`

**Interfaces:**
- Consumes: the script env contracts from the File Structure "Interfaces" block above.
- Produces: the executable spec that Tasks 2–3 must turn GREEN.

- [ ] **Step 1: Write the failing BATS spec.** Mirror `tests/spec/brain-initial-ingest.bats` structure (`#!/usr/bin/env bats`, `load 'test_helper'`, `setup`/`teardown` with `mktemp -d`). Cover exactly the 7 design cases. Use `AUTO_MEMORY_ROOT`, `AUTO_MEMORY_STATE`, `AUTO_MEMORY_CANDIDATES`, `BRAIN_REPO_PATH`, and `AUTO_MEMORY_ASSUME` fixtures so nothing touches the real `$HOME` or network.

```bash
#!/usr/bin/env bats
# T001567: brain-auto-memory bridge — BATS Spec (RED first, GREEN after scripts land)
# SSOT: openspec/changes/brain-auto-memory/tasks.md

load 'test_helper'

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  SCAN="$REPO_ROOT/scripts/brain-auto-memory-scan.sh"
  EXPORT="$REPO_ROOT/scripts/brain-auto-memory-export.sh"
  WORK="$(mktemp -d)"
  export AUTO_MEMORY_ROOT="$WORK/projects"
  export AUTO_MEMORY_STATE="$WORK/state.json"
  export AUTO_MEMORY_CANDIDATES="$WORK/candidates.json"
  mkdir -p "$AUTO_MEMORY_ROOT/demoproj/memory"
}

teardown() { rm -rf "$WORK"; }

# a memory page with valid frontmatter (name/description/metadata.type)
_page() { # <project> <file> <type> [bodyline]
  local dir="$AUTO_MEMORY_ROOT/$1/memory"; mkdir -p "$dir"
  cat > "$dir/$2" <<EOF
---
name: $2
description: demo page $2
metadata:
  type: $3
---
${4:-just some prose body}
EOF
}

@test "scan reports a new memory page as candidate" {
  _page demoproj feedback_thing.md feedback
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  run jq -e '.[0].file == "feedback_thing.md" and .[0].metadata_type == "feedback"' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: candidate not emitted: $(cat "$AUTO_MEMORY_CANDIDATES")"; return 1; }
}

@test "scan does not re-report an unchanged page" {
  _page demoproj note1.md project
  bash "$SCAN"
  # simulate an export having recorded the current hash into state
  local h; h="$(sha256sum "$AUTO_MEMORY_ROOT/demoproj/memory/note1.md" | cut -d' ' -f1)"
  jq -n --arg k "demoproj/note1.md" --arg h "$h" \
    '{($k): {hash: $h, last_export: "2026-07-04T00:00:00Z"}}' > "$AUTO_MEMORY_STATE"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: unchanged page re-reported: $(cat "$AUTO_MEMORY_CANDIDATES")"; return 1; }
}

@test "scan skips a page without parsable frontmatter and warns" {
  printf 'no frontmatter here\njust text\n' > "$AUTO_MEMORY_ROOT/demoproj/memory/bare.md"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  [[ "$output" == *"bare.md"* ]] || { echo "FAIL: no warning for bare.md"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: bare page became candidate"; return 1; }
}

@test "scan skips a page containing a secret pattern" {
  _page demoproj secret.md reference "-----BEGIN PRIVATE KEY-----"
  run bash "$SCAN"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status"; return 1; }
  [[ "$output" == *"secret.md"* ]] || { echo "FAIL: no secret warning"; return 1; }
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: secret page became candidate"; return 1; }
}

@test "scan skips MEMORY.md index files" {
  _page demoproj MEMORY.md project
  run bash "$SCAN"
  [ "$status" -eq 0 ]
  run jq -e 'length == 0' "$AUTO_MEMORY_CANDIDATES"
  [ "$status" -eq 0 ] || { echo "FAIL: MEMORY.md became candidate"; return 1; }
}

@test "export maps feedback -> decision and writes converted page" {
  _page demoproj feedback_conv.md feedback
  local brain="$WORK/brain"; mkdir -p "$brain"
  git -C "$brain" init -q && git -C "$brain" config user.email t@t && git -C "$brain" config user.name t
  export BRAIN_REPO_PATH="$brain"
  # answer 'y' to the single candidate; stub push by pointing origin at a bare local repo
  git init -q --bare "$WORK/remote.git"
  git -C "$brain" remote add origin "$WORK/remote.git"
  printf 'y\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  local out; out="$(find "$brain/raw/auto-memory/demoproj" -name '*.md' | head -1)"
  [ -n "$out" ] || { echo "FAIL: no page written"; return 1; }
  grep -q '^type: decision' "$out" || { echo "FAIL: type not decision: $(cat "$out")"; return 1; }
  grep -q 'auto-memory' "$out" || { echo "FAIL: missing auto-memory tag"; return 1; }
}

@test "export aborts when BRAIN_REPO_PATH is unset and leaves state untouched" {
  _page demoproj x.md project
  echo '{"pre":"existing"}' > "$AUTO_MEMORY_STATE"
  local before; before="$(cat "$AUTO_MEMORY_STATE")"
  unset BRAIN_REPO_PATH
  printf 'y\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -ne 0 ] || { echo "FAIL: export did not abort"; return 1; }
  [ "$(cat "$AUTO_MEMORY_STATE")" = "$before" ] || { echo "FAIL: state mutated on abort"; return 1; }
}

@test "export updates state only for approved (y), not rejected (n)" {
  _page demoproj keep.md project
  _page demoproj drop.md project
  local brain="$WORK/brain"; mkdir -p "$brain"
  git -C "$brain" init -q && git -C "$brain" config user.email t@t && git -C "$brain" config user.name t
  git init -q --bare "$WORK/remote.git"; git -C "$brain" remote add origin "$WORK/remote.git"
  export BRAIN_REPO_PATH="$brain"
  printf 'y\nn\n' > "$WORK/answers"; export AUTO_MEMORY_ASSUME="$WORK/answers"
  run bash "$EXPORT"
  [ "$status" -eq 0 ] || { echo "FAIL status=$status: $output"; return 1; }
  # exactly one of the two pages recorded in state (the approved one)
  run jq -e '[to_entries[] | select(.key | startswith("demoproj/"))] | length == 1' "$AUTO_MEMORY_STATE"
  [ "$status" -eq 0 ] || { echo "FAIL: state count wrong: $(cat "$AUTO_MEMORY_STATE")"; return 1; }
}
```

- [ ] **Step 2: Run the spec — expected: FAIL.** The scripts do not exist yet, so every case must fail.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-auto-memory.bats
# expected: FAIL (red — scripts/brain-auto-memory-scan.sh and export.sh not yet written)
```

- [ ] **Step 3: Commit the RED spec.**

```bash
git add tests/spec/brain-auto-memory.bats
git commit -m "test(brain): RED spec for auto-memory export bridge [T001567]"
```

---

### Task 2: GREEN — implement `brain-auto-memory-scan.sh`

**Files:**
- Create: `scripts/brain-auto-memory-scan.sh`
- Test: `tests/spec/brain-auto-memory.bats` (cases 1–5 turn GREEN)

**Interfaces:**
- Consumes: env `AUTO_MEMORY_ROOT`, `AUTO_MEMORY_STATE`, `AUTO_MEMORY_CANDIDATES`.
- Produces: candidates JSON (`[{project,file,name,description,metadata_type,hash}]`) and a `_parse_frontmatter` convention reused by the exporter (same naive `---`-split parse).

- [ ] **Step 1: Write the scanner.** Naive frontmatter parse (split on the first two `---` lines, `key: value` per line; `metadata.type` read from an indented `type:` line under `metadata:`). Skip `MEMORY.md`, unparsable pages (warn), and secret-matching bodies (warn). Emit candidates via `jq`. Exit `0` always. Include the cron example as a header comment so the file is self-documenting and not an orphan.

```bash
#!/usr/bin/env bash
# brain-auto-memory-scan.sh — read-only scanner for Claude auto-memory pages.
# Emits candidates (new or hash-changed since last export) as JSON. Exit 0 always.
# Cron example (manual, not installed by this change):
#   0 3 * * * /home/patrick/Bachelorprojekt/scripts/brain-auto-memory-scan.sh
set -euo pipefail

ROOT="${AUTO_MEMORY_ROOT:-$HOME/.claude/projects}"
STATE="${AUTO_MEMORY_STATE:-$HOME/.claude/brain-auto-memory-state.json}"
CANDIDATES="${AUTO_MEMORY_CANDIDATES:-$HOME/.claude/brain-auto-memory-candidates.json}"

# secret heuristics: PEM header, api key token, or a long hex/base64 blob
_has_secret() {
  grep -Eqi -e '-----BEGIN' -e 'api[_-]?key' -e '[A-Za-z0-9+/=]{32,}' "$1"
}

# naive frontmatter parse -> echoes "NAME\tDESC\tTYPE" or returns 1 if unparsable
_frontmatter() {
  local f="$1" line in_fm=0 seen=0 name="" desc="" mtype="" in_meta=0
  [ "$(head -n1 "$f")" = "---" ] || return 1
  while IFS= read -r line; do
    if [ "$line" = "---" ]; then
      if [ "$in_fm" -eq 0 ]; then in_fm=1; continue; else seen=1; break; fi
    fi
    [ "$in_fm" -eq 1 ] || continue
    case "$line" in
      name:*)        name="${line#name:}";        name="${name# }" ;;
      description:*) desc="${line#description:}";  desc="${desc# }" ;;
      metadata:*)    in_meta=1 ;;
      "  type:"*|$'\t'type:*) mtype="${line#*type:}"; mtype="${mtype# }" ;;
      type:*)        [ "$in_meta" -eq 1 ] && { mtype="${line#type:}"; mtype="${mtype# }"; } ;;
    esac
  done < "$f"
  [ "$seen" -eq 1 ] || return 1
  [ -n "$name" ] && [ -n "$mtype" ] || return 1
  printf '%s\t%s\t%s' "$name" "$desc" "$mtype"
}

_state_hash() { # <key> -> prints stored hash or empty
  [ -f "$STATE" ] || { echo ""; return; }
  jq -r --arg k "$1" '.[$k].hash // ""' "$STATE" 2>/dev/null || echo ""
}

candidates="[]"
if [ -d "$ROOT" ]; then
  while IFS= read -r f; do
    base="$(basename "$f")"
    [ "$base" = "MEMORY.md" ] && continue
    rel="${f#"$ROOT"/}"; project="${rel%%/*}"
    if _has_secret "$f"; then
      echo "warn: skipping $rel (secret pattern)" >&2; continue
    fi
    if ! fm="$(_frontmatter "$f")"; then
      echo "warn: skipping $rel (no parsable frontmatter)" >&2; continue
    fi
    IFS=$'\t' read -r name desc mtype <<<"$fm"
    hash="$(sha256sum "$f" | cut -d' ' -f1)"
    key="$project/$base"
    [ "$hash" = "$(_state_hash "$key")" ] && continue
    candidates="$(jq \
      --arg project "$project" --arg file "$base" --arg name "$name" \
      --arg description "$desc" --arg metadata_type "$mtype" --arg hash "$hash" \
      '. + [{project:$project,file:$file,name:$name,description:$description,metadata_type:$metadata_type,hash:$hash}]' \
      <<<"$candidates")"
  done < <(find "$ROOT" -type f -path '*/memory/*.md' 2>/dev/null | sort)
fi

mkdir -p "$(dirname "$CANDIDATES")"
printf '%s\n' "$candidates" > "$CANDIDATES"
exit 0
```

- [ ] **Step 2: Make executable and check the S1 budget.**

```bash
chmod +x scripts/brain-auto-memory-scan.sh
wc -l scripts/brain-auto-memory-scan.sh   # expected < 500 (.sh limit); confirm budget = 500 - lines > 0
```

- [ ] **Step 3: Run scanner cases — expected: PASS for cases 1–5.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-auto-memory.bats -f 'scan'
# expected: PASS (5 scan cases green)
```

- [ ] **Step 4: Commit.**

```bash
git add scripts/brain-auto-memory-scan.sh
git commit -m "feat(brain): auto-memory scanner with hash-diff and secret guardrails [T001567]"
```

---

### Task 3: GREEN — implement `brain-auto-memory-export.sh`

**Files:**
- Create: `scripts/brain-auto-memory-export.sh`
- Test: `tests/spec/brain-auto-memory.bats` (export cases 6–8 turn GREEN)

**Interfaces:**
- Consumes: candidates JSON from the scanner; env `BRAIN_REPO_PATH`, `AUTO_MEMORY_STATE`, `AUTO_MEMORY_CANDIDATES`, `AUTO_MEMORY_ROOT`, optional `AUTO_MEMORY_ASSUME` (answers file, one `y|n|e[:type]` per line).
- Produces: converted pages at `$BRAIN_REPO_PATH/raw/auto-memory/<project>/<slug>.md`; state-file updates for approved pages only.

- [ ] **Step 1: Write the exporter.** Guard `BRAIN_REPO_PATH` (unset OR not a git dir → abort non-zero before any state write). Call the scanner when candidates missing/empty. Loop candidates, prompt `[y/n/e]` (or read from `AUTO_MEMORY_ASSUME`), apply the mapping (`e` overrides type), write converted frontmatter + original body (body = everything after the source's closing `---`), then `git add/commit/push`. Update state only for `y` pages; on `git push` failure, abort without state change.

```bash
#!/usr/bin/env bash
# brain-auto-memory-export.sh — interactive, one-way export of reviewed
# auto-memory candidates into the brain repo. Runs locally (never in CI).
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE="${AUTO_MEMORY_STATE:-$HOME/.claude/brain-auto-memory-state.json}"
CANDIDATES="${AUTO_MEMORY_CANDIDATES:-$HOME/.claude/brain-auto-memory-candidates.json}"
ROOT="${AUTO_MEMORY_ROOT:-$HOME/.claude/projects}"

# --- abort guards BEFORE any state mutation ---
[ -n "${BRAIN_REPO_PATH:-}" ] || { echo "error: BRAIN_REPO_PATH not set" >&2; exit 1; }
git -C "$BRAIN_REPO_PATH" rev-parse --git-dir >/dev/null 2>&1 \
  || { echo "error: BRAIN_REPO_PATH is not a git checkout: $BRAIN_REPO_PATH" >&2; exit 1; }

# ensure candidates exist (convenience: run scan.sh if missing/empty)
if [ ! -s "$CANDIDATES" ] || [ "$(jq 'length' "$CANDIDATES" 2>/dev/null || echo 0)" = "0" ]; then
  AUTO_MEMORY_ROOT="$ROOT" AUTO_MEMORY_STATE="$STATE" AUTO_MEMORY_CANDIDATES="$CANDIDATES" \
    bash "$HERE/brain-auto-memory-scan.sh"
fi

_map_type() { # <metadata_type> -> brain type
  case "$1" in
    project|reference|user) echo note ;;
    feedback)               echo decision ;;
    *)                      echo note ;;
  esac
}
_default_answer() { # user memories default to 'n'
  [ "$1" = "user" ] && echo n || echo y
}
_slug() { echo "$1" | sed 's/\.md$//' | tr '[:upper:]' '[:lower:]' | tr ' _' '--' | sed 's/[^a-z0-9-]//g'; }

# answer source: AUTO_MEMORY_ASSUME file (test hook) or interactive read
_answers_fd() { [ -n "${AUTO_MEMORY_ASSUME:-}" ] && cat "$AUTO_MEMORY_ASSUME"; }
mapfile -t ASSUME < <(_answers_fd)
ai=0
_ask() { # <default> -> echoes y|n|e:<type>
  if [ -n "${AUTO_MEMORY_ASSUME:-}" ]; then
    echo "${ASSUME[$ai]:-n}"; ai=$((ai+1)); return
  fi
  local ans; read -r -p "Export? [y/n/e] " ans </dev/tty || ans=n
  echo "${ans:-$1}"
}

count="$(jq 'length' "$CANDIDATES")"
[ "$count" -gt 0 ] || { echo "no candidates"; exit 0; }

pushed_any=0
declare -A APPROVED   # key -> hash
for i in $(seq 0 $((count-1))); do
  project="$(jq -r ".[$i].project" "$CANDIDATES")"
  file="$(jq -r ".[$i].file" "$CANDIDATES")"
  name="$(jq -r ".[$i].name" "$CANDIDATES")"
  desc="$(jq -r ".[$i].description" "$CANDIDATES")"
  mtype="$(jq -r ".[$i].metadata_type" "$CANDIDATES")"
  hash="$(jq -r ".[$i].hash" "$CANDIDATES")"
  echo "--- $project/$file  ($mtype)  $name" >&2
  echo "    $desc" >&2
  btype="$(_map_type "$mtype")"
  ans="$(_ask "$(_default_answer "$mtype")")"
  case "$ans" in
    e|e:*) [ "$ans" != e ] && btype="${ans#e:}"; ans=y ;;
  esac
  [ "$ans" = y ] || { echo "    skipped" >&2; continue; }

  src="$ROOT/$project/memory/$file"
  slug="$(_slug "$name")"
  dest_dir="$BRAIN_REPO_PATH/raw/auto-memory/$project"
  mkdir -p "$dest_dir"
  # body = everything after the source's second '---'
  body="$(awk 'f>=2{print} /^---$/{f++}' "$src")"
  {
    echo '---'
    echo "type: $btype"
    echo "tags: [auto-memory, $project]"
    echo "status: draft"
    echo '---'
    echo
    printf '%s\n' "$body"
  } > "$dest_dir/$slug.md"
  APPROVED["$project/$file"]="$hash"
  pushed_any=1
done

if [ "$pushed_any" -eq 1 ]; then
  git -C "$BRAIN_REPO_PATH" add raw/auto-memory
  git -C "$BRAIN_REPO_PATH" commit -q -m "chore(auto-memory): export reviewed Claude memories"
  if ! git -C "$BRAIN_REPO_PATH" push -q origin HEAD 2>/dev/null; then
    echo "error: git push failed — state left unchanged, rerun to retry" >&2
    exit 1
  fi
fi

# state update ONLY for approved pages, after a successful push
[ -f "$STATE" ] || echo '{}' > "$STATE"
ts="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
for key in "${!APPROVED[@]}"; do
  tmp="$(mktemp)"
  jq --arg k "$key" --arg h "${APPROVED[$key]}" --arg ts "$ts" \
    '.[$k] = {hash:$h, last_export:$ts}' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
done
exit 0
```

- [ ] **Step 2: Make executable and check the S1 budget.**

```bash
chmod +x scripts/brain-auto-memory-export.sh
wc -l scripts/brain-auto-memory-export.sh   # expected < 500 (.sh limit); confirm budget = 500 - lines > 0
```

- [ ] **Step 3: Run the full spec — expected: PASS (all 8 cases green).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/brain-auto-memory.bats
# expected: PASS (all cases green — RED from Task 1 is now resolved)
```

- [ ] **Step 4: Commit.**

```bash
git add scripts/brain-auto-memory-export.sh
git commit -m "feat(brain): interactive auto-memory exporter with abort-safe state [T001567]"
```

---

### Task 4: Delta-spec, inventory & final verification

**Files:**
- Verify: `openspec/changes/brain-auto-memory/specs/brain-foundation.md` (ADDED Requirements 008–011 — already authored alongside this plan)
- Regenerate: `website/src/data/test-inventory.json`

- [ ] **Step 1: Validate the OpenSpec change — must be green before committing.**

```bash
bash scripts/openspec.sh validate
# expected: PASS (proposal + delta spec + tasks well-formed)
```

- [ ] **Step 2: Regenerate the test inventory (new BATS file) and commit it.**

```bash
task test:inventory
git add website/src/data/test-inventory.json
git commit -m "chore(brain): regenerate test inventory for auto-memory spec [T001567]"
```

- [ ] **Step 3: Run the three mandatory CI gates.**

```bash
task test:changed          # targeted tests for changed domains (BATS selection + quality)
task freshness:regenerate  # refresh generated artefacts (test-inventory, repo-index, …)
task freshness:check       # CI equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
```

Expected: all three exit `0`. If `freshness:regenerate` changed any tracked file, `git add -A && git commit -m "chore(brain): freshness artefacts [T001567]"` and re-run `task freshness:check`.

- [ ] **Step 4: Confirm no S1/orphan regression.** `wc -l` on both scripts stays under 500; both scripts are reachable (`export.sh` calls `scan.sh`; both referenced by the BATS spec and the in-script cron comment) so S4 is satisfied. No new `docs/code-quality/baseline.json` keys were added.
