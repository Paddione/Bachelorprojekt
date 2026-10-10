---
title: go-task CLI/ENV-Determinismus (doppelte Taskfile-Globals dedupen)
ticket_id: T901788
domains: [ci, taskfile]
status: staged
---

# task-cli-var-determinism — Implementation Plan

Single-Plan (ein Subsystem + Tests). Root-Cause-Analyse und Evidenz:
`design.md` im selben Ordner, Proposal in `proposal.md`. Ausgangslage:
Branch-Basis `4f4166973`, go-task `3.52.0` lokal verifiziert (CI nutzt
setup-task v5, gleiche Flake-Klasse dort beobachtet).

## File Structure

| Datei | Änderung |
|---|---|
| `taskfiles/Taskfile.brainstorm.yml` | Globale `ENV`/`CTX_DEV`/`NS_DEV` entfernen, Task-Level-Defaults an Konsumenten |
| `taskfiles/Taskfile.dev-stack.yml` | Globale `ENV`/`CTX_DEV`/`NS_DEV`/`CLUSTER_NAME` entfernen, Task-Level-Defaults an Konsumenten |
| `taskfiles/Taskfile.rustdesk.yml` | Globales `ENV` entfernen, Task-Level-Default an `deploy` |
| `taskfiles/Taskfile.session.yml` | Globales `ENV` entfernen, Task-Level-Defaults an `register`/`start-form` |
| `tests/py/spec/native_ported/spec/test_migrate_target_safety.py` | RED-Tests (bereits im Branch, 103 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`tests/py/spec/native_ported/spec/test_migrate_target_safety.py` hat Ist 103 bei Budget 697.
Die vier `taskfiles/*.yml` sind nicht S1-vermessen (kein `.yml`-Limit in
`gates.yaml`); die Änderung ist je Datei klein (Globals raus, Defaults an
Konsumenten), kein Split nötig. `Taskfile.yml` (Root) bleibt unverändert —
`CLUSTER_NAME: korczewski` dort ist nach dem Dedupe die einzige Definition.

## Task 1 — RED-Bestätigung

- Step: `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_migrate_target_safety.py` — expected: FAIL, die beiden neuen Tests rot.
- Acceptance: `test_cli_env_is_deterministic_across_runs` und
  `test_no_duplicate_top_level_taskfile_vars` scheitern;
  `test_no_fixed_well_known_local_port` bleibt grün.
  Hinweis: `test_unknown_env_is_rejected_at_task_level` kann in dieser Phase
  flaken — das ist der Bug selbst, kein Testdefekt.

## Task 2 — Vorher-Evidenz sichern

- Jeweils Dry-Run rendern und Output nach `/tmp/t901788-before/` sichern:
  - `task -d . -n brainstorm:status`
  - `task -d . -n session:list`
  - `task -d . -n rustdesk:deploy ENV=mentolder`
  - `task -d . -n dev:secrets`
  - `task -d . -n dev-korczewski:secrets` (muss heute `korczewski` rendern —
    per Wiederholung prüfen, ob es flakt)
  - `task -d . -n dev-korczewski:secrets ENV=mentolder` (CLI-Override-Fall)
- Acceptance: alle Render-Outputs liegen unter `/tmp/t901788-before/` und
  dokumentieren das Vorher-Verhalten inkl. Flake.

## Task 3 — Globals dedupen, Task-Level-Defaults setzen

- In den vier Taskfiles die Top-Level-Blöcke entfernen:
  - `Taskfile.brainstorm.yml`: `ENV`, `CTX_DEV`, `NS_DEV`
  - `Taskfile.dev-stack.yml`: `ENV`, `CTX_DEV`, `NS_DEV`, `CLUSTER_NAME`
    (`CTX_PROD`/`NS_PROD` bleiben — nur je einmal definiert, kein Rennen)
  - `Taskfile.rustdesk.yml`: `ENV`
  - `Taskfile.session.yml`: `ENV`
- Jedem Task mit `{{.VAR}}`-Referenz (per `grep -n '{{.VAR}}'` je Datei
  lokalisieren) einen `vars:`-Default im Self-Default-Idiom geben, z. B.
  `ENV: '{{.ENV | default "mentolder"}}'`,
  `CTX_DEV: '{{.CTX_DEV | default "fleet"}}'`,
  `NS_DEV: '{{.NS_DEV | default "workspace-dev"}}'`.
  Die Default-Werte entsprechen exakt den bisherigen Globals (brainstorm:
  `mentolder`/`fleet`/`workspace-dev`; dev-stack: `mentolder`/`fleet`/
  `workspace-dev`; rustdesk/session: `mentolder`).
- Verbot: NIEMALS statische Task-Level-Werte (`ENV: mentolder`) — ein
  statischer Task-Wert schlägt die CLI-Variable immer (Phase-A-Experiment
  `t-static`), das wäre ein schlimmerer Bug als der heutige Flake.
- `dev-stack.yml` definiert kein `CLUSTER_NAME` mehr; die
  `dev-korczewski`-Include-Vars (`ENV`/`CTX_DEV`/`NS_DEV`/`CTX_PROD`/
  `NS_PROD`/`CLUSTER_NAME`) fließen weiter als Include-Overrides.
- Danach Task 2 mit Ziel `/tmp/t901788-after/` wiederholen.
- Acceptance:
  - `test_no_duplicate_top_level_taskfile_vars` ist grün.
  - Vorher/nachher-Diffs zeigen nur Fix-Effekte: `dev-korczewski:secrets`
    rendert stabil `korczewski`, der CLI-Override-Fall rendert stabil
    `mentolder`, alle übrigen Tasks rendern wie vorher.

## Task 4 — Upstream-Issue an go-task/task

- Minimal-Repro aus Phase A nachbauen (`/tmp/taskrepro`: Root-Taskfile mit
  5 flattened Includes, 4 definieren globales `ENV`, Task ohne eigene
  Globals, `task -n t ENV=cli-val` über 12 Runs streut über alle 5
  Kandidaten) und die Streuung erneut belegen.
- Issue im Repo `go-task/task` erstellen (Titel sinngemäß: flattened include
  globals race with CLI variables, winner nondeterministic), mit task-Version
  `3.52.0`, den Repro-Dateien und der Beobachtung, dass die CLI-Variable
  keine garantierte Präzedenz hat.
- Issue-URL als Kommentar ins Ticket schreiben:
  `bash scripts/ticket.sh add-comment --id T901788 --body "Upstream: <url>"`.
- Acceptance: Issue existiert, URL steht im Ticket. Der Repo-Fix ist vom
  Upstream-Verlauf unabhängig.

## Task 5 — Verify

- Steps:
  - `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_migrate_target_safety.py` (grün, alle 4 Tests, davon 10/10 Loop-Durchläufe)
  - `task test:changed`
  - `task test:inventory` falls Test-Inventar betroffen, Artefakt mitcommitten
  - `task freshness:regenerate`
  - Artefakte committen
  - `task freshness:check`
- Acceptance: alle drei Kommandos `task test:changed`,
  `task freshness:regenerate`, `task freshness:check` laufen erfolgreich.
