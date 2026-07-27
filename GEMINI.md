# Gemini CLI Context: Workspace MVP

Kontextdatei für die Gemini-CLI (`agy`). Sie ist bewusst ein **Zeiger**, keine eigene
Zusammenfassung des Projekts.

## Lies stattdessen diese beiden

- **[CLAUDE.md](CLAUDE.md)** — die maßgebliche Referenz: Agent-Routing, Architektur,
  Cluster-Topologie, Konfigurationsmuster, CI/CD, Entwicklungsregeln, Footguns.
- **[AGENTS.md](AGENTS.md)** — cross-harness Quick-Start: Kernkommandos, Workflow-Regeln,
  OpenSpec-Konventionen.

Beide sind für dich gedacht — öffne sie, statt dich auf diese Datei zu verlassen.

## Kommandos nicht raten
Kommandos werden nicht nachgeschlagen und nicht hartkodiert, sondern erfragt:

```bash
bash scripts/vda.sh oracle '<was du erreichen willst, in einem Satz>'
```

Begründung und Flags stehen in CLAUDE.md § „Running Tasks".

## Das Einzige, was nur für agy gilt

`agy` liest MCP-Server **ausschließlich** aus `~/.gemini/config/mcp_config.json` — Einträge in
`settings.json` bleiben wirkungslos. Diese Datei wird nicht von Hand gepflegt: sie wird per
`task mcp:sync` aus der Registry `docs/agent-guide/registry/mcp.yaml` generiert (T002300, K1);
`task mcp:check` prüft auf Drift.

## Warum diese Datei so dünn ist

Sie war einmal ein Architektur-Spiegel — und stand am 2026-07-27 mit **zehn verifiziert falschen
Aussagen** im Repo: ein Identity Provider, der längst ersetzt ist, ein entfernter Streaming-Stack,
ein Deploy-Modell, das dem tatsächlichen widersprach, und vier Kommandos, die es nicht gibt.
Duplizierte Ebenen driften — niemand merkt es, weil nichts sie misst.

Diese Datei bitte **nicht „vervollständigen"**. Ein fail-closed Gate in
`tests/spec/agent-skills.bats` (T002305) hält Zeilenzahl, Service-Aufzählungen und
Kommando-Literale klein.
