# Proposal: plan-qa-check-parse

## Why

Die advisory Plan-QA (`scripts/plan-qa-check.sh`) meldete beim Plan-Stage fuer T003077
`FAIL — Missing criteria: Could not parse missing items` statt einer inhaltlichen
Rueckmeldung. Die Zeile steht unveraendert in `scripts/plan-qa-check.sh:186`; am 2026-08-10
gegen einen Fixture-Gateway reproduziert (Antwort in einem ```json-Fence → beide Iterationen
melden denselben Parse-Fehler, exit 1).

Dahinter liegen zwei Defekte:

1. **Parse.** Drei getrennte `python3 -c`-Bloecke rufen `json.loads()` direkt auf dem
   Modell-Content auf. Ein Markdown-Fence oder ein einleitender Satz — beides liefern Modelle
   trotz gegenteiliger Prompt-Anweisung — laesst alle drei scheitern.
2. **Sichtbarkeit (der eigentliche Wert).** Die Pruefung wird als
   `bash scripts/plan-qa-check.sh … || true` aufgerufen; ihr Exit-Code traegt keine
   Information. Alle Ausfallpfade enden mit `exit 0` und sind von einem bestandenen Lauf nicht
   zu unterscheiden — eine uebersprungene Pruefung sieht aus wie eine bestandene. Umgekehrt
   wird ein Parse-Ausfall als inhaltliches Verdict `FAIL` ueber den Plan ausgegeben. T002848
   haelt genau diese Klasse fuer alle LLM-gestuetzten Pruefungen im Repo fest.

## What

- Eine maschinenlesbare Ergebniszeile `RESULT: <PASS|FAIL|SKIPPED|ERROR>` auf **jedem**
  terminierenden Pfad. `SKIPPED`/`ERROR` sind damit weder als PASS noch als inhaltliches FAIL
  lesbar.
- Toleranter Content-Parse (Fence/Prosa-Umrahmung) in **einem** Durchgang statt drei
  unabhaengigen Teilparses.
- Ein uninterpretierbarer Content fuehrt zu `RESULT: ERROR` mit Antwort-Auszug, nicht zu einem
  Verdict — und nicht in den Auto-Fix-Loop, der sonst einen leeren Abschnitt an den geprueften
  Plan haengt.

_Ticket: T003112_
