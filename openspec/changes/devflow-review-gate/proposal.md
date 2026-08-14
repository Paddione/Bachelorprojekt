# Proposal: devflow-review-gate

## Why

Der delegierte Execute-Flow kann das Review-Gate überspringen, weil es nur im Orchestrator-Abschnitt des Skills steht, nicht im Prompt, den der Implementer-Subagent erhält (T005307/PR #4444).

## What

PFLICHT-Bullet im Auftrag-Block des dev-flow-execute-Skills: unabhängiges Review via `superpowers:requesting-code-review` vor PR-Erstellung; plus Verweis in Schritt 3.8. Guard-Test pinnt die Verankerung.

## Impact

`.claude/skills/dev-flow-execute/SKILL.md`, `tests/spec/agent-skills/devflow-review-gate.bats`, SSOT-Delta `agent-skills.md`.
