---
name: fix-t001953-mishap-bundle
description: Bundled mishap fixes — subagent empty output, ticket.sh --component flag, third mishap
---

# Capability: fix-t001953-mishap-bundle

## Purpose

Resolve three unrelated mishaps collected from recent sessions in one bundled maintenance change:
a degraded subagent delegation path, a missing `ticket.sh triage --component` flag, and a third
scripts-related mishap.

## ADDED Requirements

### Requirement: `ticket.sh triage` Accepts a `--component` Flag

`scripts/vda/ticket/triage.sh` MUST accept a `--component` flag alongside the existing
`--priority`, `--severity`, `--status`, `--suggest`, `--apply`, and `--no-comment` flags, and
apply it to `tickets.tickets.component`.

#### Scenario: Triage sets the component field

```gherkin
GIVEN a ticket is triaged with `--component <name>`
WHEN the triage command completes
THEN `tickets.tickets.component` for that ticket is set to `<name>`
```

### Requirement: Subagent Delegation Does Not Silently Return Empty Output

The opencode delegation mechanism (`background-agents.ts`) MUST NOT silently swallow a failed or
empty subagent response; a degraded response is either retried or surfaced as an error.

#### Scenario: Subagent returns empty output

```gherkin
GIVEN a delegated qwen35-iq4 subagent call returns empty output
WHEN the orchestrator processes the response
THEN the empty response is surfaced (logged/retried), not treated as a silent success
```
