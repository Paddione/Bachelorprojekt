## Why

Die lokalen HTTP-MCP-Endpunkte vertrauen heute allein auf den Loopback-Bind und erlauben teilweise `Access-Control-Allow-Origin: *`; der Kubernetes-CORS-Proxy entfernt sogar `Origin`, `Referer` und Browser-Fetch-Metadaten vor dem Upstream. Damit können fremde Browser-Origin- und DNS-Rebinding-Anfragen Schutzmechanismen umgehen und bei `factory-mcp` mutierende Factory-Tools erreichen.

Die MCP-Transportvorgaben verlangen Origin-Prüfung für HTTP-Server und empfehlen Authentifizierung auch auf localhost. Der bereits abgesicherte `bge-mcp`-Tokenpfad zeigt, dass die Registry und Harness-Generatoren dafür grundsätzlich vorbereitet sind; die Policy ist jedoch nicht einheitlich und nicht fail-closed.

## What Changes

- Eine gemeinsame localhost-Policy für `Host` und `Origin` wird für alle repo-eigenen HTTP-MCP-Oberflächen definiert.
- Browserzugriff wird auf eine explizite, konfigurierbare Allowlist begrenzt; Requests ohne `Origin` bleiben für lokale CLI-Harnesses zulässig.
- `factory-mcp-node` erhält verpflichtende Bearer-Authentifizierung, bevor MCP-Methoden-Routing oder Toolausführung stattfindet. Ein minimaler Liveness-Endpunkt darf tokenfrei bleiben, unterliegt aber der Host-/Origin-Prüfung und gibt keine sensitiven Details aus.
- Der Kubernetes-CORS-Proxy verlangt einen eigenen Bearer-Token und reicht keine nicht autorisierten Browseranfragen an den Upstream weiter. Er darf Browser-Sicherheitsheader erst nach erfolgreicher lokaler Prüfung entfernen.
- `bge-mcp` und `mcp-postgres-local` übernehmen dieselbe Host-/Origin-Prüfung; die bestehende BGE-Authentifizierung bleibt erhalten.
- Registry, generierte Harness-Konfigurationen und Browser-Seed deklarieren benötigte Authorization-Header ohne Klartext-Secrets in getrackten Dateien.
- Verhaltenstests decken erlaubte CLI-Aufrufe, erlaubte llama-Web-UI-Origin, fremde Origins, manipulierte Host-Header, fehlende/falsche Tokens und Preflight-Anfragen ab.

## Capabilities

### New Capabilities

Keine.

### Modified Capabilities

- `mcp-gateway`: Verbindliche Host-/Origin-Validierung und Authentifizierung für lokale HTTP-MCP-Endpunkte und Browser-Brücken.

## Impact

- Betroffene Server und Proxies: `scripts/factory-mcp-node/server.mjs`, `scripts/bge-mcp/server.mjs`, `scripts/mcp-gateway/mcp-postgres-local.mjs`, `scripts/mcp-cors-proxy/proxy.mjs` sowie die lokalen Port-Forward-/Startpfade für browserfähige Monolith-Endpunkte.
- Betroffene Konfiguration: `docs/agent-guide/registry/mcp.yaml`, `scripts/mcp-sync.sh` und daraus erzeugte Harness-/Browser-Konfigurationen.
- Betroffene Tests: neue BATS-Szenarien unter `tests/spec/mcp-gateway/`; bestehende HTTP-MCP-Startup- und Header-Tests werden angepasst.
- Neue Secret-Variablen für Factory-MCP und Kubernetes-CORS-Proxy; keine Tokenwerte werden eingecheckt.
- Bestehende lokale CLI-Harnesses bleiben kompatibel, müssen für neu geschützte HTTP-Server jedoch den generierten Authorization-Header erhalten.

## Non-Goals

- Kein Wechsel auf MCP `2026-07-28`; Protokollmodernisierung bleibt ein eigener Change.
- Keine Änderung an Toolnamen, Eingabeschemata oder fachlicher Toollogik.
- Keine Öffnung der Server auf externe Netzwerkinterfaces und keine Einführung eines zentralen OAuth-Providers für Loopback-Dienste.
