---
title: "BATS guards for V2 compaction, threshold math, AGENTS cap, reviewer no-write, task-packet smoke"
ticket_id: "T900074"
domains: ["config", "llm-local-dev", "factory", "scripts"]
status: "draft"
---

# p6 — Spec-Guards (guards-tests, TESTS ROLE)

## File Structure

```
tests/spec/llm-local-dev/opencode-compaction.bats    # NEW (~110 lines)
```

New file; `.bats` is not in `docs/code-quality/baseline.json`.
Parent `tests/spec/llm-local-dev.bats` untouched (T002416: own file under
`tests/spec/<spec-slug>/`).

> Orchestrator corrections (2026-09-04): (1) the draft's
> "no-args → exit 2" test piped through `|| true`, forcing `$status` to 0
> and failing the assertion unconditionally — fixed below (no `|| true`;
> `run` captures nonzero exits fine). (2) The draft's reviewer check looked
> for an agent literally named `reviewer`; p2 defines reviewer as a *role*
> (possibly empty agent list + `factory_roles` mirror in `agents.yaml`) —
> the test below asserts on the mirror plus a skip-guarded per-agent check.

## Implementation Steps

1. Create the file with bats shebang + SSOT ref comment + `setup()` resolving
   `REPO` from `$BATS_TEST_DIRNAME`.
2. V2 block tests (grep `-qF`): `"auto": true`, `"keep": { "tokens": 16000 }`,
   `"buffer": 96000` in `.opencode/opencode.jsonc`.
3. V1-absence tests with positive anchor (T002356-M1): first assert
   `"compaction":` exists, then assert `grep -F '"reserved":'` and
   `grep -F '"preserve_recent_tokens":'` outputs are empty.
4. Threshold-math test: `grep -qF '200000 − max(8192, 96000) = 104000'`
   (U+2212 minus — must byte-match the p1 comment; keep both in sync).
5. Reviewer test: assert `agents.yaml` `factory_roles.reviewer` deny-list
   contains `edit` and `bash`; plus node-based per-agent check that skips
   (exit 77 → `skip`) when no reviewer-role agent with a `permission` block
   exists yet. `node` only behind this guard (no new CI dependency).
6. AGENTS.md cap: `lines="$(wc -l < "$REPO/AGENTS.md")"; [ "$lines" -le 160 ]`.
7. task-packet smoke: no args → exit 2 (no `|| true`!); two args → exit 0;
   all eight H2 sections (`## Goal`, `## Files to touch`,
   `## Expected output`, `## Acceptance criteria`, `## Done when`,
   `## Stop when`, `## Rejected approaches`, `## Continuation Summary`) on
   stdout.
8. Run the suite — RED before p1/p4/p5, GREEN after. This is the
   STRUCT2 failing-test step:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev/opencode-compaction.bats
# expected: FAIL on the unimplemented base (no compaction block,
# AGENTS.md at 211 lines, script absent); expected: PASS after p1/p4/p5.
```

## Full BATS source

```bash
#!/usr/bin/env bats
# tests/spec/llm-local-dev/opencode-compaction.bats
# SSOT: openspec/specs/llm-local-dev.md (change opencode-factory-context-tuning)

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../../" && pwd)"
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
      const n = (agents[k].note || '').toLowerCase();
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
```

(Note: the node check reads `process.env.REPO` — export `REPO` in the
executing shell, or run via bats where `setup()` sets it per test; bats
`run` inherits shell variables only if exported, so the implementation MUST
`export REPO` in `setup()`. The snippet above uses `REPO=` — change to
`export REPO=`.)

## Acceptance Criteria

- [ ] File exists (~110 lines), six spec scenarios covered (12 `@test` blocks).
- [ ] `setup()` uses `export REPO` (node test dependency).
- [ ] `grep`-based asserts; `node` only behind the json5/skip guard.
- [ ] No TBD/TODO/FIXME placeholders.
- [ ] Git diff touches only the new file.

## Not in Scope

- p3 prompt-content tests — covered by prompt review, no executable guard.
- Anything outside the new file.
