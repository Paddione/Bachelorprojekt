# Proposal: queue-dispatch-bug-type

## Why

Die Dispatch-Query in `scripts/factory/queue.sh` filtert über `status` **und** `type`, kennt
aber nur zwei Kombinationen: `feature`+`backlog` und `task`+`plan_staged`. `type='bug'`
kommt in keinem Zweig vor.

Ein Bug-Ticket, für das `dev-flow-plan` einen Plan gestaged hat, ist damit für den
Dispatcher strukturell unsichtbar. Es bleibt dauerhaft in `plan_staged` liegen — ohne
Fehlermeldung, ohne Warnung, ohne dass irgendein Monitoring anschlägt. Der einzige
Hinweis ist ein Ticket, das nie in Arbeit geht.

Am 2026-07-27 waren drei Tickets betroffen: T002278 und T002321 (beide `bug`, beide mit
gültigem `FACTORY-PLAN-REF`, beide von `queue.sh` nicht geliefert) sowie T002335
(`bug`, Priorität hoch, LLM-Watchdog) — für letzteres existiert bereits ein Worktree mit
gestagtem Plan, der seither wartet.

Verschärfend: `factory-mcp`s `factory_queue` meldet Tickets nach `status`, der Dispatcher
wählt nach `status` × `type`. Beide Sichten driften auseinander, und die optimistischere
ist die sichtbarere — die Queue sieht voller aus, als sie ist.

## What

Der bestehende `plan_staged`-Zweig der WHERE-Klausel wird von `type='task'` auf
`type IN ('task','bug')` erweitert. Die Begründung des Zweigs gilt unverändert für beide
Typen: Der Plan ist bereits von `stage-plan` verfasst und lint-gegated, also greift kein
Lastenheft-Gate.

Bewusst **ein** Zweig statt eines zusätzlichen OR-Zweigs: Nur so teilen sich Tasks und Bugs
dieselben Readiness-Gates (`execution_released`, `factory_excluded`). Ein zweiter Zweig
müsste sie duplizieren — genau die Divergenz, die T002361 schließen musste.

Nicht Teil dieses Changes:

- `feature`+`plan_staged` behält den Weg über `auto-enqueue.sh` → `backlog` und seinen
  `lastenheft_locked`-Gate. Dieser Gate ist eine bewusste, getestete Sicherheitseigenschaft
  ("queue.sh gates the autopilot on a locked Lastenheft (fail-closed)"), keine Nachlässigkeit.
- `project`+`backlog` bleibt außen vor — Epics werden in Kinder zerlegt statt direkt gebaut.

_Ticket: T002333_
