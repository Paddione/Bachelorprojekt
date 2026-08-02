---
title: "K8 Agentische Headed-Tests"
ticket_id: T002467
domains: [test, agents]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: T002430
depends_on_plans: []
---

# K8 Agentische Headed-Tests

_Ticket: T002467_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|-------------|------------|
| 1 | tasks.d/p1-skill-extension.md | spec | .agents/skills/dev-flow-e2e/SKILL.md | — |
| 2 | tasks.d/p2-playwright-spec.md | test | tests/e2e/specs/k8-headed-verify.spec.ts | 1 |
| 3 | tasks.d/p3-ci-docs.md | docs | .github/workflows/e2e.yml | 1 |
