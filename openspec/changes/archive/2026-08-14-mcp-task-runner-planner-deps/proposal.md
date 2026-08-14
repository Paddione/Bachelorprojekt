# Proposal: mcp-task-runner-planner-deps

## Why

`planner.Parse` liest `json:"deps"` aus `task --list-all --json` — go-task 3.52.0 liefert dieses Feld nicht mehr (JSON enthält nur `name/task/desc/summary/aliases/up_to_date/location`). Der Planner baut seitdem einen kantenlosen Graphen: `plan_tasks` liefert immer genau eine parallele Gruppe, `get_task_graph` rendert einen Graphen ohne Kanten, `execute_plan` parallelisiert abhängige Tasks (Race-Potenzial).

End-to-end verifiziert am Basis-Commit `97ffafeb`: `plan_tasks` mit `workspace:transcriber-push` + `workspace:transcriber-build` — die YAML-Quelle deklariert `deps: [workspace:transcriber-build]` (`Taskfile.yml:1790`) — liefert **1 Gruppe statt 2**.

Die BATS-Fixtures (`tests/spec/mcp-task-runner.bats`) faken den `task`-Binary mit einem Hardcoded-JSON, das `deps` **enthält** — die Tests laufen gegen eine Datenform, die das echte Tool nicht liefert, und maskieren den Defekt.

## What

`planner.Parse` bezieht die deps-Kanten aus den **Taskfile-YAML-Quellen** statt aus dem task-JSON:

1. `task --list-all --json` liefert nur noch das Task-Universum (stabile Felder `name` + `location.taskfile`).
2. Je vorkommender Quelldatei werden die `deps` per YAML-Parser (`gopkg.in/yaml.v3`) extrahiert; `includes:`-Namespaces der Root-Taskfile (z. B. `assets:` → `taskfiles/Taskfile.assets.yml`) werden aufgelöst, sodass include-namespaced Tasks (`assets:sync`) ihrem relativen YAML-Eintrag zugeordnet werden.
3. Die Schnittstelle `Parse → Graph` bleibt unverändert; `Schedule`, `execute_plan` und `get_task_graph` arbeiten unverändert weiter — sie bekommen nur wieder echte Kanten.

Fail-closed wie bisher: unlesbare/parsebare YAML-Quelle → Fehler mit Dateipfad.

Begleitend: neuer BATS-Test gegen den **echten** Taskfile-Graphen (transcriber-Paar, rot mit aktuellem Binary — Rotphase bereits bestätigt), Unit-Tests in `parser_test.go` auf On-Disk-YAML-Fixtures umgestellt, SSOT-Spec-Delta für die Datenquelle.

## Impact

- `mcp-task-runner/` (Go-Modul): parser.go, parser_test.go, go.mod/go.sum (+ yaml.v3).
- `tests/spec/mcp-task-runner/planner-sees-real-deps.bats`: neuer Integrationstest.
- `openspec/specs/mcp-task-runner.md`: plan_tasks-Requirement — Datenquelle korrigiert (via Delta beim Archive).

Nicht betroffen: `runner/`, `telemetry/`, `scheduler.go`, BATS-Fixtures für die übrigen Tools, die Taskfile-Quellen selbst (die cmds-vs-deps-Frage läuft unter T005604).
