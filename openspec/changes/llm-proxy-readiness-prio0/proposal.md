# Proposal: llm-proxy-readiness-prio0

## Why

Beobachtetes Symptom (Fakt): `GET 127.0.0.1:18235/health` liefert dauerhaft
`{"status":"degraded","ready":false,"degraded":[]}`, obwohl alle aktiven
Backends gesund antworten (`:1919`, `:8093`, `:8081` je HTTP 200).

Ursache (belegt): `evaluateReadiness` in `scripts/llm-proxy/discovery.mjs`
zaehlt nur Backends mit `priority === 1` als Primaerstufe. Seit T900189
(PR #5665) traegt das einzige Chat-Backend `freetoken-local` `priority 0`.
Die aktiven Prioritaeten sind 0/10/10/30, es gibt also kein Prio-1-Backend,
und die Regel "kein Prio-1-Backend → not ready" greift immer.

```bash
bash -c 'source scripts/factory/lib.sh; factory_resolve; echo "SELECT name,priority FROM tickets.llm_proxy_backends WHERE enabled ORDER BY priority;" | factory_psql'
```

Reproducer: `tests/spec/local-llm-proxy/readiness-primary-tier.bats` Test 1 ist rot.

## What

- Die Primaerstufe umfasst alle Backends mit `priority <= 1` statt nur `priority === 1`.
- Der Cloud-Schutz aus T002336 bleibt: `deepseek` (priority 2) macht den Proxy nie allein ready.
- Das Requirement "Health endpoint reports readiness, not liveness" wird per MODIFIED-Delta angepasst.

## Non-Goals

- Keine Aenderung an den Prioritaeten in `tickets.llm_proxy_backends`.
- Keine dynamische Primaerstufe ("kleinste vorhandene Prioritaet"): sie wuerde bei abgeschaltetem Chat-Backend ein Embed-Backend als primaer werten.

_Ticket: T900212_
