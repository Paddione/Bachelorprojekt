# Phase-Events — dev-flow-execute Telemetrie (Detail)

Alle Events **MCP-first** (`ticket-mcp-node`); Fallback `./scripts/ticket.sh phase`, wenn
ticket-mcp nicht erreichbar. `verify`-Events sind PFLICHT — Schritt 6 erzwingt `verify:done`
fail-closed (`./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"`).
`plan`/`implement`/`deploy`-Events entstehen automatisch aus den Statuswechseln;
Doppel-Emission ist dank Dedup harmlos.

## Implementierung gestartet (Schritt 2, best-effort)

> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "entered", driver: "devflow", detail: "Subagent gestartet · agent_id=$IMPLEMENTER_AGENT_ID" })`

Fallback:
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

## Implementierung fertig + Verifikation gestartet (Schritt 3, PFLICHT)

> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "implement", state: "done", driver: "devflow", detail: "Implementierung fertig" })`
> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "entered", driver: "devflow", detail: "task test:changed + freshness" })`

## Verifikation bestanden (Schritt 3, nach grünen Tests, PFLICHT)

> `mcp__ticket-mcp-node__record_phase_event({ id: "$TICKET_ID", phase: "verify", state: "done", driver: "devflow", detail: "Tests grün · freshness OK" })`

Fallback (Schritt 3, gebündelt):
```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:changed + freshness" || true
# nach den Tests:
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```
