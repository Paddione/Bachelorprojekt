---
ticket_id: T006364
plan_ref: openspec/changes/watchdog-factory-excluded-scope/tasks.md
status: active
date: 2026-08-15
---

# Design: watchdog-factory-excluded-scope

## Root-Cause

Der Stale-Sweep in `scripts/factory/watchdog.sh` (`_stale_query`) selektiert Kandidaten
ausschließlich über `type NOT IN (...)` + `status='in_progress'` + `updated_at < now() -
STALE_MIN`. Mit `FACTORY_STALE_MIN=0` ist damit **jedes** `in_progress`-Ticket sofort
stale — auch eines, das eine manuelle Session per branch-scoped Claim übernommen hat.

Evidenz:

- **Reproducer (Output, ohne Cluster):** `FACTORY_STALE_MIN=0 bash
  scripts/factory/watchdog.sh --print-stale-query` →
  `SELECT external_id, type FROM tickets.tickets WHERE type NOT IN ('project','incident')
  AND status='in_progress' AND updated_at < now() - make_interval(mins => 0);` — kein
  `factory_excluded`-Filter.
- **Gate-Divergenz:** `queue.sh` filtert in beiden Dispatch-Lanes auf
  `COALESCE((readiness->>'factory_excluded')::boolean, false) = false` (T002361-Kommentar:
  "durable half of `ticket.sh unfactory`"). Der Watchdog kennt das Flag nicht.
- **Defer-Stillstand:** Die Factory-Pipeline deferriert am fremden branch-scoped Claim
  (T003677, `fix-factory-lock-worktree-safety.md`) und lässt den Status unangetastet —
  das `in_progress` bleibt also genau dann stehen, wenn eine manuelle Session arbeitet.
  Genau dieses stehen gebliebene `in_progress` resettet der Watchdog.
- **Beobachtung:** Livelock 22:41–22:54 UTC an T005560, beendet durch manuelles
  `factory_excluded=true`.

## Fix-Ansatz (Entscheidung)

**Ansatz A (gewählt): Watchdog respektiert `readiness.factory_excluded=true`.**

Der Stale-Sweep erhält denselben Gate, den `queue.sh` in beiden Lanes anwendet. Eine
WHERE-Klausel in `_stale_query` deckt beide Sweep-Pfade ab (Reset und Eskalation):
Tickets mit `factory_excluded=true` sind keine Stale-Kandidaten. Begründung:

1. **Bestehendes, bewährtes Escape-Hatch:** Der Workaround hat den Livelock real beendet;
   der Fix macht ihn zur stabilen Vertrags-Semantik statt zum Einmal-Trick.
2. **Konsistenz:** queue.sh-Kommentar nennt das Flag "the durable half of `ticket.sh
   unfactory`" — der Watchdog darf eine bewusste menschliche Entscheidung nicht
   überschreiben.
3. **Minimal-invasiv:** eine Bedingung in der Query; keine neue Laufzeit-Abhängigkeit,
   kein Branchname-Parsing, keine Liveness-Heuristik.
4. **Testbar:** das bestehende `--print-stale-query`-Muster (Output-Verifikation,
   T002448-M4) prüft die Query — kein Cluster nötig, rot/grün ohne DB.

**Verworfen — Ansatz B (branch-scoped Claims als Fortschritt werten):** Eine hängende
Pipeline hinterlässt ihren eigenen branch-scoped Claim (T003677, Label
`factory-pipeline`, Heartbeat-TTL 1800s). Ein Live-Lock-Check im Stale-Sweep würde genau
die hängenden Pipelines nie mehr zurücksetzen — der Kernzweck des Watchdogs
(T002361/T002389) wäre ausgehebelt. Zusätzlich hält die manuelle Session bewusst keinen
ticket-scoped Lock (T003102), und der Branchname ist nicht stabil aus der `external_id`
ableitbar (Naming-Konventionen variieren je nach Typ/Slug). Die Drei-Signal-Erkennung
für aktive Arbeit gehört in den T002770-Orphan-Sweep (60-min-Karenz, lock/branch/
worktree) — nicht in den Stale-Sweep.

**Verworfen — Fortschrittsdefinition erweitern (z. B. `implement:entered` zählen):** Die
done-state-Definition ist bewusst (T002361); ein Defer schreibt gar kein
`implement:entered`. Nicht die Ursache.

## Prozess-Teil (type=process)

Der Fortsetzungs-Kontrakt (`.claude/skills/references/factory-resume-contract.md`)
erhält einen Abschnitt "Manuelle Übernahme": Wer ein Factory-gestagtes Ticket manuell
übernimmt (dev-flow-execute), setzt unmittelbar nach dem Branch-Claim
`readiness.factory_excluded=true` via `ticket.sh plan-meta set --readiness
factory_excluded=true`. Watchdog und queue.sh respektieren das Flag — damit ist der
Livelock kausal ausgeschlossen (kein Reset, kein erneuter Dispatch), nicht nur
abgekürzt. Ohne das Flag bleibt die Übernahme ungeschützt: Der Watchdog resettet,
die Queue dispatcht, die Pipeline deferriert — der Ping-Pong läuft weiter.

## Betroffene Dateien

| Datei | Art | Rolle |
|---|---|---|
| `scripts/factory/watchdog.sh` | ändern | `_stale_query`: factory_excluded-Filter + Kommentar |
| `tests/spec/factory-watchdog/factory-excluded-scope.bats` | neu (RED) | Output-Verifikation über `--print-stale-query` |
| `openspec/changes/watchdog-factory-excluded-scope/specs/software-factory.md` | neu (MODIFIED-Delta) | Requirement "Watchdog-Eskalation und Zombie-Cleanup" + Scope-Regel |
| `.claude/skills/references/factory-resume-contract.md` | ändern | Abschnitt "Manuelle Übernahme" (Workaround als Vertrag) |
| `website/src/data/test-inventory.json` | regenerieren | CI-Inventory-Gate |

## Testdesign (RED → GREEN)

`tests/spec/factory-watchdog/factory-excluded-scope.bats`:

1. Positiv-Anker (T002356-M1): `--print-stale-query` liefert Exit 0 und eine nicht-leere
   Query, die `status='in_progress'` enthält (das bestehende `stale-type-coverage.bats`
   macht dasselbe).
2. Kernaussage: Die Query enthält den factory_excluded-Gate — `factory_excluded` und
   `readiness` als Substrings. Rot ohne Fix (Filter fehlt), grün mit Fix.
3. Gegenprobe (Negativ mit Anker): Der `type`-Denylist-Teil bleibt unverändert —
   `'project'` bleibt ausgeschlossen (kein Regression des T002674-Verhaltens).

Verifikation ohne Cluster: `bats tests/spec/factory-watchdog/factory-excluded-scope.bats`
— rot vor, grün nach dem Fix.
