# p1 — Gateway-Gesundheit

`target_files`: `scripts/mcp-gateway/probe.sh`,
`scripts/mcp-gateway/watchdog-check.sh`,
`tests/spec/llm-proxy-embed-mitte.bats`

## 1. RED — Spec (gehört p4, hier nur Referenz)

Der failing-test-Lebenszyklus der Spec liegt in `tasks.d/p4-tests.md`
(RED vor diesem Partial). Dieses Partial liefert die Code-Seite für die
Fälle 2+3 (`18235` in `probe.sh`/`watchdog-check.sh`); Fall 1 (vereinter
Proxy-Host) wird erst mit p2 grün — im Commit vermerken.

## 2. Runtime-Reparatur — `:13005`-Forward (keine Repo-Datei)

`devmesh-forward.service` ist im Restart-Loop (exit 1, Stand 2026-10-09
05:00). Diagnose und Reparatur **vor** jeder Verifikation:

```bash
systemctl --user status devmesh-forward.service
journalctl --user -u devmesh-forward.service --since "1 hour ago" | tail -n 30
kubectl --context devmesh -n workspace get svc/llm-services
```

Erst weiter, wenn `curl -s -m 2 -X POST http://localhost:13005/mcp` (mit
`BGE_MCP_TOKEN` aus `~/.config/bge-mcp/server.env`) eine
`initialize`-Antwort mit `"result"` liefert. Befund (Ursache + Fix) als
Ticket-Kommentar an T901560 — kein Code in diesem Partial dafür.

## 3. GREEN — `:18235` ins Watchdog-Raster

- `probe.sh`: `PORTS=(18080 13005 13001)` um `18235` erweitern. Neue
  Sektion nach BGE-Vorbild, aber **HTTP-Health statt MCP-`initialize`**
  (`:18235` ist kein MCP-Server): `POST /v1/embeddings` mit
  Minimal-Payload (`{"model":"bge-m3","input":["ok"]}`); 200 **oder**
  4xx (Modell/Validierung) zählt als OK (Prozess routenfähig),
  Timeout/5xx zählt als FAIL. Kommentar-Stil wie `probe.sh:41-44`.
- `watchdog-check.sh`: `:18235`-FAIL löst denselben
  `devmesh-forward`-Neustart aus wie `:13005` (ein `kubectl`-Prozess
  trägt `18235:18235 13005:13005`, siehe `devmesh-forward.service:37`).
  Erfolgsmeldung (`OK: alle …`) nennt den neuen Port.

Danach Spec aus Schritt 1 grün laufen lassen (Fälle 2+3 werden grün;
Fall 1 bleibt rot bis p2 — im Commit vermerken).
