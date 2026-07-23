#!/usr/bin/env bats
# tests/spec/dev-flow-plan.bats
# SSOT: openspec/specs/dev-flow-plan.md (delta: openspec/changes/plan-intel-bundle/specs/dev-flow-plan.md)
# T001323 — Plan Intel Bundle: schema contract + .d.ts mirror + fixture + skill wiring.
#
# One .bats file per SSOT spec (slug convention). Hermetic: only reads repo files
# (schema, .d.ts, fixture, both dev-flow-* SKILL.md via the .agents/skills symlink).
# No cluster, no network.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  SCHEMA="$REPO/.claude/skills/references/schemas/plan-intel-bundle.schema.json"
  DTS="$REPO/.claude/skills/references/schemas/plan-intel-bundle.d.ts"
  EXAMPLE="$REPO/.claude/skills/references/schemas/plan-intel-bundle.example.json"
  PLAN_SKILL="$REPO/.agents/skills/dev-flow-plan/SKILL.md"
  EXEC_SKILL="$REPO/.agents/skills/dev-flow-execute/SKILL.md"
}

# ── (1) schema is valid JSON declaring draft 2020-12 + required sections ──
@test "PIB: schema file is valid JSON" {
  [ -f "$SCHEMA" ] || { echo "MISSING schema: $SCHEMA"; return 1; }
  jq . "$SCHEMA" >/dev/null
}

@test "PIB: schema declares JSON-Schema draft 2020-12" {
  grep -q '2020-12' "$SCHEMA"
}

@test "PIB: schema marks meta/impact_files/symbols required" {
  jq -e '.required | index("meta") and index("impact_files") and index("symbols")' "$SCHEMA" >/dev/null
}

@test "PIB: schema declares all eight top-level sections" {
  for s in meta impact_files symbols call_graph db_tables api_contracts external_types risks; do
    jq -e --arg s "$s" '.properties | has($s)' "$SCHEMA" >/dev/null \
      || { echo "MISSING schema section: $s"; return 1; }
  done
}

# ── (2) fixture conforms: required top-level keys + element required fields ──
@test "PIB: example.json is valid JSON with required top-level keys" {
  [ -f "$EXAMPLE" ] || { echo "MISSING example: $EXAMPLE"; return 1; }
  jq . "$EXAMPLE" >/dev/null
  for k in meta impact_files symbols; do
    jq -e --arg k "$k" 'has($k)' "$EXAMPLE" >/dev/null \
      || { echo "MISSING top-level key: $k"; return 1; }
  done
}

@test "PIB: example.json meta.slug and meta.ticket_id are strings" {
  [ "$(jq -r '.meta.slug | type' "$EXAMPLE")" = "string" ]
  [ "$(jq -r '.meta.ticket_id | type' "$EXAMPLE")" = "string" ]
}

@test "PIB: example.json impact_files is a non-empty array with required element fields" {
  [ "$(jq -r '.impact_files | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.impact_files | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.impact_files | all(has("path") and has("language") and has("loc") and has("s1_limit") and has("s1_baseline") and has("s1_budget"))' "$EXAMPLE" >/dev/null
}

@test "PIB: example.json symbols is a non-empty array with required element fields" {
  [ "$(jq -r '.symbols | type' "$EXAMPLE")" = "array" ]
  [ "$(jq -r '.symbols | length' "$EXAMPLE")" -gt 0 ]
  jq -e '.symbols | all(has("qualified_name") and has("kind") and has("file") and has("signature") and has("type_text") and has("source"))' "$EXAMPLE" >/dev/null
}

# ── (3) schema ↔ .d.ts top-level key parity (cheap drift guard) ──
@test "PIB: schema and .d.ts top-level keys are in parity" {
  [ -f "$DTS" ] || { echo "MISSING .d.ts: $DTS"; return 1; }
  schema_keys="$(jq -r '.properties | keys[]' "$SCHEMA" | sort | tr '\n' ' ')"
  dts_keys="$(awk '/^export interface PlanIntelBundle \{/{c=1;next} c&&/^\}/{c=0} c' "$DTS" \
    | grep -oE '^[[:space:]]+[a-zA-Z_]+\??:' | sed -E 's/[[:space:]]//g; s/\??:$//' \
    | sort | tr '\n' ' ')"
  [ "$schema_keys" = "$dts_keys" ] \
    || { echo "DRIFT: schema=[$schema_keys] dts=[$dts_keys]"; return 1; }
}

# ── (4) dev-flow-plan wiring: Intel-Gathering step + intel.json + four sources ──
@test "PIB: dev-flow-plan SKILL.md adds the Intel-Gathering step" {
  grep -Eq 'A\.1\.5|Intel-Gathering|Plan Intel Bundle' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md references intel.json" {
  grep -q 'intel\.json' "$PLAN_SKILL"
}

@test "PIB: dev-flow-plan SKILL.md names the four intel sources" {
  grep -q 'codebase-memory' "$PLAN_SKILL" || { echo "MISSING codebase-memory"; return 1; }
  grep -q 'mcp-postgres'    "$PLAN_SKILL" || { echo "MISSING mcp-postgres";    return 1; }
  grep -q 'context7'        "$PLAN_SKILL" || { echo "MISSING context7";        return 1; }
  grep -Eq '\bLSP\b'        "$PLAN_SKILL" || { echo "MISSING LSP";             return 1; }
}

# ── (5) dev-flow-execute wiring: Step 2 references intel.json ──
_exec_step2_block() {
  awk '/^## Schritt 2:/{c=1;print;next} c&&/^## /{exit} c' "$EXEC_SKILL"
}

@test "PIB: dev-flow-execute SKILL.md Step 2 references intel.json" {
  _exec_step2_block | grep -q 'intel\.json' \
    || { echo "MISSING intel.json in dev-flow-execute Step 2 block"; return 1; }
}

# ── T002137: Alt-Worktrees nach T002135 — cleanup documented ──
@test "mishap-t002137: gotchas-footguns.md enthält Alt-Worktrees-Abschnitt" {
  FOOTGUNS="$REPO/docs/superpowers/references/gotchas-footguns.md"
  grep -q "Alt-Worktrees nach T002135" "$FOOTGUNS" \
    || { echo "MISSING section title: Alt-Worktrees nach T002135"; return 1; }
  grep -q "\.git/worktrees/<name>/modules" "$FOOTGUNS" \
    || { echo "MISSING path pattern: .git/worktrees/<name>/modules"; return 1; }
}
