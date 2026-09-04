#!/usr/bin/env bats
# tests/spec/llm-local-dev/opencode-compaction.bats
# SSOT: openspec/specs/llm-local-dev.md (change opencode-factory-context-tuning)

setup() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../../" && pwd)"
}

@test "compaction block: auto true" {
  run grep -qF '"auto": true' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

@test "compaction block: keep.tokens 16000" {
  run grep -qF '"keep": { "tokens": 16000 }' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

@test "compaction block: buffer 96000" {
  run grep -qF '"buffer": 96000' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

@test "compaction block: no V1 reserved key" {
  run grep -qF '"compaction":' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
  [ -z "$(grep -F '"reserved":' "$REPO/.opencode/opencode.jsonc" || true)" ]
}

@test "compaction block: no V1 preserve_recent_tokens key" {
  run grep -qF '"compaction":' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
  [ -z "$(grep -F '"preserve_recent_tokens":' "$REPO/.opencode/opencode.jsonc" || true)" ]
}

@test "compaction block: threshold math comment" {
  run grep -qF '200000 − max(8192, 96000) = 104000' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

@test "reviewer role: edit and bash denied in factory_roles mirror" {
  run grep -qF 'factory_roles:' "$REPO/docs/agent-guide/registry/agents.yaml"
  [ "$status" -eq 0 ]
  reviewer_block="$(sed -n '/factory_roles:/,$p' "$REPO/docs/agent-guide/registry/agents.yaml")"
  reviewer_block="$(printf '%s\n' "$reviewer_block" | sed -n '/reviewer:/,$p')"
  printf '%s\n' "$reviewer_block" | grep -qF 'edit'
  printf '%s\n' "$reviewer_block" | grep -qF 'bash'
  printf '%s\n' "$reviewer_block" | grep -qF 'deny'
}

@test "reviewer role: no per-agent write allow (skip-guarded)" {
  if ! node -e "try{require('json5')}catch(e){process.exit(77)}" 2>/dev/null; then
    skip "json5 not resolvable — mirror test above is authoritative"
  fi
  run node -e "
    const j5 = require('json5'), fs = require('fs');
    const d = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const agents = d.agent || {};
    const bad = Object.keys(agents).filter((k) => {
      const n = String(agents[k].description || agents[k].note || '').toLowerCase();
      const p = agents[k].permission || {};
      return n.includes('reviewer') && (p.edit === 'allow' || p.write === 'allow' || p.bash === 'allow');
    });
    if (bad.length) { console.error('reviewer-role agents with write: ' + bad.join(',')); process.exit(1); }
  "
  [ "$status" -eq 0 ]
}

@test "AGENTS.md line count <= 160" {
  [ "$(wc -l < "$REPO/AGENTS.md")" -le 160 ]
}

@test "factory-task-packet.sh: no args exit 2" {
  run bash "$REPO/scripts/factory-task-packet.sh"
  [ "$status" -eq 2 ]
}

@test "factory-task-packet.sh: two args exit 0" {
  run bash "$REPO/scripts/factory-task-packet.sh" T000001 p5
  [ "$status" -eq 0 ]
}

@test "factory-task-packet.sh: all eight H2 sections" {
  out="$(bash "$REPO/scripts/factory-task-packet.sh" T000001 p5 2>/dev/null)"
  for h in '## Goal' '## Files to touch' '## Expected output' \
           '## Acceptance criteria' '## Done when' '## Stop when' \
           '## Rejected approaches' '## Continuation Summary'; do
    printf '%s\n' "$out" | grep -qF "$h"
  done
}
