---
title: Fix T000288 — ops agent: output-trust discipline
ticket_id: T000288
domains: []
status: active
pr_number: null
---

# Fix T000288 — ops agent: output-trust discipline

Branch: `fix/ops-agent-output-trust`
Ticket: T000288 (bug, priority hoch, severity major)
Test: `tests/unit/agent-ops-output-trust.bats` (already staged, currently RED)

## Problem

The `bachelorprojekt-ops` subagent ran inside a corrupted PTY:
`run_shell_command` echoed the input command back instead of executing it,
and `date` returned the literal `patrick` (a stale prompt-buffer artifact).
Despite the broken shell, the agent narrated a confident, plausible-but-false
diagnosis. The recoverable failure is the broken shell; the real hazard is the
agent fabricating an authoritative conclusion from garbage output, because
downstream actions trust it.

## Fix (agent-prompt only)

Add a new `## Output trust & shell-session integrity` section to
`.claude/agents/bachelorprojekt-ops.md`. The section must instruct the agent to:

1. **Probe before trusting the session.** At the start of an investigation run a
   trivial, verifiable command — `kubectl get nodes --context mentolder` — and
   confirm the output is real (a node table), not the command echoed back.
2. **Recognise corruption signals.** Output that repeats the input command, a
   stale prompt buffer (e.g. a command returning a literal like the username
   instead of real output), or any desynced `run_shell_command` session.
3. **Fail loud, never fabricate.** If output looks echoed / stale / suspicious,
   do NOT draw a diagnosis from it. Stop and report the broken/unreliable
   environment to the orchestrator instead of narrating a confident conclusion.

Wording is free, but the section must satisfy the regression guards in
`tests/unit/agent-ops-output-trust.bats`:
- a `##` heading matching output-trust / shell-session / session-integrity
- mentions echoed input / stale PTY buffer / desync
- a never/do-not directive against fabricating/concluding/trusting
- the literal probe `kubectl get nodes --context mentolder`
- a directive to report/surface/stop on a broken/corrupt/unreliable environment

## Verification

```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/agent-ops-output-trust.bats   # GREEN
task test:all                                                                # GREEN (CI parity)
```

## Out of scope

- The PTY/run_shell_command wrapper fault itself is an environment/harness bug,
  not fixable in this repo. This fix only hardens the agent against *trusting*
  corrupted output.
- No deploy: `.claude/`, `tests/`, and `Taskfile.yml` changes are not deployed
  to clusters.
