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
