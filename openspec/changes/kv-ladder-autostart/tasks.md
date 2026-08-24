---
title: "kv-ladder-autostart — Implementation Plan"
ticket_id: T016416
domains: [llm-local-dev]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# kv-ladder-autostart — Implementation Plan

_Ticket: T016416_

## Ausgangslage

Die Implementierung existiert vollständig als Commit auf diesem Branch (übertragen aus dem
ungeticketen Hauptcheckout-Patch). Der Plan deckt Verifikation und PR-Versand ab. Runtime-
Verifikation der `.ps1`-Änderung ist operator-seitig (Windows/WSL) und Teil des Post-Merge-
Deployments, nicht der CI.

## File Structure

```
scripts/llm/restart-freetoken.ps1        (geändert — KV-Ladder-Autostart, Zombie-Reap, -NoLadder)
.opencode/agent-models.jsonc             (geändert — Qwen3.6-35B limit.context 131072 → 200000)
.opencode/plugin/freetoken-active.ts     (geändert — SDLC_CONTEXT_CEILING-Advertise mit Guard)
openspec/changes/kv-ladder-autostart/    (Proposal + Delta + dieser Plan)
```

## Tasks

- [x] 1. Patch aus Hauptcheckout auf Branch übertragen (Commit auf diesem Branch)
- [x] 2. CRLF-Toleranz geprüft: Patch berührt nur bestehende `.ps1`-Zeilen, keine neuen Guards
       in Bash geschrieben (T002338-M2)
- [ ] 3. Gates: `task test:changed`, `task freshness:check`
- [ ] 4. PR erstellen (Conventional Commit mit `[T016416]`), CI abwarten, Squash-Merge
- [ ] 5. Ticket auf `done`/`shipped`; Post-Merge verifiziert der Operator:
       Restart startet Ladder (`/tmp/opencode/kv-ladder.log` wächst), `ft ctl cache --kv`
       zieht nach, Session advertise 200k ohne Overflow ab ~131k

## Verification

- Statische Prüfung: JSONC bleibt parsebar (`node -e` über den Provider-Block), Plugin-Syntax via
  opencode-Start.
- Der Vertrag „limit.context == LADDER_CEILING" ist im Delta-Spec festgehalten; Drift zwischen
  beiden Seiten wäre ein Folge-Ticket.
