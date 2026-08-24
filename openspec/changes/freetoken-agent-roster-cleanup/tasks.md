---
title: "freetoken-agent-roster-cleanup — Implementation Plan"
ticket_id: T016419
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# freetoken-agent-roster-cleanup — Implementation Plan

_Ticket: T016419_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-config.md | impl | .opencode/agent-models.jsonc, .opencode/opencode.jsonc | |
| p2 | tasks.d/p2-docs-mirrors.md | impl | docs/agent-guide/registry/agents.yaml, AGENTS.md, .opencode/skills/freetoken-setup/SKILL.md | p1 |
| p3 | tasks.d/p3-tests.md | tests | tests/spec/llm-local-dev.bats, tests/spec/local-llm-proxy/qwen38-default-backend.bats | p1,p2 |

## File Structure

```
.opencode/agent-models.jsonc                      # -4 tote Katalogmodelle, -7 Klon-Primaries
.opencode/opencode.jsonc                          # Default -> freetoken-local/active + Kommentar-Neufassung
docs/agent-guide/registry/agents.yaml             # -7 Runtime-Einträge (P4.3/P4.3b-Mirror)
AGENTS.md                                         # Agententabelle + Backend-Note-down (FreeToken, dense-fits-not)
.opencode/skills/freetoken-setup/SKILL.md         # Description-Zeile ohne Qwen3.6-27B-NVFP4
docs/agent-guide/maps/agents-map.md               # GENERIERT — task agent-guide:maps im Verify (P4.5)
tests/spec/llm-local-dev.bats                     # Acht-Locals-Assert -> einer; gptoss-context-Awk umziehen
tests/spec/local-llm-proxy/qwen38-default-backend.bats  # Default-Pin -> freetoken-local/active
```

Nicht in diesem Change (explizite Non-Goals): `scripts/sdlc/llm-up.sh` +
`health-gate.sh` (SDLC_LLM_LOADOUT folgt in einem eigenen Ticket),
`scripts/llm/loadouts.json` (Loadout-Deklarationen bleiben), Cloud-Provider und
Subagenten-Familien, `openspec/specs/local-llm-proxy.md`.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die Tests in p3 werden gegen den Ist-Stand
      des Branches geschrieben und müssen VOR den Impl-Partials rot liegen:
      der Roster-Assert zählt genau einen lokalen Primary, der Default-Assert
      verlangt `freetoken-local/active` — beides trifft auf dem Scaffold-Stand
      noch nicht zu. Der p3-Plan trägt den Testrunner-Aufruf mit der Phrase
      `expected: FAIL`.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/llm-local-dev.bats tests/spec/local-llm-proxy/qwen38-default-backend.bats
# expected: FAIL (red — impl partials not applied yet)
```

- [ ] **Fix-Step (GREEN).** Nach p1+p2 laufen dieselben Tests grün; zusätzlich
      P4.x-Roster-Gates (`agent-roster.bats`) und die FreeToken-Routing-Guards.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats tests/spec/freetoken-local-backend/routing.bats tests/spec/routing-check-freetoken.bats
```

- [ ] **Ops-Schritte (p2):** `bash scripts/opencode-sync-agents.sh` (Global-
      Config); `task agent-guide:maps` (P4.5-Freshness); Löschung des
      nicht-viablen Checkpoints `/mnt/c/Users/PatrickKorczewski/models/Qwen3.6-27B-NVFP4`
      (19 GB, Pfad vorher auf Existenz+Größe prüfen).

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
