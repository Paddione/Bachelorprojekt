# Proposal: devflow-phase-telemetry

## Why

dev-flow-execute-Läufe erscheinen nicht zuverlässig auf dem Factory Floor
(`/admin/pipeline`) und hinterlassen keine vollständigen Analytics-Spuren:
Die Mehrzahl der jüngst per devflow abgeschlossenen Tickets hat **null** Zeilen
in `tickets.factory_phase_events` (u. a. T001437, T001441, T001394, T001390),
der Rest fragmentierte Ketten. Root Cause: Die Telemetrie ist im Skill nur als
„best-effort `|| true`" formuliert — instruktions-basierte Telemetrie wird von
LLM-Agents unzuverlässig befolgt. `getHall()` zeigt slot-lose Tickets aber nur
mit ≥1 `driver='devflow'`-Event → ohne Events unsichtbar. Zusätzlich weicht das
hartkodierte UI-Heading „Versand" (`ShippedColumn.svelte`) vom SSOT-Label
(„Fertig", `pipeline-order.ts`) ab und die Lane-Semantik (Merge = Abschluss,
ADR-005) ist im UI nicht erklärt.

## What

1. **Auto-Emission (deterministisch statt instruiert):**
   `scripts/vda/ticket/update-status.sh` und `scripts/vda/ticket/stage-plan.sh`
   emittieren Phase-Events als Seiteneffekt der Status-Transitions — dadurch
   sind CLI **und** MCP (`transition_status`) abgedeckt. Mapping:
   `stage-plan` → scout/design/plan `done`; `in_progress` → implement `entered`;
   `in_review` → implement `done`; `qa_review` → verify `entered`;
   `done` → deploy `done`; `blocked` → letzte Phase `blocked`.
   Idempotent (Dedup auf ticket+phase+state), Driver via `TICKET_PHASE_DRIVER`
   (Default `devflow`), `detail='auto: …'`, Telemetrie-Fehler nie fatal für den
   Statuswechsel.
2. **Fail-closed Checkpoint-Gate:** neues Subkommando
   `ticket.sh assert-phase-chain --id T… [--json]` (sourced Modul
   `scripts/vda/ticket/assert-phase-chain.sh`) prüft plan:done,
   implement:entered, verify:done; Exit 1 mit exakten Backfill-Kommandos.
   `dev-flow-execute` ruft es PFLICHT vor `gh pr merge` auf (kein `|| true`);
   verify-Emission wird von best-effort auf Pflicht angehoben.
3. **Versand-Lane geklärt:** SSOT-Label der `shipped`-Lane in
   `pipeline-order.ts` → „Versand"; `ShippedColumn.svelte` importiert das Label
   aus dem SSOT und erhält den Untertitel „Gemergt nach main · Prod-Deploy
   entkoppelt" (Versand = gemergt, nicht prod-live).

Spec: `docs/superpowers/specs/2026-07-02-devflow-phase-telemetry-design.md`

_Ticket: T001444_
