---
ticket_id: T006297
plan_ref: openspec/changes/factory-merged-dispatch-gate/tasks.md
status: active
date: 2026-08-15
domains: [bachelorprojekt-test]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: factory-merged-dispatch-gate

## Brainstorming-Ergebnis (superpowers:brainstorming, 2026-08-15)

### Root-Cause-Kette (verifiziert, T002448-M5)

Beobachtet auf T004896/T005565/T005591 (+ T005560) am 2026-08-14, 22:37–23:49 UTC:

```
PR gemergt (22:37–22:52Z) ──► Ticket bleibt offen (auto-close-merged lief nicht:
                              läuft nur 1× pro Service-Activation, der aktive Tick
                              hing im 5-s-Retick-Loop ohne erneuten Aufruf)
     │
     ▼
Ticket in in_progress/plan_staged bleibt dispatchbar
  (queue.sh: reine DB-Query, KEIN Merged-Check)
     │
     ▼
Dispatch → in_progress → Pipeline startet nicht (INFRA, keine Phase-Events)
     │
     ▼
Watchdog (FACTORY_STALE_MIN=0 in Laufzeit-Env): sofort stale →
  Reset auf plan_staged + Kommentar (kein Merged-Check im Sweep)
     │
     └──► Queue nie leer → Idle-Retick (5 s) → Dispatch …  (selbsttragender Loop)
```

### Entscheidungen

| Frage | Entscheidung | Begründung |
|---|---|---|
| Wo bricht man den Loop? | An **beiden** Kanten: Dispatch-Gate (schedule.sh) UND Watchdog-Reset | plan_staged/backlog+gemergt wird vom Gate, in_progress+gemergt vom Watchdog geschlossen. Jede einzelne Kante bräche den Loop auch, aber die Kombination schließt beide beobachteten Zustände sofort. |
| Merged-Check-Quelle | `agent-lock.sh check-merged` (bestehend, T002279) | Einzige Quelle der Wahrheit; Subject-only-Grep auf `[T-id]` in `git log origin/main` (M2-Regel T002506). Kein neuer Helper, keine GitHub-API-Abhängigkeit im Tick-Pfad (gh-Aufrufe kosten Rate-Limits; git ist offline und schnell). |
| Was passiert mit einem gemergten Kandidaten im Gate? | Schließen (done, resolution nach Typ) + Kommentar | Merge = Abschluss (T001092). Das Ticket darf nie wieder in den Dispatch-Pfad; done ist terminal für queue.sh. |
| auto-close-merged in die Retick-Loop? | **Nein** (Kandidat verworfen) | Mit beiden Gates konvergiert der Abschluss im selben Tick; pro-Retick-`gh pr list` würde API-Limits belasten; wakeup.sh bleibt unberührt. |
| STALE_MIN=0 (Ursache der Sofort-Staleness)? | **Nicht angefasst** | Herkunft + Flooor-Diskussion sind Scope von T006364 (watchdog-factory-excluded-scope). Die Gates brechen den Loop unabhängig vom STALE_MIN-Wert. |
| Verhalten bei rc=2 (kein origin/main)? | fail-open + sichtbare WARN | Muster T002418/T002610: ein Umgebungsfehler darf den Dispatch nicht anhalten, muss aber sichtbar sein. |

### Betroffene Subsysteme

- `scripts/factory/schedule.sh` — neuer Gate vor Dependency-Gate (gemergt ist terminaler
  als geblockt) bzw. vor Conflict-Gate/Slot-Claim.
- `scripts/factory/watchdog.sh` — Merged-Check im Stale-Loop nach plan_ref-Extraktion;
  T006364 berührt `_stale_query` (disjunkt, dokumentiert im Proposal).
- `openspec/specs/software-factory.md` — neues Requirement (nicht das von T006364
  modifizierte „Watchdog-Eskalation und Zombie-Cleanup").
- Tests: `tests/spec/software-factory/merged-dispatch-gate.bats`,
  `tests/spec/factory-watchdog/merged-ticket-close.bats`.

### Edge-Cases

1. **Ticket in in_progress, Pipeline arbeitet gerade aktiv** am gemergten Fix: Das
   Watchdog-Gate greift erst beim Stale-Sweep (updated_at veraltet). Ein laufender
   Pipeline-Prozess wird nicht abgebrochen — Restrisiko des Duplikat-Fensters bleibt
   bewusst (Trivial-Severity; der Loop ist gebrochen, das Fenster ist ein einzelner
   laufender Prozess, kein Dauerzustand).
2. **Batch-PR-Titel** (mehrere Ticket-IDs): check-merged prüft die Commit-Subjects auf
   die jeweilige `[T-id]` — funktioniert pro Ticket unabhängig vom Titel.
3. **Ticket auf main gemergt, aber noch offene Child-Tickets**: Das Gate schließt nur
   das jeweilige Ticket; Child-Tickets ohne eigenen Merge bleiben dispatchbar — korrekt,
   denn sie sind nicht gemergt.
4. **is_test_data**: queue.sh filtert is_test_data=true bereits; das Gate sieht nur
   echte Kandidaten. Watchdog-Test nutzt das bestehende Test-Seed-Muster.
5. **Resolution-Ableitung**: fix/bug → fixed, sonst shipped (deckungsgleich mit
   auto-close-merged, Dual-Vokabular T002329).
6. **Mehrere parallele Sessions / laufende Claims**: Das Gate läuft VOR dem
   Slot-Claim; ein gemergtes Ticket bekommt nie einen Slot. Bestehende Claims werden
   nicht angefasst.
