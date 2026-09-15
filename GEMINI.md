# Gemini CLI Context: Workspace MVP

Kontextdatei für die Gemini-CLI (`agy`). Sie ist bewusst ein **Zeiger**, keine eigene
Zusammenfassung des Projekts.

## Lade Kontext gezielt

- Lies zuerst **[AGENTS.md](AGENTS.md)** — den cross-harness Quick-Start für Kommandos,
  Workflow-Regeln und OpenSpec-Konventionen.
- Lies **[CLAUDE.md](CLAUDE.md)** nicht pauschal. Öffne nur die zum Auftrag passende Sektion,
  wenn Routing, Architektur, CI/CD, Konfigurationsmuster oder Footguns nötig sind.

So bleibt die maßgebliche Referenz erreichbar, ohne sie bei jeder Aufgabe vollständig in den aktiven Kontext zu laden.

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
