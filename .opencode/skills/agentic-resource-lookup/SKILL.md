---
name: agentic-resource-lookup
description: Use to discover MCP servers and agent plugins on-demand without installing them — search, inspect live tool schemas, and record curation decisions. Triggers on "gibt es ein MCP für", "welcher Server kann", "schon geprüft?", "is there an MCP server for", "find a plugin", "what can do", "look up a plugin", "MCP discovery", agentic-resource-lookup, toolset:lookup. Not for installing or uninstalling — this skill only discovers and records decisions.
---

# agentic-resource-lookup — On-Demand MCP/Agent Discovery

Findet externe MCP-Server und Agent-Plugins **bei Bedarf**, ohne sie zu installieren und ohne
ihre Beschreibungen dauerhaft im Kontext zu tragen.

Drei Verben, ein Skript: `scripts/agentic-lookup.mjs`.

## find — Suchen, was es für ein Problem gibt

```bash
node scripts/agentic-lookup.mjs find <query>
```

Liest in fester Reihenfolge:
1. `docs/agent-guide/registry/capabilities.yaml` — bereits kuratierte Einträge (lokal)
2. `~/.claude/plugins/known_marketplaces.json` — installierte Marktplätze (lokal)
3. `https://registry.modelcontextprotocol.io/v0/servers?search=<query>` — offizielle Registry (Netz)

Lokale Einträge gewinnen gegen entfernte; ein bereits unterdrückter Server wird mit seinem
gespeicherten Grund annotiert, nicht als neuer Kandidat. Netzausfälle degradieren, sie brechen
nicht ab — die ausgefallene Quelle wird auf stderr gemeldet, die übrigen liefern, Exit 0.

Ausgabe je Treffer: `name | source | state | description`

## inspect — Live-Schema eines Servers abrufen

```bash
node scripts/agentic-lookup.mjs inspect <name>
```

Schlägt den Server in der Registry nach. Trägt er `remotes[]`, wird eine
MCP-`initialize`+`tools/list`-Sequenz gegen den Endpunkt gefahren und die Tool-Namen mit
Parametern ausgegeben — gekennzeichnet als `[schema]`.

Schlägt die Sequenz fehl oder existiert kein Remote, fällt das Kommando auf das README des
`repository`-Feldes zurück — gekennzeichnet als `[readme]`, inklusive Bezugsweg (`npm:…` oder
`oci:…`).

Keine Installation, kein Schreiben nach `~/.claude/plugins/`.

## record — Ein Urteil festhalten

```bash
node scripts/agentic-lookup.mjs record <name> \
  --capability <cap> --state <state> --reason "<text>" \
  [--use-when "<text>"] [--roles <role1,role2>] \
  [--avoid-when "<text>"] [--tier <tier>] [--deep-ref <path>] [--fallback <cmd>]
```

Schreibt genau einen Eintrag nach `capabilities.yaml` und führt danach
`node scripts/toolset/check.mjs` aus.

Fail-closed: `--reason` ist Pflicht bei `--state suppressed` oder `--state unreviewed`.
`--use-when` und `--roles` sind Pflicht bei `--state canonical`. Verstöße brechen vor dem
Schreiben ab — die Datei bleibt unangetastet.

## Abgrenzung

- **Kein Installieren/Deinstallieren.** Mutiert `~/.claude/plugins/` nicht.
- **Keine Duplikation von `mcp.yaml`.** Erreichbarkeit bleibt dort, Auswahl in
  `capabilities.yaml`.
- **Keine Kuration.** Das Bewerten selbst bleibt beim Skill `toolset-curate`; `record` ist nur
  der Schreibweg für ein bereits gefälltes Urteil.
- **Kein Caching.** Persistiert wird ausschließlich das Urteil, nicht der Lookup.
