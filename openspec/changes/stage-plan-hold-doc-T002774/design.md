# T002774: --hold im Fix-Pfad-Beispiel + MCP stage_plan hold-Parameter

## Problem

Das Referenzbeispiel des Fix-Pfads in `dev-flow-plan-phases.md` Schritt 4.5 lässt `--hold` weg.
Im Feature-Pfad (`ticket-stage-procedure.md`) ist `--hold` dagegen explizit gesetzt und
dokumentiert.

Ohne `--hold` weckt `stage-plan.sh` am Ende `factory.service` — das Ticket wird sofort
dispatched, obwohl der Planer `dev-flow-execute` erst später aufrufen will.

Zusätzlich: Der MCP-First-Pfad (`stage_plan`-Tool) unterstützt gar kein `hold`-Flag. Die
MCP-Tool-Definition in `workflow.go` leitet nur `--id`, `--branch`, `--plan` durch.

## Fix

1. `dev-flow-plan-phases.md` Schritt 4.5: `--hold` zur CLI-Fallback-Zeile hinzufügen
2. `workflow.go` `stage_plan`-Tool: `hold`-Parameter (optional boolean) hinzufügen
3. `dev-flow-plan-phases.md` Schritt 4.5: MCP-First-Aufruf um `hold: true` ergänzen

Keine Änderung an `stage-plan.sh` nötig — es unterstützt `--hold` bereits (Zeile 52).
