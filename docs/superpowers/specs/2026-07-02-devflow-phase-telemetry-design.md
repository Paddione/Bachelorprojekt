---
ticket_id: T001444
plan_ref: openspec/changes/devflow-phase-telemetry/tasks.md
status: active
date: 2026-07-02
---

# Design: Deterministische Devflow-Phase-Telemetrie + Checkpoint-Gate + Versand-Lane-Klärung

- Datum: 2026-07-02
- Slug: `devflow-phase-telemetry`
- Modus: autonomer Lauf (Goal-Hook) — Entscheidungen dokumentiert statt interaktiv erfragt

## Problem

dev-flow-execute-Läufe erscheinen nicht zuverlässig auf dem Factory Floor (`/admin/pipeline`)
und hinterlassen keine vollständigen Analytics-Spuren. Befund (DB, 2026-07-02):

- Die Mehrzahl der jüngst per devflow abgeschlossenen Tickets (`done`) hat **null**
  Zeilen in `tickets.factory_phase_events` (u. a. T001437, T001441, T001394, T001390,
  T001435, T001438).
- Der Rest hat fragmentierte Ketten (nur `deploy`, nur `plan+deploy`); `deploy entered`
  existiert 153×, `deploy done` nur 73×.
- `getHall()` (`website/src/lib/factory-floor.ts:177-181`) zeigt slot-lose Tickets nur,
  wenn ≥1 `driver='devflow'`-Event existiert → Tickets ohne Events sind auf dem Floor
  **unsichtbar**, PhaseStepper/Heatmap/Timeline bleiben leer.

**Root Cause:** Die Telemetrie ist in `.claude/skills/dev-flow-execute/SKILL.md` als
„Live-Floor-Telemetrie (best-effort)" mit `|| true` formuliert. Instruktions-basierte
Telemetrie wird von LLM-Agents unzuverlässig befolgt. Zusätzlich unklar: die
„Versand"-Spalte (`ShippedColumn.svelte`) trägt ein hartkodiertes Heading, das vom
SSOT-Label („Fertig", `pipeline-order.ts`) abweicht, und ihre Semantik (Merge =
Abschluss, Deploy entkoppelt, ADR-005) ist im UI nicht erklärt.

## Ziele

1. Jeder dev-flow-execute-Lauf ist ohne Agent-Disziplin auf dem Floor sichtbar
   (vollständige Phase-Kette scout→deploy).
2. Fail-closed Checkpoint: vor PR-Merge wird die Phase-Kette maschinell geprüft.
3. „Versand"-Lane: SSOT-Label und UI-Heading identisch, Semantik im UI erklärt.

Nicht-Ziele: neue Phasen/States/Tabellen; Go-MCP-Server-Änderungen; CI-seitiges
DB-Gate (Runner hat keinen Cluster-DB-Zugriff).

## Entscheidung A — Auto-Emission als Seiteneffekt (statt Instruktion)

Alle Status-Transitions laufen durch genau zwei sourced Module —
`scripts/vda/ticket/update-status.sh` (CLI **und** MCP `transition_status`, das intern
`ticket.sh update-status` aufruft) und `scripts/vda/ticket/stage-plan.sh`. Dort werden
Phase-Events deterministisch mit-emittiert:

| Auslöser | Auto-Event(s) | Begründung |
|---|---|---|
| `stage-plan` | `scout done`, `design done`, `plan done` | Ein gestagter Plan impliziert durchlaufene Exploration/Design/Plan-Phase (dev-flow-plan) |
| Status → `in_progress` | `implement entered` | Implementierung beginnt |
| Status → `in_review` | `implement done` | PR offen |
| Status → `qa_review` | `verify entered` | historischer/manueller Pfad |
| Status → `done` | `deploy done` | Merge = Abschluss (ADR-005) |
| Status → `blocked` | `<letzte Phase> blocked` (SQL-Lookup, Fallback `implement`) | Attention-Strip-Telemetrie |

Eigenschaften:

- **Idempotent/Dedup:** kein Insert, wenn für das Ticket bereits ein Event mit gleichem
  `(phase, state)` existiert. Factory-Läufe (pipeline.js emittiert weiterhin selbst,
  vor dem Statuswechsel, mit reicheren Details) bekommen dadurch keine Duplikate.
- **Driver-Attribution:** `TICKET_PHASE_DRIVER` env, Default `devflow`;
  `scripts/factory/pipeline.js` exportiert `factory` (greift nur, falls Dedup je nicht
  greift — Sicherheitsnetz).
- **Best-effort gegenüber DB-Fehlern:** der Statuswechsel selbst darf nie an der
  Telemetrie scheitern (Insert im selben `_exec_sql`-Fluss, aber Fehler nicht fatal).
- **Detail-Konvention:** `detail = 'auto: <auslöser>'`, damit Auto-Events in Timeline
  und Observability von hand-emittierten unterscheidbar sind.
- Implementierung als SQL im selben psql-Roundtrip (CTE/zweites Statement), kein
  zusätzlicher `kubectl exec`.

Verworfen: DB-Trigger (keine Driver-Attribution, DDL-/Migrationsaufwand); nur
Skill-Prosa verschärfen (nachweislich wirkungslos).

## Entscheidung B — Fail-closed Checkpoint-Gate

