---
title: "Create factory-task-packet.sh — task-packet template generator"
ticket_id: "T900074"
domains: ["factory", "scripts"]
status: "draft"
---

# p5 — Task-Paket-Generator (task-packet)

## File Structure

```
scripts/factory-task-packet.sh    # NEW (executable, ~115 lines)
```

New file, not in `docs/code-quality/baseline.json` — no S1 violation.
Well under the 150-line budget for this partial.

## Problem

Factory dispatch prompts (p3) require `Done when` / `Stop when` /
`Rejected approaches` in every task packet, but no script generates a
consistent packet skeleton. Every planner assembles it by hand —
inconsistent sections, forgotten fields, divergent formats.

## Implementation Steps

1. Create `scripts/factory-task-packet.sh` with `#!/usr/bin/env bash`,
   `set -euo pipefail`, header comment, usage `<ticket> <partial>`.
2. Zero or >2 args → usage on stderr, `exit 2`. Two args → template on
   stdout, `exit 0` (heredoc `cat <<MARKDOWN`, ticket/partial expanded).
3. Sections: Goal, Files to touch, Expected output, Acceptance criteria,
   Done when (behavior, tests, no unrelated files, commit, ticket evidence),
   Stop when (3rd identical failure, missing credential, spec conflict,
   file-boundary breach), Rejected approaches (X failed because exact reason),
   Continuation Summary checklist (ticket+partial, constraints,
   decisions+reasons, changed files, exact errors, passed tests, next step).
4. `chmod +x`, smoke-run both paths, `wc -l` (<150), no TBD/TODO/FIXME.

## Full script

```bash
#!/usr/bin/env bash
# scripts/factory-task-packet.sh — generates a factory task-packet skeleton.
# Usage: scripts/factory-task-packet.sh <ticket> <partial>
# Exit 0 = packet on stdout, 2 = bad arguments.
# [T900074] Partial p5 — opencode-factory-context-tuning
set -euo pipefail

export AGENT_LOCK_SID="${AGENT_LOCK_SID:-opencode-orch-T900074}"

usage() {
  cat >&2 <<'EOF'
Usage: scripts/factory-task-packet.sh <ticket> <partial>

Generates a factory task-packet skeleton on stdout.

Arguments:
  ticket    ticket external_id (e.g. T000001)
  partial   partial name (e.g. p5)

Exit codes:
  0  packet written to stdout
  2  wrong argument count
EOF
  exit 2
}

[[ $# -eq 0 || $# -gt 2 ]] && usage

TICKET="${1:-}"
PARTIAL="${2:-}"

main() {
  cat <<MARKDOWN
---
title: "Partial $PARTIAL — $TICKET"
ticket_id: "$TICKET"
domains: []
status: "draft"
---

# $PARTIAL — Task packet

## Goal

Implement the requirements of partial $PARTIAL for ticket $TICKET.

## Files to touch

- \`<file-1>\`
- \`<file-2>\`

## Expected output

- Changed files as listed above.
- All specified tests green.
- Commit with Conventional-Commit title and ticket tag.

## Acceptance criteria

- [ ] Requested behavior implemented.
- [ ] Specified tests pass.
- [ ] No unrelated files changed.
- [ ] Commit created with meaningful message.
- [ ] Ticket updated with test evidence.

## Done when

- [ ] Requested behavior implemented.
- [ ] Specified tests pass.
- [ ] No unrelated files changed.
- [ ] Commit created with meaningful message.
- [ ] Ticket updated with test evidence.

## Stop when

- [ ] Same failure 3 times → abort, file friction report.
- [ ] Missing credential or required access → escalate.
- [ ] Spec conflict → flag on ticket, do not guess.
- [ ] Edits would leave assigned file boundary → stop, ask.

## Rejected approaches

- X: failed because <exact error/reason>.
- Y: incompatible with constraint Z.

## Continuation Summary

- **Ticket + partial:** $TICKET / $PARTIAL
- **Constraints:** what holds, what does not
- **Decisions + reasons:** choice made and why
- **Changed files:** which files were modified
- **Exact errors:** verbatim messages, not paraphrase
- **Passed tests:** which tests passed
- **Next concrete step:** which exact command/edit comes next
MARKDOWN
}

main
```

## Acceptance Criteria

- [ ] Executable (`chmod +x`); no args → usage on stderr, exit 2.
- [ ] `bash scripts/factory-task-packet.sh T000001 p5` → exit 0, all eight
      H2 sections on stdout (Goal, Files to touch, Expected output,
      Acceptance criteria, Done when, Stop when, Rejected approaches,
      Continuation Summary).
- [ ] Done/Stop/Rejected/Continuation contents as specified above.
- [ ] <150 lines, `set -euo pipefail`, no TBD/TODO/FIXME.

## Not in Scope

- **Tests** — p6 owns the test steps. This partial has **no** Failing-Test-Step
  by design.
