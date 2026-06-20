# MCP-Tool-Guide — MCP-Schnellweg vs. kubectl-Fallback

SSOT für die MCP-native Tool-Nutzung in Skills und Subagents. Skills verlinken hierher statt die
Tabelle zu duplizieren. Die MCP-Server laufen via `scripts/mcp-portforward.sh` (Portforward auf
`localhost`), registriert in `.mcp.json`.

## Server → Port → Tool → Anwendungsfall

| MCP-Server | Endpoint | Tool / Prefix | Anwendungsfall |
|---|---|---|---|
| `mcp-postgres` | `http://localhost:13001/mcp` | `mcp__mcp-postgres__query` (Param: `sql`) | **Read-only** SQL (SELECT) als `website`-User — Ticket-Pool, staged-plans, planning-Count, Timeline-Reads |
| `mcp-kubernetes` | `http://localhost:18080/sse` | `mcp__mcp-kubernetes__*` | Strukturierte k8s-Status-/Read-Operationen (Pods, Logs, Describe) |

> **`mcp__mcp-postgres__query` ist READ-ONLY und nimmt NUR `sql`.** Kein `connectionString`-Argument
> — die Verbindung ist serverseitig fest (`localhost:13001`, siehe `.mcp.json`). INSERT/UPDATE/DELETE
> gehen NICHT über dieses Tool.

## Portforward-Guard (vor MCP-Nutzung prüfen)

```bash
bash scripts/mcp-portforward.sh status
# oder gezielt nur postgres:
curl -s --max-time 2 -o /dev/null -w '%{http_code}' \
  -X POST -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"hc","version":"1"}}}' \
  http://localhost:13001/mcp
# 200 → MCP erreichbar; alles andere → kubectl-Fallback nutzen
```

Wenn der Portforward nicht läuft: `bash scripts/mcp-portforward.sh start`. Schlägt das fehl oder ist
der Cluster-Kontext nicht gesetzt → **kubectl-Fallback** (der jeweilige `psql`-/`kubectl`-Block im Skill).

## Wann MCP, wann kubectl

**MCP bevorzugen** (wenn Guard = erreichbar):
- Read-only SELECTs gegen `tickets.*`, `knowledge.*`, `v_timeline` → `mcp__mcp-postgres__query`
- k8s-Status/Read (Pod-Liste, Logs, Describe) → `mcp__mcp-kubernetes__*`


**Bleibt kubectl (Pflicht, kein MCP-Äquivalent / fehlende Rechte):**
- **DDL als `postgres`-Superuser** auf den Schemas `bachelorprojekt`, `coaching`, `knowledge`
  (Tabellen-Owner = `postgres`). MCP-Postgres verbindet als `website` ohne Superuser-Rechte → DDL
  schlägt mit „must be owner" fehl. Pflicht:
  ```bash
  PGPOD=$(kubectl get pod -n workspace --context <env> -l app=shared-db -o name | head -1)
  kubectl exec -i "$PGPOD" -n workspace --context <env> -- psql -U postgres -d website < migration.sql
  ```
- **Schreibende SQL** (INSERT/UPDATE/DELETE/UPSERT) — `mcp__mcp-postgres__query` ist read-only → kubectl.
- **`kubectl apply` / `kubectl rollout restart`** und sonstige Manifest-Mutationen.
- **Sealed Secrets / RBAC / Cluster-Level-Operationen.**
