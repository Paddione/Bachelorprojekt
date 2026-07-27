# Proposal: ticket-mcp-portable

## Why

`ticket-mcp` ist der einzige der drei selbstgebauten Go-MCP-Server, der über einen **absoluten
Pfad** eingebunden wird: `/home/patrick/Bachelorprojekt/scripts/ticket-mcp/ticket-mcp-go`. Der Pfad
steht in fünf Dateien und bindet das Repo an einen Benutzernamen und ein Home-Verzeichnis.

Das Muster für die Lösung liegt im selben Repo: `mcp-task-runner` wird von `Taskfile.yml:728-745`
gebaut und nach `/usr/local/bin` installiert und steht deshalb in der K1-Registry als
`command: mcp-task-runner` — ganz ohne Pfad.

**Nicht der ursprünglich geplante Weg.** T002301 sah MCPB-Bundles für alle drei Server vor. Die
Prüfung am 2026-07-27 ergab: MCPB ist ein Claude-**Desktop**-Format (`compatibility.claude_desktop`,
Installation per Drag-and-drop). Keiner der drei Harnesses lädt es — Claude Code CLI, opencode und
agy starten Server über `command`/`url` aus ihren JSON-Configs. Ein Bundle löste das Problem also
nicht. Zudem ist `factory-mcp` ein HTTP-Server; MCPB startet `mcp_config.command` als stdio-Server.
Und `mcp-task-runner` hat gar kein Pfadproblem. Der Scope ist deshalb auf den einen Server
reduziert, der eines hat.

## What

- `scripts/ticket-mcp/go/Makefile` bekommt ein `install`-Ziel.
- `ticket-mcp:build` im Taskfile installiert das Binary nach `/usr/local/bin` — mit demselben
  Best-effort-Verhalten wie `mcp-task-runner` (direkter `install`, dann `sudo -n`, sonst
  Weiterverwendung des vorhandenen Binaries statt Abbruch).
- `docs/agent-guide/registry/mcp.yaml` referenziert `ticket-mcp-go` über den PATH-Namen;
  `task mcp:sync` rendert daraus `.mcp.json`, `.opencode/opencode.jsonc` und
  `~/.gemini/config/mcp_config.json`.
- Die verbliebenen absoluten Pfade in `Taskfile.agents.yml` und `scripts/hermes-mcp-servers.yaml`
  entfallen.
- Ein Test hält fest, dass die Registry kein `/home/<user>`-Literal mehr führt.

Nicht im Scope: MCPB-Bundles, `factory-mcp` (HTTP), `mcp-task-runner` (bereits portabel).

_Ticket: T002301_
