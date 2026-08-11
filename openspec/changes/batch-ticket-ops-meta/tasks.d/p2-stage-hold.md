# p2 — MCP stage_plan(hold:true): Readiness-Parität zum CLI-Fallback (T002937)

_Ticket: T003541 · Partial p2 (impl) · Kind: T002937_

## Ziel

`mcp__ticket-mcp__stage_plan(hold:true)` muss dieselbe readiness setzen wie der
CLI-Fallback `scripts/vda/ticket/stage-plan.sh` — sonst kann ein per MCP mit
hold gestagtes Ticket von der Factory dispatcht werden, obwohl der Aufrufer
explizit Hold verlangt hat.

## Befund (T002937)

Bei T002925 wurde stage_plan über ticket-mcp mit hold:true aufgerufen. status
wurde korrekt auf plan_staged gesetzt, plan_ref korrekt befüllt. Aber
`tickets.tickets.readiness` lieferte null — nicht
`{"execution_released": false}`, wie der CLI-Fallback es bei --hold setzt.

## Wichtige Vorprüfung — ggf. bereits gefixt

Der MCP-Wrapper in `scripts/ticket-mcp/go/internal/tools/workflow.go` (Tool
`stage_plan`, ca. Z. 92-118) übersetzt seit T003267 den bool-Parameter `hold`
korrekt in `--hold`/`--no-hold` und ruft damit `ticket.sh stage-plan` auf —
welches intern `scripts/vda/ticket/stage-plan.sh` sourced, das die readiness
setzt. Der T002937-Befund datiert vom 2026-08-09 (VOR T003267, gemergt
2026-08-10 15:38). **Die Drift kann also bereits behoben sein.**

**Plan-Auftrag:** ZUERST den Ist-Zustand testen (RED-Test), DANN nur den
tatsächlich verbleibenden Drift fixen. Wenn der Test auf dem aktuellen Branch
bereits grün ist: Fix = Test als Regressionsschutz behalten + keinen Code
umbauen. Kein Blind-Fix an einer nicht existierenden Datei — der frühere
Plan-Entwurf referenzierte fälschlich `stage_plan.go`; das Tool lebt in
`workflow.go`.

## Steps

1. **RED.** Go-Unit-Test in `scripts/ticket-mcp/go/internal/tools/workflow_test.go`:
   - Der `stage_plan`-Tool-Handler baut aus hold:true die Argumentliste mit
     `--hold` (und aus hold:false/fehlend mit `--no-hold`).
   - Erwartung im Defekt-Fall: die Argumentliste enthält KEIN `--hold` bzw. die
     readiness-Auswirkung ist nicht abgedeckt → Test schlägt fehl bzw. deckt
     das Verhalten sichtbar ab. (Test verifiziert die Argument-Konstruktion des
     Handlers; die readiness-Setzung selbst ist CLI-Seite und wird durch den
     BATS-Test in p6 auf der CLI-Ebene abgedeckt.)

2. **GREEN.** Nur falls die Vorprüfung einen verbleibenden Drift zeigt:
   - `scripts/ticket-mcp/go/internal/tools/workflow.go`: sicherstellen, dass
     hold:true → `--hold` (readiness `{"execution_released":false}` via
     CLI-JSONB-Merge) und hold:false → `--no-hold`.
   - `scripts/vda/ticket/stage-plan.sh` als Referenz (Z. ~125-130).

3. **Verifikation.** Fall aus T002937: MCP-hold-Ticket hat
   execution_released=false in readiness.

## Acceptance

- MCP stage_plan(hold) verhält sich identisch zum CLI-Fallback
  (execution_released=false bei hold, Factory dispatcht nicht).
- Regressionstest bleibt im Repo (schützt vor erneutem Auseinanderlaufen).
