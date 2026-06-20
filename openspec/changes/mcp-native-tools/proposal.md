---
slug: mcp-native-tools
status: planning
ticket: none
---

# MCP-native Tool-Nutzung in Skills und Subagents

## WARUM

Die aktuellen Skills nutzen durchgehend `kubectl exec -n workspace deploy/shared-db -- psql ...` für PostgreSQL-Abfragen und `kubectl` direkt für Kubernetes-Operationen. Das hat mehrere Nachteile:

- **Latenz**: Jeder kubectl-exec-Aufruf durchläuft k8s-API → Pod → stdin; typisch 300–800 ms Overhead pro Query
- **Kopplung**: Skills erfordern aktiven kubeconfig-Kontext — scheitert lautlos wenn Context falsch ist
- **Boilerplate**: Skills müssen PGPOD ermitteln, Context setzen, Fehlerbehandlung selbst machen
- **Subagent-Blindheit**: Subagents (via Agent-Tool) bekommen MCP-Tools vererbt, werden aber in den Skills nie explizit darauf hingewiesen — nutzen stattdessen Bash+kubectl

MCP-Server laufen bereits produktiv via `scripts/mcp-portforward.sh`:
- `mcp-postgres` → `localhost:13001` (direkt als `website`-User)
- `mcp-kubernetes` → `localhost:18080` (k8s-Operationen, strukturiertes JSON)
- `mcp-keycloak` → `localhost:18081` (Realm-Operationen)
- `mcp-github` → `localhost:13002` (GitHub-API)
- `mcp-browser` → `localhost:13000` (Browser-Automation)

Das Portforward-Skript hat bereits JSON-RPC Health-Checks eingebaut (`status()`-Funktion mit `--max-time 3`).

## WAS

1. **Skill-Direktiven**: Relevante Skills bekommen einen MCP-Schnellweg als bevorzugte Option, kubectl-exec als expliziten Fallback
2. **CLAUDE.md Agent-Routing**: Routing-Tabelle bekommt `MCP-Primär`-Spalte damit Subagents wissen, welchen MCP-Server sie bevorzugen sollen
3. **Portforward-Guard-Pattern**: Einheitliche Prüfung (`bash scripts/mcp-portforward.sh status` oder `curl localhost:13001/mcp`) wird in Skills standardisiert

## GRENZEN (was bleibt kubectl)

- **DDL als postgres-Superuser**: `bachelorprojekt`, `coaching`, `knowledge`-Schemas erfordern postgres-User — MCP-Postgres verbindet als `website`-User ohne Superuser-Rechte → kubectl exec bleibt Pflicht für DDL-Migrationen
- **k8s-Manifest-Apply**: `kubectl apply`, `kubectl rollout restart` etc. → kein MCP-Äquivalent
- **Sealed Secrets / RBAC**: Cluster-Level-Operationen bleiben kubectl

## Betroffene Dateien

- `CLAUDE.md` — Agent-Routing-Tabelle erweitern
- `.claude/skills/dev-flow-execute/SKILL.md` — MCP postgres für staged-plans-Queries
- `.claude/skills/dev-flow-plan/SKILL.md` — MCP postgres für staged-plans und planning-Count
- `.claude/skills/feature-intake/SKILL.md` — MCP postgres für Ticket-Pool-Queries
- `.claude/skills/ticket-ops/SKILL.md` — psql-Hilfsfunktion → MCP-Bevorzugung
- `.claude/skills/mishap-tracker/SKILL.md` — psql-Helper → MCP-Bevorzugung
- `.claude/skills/incident-response/SKILL.md` — psql-Helper → MCP-Bevorzugung
- `.claude/skills/database-ops/SKILL.md` — MCP für DML/SELECT; klare Abgrenzung zu kubectl-DDL-Pfad
