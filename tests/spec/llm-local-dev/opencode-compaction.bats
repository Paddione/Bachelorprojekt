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

@test "compaction block: buffer 33600" {
  run grep -qF '"buffer": 33600' "$REPO/.opencode/opencode.jsonc"
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
  run grep -qF '131072 − max(8192, 33600) = 97472' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
  run grep -qF '131072 − 33600 = 97472' "$REPO/.opencode/opencode.jsonc"
  [ "$status" -eq 0 ]
}

@test "DCP: allowSubAgents true so subagents get nudges (T900362)" {
  if ! node -e "try{require('json5')}catch(e){process.exit(77)}" 2>/dev/null; then
    skip "json5 not resolvable"
  fi
  run node -e "
    const j5 = require('json5'), fs = require('fs');
    const dcp = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/dcp.jsonc', 'utf8'));
    console.log(String(dcp.experimental && dcp.experimental.allowSubAgents));
  "
  [ "$status" -eq 0 ]
  [ "$output" = "true" ]
}

@test "compaction trigger for the default model is 97472 on V1 and V2 (T900350, T900362, T900365)" {
  if ! node -e "try{require('json5')}catch(e){process.exit(77)}" 2>/dev/null; then
    skip "json5 not resolvable"
  fi
  run node -e "
    const j5 = require('json5'), fs = require('fs');
    const oc = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/opencode.jsonc', 'utf8'));
    const am = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const [prov, id] = oc.model.split('/');
    const lim = am.provider[prov].models[id].limit;
    // Prompt loop (session/overflow.ts): buffer is mapped to reserved, but only
    // honoured when limit.input is set — otherwise context − output.
    const v1 = lim.input ? lim.input - oc.compaction.buffer : lim.context - lim.output;
    const v2 = lim.context - Math.max(lim.output, oc.compaction.buffer);
    console.log(v1 + ' ' + v2);
  "
  [ "$status" -eq 0 ]
  [ "$output" = "97472 97472" ]
}

@test "DCP local limits resolve below the default model's compaction trigger (T900350, T900365)" {
  if ! node -e "try{require('json5')}catch(e){process.exit(77)}" 2>/dev/null; then
    skip "json5 not resolvable"
  fi
  run node -e "
    const j5 = require('json5'), fs = require('fs');
    const oc = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/opencode.jsonc', 'utf8'));
    const am = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/agent-models.jsonc', 'utf8'));
    const dcp = j5.parse(fs.readFileSync(process.env.REPO + '/.opencode/dcp.jsonc', 'utf8')).compress;
    const [prov, id] = oc.model.split('/');
    const lim = am.provider[prov].models[id].limit;
    const res = (v) => typeof v === 'string' ? Math.round(parseFloat(v) / 100 * lim.context) : v;
    const min = res(dcp.modelMinLimits[oc.model]), max = res(dcp.modelMaxLimits[oc.model]);
    const trig = Math.min(lim.input ? lim.input - oc.compaction.buffer : lim.context - lim.output,
                          lim.context - Math.max(lim.output, oc.compaction.buffer));
    console.log(min + ' ' + max + ' ' + (min < max && max < trig));
  "
  [ "$status" -eq 0 ]
  [ "$output" = "52429 91750 true" ]
}

@test "reviewer role: edit and bash denied in the runtimes mirror" {
  # T900399: der zuvor gespiegelte factory_roles-Block entfällt mit dem
  # Factory-Subsystem; reviewer lebt jetzt nur noch unter runtimes:. Der
  # Read-only-Zuspruch wird dort ueber write_capable: false + Notiz belegt.
  run grep -qF 'runtimes:' "$REPO/docs/agent-guide/registry/agents.yaml"
  [ "$status" -eq 0 ]
  run grep -qF 'factory_roles:' "$REPO/docs/agent-guide/registry/agents.yaml"
  [ "$status" -ne 0 ]
  reviewer_block="$(sed -n '/^runtimes:/,$p' "$REPO/docs/agent-guide/registry/agents.yaml")"
  reviewer_block="$(printf '%s\n' "$reviewer_block" | sed -n '/^  reviewer:/,$p')"
  printf '%s\n' "$reviewer_block" | grep -qF 'write_capable: false'
  printf '%s\n' "$reviewer_block" | grep -qiE 'no edit/write/bash/task dispatch'
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
