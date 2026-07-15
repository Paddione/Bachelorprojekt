# Proposal: dispatcher-bridge-pipeline-orphan

## Why

T001828/T001830/T001839 hingen 2026-07-15 zweimal hintereinander in derselben Schleife:
`dev-flow-plan` staged einen Plan, danach 30+ Minuten kein Fortschritt, `watchdog.sh` setzt
den Status unbedingt auf `triage` zurück, ein neuer `dev-flow-plan`-Lauf staged denselben
Plan erneut — Implement/Verify/Deploy wird nie erreicht. `pipeline.js` hat bereits eine
eingebaute Resume-Erkennung (`FACTORY-PLAN-REF`-Auto-Detect, Zeile ~111-123), die
Scout/Design/Plan überspringt, sobald ein Plan schon existiert — sie wird aber nie erreicht,
weil `watchdog.sh` das Ticket vorher aus dem Dispatch-fähigen Status (`backlog`/`plan_staged`)
in `triage` wirft, wo es kein automatisierter Pfad mehr aufgreift.

## What

`watchdog.sh` prüft vor dem Reset eines stale `in_progress`-Tickets, ob bereits ein
`FACTORY-PLAN-REF`-Kommentar existiert (`ticket.sh get --id <id> | jq -r '.plan_ref'`):

- Kein Plan vorhanden → `status=triage` (unverändert).
- Plan vorhanden, `type=feature` → `status=backlog` (re-qualifiziert sich sofort für
  `queue.sh`s Dispatch-Gate; `lastenheft_locked` bleibt unangetastet).
- Plan vorhanden, `type=task` → `status=plan_staged` (matcht `queue.sh`s bestehenden
  Task-Pfad).

Kein Eingriff in `pipeline.js` oder `dispatcher-bridge.sh` nötig — deren Resume-Logik
existiert bereits und wird durch diesen Fix erstmals erreichbar.

## Out of Scope

- Die tiefere Ursache, warum die Pipeline nach dem Plan-Stage-Commit überhaupt hängen bleibt
  (vermuteter Orphaned-Workflow-Effekt im Closed-Source-Harness, analog T001808-10, jetzt beim
  inneren `Workflow(pipeline.js)`-Call in `dispatcher-bridge.sh`) — nicht deterministisch
  reproduzierbar, daher kein Fix-Ziel dieses Changes. Dieser Change behebt die Konsequenz
  (weggeworfene Planungsarbeit), nicht die harness-seitige Ursache.
