---
title: "mishap-t001972 — Implementation Plan"
ticket_id: T001972
domains: [ticket-mcp, scripts/openspec.sh, repo/main-checkout]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001972 — Implementation Plan

_Ticket: T001972_

## File Structure

```
scripts/vda/ticket/triage.sh                # component-Fix (Task 1)
scripts/openspec-merge.mjs                  # --create-new delta-merge (Task 2)
scripts/openspec.sh                         # Trigger-Warnung (Task 3)
AGENTS.md                                   # main-checkout-Warnung (Task 3)
```

## Tasks

### Task 1: ticket-mcp triage_ticket component-Fix

`scripts/vda/ticket/triage.sh:108` ändert
`component=NULLIF(:'c','')` zu `component=COALESCE(NULLIF(:'c',''), component)`,
damit leere Args den vorhandenen Wert nicht überschreiben. Zusätzlich in der
`triage_ticket`-MCP-Route (`scripts/ticket-mcp/go/internal/tools/triage.go`)
einen Debug-Print ergänzen, der bei `--apply` den `component`-Wert aus
`buildTriageArgs` loggt — zur Reproduktion der "calls accepted but component
not set"-Symptomatik (Mishap 1 in T001972).

Repro:
```bash
# Ticket mit component setzen, dann triage_ticket ohne component → component soll bleiben
psql ... -c "UPDATE tickets.tickets SET component='db' WHERE external_id='T001972'"
# via ticket-mcp_triage_ticket({id: 'T001972', status: 'planning'})
# Erwartet: component='db'. Vorher: component=NULL.
```

### Task 2: openspec-merge.mjs --create-new-Pfad

In `scripts/openspec-merge.mjs`, Funktion `applyDelta`: nach dem
Skeleton-Write (Zeile 90) muss `parseDelta(delta)` laufen und die Delta-
Blöcke in den frisch erzeugten SSOT gemergt werden — sonst ist der SSOT nur
ein Skelett ohne Requirements.

Repro:
```bash
mkdir -p /tmp/openspec-repro/changes/test-create-new/specs
# delta-spec mit ADDED Requirement anlegen
node scripts/openspec-merge.mjs apply <delta> <ssot> --create-new
# Erwartet: SSOT enthält ### Requirement: Foo. Vorher: leerer Purpose-Stub.
```

### Task 3: main-Checkout-Warnung für OpenSpec-Archivierung

In `AGENTS.md` Sektion "Critical Footguns" und/oder
`.claude/skills/dev-flow-chore/SKILL.md` einen expliziten Warn-Block
aufnehmen:

```
> **OpenSpec-Archivierung NUR via Worktree [T001972, T001880].**
> `task openspec:archive` und `scripts/openspec.sh archive` erzeugen
> Datei-Mutationen (openspec/specs/*.md, openspec-status.json), die bei
> Ausführung im main-Checkout unkommittiert liegen bleiben. Immer in
> einem `.worktrees/*`-Worktree auf einem chore/*-Branch ausführen.
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Reproduktion der drei Mishaps dokumentieren.
- [ ] **Fix-Step (GREEN).** Nach Implementierung der drei Tasks:
  ```bash
  task test:changed
  task freshness:regenerate
  task freshness:check
  ```
- [ ] **Final Verification.** Drei CI-Gates grün.
