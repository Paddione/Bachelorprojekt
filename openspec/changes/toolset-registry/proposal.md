# Proposal: toolset-registry

## Why

Vier Harnesses arbeiten in diesem Repo mit teils unterschiedlichen, teils
widersprüchlichen Werkzeugmengen. Der Ist-Zustand am 2026-08-02, gemessen:

| Harness | Weg | MCP-Server |
|---|---|---|
| Claude Code | `.mcp.json` | 8 − 2 disabled = **7** |
| agy | `~/.gemini/config/mcp_config.json` | **8** (kein Abschalt-Mechanismus) |
| llama.cpp (Modell) | `scripts/llm/mcp-servers.json` | **2** |
| llama.cpp (WebUI) | `scripts/llm/ui-config.template.json` | **7** |

`task-master-ai` ist in Claude Code abgeschaltet und in agy aktiv. Der lokale
LLM sieht je nach Anbindungsweg 2 oder 7 der 8 geteilten Ressourcen.

Dieselbe **Fähigkeit** ist mehrfach vorhanden, ohne dass irgendwo steht, welche
Instanz gilt: GitHub über `gh-axi` + `github-mcp` + `github@claude-plugins-official`;
Browser-Automatisierung über `claude-in-chrome` + `playwright@plugin` +
`chrome-devtools-axi`; Security über `security-guidance@plugin` (Claude) +
`Google.securecoder` (agy) + `.claude/skills/security-specialist`.

Die Entscheidungen dazu liegen an drei Orten, die sich widersprechen:
`mcp.yaml` führt `github-mcp` als disabled mit der Begründung „gh-axi ist der
mandatierte GitHub-Pfad"; `settings.json/disabledMcpjsonServers` wiederholt das;
`settings.json/enabledPlugins` hält `github@claude-plugins-official` mit rund 40
GitHub-Tools aktiv. Eine Entscheidung, drei Orte, einer davon widerspricht.

Zwei strukturelle Lücken verschärfen das:

- **Die Plugin-Achse ist unerfasst.** `mcp.yaml` regiert MCP-Server,
  `tools.yaml` beschreibt 20 Repo-eigene Skills/Agenten/Tasks. Keine der beiden
  kennt die 20 aktiven Claude-Plugins, die 5 opencode-Plugins oder agys
  `Google.securecoder` mit seinen 8 Security-Skills.
- **agy-Drift ist in CI unsichtbar.** `scripts/mcp-sync.sh:245` meldet bei
  fehlendem `~/.gemini/` „skipped" und **exit 0**. Auf jedem Rechner ohne
  agy-Installation — also in CI — wird agy-Drift strukturell nie gefunden.
  Dabei ist agy der Harness mit den meisten unerfassten Quellen: über die
  Symlinks `~/.gemini/config/skills → .claude/skills` und
  `~/.gemini/config/agents → .claude/agents` liest er alle 30 Repo-Skills und
  alle 6 Domänen-Agenten — entgegen der CLAUDE.md-Aussage, `.agents/agents`
  werde „Claude Code only" gelesen.

## What

Eine neue SSOT `docs/agent-guide/registry/capabilities.yaml` dreht die
Blickrichtung um: nicht „welche Server gibt es" (das leistet `mcp.yaml`),
sondern **welche Fähigkeit wird über welche Instanz erbracht**. Jede Instanz
trägt ihre Art als Präfix (`mcp:` · `plugin:` · `skill:` · `agent:` · `cli:`),
einen Zustand (`canonical` · `allowed` · `suppressed` · `unreviewed`), eine
Begründung und eine `transport`-Matrix je Harness.

Ein Generator `scripts/toolset/{collect,check,sync,probe}.mjs` schreibt daraus
chirurgisch fünf Harness-Ziele und prüft fail-closed auf Drift. Neue Quellen
landen als `unreviewed` in Quarantäne (WARN, exit 0); ein Skill
`toolset-curate` führt interaktiv durch die offenen Fälle und schreibt die
Entscheidung samt Begründung zurück in die Registry.

`toolset:sync` hängt sich in `freshness:regenerate` ein, `toolset:check` in
`test:all` und damit in die bestehende CI. Kein neuer Workflow, kein neuer Job.

### Abgrenzung

- **Kein Runtime-MCP-Aggregator.** Verworfen: Ein bündelnder Prozess vor dem
  gesamten Tooling wäre ein Single Point of Failure — ein hängender Downstream
  blockiert `tools/list` und nimmt damit *alle* Tools weg, statt einer Gruppe.
  Er reduziert zudem nur Config-Zeilen, nicht die Kontextlast.
- **`mcp.yaml` bleibt unverändert.** Zwei Generatoren nebeneinander sind hier
  richtig: `mcp-sync` verwaltet *Verbindungen*, `toolset-sync` verwaltet
  *Erlaubnisse*. Sie schreiben in dieselben Dateien, aber in disjunkte Schlüssel.
- **Der llm-proxy wird nicht neu gebaut.** `scripts/llm-proxy/mcp-bridge.mjs`
  ist bereits eine stdio→HTTP-MCP-Bridge unter `:18235/mcp/<name>` und der
  Grund, warum die llama.cpp-WebUI stdio-Server erreichen kann. Sie wird im
  `transport`-Modell abgebildet, nicht ersetzt.
- **Nicht jede Quellenart ist durchsetzbar.** CLIs lassen sich nicht
  abschalten, Claude Code kennt keinen Skill-Schalter, und die WebUI-MCP-Liste
  lebt letztlich im localStorage des Browsers. Die Registry bildet diese
  Differenz als Durchsetzbarkeits-Klasse ab, statt Vollständigkeit zu
  behaupten, die dort nicht erreichbar ist.

_Ticket: T002560_
