# Proposal: terminal-guard-invalid-done-repair

## Why

T003025 wurde fälschlich als `status=done` mit `resolution=null` angelegt
(`created_at == updated_at` — das Ticket hat nie einen Lebenszyklus durchlaufen,
kein Merge-Nachweis existiert). Die Korrektur über den sanktionierten Pfad ist
unmöglich: `transition_status({id: T003025, status: in_progress})` bricht mit
Exit 2 ab — „Cannot transition from 'done' to 'in_progress' — terminal tickets
can only transition to 'archived'" (Terminal-Guard T002382). Der Guard schützt
zu Recht gegen das Wiederaufreißen eines echten Abschlusses — er trifft aber
auch den Fall, in dem `done` nie gültig war, weil es der Anfangszustand ist.
Damit ist ein per Fehleingabe geschlossenes Ticket nur per Direkt-SQL oder über
`archived` + Neuanlage korrigierbar; beides umgeht bzw. verliert die Historie.

## What

**Guard-Ausnahme für ungültiges done** (Operator-Entscheid 2026-08-14):
Ein `done` mit `resolution IS NULL` UND `created_at = updated_at` ist
maschinell von einem gültigen Abschluss unterscheidbar — der Terminal-Guard
nimmt diesen Fall aus, der Übergang zu einem nicht-terminalen Status wird
erlaubt und mit einem sichtbaren WARN quittiert.

Beide Write-Pfade werden konsistent geändert (T002230-Muster „die zwei
Write-Pfade einig"):

1. `scripts/vda/ticket/update-status.sh` — Guard-SELECT um `resolution` und
   `created_at = updated_at` erweitern; im `done:*)`-Zweig die Ausnahme prüfen.
2. `website/src/lib/tickets/transition.ts` — FOR-UPDATE-SELECT um dieselben
   Spalten erweitern; Ausnahme vor dem Throw auswerten.

`archived` bleibt hart — Reparatur nur für `done` (Scope-Begrenzung).

_Ticket: T003072_
