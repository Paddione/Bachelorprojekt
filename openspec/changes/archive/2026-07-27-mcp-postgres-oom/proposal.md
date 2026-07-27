# Proposal: mcp-postgres-oom

## Why

Der `postgres`-Container im `claude-code-mcp-monolith` (ns `default`, Cluster `fleet`)
wurde 56-mal in 19 Tagen OOMKilled (exit 137, Limit 2Gi). Betroffen ist damit genau der
Zugang, den CLAUDE.md als MCP-Primärweg für die Agenten `bachelorprojekt-ops/-infra/-db/-test`
empfiehlt (`mcp-postgres` auf `127.0.0.1:13001`). Aufrufer sehen einen als Transportfehler
getarnten Abbruch ("transport dropped mid-call"), der nicht nach OOM aussieht.

Die Live-Diagnose vom 2026-07-27 korrigiert die ursprüngliche Ticket-Hypothese: Ursache ist
**kein** unbegrenztes Resultset-Buffering, sondern ein **Prozess-Leak**. `supergateway --stateless`
startet pro eingehendem MCP-Request einen neuen `mcp-server-postgres`-Node-Kindprozess
(~54 MB RSS) und beendet ihn nie; die RSS-Summe erreicht nach rund 10 Stunden das cgroup-Limit
und der Kernel killt den gesamten Container. Belege, widerlegte Nebenhypothesen (DB-Connection-Leak,
V8-Heap-über-cgroup) und die verworfenen Alternativen stehen in `design.md`.

Zusätzlich installiert der Container `supergateway` und `@modelcontextprotocol/server-postgres`
bei jedem Start **ungepinnt**, das Verhalten ist damit nicht reproduzierbar.

## What

- Container-Start des `postgres`-Containers auf **gepinnte** Paketversionen umstellen.
- **Child-Reaper** ergänzen, der akkumulierte `mcp-server-postgres`-Prozesse oberhalb einer
  Altersschwelle beendet — deterministisch und unabhängig vom Upstream-Verhalten.
- **Memory-Limit senken** statt anheben, damit ein Regress in Stunden statt Tagen auffällt.
- **Beobachtbarkeit**: Child-Count und RSS-Summe periodisch loggen; die Zuordnung
  "transport dropped mid-call → zuerst `restartCount` prüfen" dokumentieren.
- **SSOT-Korrektur**: `openspec/specs/mcp-gateway.md` behauptet seit 2026-06-22, der Monolith
  sei dekommissioniert — er läuft nachweislich. Der Spec wird an die Realität angeglichen.
- **Apply-Weg** dokumentieren und verifizieren: `k3d/default/` hängt an keiner Overlay- oder
  Flux-Kustomization, ein Manifest-Fix wird ohne expliziten Apply nicht live.

Nicht in diesem Change: Row-/Byte-Limit bzw. Cursor-Streaming (nicht die Ursache),
eigener MCP-Postgres-Server, Brand-Auflösung `DATABASE_URL` (T002278, Welle 2),
Entscheidung Monolith bleibt/geht (T002311/T002312 — der Fix ist zu beiden Ausgängen verträglich).

_Ticket: T002321_
