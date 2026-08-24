---
title: "cbm-index-single-flight — Implementation Plan"
ticket_id: T016447
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cbm-index-single-flight — Implementation Plan

_Ticket: T016447_

## File Structure

```
scripts/mcp/cbm-single-flight.sh                       # NEU (flock-Wrapper um `cbm cli index_repository`)
docs/runbooks/cbm-index-stampede.md                    # NEU (Akut-Mitigation + Prävention)
tests/spec/cbm-stampede-guard.bats                     # NEU (statische Struktur-Checks)
openspec/changes/cbm-index-single-flight/              # Proposal + Delta (liegt vor)
```

## Kontext

- Server ist extern (`~/.local/bin/codebase-memory-mcp` v0.9.0, ELF) —
  nicht patchbar; `auto_index=false`, `auto_watch=true`.
- Stampede-Quelle: agenten-initiierte `index_repository`-Volljobs bei
  Drift aus parallelen Sessions (Beobachtung 2026-08-24, Load 54.5).
- Wrapper-Nutzkrone: Skripte/Factory/Agent-Guide-Konvention; direkte MCP-
  Tool-Aufrufe im Chat sind verhaltensseitig über das Runbook adressiert.
- **AGENTS.md nicht anfassen** (fremde Stufe unter Lock SID 860181).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Neue Datei
      `tests/spec/cbm-stampede-guard.bats`, statische Checks:
      1. Wrapper existiert, enthält `flock` und Lockpfad unter
         `~/.cache/codebase-memory-mcp/`, ruft `cli index_repository`
         mit `"${@}"` (Pfadübergabe), `mkdir -p` für Lockdatei.
      2. Runbook existiert und nennt `index_status` UND
         `detect_changes` als Vorab-Check sowie STOP/TERM-Mitigation.
      3. `bash -n` auf dem Wrapper (Syntax).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats
# expected: FAIL (red — Wrapper und Runbook existieren noch nicht)
```

- [ ] **Fix-Step (GREEN).** Wrapper + Runbook implementieren.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/cbm-stampede-guard.bats
# expected: PASS (green)

# Funktionsprobe des Wrappers (serialisiert zwei Aufrufe):
scripts/mcp/cbm-single-flight.sh "$PWD" fast & scripts/mcp/cbm-single-flight.sh "$PWD" fast; wait
# expected: beide Aufrufe beenden sich rc=0, zweiter wartet auf ersten
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
