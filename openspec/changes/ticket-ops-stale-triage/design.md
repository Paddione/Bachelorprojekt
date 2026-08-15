---
ticket_id: T006295
plan_ref: openspec/changes/ticket-ops-stale-triage/tasks.md
status: active
date: 2026-08-15
---

# Design: ticket-ops Wave-1-Dispatch gegen stale Triage-Zustand absichern

## Symptom vs. Ursache (T002448-M5)

**Symptom (beobachtet, reproduzierbar):** Der freigegebene Wave-1-Dispatch der ticket-ops-Session
vom 2026-08-14 startete Planungsagenten für Tickets, die bereits von Parallelsessions übernommen
waren. Konkret: T005591 (`plan_staged`, Branch `fix/sf-fixture-hardening-T005591`, Commit
`16464a8a9`) und T005560 (Ticket umgeschrieben, `in_progress`, Branch
`fix/ticket-lock-stale-pass-T005560`, Commit `065f3319b`). Beide Planungsagenten brachen sauber ab
(keine Commits, keine `plan_ref`-Überschreibung, Locks freigegeben). Kosten: 2 opus-Agentenläufe
(~250k Tokens) verpufft.

**Ursache (verifiziert per DB-Query + git ls-remote, 2026-08-15):** Der Dispatch in
`ticket-ops-procedures.md` §Step 3.6 läuft auf dem Triage-Snapshot von 21:19 — zwischen
Masterplan-Präsentation und freigegebener Ausführung liegt ein menschliches Approval-Gate, in dem
Parallelsessions Ticket-Zustände ändern können. Die bestehende Pre-Check-Invariante [T002422]/
[T002498-M6] (§Step 3.3) prüft ausschließlich **Agent-Locks** (ticket- und branch-Scope,
Lock-Inventar, dirty Worktrees). Sie ist strukturell blind gegen die beobachtete Übernahme-Form:
`stage-plan` setzt den `FACTORY-PLAN-REF`-Kommentar und den Status `plan_staged`, ohne irgendeinen
Lock zu halten; `update-status`/Ticket-Umschreiben hinterlässt ebenfalls keinen Lock. Ein Ticket
kann also den Zustand wechseln, während der Lock-Pre-Check „frei" meldet.

**Kosten-Zuordnung:** 2 verpuffte opus-Läufe (~250k Tokens) — reine Dispatch-Zeitverschwendung
ohne Datenkorruption (Planungsagenten brechen sauber ab).

## Fix-Ansatz

Vor dem Wave-1-Dispatch (§Step 3.6, VOR der Claim-Schleife) den Ticket-Zustand **jedes**
Wave-1-Tickets re-fetchen — eine billige Query über `tickets.tickets` (Status) plus die
`FACTORY-PLAN-REF`-Kommentar-Existenz in `tickets.ticket_comments` (der Marker, den `stage-plan`
schreibt). Nur Tickets dispatchen, deren Zustand **seit dem Masterplan-Snapshot unverändert** ist;
veränderte Tickets als `STALE-STATE` melden und aus dem Dispatch ausschließen (sie gehören einer
laufenden Parallelsession).

Referenz-Query (reale Schema-Spalten, verifiziert 2026-08-15):

```sql
SELECT t.external_id, t.status,
       EXISTS (SELECT 1 FROM tickets.ticket_comments c
               WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %') AS has_plan_ref
FROM tickets.tickets t
WHERE t.external_id = ANY($wave1_ids);
```

**Stale-Regel:** Ein Ticket ist `STALE-STATE`, wenn der re-fetchte `status` vom im Masterplan
erfassten Zustand abweicht ODER `has_plan_ref` wahr ist (inzwischen gestagter Plan einer
Parallelsession). Stale-Tickets werden vor der Claim-Schleife gemeldet und zurückgestellt.

## Betroffene Dateien

| Datei | Änderung |
|-------|----------|
| `.claude/skills/references/ticket-ops-procedures.md` | §Step 3.6: Ticket-State-Recheck-Schritt mit Query + Skip-Regel vor der Claim-Schleife |
| `.claude/skills/ticket-ops/SKILL.md` | Phase 3: Invarianten-Hinweis auf den State-Recheck (neben Pre-Check-Invariante [T002422]) |
| `openspec/specs/ticket-ops.md` | SSOT-Requirement via Delta-Spec (ADDED) |
| `tests/spec/ticket-ops/wave1-state-refetch.bats` | Guard (neu, Dokumentationskonvention → grep-Modus) |
| `website/src/data/test-inventory.json` | regeneriert (`task test:inventory`) |

## Edge-Cases

1. **Execution-Wave (`plan_staged` im Snapshot):** Vergleich gegen den **Masterplan-Snapshot**,
   nicht hart gegen `triage` — ein Ticket, das im Snapshot `plan_staged` war und es noch ist,
   wird weiterhin dispatched. Nur Abweichungen vom Snapshot sind stale.
2. **Batch-Parents:** gleiche Regel auf Parent-Ebene; hat ein Kind inzwischen einen Plan, ist
   der Parent stale (Parent-Branch deckt Kinder ab).
3. **Reine Status-Übergänge ohne Lock** (`update-status`, Ticket-Umschreiben) werden erkannt —
   die Lücke, die [T002422] nicht abdeckt.
4. **CI-Kontext:** Die Query läuft zur Laufzeit über mcp-postgres (read-only). Der Guard prüft
   die dokumentierte Prozedur (grep-Modus, T002448-M4-Ausnahme für Dokumentationskonventionen) —
   keine DB im CI nötig.
5. **Stage-Reihenfolge:** `stage-plan` im Worktree über `scripts/ticket.sh` (sanktionierter
   Write-Pfad; ticket-mcp `stage_plan` schlägt im Worktree fehl).
