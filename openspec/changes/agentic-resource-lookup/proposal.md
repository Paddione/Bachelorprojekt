# Proposal: agentic-resource-lookup

## Why

Der Skill-Frontmatter-Kontext ist knapp, aber die Werkzeug-Registry wächst. Ein externes MCP-Plugin,
das man dreimal im Jahr braucht, darf nicht dauerhaft Beschreibungstokens in jeder Session belegen —
es muss im Bedarfsfall auffindbar sein. Heute gibt es keinen on-demand Zugriff: `capabilities.yaml`
dokumentiert die kuratierte Auswahl, aber nichts befragt gezielt die lokalen Quellen und die
offizielle MCP-Registry, um einen Kandidaten im Moment des Bedarfs zu bewerten.

## What

Ein Skill mit drei Verben: `find` (lokale Quellen vor externen abfragen, Kandidaten mit kuratiertem
Zustand annotieren), `inspect` (Toolschema per MCP-`initialize`+`tools/list` statt README-Prosa,
wenn möglich) und `record` (genau ein persistiertes Urteil in `capabilities.yaml`, fail-closed,
mit `check.mjs`-Bestätigung). Lookups werden nie auf Platte geschrieben — nur Entscheidungen.

_Ticket: T002611_
