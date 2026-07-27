# Proposal: mcp-registry-ssot

## Why

Die MCP-Serverliste existiert **dreimal**, in drei Formaten, mit divergierendem Inhalt — und
keine der drei Dateien ist die Quelle der anderen:

| | `.mcp.json` | `~/.gemini/config/mcp_config.json` | `.opencode/opencode.jsonc` |
|---|---|---|---|
| Harness | Claude Code | agy | opencode |
| HTTP-Form | `"type": "http"` | `"serverUrl"` | `"type": "remote"` |
| Stdio-Form | `command` + `args` | `command` + `args` | `"type": "local"`, `command: []` |
| Versioniert | ja | **nein** — liegt in `$HOME` | ja |

Belegte Divergenzen: `task-master-ai` ist in Claude Code über `npx -y` aktiv, in agy über
`~/.npm-global/bin/task-master-ai`, in opencode `enabled: false`. `github-mcp`, `playwright`,
`docfork`, `sequential-thinking` und `webresearch` stehen ausschließlich in opencodes Datei.
Die agy-Datei ist nicht Teil des Repos — Änderungen daran sind unsichtbar, nicht reviewbar und
überleben keinen Rechnerwechsel.

**Die Recon hat eine zweite Schicht freigelegt, die in keiner der drei Dateien auftaucht.** Die
Einträge `mcp-kubernetes` (`:18080`) und `mcp-postgres` (`:13001`) sehen wie lokale HTTP-Server
aus, sind aber ein `kubectl port-forward` auf `svc/claude-code-mcp-monolith` im Cluster —
etabliert von `scripts/mcp-gateway/mcp-gateway.service` und `Taskfile.agents.yml`
`mcp-gateway:start`. Dahinter läuft ein Pod mit **fünf** Containern (`kubernetes`, `postgres`,
`keycloak`, `playwright`, `github`) aus `k3d/default/claude-code-mcp-monolith-deploy.yaml`.

Wer nur die drei Client-Configs liest, hält `scripts/mcp-gateway/` für eine Karteileiche und
löscht sie — womit `mcp-kubernetes` und `mcp-postgres` in **allen drei** Harnesses ausfallen.
Genau dieser Fehlschluss steht bereits im SSOT-Spec (T002312).

## What

**Eine Registry, zwei Schichten** — `docs/agent-guide/registry/mcp.yaml`:

- `clients:` — was die drei Harnesses registrieren. **Diese Schicht wird generiert.**
- `cluster:` — der In-Cluster-Monolith mit Containern, Ports und der Port-forward-Brücke.
  **Diese Schicht wird nur dokumentiert**, nicht gerendert; sie erklärt, woher die Ports der
  `clients`-Schicht kommen.

Der Ort ist bewusst `docs/agent-guide/registry/` — dasselbe Verzeichnis, in dem T002304 (K5)
`agents.yaml` anlegt. Ein Registry-Verzeichnis, eine Stelle zum Suchen.

**Generator** `scripts/mcp-sync.sh`:

- `render` erzeugt `.mcp.json`, den `mcp`-Block in `.opencode/opencode.jsonc` und
  `~/.gemini/config/mcp_config.json` aus der `clients`-Schicht.
- `check` vergleicht Ist gegen Soll und exitet ungleich 0 bei Drift.

Das Skript liest die YAML **selbst** und hängt bewusst **nicht** an
`scripts/agent-guide/load.mjs`. Grund: `load.mjs` führt eine explizite `FILES`-Liste
(`taxonomy, guardrails, tools, goals, components`); `themes.yaml`, `flow.yaml` und
`glossary.yaml` liegen bereits ungeladen im selben Verzeichnis. `mcp.yaml` ist für die
agent-guide-Emitter also inert — und dieser Change kollidiert dadurch nicht mit den Dateien,
die T002304 gerade anfasst.

**Drift-Gate** in `tests/spec/mcp-gateway.bats` (existiert, 72 Zeilen, prüft heute bereits
`.mcp.json registers factory-mcp / mcp-kubernetes / mcp-postgres`). Kein neues Testfile, kein
`ci.yml`-Eingriff — die Spec-BATS-Suite läuft bereits im `test-factory`-Job.

**Asymmetrie, die der Plan explizit behandelt:** Die agy-Datei liegt außerhalb des Repos, CI
kann sie nicht prüfen. `check` ist daher für die zwei repo-internen Dateien **fail-closed** und
für die agy-Datei **conditional**: vorhanden → prüfen, fehlend → mit sichtbarem Hinweis
überspringen. Ein Gate, das so tut, als prüfe es etwas Unerreichbares, wäre schlimmer als keines.

**Zwei Server-Defekte werden hier NICHT gefixt**, sondern nur in der Registry abgebildet:
T002311 (`keycloak`-Sidecar zeigt auf einen Service, den es nicht gibt) und T002312 (der
SSOT-Spec behauptet, der Monolith sei dekommissioniert). Beide erfordern einen Eingriff in
Prod-Manifeste — andere Risikoklasse als ein Generator.

**Nicht Teil dieses Changes:** MCPB-Bundles für die drei eigenen Go-Server (T002301 / K2, hängt
an diesem Ticket) und die Instruktionsdateien (T002305 / K6).

_Ticket: T002300_
