# Proposal: factory-reclaim-lock-respect

## Why

Ein Ticket soll normal in die Factory gestaget werden und in der Queue sichtbar bleiben —
aber solange eine interaktive Session es hält oder gar kein Worker daran arbeitet, muss es
sich ohne Umwege entnehmen und selbst bearbeiten lassen. Heute geht beides nicht.

Am 2026-07-27 (T002255) griff der laufende Factory-Tick ein Ticket unmittelbar nach
`ticket.sh stage-plan` (`status=in_progress`, `pipeline_slot=1`), obwohl `dev-flow-plan`
laut Kontrakt bei `plan_staged` stoppt und dem Menschen die Ausführungswahl lässt.
Zurückholen ging nur über den Umweg `status=blocked`, weil `plan_staged` beim nächsten Tick
sofort erneut dispatcht worden wäre. `blocked` ist dabei semantisch falsch: der Plan ist
fertig, es blockiert nichts. Zusätzlich stand ein zweites Ticket in der Queue, das auf
denselben Plan und Branch zeigte — zwei Agenten wären parallel auf einem Branch gelandet.

Die Ursache ist ein Sentinel, der nicht tut, was sein Name verspricht:
`scripts/factory/dispatcher.js` liest zwar `agent-lock.sh list`, prüft aber nur per Regex
auf das Label `interactive-worker` und reduziert dann lediglich `maxParallel` um 1. Das ist
ticket-unabhängig — es hält allgemein einen Slot frei, statt ein bestimmtes Ticket zu
überspringen — und greift ohnehin nie, weil die dev-flow-Skills mit den Labels
`dev-flow-plan`/`dev-flow-execute` claimen.

## What

- **`scripts/factory/dispatcher.js`** fragt pro Kandidat-Ticket `agent-lock.sh check ticket
  <id>` und überspringt es bei Exit 3 (`held`). Der alte `interactive-worker`-Regex samt
  pauschalem `maxParallel`-Abzug entfällt. Übersprungene Tickets werden geloggt.
- **`scripts/ticket-reclaim.sh` (neu)**, dispatcht von `ticket.sh reclaim <id>`: prüft
  Worker-Liveness über `updated_at` (dieselbe Semantik wie `watchdog.sh`), gibt bei totem
  oder fehlendem Worker den Slot frei, setzt den Status zurück auf **`plan_staged`** und
  claimt das Ticket für die aufrufende Session. Lebt ein Worker, bricht es mit Hinweis auf
  Slot, Status und Alter des letzten Fortschritts ab — Übernahme nur mit `--force`.
- **`scripts/factory/queue.sh` bleibt unverändert.** Die Sichtbarkeit in der Queue ist
  gewollt: die Factory sieht das Ticket, fasst es aber nicht an.
- **`scripts/agent-lock.sh` bleibt unverändert.** Sein `check`-Kontrakt genügt bereits und
  ist von sich aus stale-sicher — ein toter Lock meldet `free` und blockiert nichts.

Damit bleibt `plan_staged` der ehrliche Zustand, und die Zuständigkeit wird über den Lock
ausgedrückt statt über einen verbogenen Status.

_Ticket: T002267_
