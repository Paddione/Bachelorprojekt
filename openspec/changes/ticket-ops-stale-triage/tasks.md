---
title: "ticket-ops-stale-triage — Implementation Plan"
ticket_id: T006295
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-ops-stale-triage — Implementation Plan

_Ticket: T006295_

## File Structure

| Datei | Ist | Budget |
|-------|-----|--------|
| `.claude/skills/references/ticket-ops-procedures.md` | 568 | kein S1-Limit (.md nicht gerated) |
| `.claude/skills/ticket-ops/SKILL.md` | 193 | kein S1-Limit (.md nicht gerated) |
| `openspec/specs/ticket-ops.md` | 66 | kein S1-Limit (.md nicht gerated) — SSOT-Ergänzung via Delta-Spec beim Archivieren |
| `tests/spec/ticket-ops/wave1-state-refetch.bats` | neu | kein S1-Limit (.bats nicht gerated) |
| `website/src/data/test-inventory.json` | regeneriert | generiert |

## Task 1: RED — Guard-Test für den Ticket-State-Recheck schreiben

Schreibe den Guard-Test `tests/spec/ticket-ops/wave1-state-refetch.bats` (liegt bereits im
Branch vor, wurde im Plan-Commit eingebracht) und verifiziere, dass er auf dem aktuellen Stand
rot ist: Die Step-3.6-Sektion in `ticket-ops-procedures.md` enthält weder die Re-Fetch-Query noch
die STALE-STATE-Skip-Regel.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-ops/wave1-state-refetch.bats
# expected: FAIL (red — die Dispatch-Prozedur dokumentiert den State-Recheck noch nicht)
```

Der Test prüft (grep-Modus, Dokumentationskonvention nach T002448-M4):
- Positiv-Anker: die Step-3.6-Sektion existiert und ist nicht leer (T002356-M1).
- Die Sektion referenziert die Re-Fetch-Query über `tickets.tickets` mit `status` und dem
  `FACTORY-PLAN-REF`-Marker aus `tickets.ticket_comments`.
- Die Sektion enthält `STALE-STATE` und die Regel, dass nur seit dem Snapshot unveränderte
  Tickets dispatched werden.

## Task 2: GREEN — Ticket-State-Recheck in die Dispatch-Prozedur aufnehmen

Ergänze in `.claude/skills/references/ticket-ops-procedures.md` §Step 3.6 (vor der Claim-Schleife)
einen Schritt „Ticket-State-Recheck [T006295]“:

- Eine billige Query über die reale Schema-Referenz (verifiziert 2026-08-15):

```sql
SELECT t.external_id, t.status,
       EXISTS (SELECT 1 FROM tickets.ticket_comments c
               WHERE c.ticket_id = t.id AND c.body LIKE 'FACTORY-PLAN-REF %') AS has_plan_ref
FROM tickets.tickets t
WHERE t.external_id = ANY($wave1_ids);
```

- Die Stale-Regel: Ein Ticket ist `STALE-STATE`, wenn der re-fetchte `status` vom
  Masterplan-Snapshot abweicht ODER `has_plan_ref` wahr ist. Vergleichsbasis ist der Zustand,
  den der Masterplan für das Ticket erfasst hat (Execution-Wave-Tickets waren bereits
  `plan_staged` im Snapshot und bleiben dispatchebar, solange der Zustand unverändert ist).
- Stale-Tickets werden als `STALE-STATE: T00XXXX …` gemeldet, aus der Wave-Menge entfernt und
  NICHT dispatched (sie gehören einer laufenden Parallelsession).
- Der Schritt steht VOR dem ersten `claim`-Aufruf der Dispatch-Schleife.

Ergänze in `.claude/skills/ticket-ops/SKILL.md` Phase 3 neben der Pre-Check-Invariante
[T002422] einen Invarianten-Hinweis „Ticket-State-Recheck [T006295]“, der auf den neuen
Prozedur-Schritt in §Step 3.6 verweist.

## Task 3: Verify — Tests grün und Gates sauber

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-ops/wave1-state-refetch.bats
# expected: PASS (green — Prozedur dokumentiert den State-Recheck)
```

Danach die drei mandatory Verify-Commands:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

- Nach der Test-Änderung `task test:inventory` regenerieren und
  `website/src/data/test-inventory.json` mitcommitten (CI-Inventar-Check failt sonst).
- `bash scripts/openspec.sh validate` muss grün sein (Delta-Spec-Konvention T001304:
  Datei `specs/ticket-ops.md` nach dem Parent-SSOT-Slug benannt).
