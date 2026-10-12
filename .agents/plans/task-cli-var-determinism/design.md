---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-10
---

# T901788 — go-task CLI/ENV-Nondeterminismus: Root-Cause-Spec

Ticket: T901788 (`fix`, major, hoch). Bereich: Taskfile/CI.

## Symptom (Fakt)

`task -d . -n website:migrate ENV=bogus-no-such-env-t901750` liefert abwechselnd
rc 201 (korrekt, Precondition greift) und rc 0 (falsch). Im rc-0-Fall rendert
`{{.ENV}}` als `mentolder` statt `bogus`. Reproduziert auf main 4f4166973,
task 3.52.0: 12 Runs → `201 0 201 0 201 201 201 0 201 201 0 201`.

## Ursache (verifiziert, keine Hypothese)

go-task mergt gleichnamige globale `vars` aller flatten-includierten Taskfiles
UND die CLI-Variable in einen Topf; der Gewinner wird in Go-Map-Iteration-Order
gezogen — zufällig pro Prozess. Die CLI-Variable hat keine garantierte
Präzedenz, sobald 2+ Definitionen desselben Namens existieren.

Belege (alle auf task 3.52.0):

1. Repo: 4 Top-Level-`ENV`-Definitionen (`Taskfile.brainstorm.yml`,
   `Taskfile.dev-stack.yml`, `Taskfile.rustdesk.yml`, `Taskfile.session.yml`,
   alle Default `mentolder`) + CLI-Var = 5 Kandidaten → Flake.
2. Minimal-Repro `/tmp/taskrepro` (Task ohne eigene Globals, 4 Includes mit
   `ENV: val-mN`, `task -n t ENV=cli-val`, 12 Runs): `val-m3, val-m1, cli-val,
   val-m2, ...` — zufällige Auswahl unter EINSCHLUSS der CLI-Variable.
3. Definierende Datei gewinnt deterministisch, wenn SIE ein Global definiert
   (2 Includes → immer `from-b`, CLI immer ignoriert).
4. Baseline ohne Konkurrenz (Single-File, Task-Level-Self-Default): 6/6 CLI
   gewinnt, ohne CLI greift der Default. So muss es überall sein.

Nebenbefund gleiche Klasse: `CTX_DEV` ×2, `NS_DEV` ×2 (brainstorm vs.
dev-stack), `CLUSTER_NAME` Root-vs-Include (`korczewski` vs. Default
`mentolder-dev`). Flatten betrifft nur Task-Namen — Globals aller Includes
(global, auch namespaceter wie `dev`/`dev-korczewski`) landen im selben Pool.

## Fix-Ansatz

Doppelte Top-Level-Globals entfernen, Defaults ans Task-Level verlagern
(Repo-Pattern, vgl. `Taskfile.web.yml`: `ENV: '{{.ENV | default "dev"}}'`):

- 4× globales `ENV:` löschen; alle `{{.ENV}}`-konsumierenden Tasks in
  brainstorm (3 Refs), dev-stack (9), rustdesk (1), session (2) erhalten
  `ENV: '{{.ENV | default "mentolder"}}'`.
- Gleiches für `CTX_DEV`/`NS_DEV`-Doppel und `CLUSTER_NAME`-Kollision.
- Regressionstests: Determinismus-Loop (12× bogus → immer rc 201) +
  statischer Guard (kein Top-Level-Var-Name doppelt über
  `Taskfile.yml` + `taskfiles/`).
- Upstream-Issue an go-task/task mit Minimal-Repro (Repo-Fix unabhängig davon).

## Edge-Cases

- `dev-korczewski`-Include-Vars (`ENV: korczewski` + CTX/NS-Overrides) müssen
  nach dem Umbau weiter greifen — per `task -n dev-korczewski:<task>`
  verifizieren (negativ UND positiv: CLI-Override gewinnt).
- `.env` existiert (Tailscale-Creds), definiert kein `ENV` — irrelevant.
- Kein Merge-Blocker bis Fix (Workaround Rerun); danach wird der
  T901750-Regressionstest stabil.
