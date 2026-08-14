---
ticket_id: T005596
plan_ref: openspec/changes/mcp-task-runner-planner-deps/tasks.md
status: active
date: 2026-08-14
---

# Design: mcp-task-runner deps-Bezug auf YAML-Quellen umstellen

## Root-Cause

`planner.Parse` (mcp-task-runner/planner/parser.go) liest `json:"deps"` aus `task --list-all --json`. go-task **3.52.0** liefert dieses Feld nicht mehr (JSON enthält nur `name/task/desc/summary/aliases/up_to_date/location`) — der Planner baut seitdem einen **kantenlosen Graphen**: `plan_tasks` liefert immer genau eine parallele Gruppe, `get_task_graph` rendert einen Graphen ohne Kanten, `execute_plan` parallelisiert abhängige Tasks.

End-to-end verifiziert (T005596): `plan_tasks` mit `workspace:transcriber-push` + `workspace:transcriber-build` (deps-Kante deklariert in `Taskfile.yml:1790`) liefert 1 Gruppe statt 2.

Die BATS-Fixtures (`tests/spec/mcp-task-runner.bats`) faken den `task`-Binary mit einem Hardcoded-JSON, das `deps` **enthält** — die Tests laufen gegen eine Datenform, die das echte Tool nicht liefert, und maskieren den Defekt.

## Entscheidung (Brainstorming, vom User freigegeben)

**YAML-Direktparse**: Das `--list-all --json` bleibt nur noch Task-Universum (stabile Felder `name` + `location.taskfile`); die deps-Kanten werden je Quelldatei per YAML-Parser aus den Taskfile-Quellen gezogen. Verworfen: go-task-Versionssuche mit deps im JSON (erneute Schema-Abhängigkeit — dieselbe Fehlerklasse) und `task --dry`-Parsing (kein Maschinenformat).

## Design

### Parse-Ablauf (neu)

1. `task --list-all --json` ausführen → Universum: `name` → `location.taskfile` (+ optional `location.line`).
2. Für jede vorkommende Taskfile-Datei: YAML parsen (`gopkg.in/yaml.v3`).
   - **includes-Namespaces** der Root-Taskfile auflösen (`includes: { <ns>: { taskfile: <pfad> } }`): Ein Task aus einer include-Datei hat im JSON den vollen Namen `<ns>:<relativ>`, in der YAML-Quelle aber nur `<relativ>`. Auflösung: je Datei die bekannten Namespace-Präfixe abstreifen, Restpfad im YAML-Taskbaum suchen.
   - Namespacing im YAML (verschachtelte Keys) und flache Doppelpunkt-Namen behandeln (beide Formen kommen im Repo vor).
3. `deps` je Task extrahieren — Scalar oder Liste; fehlend = leer.
4. Graph wie bisher: `map[string][]string` — Schnittstelle von `Parse` bleibt unverändert (Aufrufer: `plan_tasks`, `get_task_graph`; `Schedule` in scheduler.go unberührt).

### Fehlerverhalten

Fail-closed wie bisher: nicht lesbares/parsebares YAML → Fehler mit Dateipfad (kein stilles leeres Deps). Templates in `deps:` (`{{.VAR}}`) werden als Literale übernommen — im Repo kommen in deps keine Templates vor (Graph-Analyse, 15 Kanten).

### Betroffene Dateien

| Datei | Änderung |
|---|---|
| `mcp-task-runner/planner/parser.go` | Parse neu: JSON-Universum + YAML-deps-Extraktion; `taskEntry.Deps` entfällt |
| `mcp-task-runner/go.mod`/`go.sum` | + `gopkg.in/yaml.v3` |
| `mcp-task-runner/planner/parser_test.go` | Unit-Tests auf YAML-Quellen umstellen (Fixture-Taskfiles auf Disk) |
| `tests/spec/mcp-task-runner/planner-sees-real-deps.bats` | Failing Test: plan_tasks gegen den **echten** Taskfile-Graphen → 2 Gruppen |
| `openspec/specs/mcp-task-runner.md` | plan_tasks-Requirement: Datenquelle korrigieren (YAML-Quellen statt deps im JSON) |

Nicht angefasst: `runner/`, `telemetry/`, `scheduler.go`-Logik. Die BATS-Fixtures werden **minimal** angepasst (location-Feld im Fake-JSON, deps-frei bleibend) — der neue fail-closed-Parser bricht sonst bei leerem `location.taskfile` ab.

### Teststrategie

- **Rotphase (dieser Commit):** BATS gegen den echten Taskfile-Graphen (transcriber-Paar) — rot mit aktuellem Binary, grün nach dem Fix.
- Unit: `parser_test.go` mit kleinen On-Disk-Taskfile-Fixtures (inkl. include-Namespace-Fall `assets:sync` und Guard-Task-Form `_node-guard`).
- Bestand: MCP-TASK-RUNNER-001..004 (Fixture-basiert) bleiben grün — sie prüfen Tool-Oberfläche, nicht die Datenquelle.

## Abgrenzung

Die Frage, ob cmds-Subcall-Sequenzen (z. B. `feature:deploy`) auf deps-Kanten umdeklariert werden sollen, ist **nicht** Teil dieses Fixes (T005604). Dieser Fix stellt nur wieder her, dass deklarierte Kanten gesehen werden.
