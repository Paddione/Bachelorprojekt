# p3 — stage_plan(hold:true): MCP/CLI-Readiness-Drift (T002937)

## Ziel

`mcp__ticket-mcp__stage_plan(hold:true)` setzt status=plan_staged + plan_ref,
aber readiness bleibt null — der CLI-Fallback (`scripts/vda/ticket/stage-plan.sh`
Z.~119) setzt `{"execution_released":false}`. Ein per MCP mit hold gestagtes
Ticket könnte von der Factory dispatcht werden, obwohl Hold verlangt war.

## Steps

1. **RED.** Test in `tests/spec/batch-ticket-ops-meta-fixes.bats` (oder Go-Unit-Test):
   stage_plan(hold:true) über MCP setzt execution_released=false.
   `expected: FAIL` (readiness bleibt null).

2. **GREEN.** In `scripts/ticket-mcp/go/internal/tools/stage_plan.go`:
   hold:true → readiness JSONB-Merge `{"execution_released":false}` (wie CLI);
   hold:false → `{"execution_released":true}`. `scripts/vda/ticket/stage-plan.sh`
   als Referenz (Zeile ~119).

3. **Verifikation.** Fall aus T002937: MCP-hold-Ticket hat execution_released=false.

## Acceptance

- MCP stage_plan(hold) setzt readiness identisch zum CLI-Fallback.
- Kein unbeabsichtigter Factory-Dispatch bei hold:true.
