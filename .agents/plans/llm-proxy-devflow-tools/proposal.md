# Proposal: llm-proxy-devflow-tools

Ticket: T901630 · Slug: `llm-proxy-devflow-tools` · Pfad: feature

## WARUM

`dev-flow-plan` und `dev-flow-execute` rufen heute verstreute Bash-Einzelskripte
(`plan-lint.sh`, `devflow-ci-watch.sh`, …) auf. Jeder Harness (Claude Code, opencode,
agy, lokale Runner) verdrahtet sie anders; Checks driften, CI-Feedback kommt erst
nach dem Push, und die Fix-Schleife bis Automerge ist Handarbeit des Orchestrators.

Ziel: Eine Python-Sandbox um den Worktree, die ab `stage-plan` existiert und jedem
Harness dieselben Werkzeuge gibt — Turbolint, Plan-Evaluierung, lokales Insta-CI
und eine Fail-Redirect-Schleife bis `cigreen`/Automerge.

## WAS (MVP-Schnitt, brainstormt und entschieden)

1. **Python-Backend `scripts/devflow/`** (SSOT der Logik): `cli.py` als einziger
   Einstieg (`python3 -m devflow <verb>`, JSON rein/raus), `sandbox.py`
   (create/activate/destroy + `.devflow/sandbox.json`-Manifest), `turbolint.py`
   (V1: `plan-lint.sh` + `ruff` + `tsc --noEmit` parallel), `instaci.py` plus neue
   SSOT `docs/code-quality/ci-map.yaml` (CI-Jobname → lokales Kommando).
2. **Proxy-Frontend `scripts/llm-proxy/devflow-tools.mjs`**: native Routen
   `POST /tools/devflow/<verb>` nach dem bge-Muster (T003205) — 2-Zeilen-Forward
   in `server.mjs`, Logik im Modul, Error-Envelope `{error:{code,message}}`.
3. **Tasks in `taskfiles/Taskfile.llm.yml`**: `task llm:devflow:turbolint` etc.
   (curl gegen Proxy, Direkt-Python-Fallback bei offline Proxy).
4. **Tests**: `devflow-tools.test.mjs` (`node --test`) + pytest-Modul fürs Backend.

## Nicht-Ziele (MVP)

- `eval.py` (plan-eval/done-eval) und `ciloop.py` (Fail-Klassifier + Fix-Hints):
  V2, eigene Tickets.
- MCP-Alias (`/mcp/devflow` via `mcp-bridge.json`): Phase 2, dünner Stdio-Wrapper
  über dieselben Python-Funktionen, kein Doppelcode.
- Skill-Text-Änderungen an `dev-flow-plan`/`dev-flow-execute`: liegen im
  Dotfiles-Repo (`~/.agents/skills`), nicht hier — Folge-Chore dort.

## Risiken

- Proxy offline auf frischen Maschinen → Direkt-Python-Fallback ist Pflicht,
  kein stiller Skip (Prinzip aus ADR-004: fail-closed, klare Fehler).
- `server.mjs`-Edit: Datei ist nicht gebaselined (Stand 324 Zeilen, `.mjs`-Limit
  800), Budget reicht für den 2-Zeilen-Forward ohne Split.
- Fremde Live-Sessions (T901286, chore/langfuse) berühren andere Pfade —
  keine Kollision (Audit Schritt −1).