Neues sourced Modul `scripts/vda/ticket/assert-phase-chain.sh`, Dispatcher-Eintrag
`ticket.sh assert-phase-chain --id T…` (Muster wie `update-status.sh`):

- Prüft, dass für das Ticket Events `plan:done`, `implement:entered` und `verify:done`
  existieren (beliebiger Driver).
- Bei Lücken: Exit 1 + Ausgabe der exakten Backfill-Kommandos
  (`./scripts/ticket.sh phase <id> <phase> <state> --driver devflow --detail …`).
- `--json`-Flag für maschinelle Auswertung (`{"ok":bool,"missing":[…]}`).

Skill-Änderungen `.claude/skills/dev-flow-execute/SKILL.md`:

- Schritt 6.5 (vor `gh pr merge`): PFLICHT-Aufruf `assert-phase-chain` **ohne**
  `|| true`; bei FAIL erst backfillen (insb. `verify done` nach grünem
  `task test:changed`), dann mergen.
- `verify entered`/`verify done`-Emission bleibt Aufgabe des Agenten (nicht aus Status
  ableitbar), wird aber von „best-effort" auf Pflicht umformuliert; das Gate erzwingt
  sie nachweislich.
- Die übrigen Telemetrie-Blöcke verweisen darauf, dass plan/implement/deploy jetzt
  automatisch aus Statuswechseln entstehen (Doppel-Emission ist dank Dedup harmlos).

Verworfen: CI-Gate (kein DB-Zugriff vom Runner); neues Go-MCP-Tool
(Rebuild/Redeploy-Aufwand, YAGNI — `record_phase_event` existiert bereits, das Gate
ist shell-first; MCP-Pendant als mögliches Follow-up).

## Entscheidung C — Versand-Lane klären

- `website/src/lib/tickets/pipeline-order.ts`: Label der `shipped`-Lane von „Fertig" →
  **„Versand"** (konsistent mit Fabrikhallen-Metapher: Planung → Kommissioniert →
  Laderampe → In Arbeit → QS-Abnahme → Versand).
- `website/src/components/factory/ShippedColumn.svelte`: Heading importiert das Label
  aus dem SSOT (kein Hardcode mehr) und erhält einen Untertitel:
  „Gemergt nach main · Prod-Deploy entkoppelt". Empty-State-Text bleibt
  „Noch nichts versandt.".
- Damit ist maschinenlesbar und im UI erklärt: **Versand = Ticket gemergt
  (status `done`), nicht notwendigerweise prod-live** (ADR-005 Merge = Abschluss).

## Datenfluss (Ziel)

```
stage-plan / update-status (CLI + MCP transition_status)
        │  Auto-Emission (dedup, TICKET_PHASE_DRIVER)
        ▼
tickets.factory_phase_events ──► getHall()/getTicketDetail() ──► FactoryFloor (SSE-Refetch)
        │                        v_timeline, Heatmap, Observability
        ▲
dev-flow-execute: verify entered/done (Pflicht) + assert-phase-chain-Gate vor Merge
```

## Fehlerbehandlung

- Auto-Emission scheitert (DB weg): Statuswechsel bleibt erfolgreich, Warnung auf
  stderr — Verfügbarkeit des Ticket-Flows > Telemetrie.
- Gate nicht ausführbar (DB weg): Exit ≠ 0 → Merge blockiert; Agent eskaliert statt
  still zu mergen (fail-closed per Definition).
- Doppel-Emission (Factory + Auto): durch Dedup ausgeschlossen.

## Tests

- BATS in `tests/spec/software-factory.bats`: Auto-Emissions-Mapping (Status →
  Event), Dedup-Verhalten, `assert-phase-chain` PASS/FAIL/`--json`, Backfill-Hinweise.
  SQL-Aufrufe gemockt nach bestehendem Muster der ticket.sh-Tests.
- Bestehende Svelte-/DAL-Tests: Label-Änderung `shipped` → „Versand" nachziehen
  (`factory-floor.test.ts`, e2e-Selektoren nutzen `data-testid`, nicht das Label).
- Manuelle Verifikation: ein Ticket per `stage-plan` + `update-status` durchschalten
  und die Kette in `tickets.factory_phase_events` + `/admin/pipeline` prüfen.

## Betroffene Dateien

| Datei | Zeilen (Ist) | S1-Anmerkung |
|---|---|---|
| `scripts/vda/ticket/update-status.sh` | 44 | weit unter .sh-Limit 500 |
| `scripts/vda/ticket/stage-plan.sh` | 36 | dito |
| `scripts/vda/ticket/assert-phase-chain.sh` | neu | klein halten (<120) |
| `scripts/ticket.sh` | 852 (>Limit 500, in s1.ignore laut gates.yaml) | nur ~4 Dispatcher-Zeilen; keine Netto-Vergrößerung darüber hinaus |
| `.claude/skills/dev-flow-execute/SKILL.md` | 569 | Doku, kein Code-Ratchet |
| `website/src/lib/tickets/pipeline-order.ts` | 45 | Label-Änderung, ±0 |
| `website/src/components/factory/ShippedColumn.svelte` | 58 | Import + Untertitel, +~5 |
| `tests/spec/software-factory.bats` | 2966 | neue @tests |
