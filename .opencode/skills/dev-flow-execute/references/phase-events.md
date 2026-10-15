# Phase-Events — dev-flow-execute Telemetrie (Detail)

Alle Events über `./scripts/ticket.sh phase` (`ticket-mcp-node` retiriert, T900984 obsolet).
`verify`-Events sind PFLICHT — Schritt 6 erzwingt `verify:done`
fail-closed (`./scripts/ticket.sh assert-phase-chain --id "$TICKET_ID"`).
`plan`/`implement`/`deploy`-Events entstehen automatisch aus den Statuswechseln;
Doppel-Emission ist dank Dedup harmlos.

## Implementierung gestartet (Schritt 2, best-effort)

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement entered --driver devflow --detail "Subagent gestartet" || true
```

## Implementierung fertig + Verifikation gestartet (Schritt 3, PFLICHT)

```bash
./scripts/ticket.sh phase "$TICKET_ID" implement done --driver devflow --detail "Implementierung fertig" || true
./scripts/ticket.sh phase "$TICKET_ID" verify entered --driver devflow --detail "task test:changed + freshness" || true
```

## Verifikation bestanden (Schritt 3, nach grünen Tests, PFLICHT)

```bash
# nach den Tests:
./scripts/ticket.sh phase "$TICKET_ID" verify done --driver devflow --detail "Tests grün · freshness OK" || true
```
