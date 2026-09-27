---
title: "openclaw-ops-bot — Implementation Plan"
ticket_id: T900538
domains: [agent-tooling, llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openclaw-ops-bot — Implementation Plan

_Ticket: T900538_ · Design (bindender Vertrag für alle Partials): `openspec/changes/openclaw-ops-bot/design.md`
· Specs: `openspec/changes/openclaw-ops-bot/specs/openclaw-ops-bot.md`, `openspec/changes/openclaw-ops-bot/specs/llm-local-dev.md`

## File Structure

```
taskfiles/Taskfile.openclaw.yml                          (umgebaut, p1)
openclaw/openclaw-gateway.service                        (neu, p1)
openclaw/openclaw.json5                                  (neu, p2)
openclaw/.env.example                                    (umgebaut, p2)
openclaw/exec-approvals.json5                            (neu, p2)
openclaw/heartbeat-scratch.md                            (neu, p3)
openclaw/workspace/AGENTS.md                             (neu, p3)
docs/runbooks/openclaw-ops-bot.md                        (neu, p3)
scripts/openclaw-ask.sh                                  (neu, p4)
docs/agent-guide/registry/capabilities.yaml              (geaendert, p4)
tests/unit/openclaw-taskfile.bats                        (umgebaut, p5)
tests/spec/openclaw-ops-bot.bats                         (neu, p5)
tests/spec/fixtures/openclaw-fake-gateway.mjs            (neu, p5)
tests/spec/llm-local-dev.bats                            (zwei Tests entfernt, p5)
components/website/src/data/test-inventory.json          (regeneriert, p5)
```

S1: `taskfiles/Taskfile.openclaw.yml`, `.env.example`, `.json5`, `.md`, `.service` und `.yaml` haben
kein S1-Limit. `scripts/openclaw-ask.sh` ist neu (`.sh`-Limit 800, Ziel unter 120 Zeilen),
`tests/spec/fixtures/openclaw-fake-gateway.mjs` ist neu (`.mjs`-Limit 800, Ziel unter 80 Zeilen).
S4: `scripts/openclaw-ask.sh` wird aus `docs/runbooks/openclaw-ops-bot.md` und `capabilities.yaml`
referenziert.

## Partials

| id | plan | role | target_files | depends_on | min_tier | ctx_tokens |
|----|------|------|--------------|------------|----------|------------|
| p1 | tasks.d/p1-install.md | impl | taskfiles/Taskfile.openclaw.yml, openclaw/openclaw-gateway.service | | 4b-local | 32000 |
| p2 | tasks.d/p2-config.md | impl | openclaw/openclaw.json5, openclaw/.env.example, openclaw/exec-approvals.json5 | | 4b-local | 32000 |
| p3 | tasks.d/p3-workspace.md | impl | openclaw/heartbeat-scratch.md, openclaw/workspace/AGENTS.md, docs/runbooks/openclaw-ops-bot.md | | 4b-local | 32000 |
| p4 | tasks.d/p4-broker.md | impl | scripts/openclaw-ask.sh, docs/agent-guide/registry/capabilities.yaml | | 4b-local | 80000 |
| p5 | tasks.d/p5-tests.md | tests | tests/unit/openclaw-taskfile.bats, tests/spec/openclaw-ops-bot.bats, tests/spec/fixtures/openclaw-fake-gateway.mjs, tests/spec/llm-local-dev.bats, components/website/src/data/test-inventory.json | p1,p2,p3,p4 | 27b-local | 32000 |

## Verify (RED → GREEN)

Der Failing-Test-Step steht in `tasks.d/p5-tests.md` (`expected: FAIL`).

- [ ] **Task V: Finale Verifikation**
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/unit/openclaw-taskfile.bats tests/spec/openclaw-ops-bot.bats tests/spec/llm-local-dev.bats
  shellcheck scripts/openclaw-ask.sh
  node scripts/toolset/check.mjs
  bash scripts/openspec.sh validate openclaw-ops-bot
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
