---
title: agentic-resource-lookup — Design
ticket_id: T002611
domains: [tooling, scripts, test]
status: active
date: 2026-08-03
---

# agentic-resource-lookup — Design

## Purpose

Ein Skill, der externe MCP-Server und Agent-Plugins **bei Bedarf** auffindbar und beurteilbar
macht, ohne sie zu installieren und ohne ihre Beschreibungen dauerhaft im Kontext zu tragen.

Das Problem, das er löst, ist nicht Beschaffung, sondern Kontext-Ökonomie. Claude Code lädt die
`description:`-Frontmatter **aller** verfügbaren Skills in jede Session; der Body erst beim
Invoke. Lazy Loading ist damit bereits Architektur — knapp ist nicht der Mechanismus, sondern der
Platz für Beschreibungen. Ein Werkzeug, das man dreimal im Jahr braucht, darf diesen Platz nicht
belegen. Es muss stattdessen in dem Moment auffindbar sein, in dem man es braucht.

## Architecture

```
.claude/skills/agentic-resource-lookup/SKILL.md   Skill-Body, Verben und Beispiele
scripts/agentic-lookup.mjs                        Implementierung der drei Verben
tests/spec/toolset-registry/agentic-resource-lookup.bats   Verhaltensprüfung
```

Ein Skript, keine Bibliothek. Die drei Verben sind unabhängig voneinander aufrufbar und teilen
nur den Quellen-Resolver.

### Datenfluss `find`

```
query
  ├─ capabilities.yaml         (lokal, immer)
  ├─ known_marketplaces.json   (lokal, immer)
  └─ registry /v0/servers      (Netz, mit Timeout und Ausfall-Toleranz)
        ↓
   Zusammenführung nach Servername, lokaler Zustand gewinnt
        ↓
   Liste: name | bezugsweg | state | einzeilige Beschreibung
```

### Fehlerbehandlung

Netzausfälle degradieren, sie brechen nicht ab: eine ausgefallene Quelle wird namentlich auf
stderr gemeldet, die übrigen liefern. `record` dagegen ist fail-closed — es validiert gegen das
Schema von `capabilities.yaml`, bevor es schreibt, und lässt `check.mjs` das Ergebnis bestätigen.

### Testing

BATS unter `tests/spec/toolset-registry/`, Verhaltensprüfung nach der Repo-Konvention
(T002448-M4): die Tests rufen die Verben auf und prüfen deren Ausgabe, sie greppen nicht den
Quelltext. Netzabhängige Pfade laufen gegen abgelegte Registry-Antworten als Fixture; der
Ausfall-Pfad wird über eine unerreichbare URL erzwungen, nicht simuliert.

## Abgrenzung

- **Kein Installieren und kein Deinstallieren.** Der Skill mutiert `~/.claude/plugins/` nicht.
  Ein abgebrochener Vorgang kann so keine Leiche hinterlassen.
- **Keine Duplikation von `mcp.yaml`.** Erreichbarkeit bleibt dort, Auswahl in
  `capabilities.yaml` — die bestehende Aufgabenteilung wird übernommen, nicht neu erfunden.
- **Keine Kuration.** Das Bewerten selbst bleibt beim Skill `toolset-curate`; `record` ist nur
  der Schreibweg für ein bereits gefälltes Urteil.
