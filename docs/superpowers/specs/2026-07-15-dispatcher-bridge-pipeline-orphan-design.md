---
ticket_id: T001850
plan_ref: null
domains: [factory]
status: draft
---

# dispatcher-bridge-pipeline-orphan — Root-Cause Spec

## Problem / Root Cause

Beobachtet 2026-07-15 an T001828/T001830/T001839 (G-GIT03/G-DB01/G-DB10): jedes Ticket
durchlief zweimal denselben Zyklus — `dev-flow-plan` staged einen Plan (Commit
`chore(plans): stage ...`, `FACTORY-PLAN-REF`-Kommentar), danach 30+ Minuten keine weitere
Phase-Progress-Schreibung, dann `watchdog.sh`: *"pipeline stale > 30min ... Returned to queue
(triage); slot released."* Anschließend re-staged `dev-flow-plan` denselben Plan erneut —
Implement/Verify/Deploy wird nie erreicht.

`pipeline.js` (Zeile ~108-123) hat bereits eine **Resume-Erkennung**: fehlt `A.branch`/
`A.plan_path`, liest es das `FACTORY-PLAN-REF` vom Ticket, setzt `REUSE=true` und überspringt
Scout/Design/Plan — genau das Verhalten, das ein hängengebliebenes Ticket bräuchte, um direkt
bei Implement fortzusetzen.

**Der eigentliche Bug liegt nicht in `pipeline.js`, sondern in `watchdog.sh`:** Es setzt JEDE
stale `in_progress`-Ticket unbedingt auf `status='triage'` zurück (`watchdog.sh:19`) —
unabhängig davon, ob bereits ein `FACTORY-PLAN-REF`-Kommentar (= fertiger, committeter Plan)
existiert. `triage` ist aber kein Status, den `dispatcher-bridge.sh`/`queue.sh` dispatcht
(`queue.sh` verlangt `status='backlog'` für Features) — das Ticket verlässt die automatisierte
Pipeline komplett und wird nur durch einen erneuten, manuellen/eigenständigen
`dev-flow-plan`-Lauf wieder aufgegriffen, der bei Null neu plant statt `pipeline.js`s
eingebaute Resume-Fähigkeit zu nutzen.

(Die tiefere Frage, WARUM die Phase nach dem Plan-Stage-Commit überhaupt hängen bleibt —
vermutlich derselbe Orphaned-Workflow-Effekt wie beim äußeren Dispatcher-Call, T001808-10,
jetzt beim inneren `Workflow({scriptPath:'scripts/factory/pipeline.js'},...)`-Aufruf in
`dispatcher-bridge.sh` — bleibt ungelöst, da sie im Closed-Source-Harness liegt und nicht
deterministisch reproduzierbar ist. Dieser Fix behebt stattdessen die **Konsequenz**: die
Watchdog-Reaktion darf schon vorhandene Planungsarbeit nicht wegwerfen.)

## Fix-Ansatz

`watchdog.sh` prüft vor dem Reset, ob `ticket.sh get --id <ext_id>` ein nicht-leeres
`.plan_ref` liefert (identische Quelle wie `pipeline.js`s Auto-Detect: neuester
`FACTORY-PLAN-REF %`-Kommentar):

- **`plan_ref` vorhanden** (Plan bereits gestaged) → Reset-Ziel `status='backlog'` statt
  `triage`. Für `type='feature'` erfüllt das direkt `queue.sh`s Gate (der Ticket war beim
  ursprünglichen Dispatch bereits `lastenheft_locked=true`, das Flag bleibt unangetastet) —
  der nächste Dispatcher-Tick claimed erneut einen Slot und `pipeline.js` erkennt
  `FACTORY-PLAN-REF` automatisch, überspringt Scout/Design/Plan und fährt bei Implement fort.
  Kommentar-Text ändert sich entsprechend ("plan already staged — resuming via backlog"
  statt "Returned to queue (triage)").
- **kein `plan_ref`** (noch nie geplant) → unverändertes Verhalten: `status='triage'`.

Kein Eingriff in `pipeline.js` oder `dispatcher-bridge.sh` nötig — die Resume-Logik existiert
bereits, sie wird nur nie erreicht, weil der Watchdog vorher den falschen Status setzt.

## Betroffene Subsysteme

- `scripts/factory/watchdog.sh` — Reset-Zielstatus konditional auf `plan_ref`.
- `tests/local/FA-SF-26-watchdog.bats` — neuer Testfall: stale Ticket MIT `FACTORY-PLAN-REF`
  landet auf `backlog`, nicht `triage`; bestehender Testfall (ohne Plan) bleibt `triage`.

## Edge Cases

- Ticket mit `FACTORY-PLAN-REF`, aber `lastenheft_locked` nie gesetzt (z. B. `type='task'`
  ohne Lock-Konzept) → `type='task' AND status='plan_staged'` ist der bestehende Dispatch-Pfad
  in `queue.sh`; für `task`-Tickets ist `plan_staged` (nicht `backlog`) das korrekte
  Reset-Ziel bei vorhandenem `plan_ref`. Der Fix unterscheidet daher nach `type`.
- Mehrere `FACTORY-PLAN-REF`-Kommentare (re-staged) → `ticket.sh get` nimmt bereits den
  neuesten (`ORDER BY created_at DESC LIMIT 1` in `get.sh`), unverändert übernommen.
