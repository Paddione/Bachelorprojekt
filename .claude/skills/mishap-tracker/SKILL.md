---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to file the frictions it accumulated — writes each MISHAP_LOG entry as a comment on the ticket being worked on. Without ticket context an entry is logged and discarded; no collection container and no follow-up ticket is created. Only incident types (incident, broken, security) create a ticket each. Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops, incident-response and ticket-ops.'
---

# This skill's canonical implementation lives at: .opencode/skills/mishap-tracker/SKILL.md
