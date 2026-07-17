## Why

Dieses Bündel adressiert drei Prozess-Frictions (Mishaps), die während vorheriger dev-flow-Sessions in den Bereichen dev-flow-execute, session-coordination und scripts/vda aufgetreten sind. Die Mishaps wurden automatisch vom mishap-tracker gesammelt und als Ticket T001482 aggregiert. Ziel ist es, die zugrundeliegenden Ursachen zu beheben, um wiederkehrende Frictions zu eliminieren.

## What Changes

1. **dev-flow-execute Friction**: Behebung eines Prozess-Problems im dev-flow-execute-Ablauf, das während der Plan-Ausführung zu Fehlern oder Brüchen führt.
2. **session-coordination Friction**: Behebung eines Koordinationsproblems zwischen parallelen Agent-Sessions (agent-lock, agent-msg, Worktree-Isolation).
3. **scripts/vda Friction**: Behebung eines Problems im scripts/vda.sh-oracle oder verwandten VDA-Skripten.

## Capabilities

### New Capabilities

- `mishap-bundle-fix`: Behebung der drei gesammelten Prozess-Frictions aus den Bereichen dev-flow-execute, session-coordination und scripts/vda.

### Modified Capabilities

<!-- Keine bestehenden SSOT-Specs ändern sich auf Requirement-Ebene -->

## Impact

- `.claude/skills/dev-flow-execute/SKILL.md` — mögliche Anpassung
- `.claude/skills/references/session-coordination.md` — mögliche Anpassung
- `scripts/vda.sh` oder Subskripte in `scripts/vda/` — mögliche Anpassung
