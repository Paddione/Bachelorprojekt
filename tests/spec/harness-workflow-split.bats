#!/usr/bin/env bats
# T001611 harness-workflow-split — one file per OpenSpec SSOT spec (harness-workflow-split).
# Forbidden Claude-only tokens (see plan "Forbidden-token contract"):
FORBIDDEN='AskUserQuestion|TodoWrite|subagent_type|Task tool'
OPENSPEC_SKILLS='openspec-propose openspec-apply-change openspec-archive-change openspec-explore'
OC_SKILLS='opencode-flow-plan opencode-flow-execute opencode-flow-chore opencode-git-workflow'

@test "HWS-1: the four opencode-flow/-git-workflow skills exist" {
  for s in $OC_SKILLS; do [ -f ".opencode/skills/$s/SKILL.md" ]; done
}

@test "HWS-2: opencode skills carry no Claude-only tool syntax" {
  for s in $OC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".opencode/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-3: opencode skills reference both opencode primitives (collectively)" {
  grep -rqF 'background-agents.ts' .opencode/skills/opencode-flow-plan .opencode/skills/opencode-flow-execute
  grep -rqF 'worktree.ts' .opencode/skills
}

@test "HWS-4: opencode-git-workflow uses the git-crypt-safe worktree wrapper" {
  grep -qF 'scripts/worktree-create.sh' .opencode/skills/opencode-git-workflow/SKILL.md
}

@test "HWS-5: opencode-flow-execute/-chore call the opencode-git-workflow skill" {
  grep -qF 'opencode-git-workflow' .opencode/skills/opencode-flow-execute/SKILL.md
  grep -qF 'opencode-git-workflow' .opencode/skills/opencode-flow-chore/SKILL.md
}

@test "HWS-6: shared openspec-* skills are free of Claude-only tool syntax" {
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-7: openspec-archive-change retains its delegation instruction" {
  grep -qF 'openspec-sync-specs' .claude/skills/openspec-archive-change/SKILL.md
}

@test "HWS-8: AGENTS.md Skill Dispatch Protocol is opencode-native" {
  # extract the '## Skill Dispatch Protocol' section body (up to the next H2)
  local awkp='/^## Skill Dispatch Protocol/{f=1;next} f&&/^## /{f=0} f'
  run bash -c "awk '$awkp' AGENTS.md | grep -nE '$FORBIDDEN'"
  [ "$status" -ne 0 ]   # no Claude-only tokens in the section
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'background-agents.ts'"
  [ "$status" -eq 0 ]
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'delegate'"
  [ "$status" -eq 0 ]
}

@test "HWS-9: tools.yaml has a harness field on every entry" {
  local ids harnesses
  ids="$(grep -cE '^- id:' docs/agent-guide/registry/tools.yaml)"
  harnesses="$(grep -cE '^  harness:' docs/agent-guide/registry/tools.yaml)"
  [ "$ids" -eq "$harnesses" ]
}

@test "HWS-10: tools.yaml carries at least one opencode-tagged entry" {
  grep -qE '^  harness:[[:space:]]*opencode' docs/agent-guide/registry/tools.yaml
}

@test "HWS-11: tools-map.md renders a Harness column" {
  grep -qF '| Harness |' docs/agent-guide/maps/tools-map.md
}

@test "HWS-12: agent-guide registry validates (harness schema included)" {
  run node scripts/agent-guide/validate.mjs
  [ "$status" -eq 0 ]
}

# ── Antigravity guard (home-dir state, skip-when-absent — mcp-tooling.bats pattern) ──
@test "HWS-13: Antigravity inherits the cleaned openspec-* skills (repo is the source)" {
  # Antigravity (~/.gemini/antigravity-cli/) is a Claude-Code instance that reads the repo
  # .claude/skills/ directly, so the cleanup applies to it automatically.
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-14: host antigravity-cli carries no shadowing dirty openspec-* copy" {
  local ag="$HOME/.gemini/antigravity-cli"
  [ -d "$ag" ] || skip "antigravity-cli not installed on this machine"
  run bash -c "find \"$ag\" -path '*openspec-*/SKILL.md' -exec grep -lE \"$FORBIDDEN\" {} + 2>/dev/null"
  [ -z "$output" ]
}
