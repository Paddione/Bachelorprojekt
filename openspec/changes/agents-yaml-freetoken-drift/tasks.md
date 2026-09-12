---
title: "agents-yaml-freetoken-drift — Implementation Plan"
ticket_id: T900167
domains: [ops, docs]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agents-yaml-freetoken-drift — Implementation Plan

_Ticket: T900167_

## File Structure

- `docs/agent-guide/registry/agents.yaml` (mod: die fuenf Rollen-Bloecke
  `freetoken-primary`, `freetoken-thinking`, `freetoken-fast-1`, `freetoken-fast-2`,
  `freetoken-fast-3` vollstaendig entfernen — Zeilen 89-113 im Ist-Zustand)
- `docs/agent-guide/maps/agents-map.md` (mod: regeneriert per `task agent-guide:maps`,
  keine manuelle Bearbeitung)
- `tests/spec/agent-roster.bats` (bereits vorhanden, RED — siehe Task 1)
- `tests/spec/agent-skills.bats` (bereits vorhanden, RED — siehe Task 1)

## Tasks

### Task 1 — Failing Tests bestaetigen (bereits vorhanden, RED)
- [x] Root-Cause verifiziert (siehe `proposal.md`): T900163 hat die fuenf Rollen aus
  `.opencode/agent-models.jsonc` entfernt (ersetzt durch die bereits vorhandene Rolle
  `qwen38`), `docs/agent-guide/registry/agents.yaml` wurde dabei nicht nachgezogen.
- [x] `tests/spec/agent-roster.bats` ist RED:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
  ```
  expected: FAIL — `not ok 2 P4.3: runtimes ↔ .opencode/agent-models.jsonc (bidirectional)`
  und `not ok 3 P4.3b: runtimes.model ↔ agent-models.jsonc agent.model (Modell-Zuordnung synchron)`
  melden die fuenf Rollen als "runtimes ohne agent-models.jsonc-Eintrag".
- [x] `tests/spec/agent-skills.bats` ist RED:
  ```bash
  tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
  ```
  expected: FAIL — `not ok 18 T002305: AGENTS.md runtime table covers every registry runtime`.

### Task 2 — Stale Rollen aus der Registry entfernen
- [x] `docs/agent-guide/registry/agents.yaml`: die fuenf Bloecke `freetoken-primary:`,
  `freetoken-thinking:`, `freetoken-fast-1:`, `freetoken-fast-2:`, `freetoken-fast-3:`
  (jeweils mit `mode`, `model`, `write_capable`, `note`) vollstaendig entfernen.
  `qwen38:` (bereits vorhanden, Zeile 74 im Ist-Zustand) bleibt unveraendert stehen —
  es ist die von T900163 gewaehlte Ersatzrolle fuer dasselbe Modell
  `llamacpp-local/qwen38-220k`.
- [x] `yq eval '.roles | keys' docs/agent-guide/registry/agents.yaml` gegenpruefen: keine
  der fuenf Rollen mehr gelistet, `qwen38` weiterhin vorhanden.

### Task 3 — Abgeleitete Artefakte regenerieren
- [x] `task agent-guide:maps` ausfuehren — regeneriert `docs/agent-guide/maps/agents-map.md`
  aus der bereinigten Registry.
- [x] `git diff docs/agent-guide/maps/agents-map.md` pruefen: die vier freetoken-Zeilen
  (fast-1/2/3, primary, thinking) sind verschwunden, keine anderen Rollen betroffen.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Siehe Task 1 — beide Tests sind bereits vorhanden und
  reproduzieren den Bug.
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
# expected: FAIL (rot — P4.3, P4.3b, T002305 schlagen fehl)
```

- [ ] **Fix-Step (GREEN).** Nach Task 2+3 muessen beide Tests gruen laufen:
```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-roster.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills.bats
```

- [ ] **Final Verification.**
```bash
task test:changed
task freshness:regenerate
task freshness:check
```
