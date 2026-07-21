#!/usr/bin/env bats
# tests/spec/agentic-trends-radar.bats
# SSOT: openspec/specs/agentic-trends-radar.md
#
# Covers: Trend-radar workflow — 5-angle sweep, consolidation, SDLC-fit verdict.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  WORKFLOW="$REPO/.claude/workflows/agentic-trends-radar.js"
}

# ── File structure ─────────────────────────────────────────────────────

@test "agentic-trends-radar: workflow file exists" {
  [ -f "$WORKFLOW" ]
}

@test "agentic-trends-radar: workflow file is non-empty JavaScript" {
  run grep -q "export const meta" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

# ── Meta export ────────────────────────────────────────────────────────

@test "agentic-trends-radar: exports meta object with name" {
  run grep -q "name: 'agentic-trends-radar'" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

@test "agentic-trends-radar: meta contains description and whenToUse" {
  run grep -q "description:" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "whenToUse:" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

# ── Phase definitions ──────────────────────────────────────────────────

@test "agentic-trends-radar: defines 4 phases" {
  run grep -c "title:" "$WORKFLOW"
  [ "$status" -eq 0 ]
  [[ "$output" -ge 4 ]]
}

@test "agentic-trends-radar: phases include Sweep, Konsolidieren, Bewerten, Synthese" {
  run grep -q "Sweep" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "Konsolidieren" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "Bewerten" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "Synthese" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

# ── Sweep angles ───────────────────────────────────────────────────────

@test "agentic-trends-radar: defines 5 sweep angles in ANGLES array" {
  run grep -c "key:" "$WORKFLOW"
  [ "$status" -eq 0 ]
  [[ "$output" -ge 5 ]]
}

@test "agentic-trends-radar: angles include vendor, research, community, oss, practices" {
  for angle in vendor research community oss practices; do
    run grep -q "'$angle'" "$WORKFLOW"
    [ "$status" -eq 0 ]
  done
}

# ── Schema contracts ───────────────────────────────────────────────────

@test "agentic-trends-radar: TRENDS_SCHEMA requires name, summary, sources, momentum" {
  for field in name summary sources momentum; do
    run grep -q "$field" "$WORKFLOW"
    [ "$status" -eq 0 ]
  done
}

@test "agentic-trends-radar: VERDICT_SCHEMA enum includes adopt/trial/hold/skip" {
  run grep -q "'adopt'" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "'trial'" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "'hold'" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "'skip'" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

@test "agentic-trends-radar: VERDICT_SCHEMA requires borrow_what, effort, risks" {
  for field in borrow_what effort risks; do
    run grep -q "$field" "$WORKFLOW"
    [ "$status" -eq 0 ]
  done
}

@test "agentic-trends-radar: MERGED_SCHEMA limits trends to maxItems 10" {
  run grep -q "maxItems: 10" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

# ── SDLC self-description ──────────────────────────────────────────────

@test "agentic-trends-radar: OUR_SDLC constant exists" {
  run grep -q "OUR_SDLC" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

@test "agentic-trends-radar: OUR_SDLC mentions OpenSpec and dev-flow" {
  run grep -q "OpenSpec" "$WORKFLOW"
  [ "$status" -eq 0 ]
  run grep -q "dev-flow" "$WORKFLOW"
  [ "$status" -eq 0 ]
}

# ── Output structure ───────────────────────────────────────────────────

@test "agentic-trends-radar: workflow returns report, results, dropped" {
  run grep -q "return.*report.*results.*dropped" "$WORKFLOW"
  [ "$status" -eq 0 ]
}
