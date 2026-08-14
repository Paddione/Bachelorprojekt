# p5 — Erreichbarkeit herstellen

**Rolle:** impl · **Dateien:** `Taskfile.yml` · **Hängt ab von:** p4

Das S4-Gate verlangt, dass jedes neue `scripts/*.mjs` von Taskfile, CI, Doku oder einem anderen
Skript aus erreichbar ist — sonst Orphan-Violation.

## Schritte

Ergänze in `Taskfile.yml` neben den bestehenden `openspec:embed`-Tasks:

- **`context:retrieve`** — ruft `scripts/context-retrieve.mjs` mit durchgereichten Argumenten auf.
- **`context:retrieve:explain`** — dasselbe mit `--json`, für Messung und Fehlersuche.

Die beiden Bibliotheken unter `scripts/knowledge/` sind über den Import aus
`scripts/context-retrieve.mjs` erreichbar und brauchen keinen eigenen Task.

## Budget

`Taskfile.yml` hat 5150 Zeilen, trägt als `.yml` aber **kein** S1-Extension-Limit — kein
Zeilenbudget zu beachten.

## Fertig wenn

`task --list` zeigt beide Tasks, und `task quality:check` meldet keine S4-Orphan-Violation für
`scripts/context-retrieve.mjs`.
