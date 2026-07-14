# Proposal: factory-sandbox-runner

## Why

Die Factory-Agenten (Implement-Phase, `scripts/factory/pipeline.js:411-419` + `build-loop.cjs`) führen generierten Code und Bash-Kommandos als normaler Host-Prozess aus — mit vollem User-, Dateisystem- und Netzwerk-Zugriff des WSL-Hosts. Die einzige Isolation ist die Worktree-Dateisystem-Trennung plus Claude-Code-Tool-Allowlisting (`wakeup.sh:129`). Ein fehlerhafter oder kompromittierter Implement-Lauf kann damit den Host, das Haupt-Checkout oder fremde Umgebungen beschädigen. Brainstorming-Entscheidung (2026-07-14, Spec `docs/superpowers/specs/2026-07-14-factory-qa-sandbox-design.md`): der komplette Implement-Agent wird gesandboxt.

## What

- Neues Runner-Skript `scripts/factory/sandbox-run.sh`: kapselt „führe Kommando X im Worktree Y isoliert aus".
  - **Docker-Pfad (primär):** dediziertes Sandbox-Image (Node 22, go-task, Playwright-Deps), Worktree als Bind-Mount, Haupt-Checkout und `environments/.secrets/` NICHT gemountet; Egress default-deny mit Allowlist (Anthropic-API, npm-Registry, GitHub, Staging-/Prod-Domains).
  - **k8s-Job-Fallback:** gleiche Semantik als Job im lokalen Cluster, gewählt wenn `docker info` fehlschlägt.
  - **Escape-Hatch:** `FACTORY_SANDBOX=docker|k8s|off` (off = heutiges Verhalten + Warn-Telemetrie).
- Integration: Implement-Phase und `runTaskVerifyLoop` rufen ihre Bash-/Task-Kommandos durch den Runner statt direkt (Stufe 1: Kommando-Ausführung im Container; kompletter Agent-Prozess als Stufe 2 im Folge-Change dokumentiert).
- Telemetrie über bestehende `phaseEvent`-Mechanik (`pipeline.js:73`); BATS-Tests für Auswahl-/Fallback-Kette in `tests/spec/software-factory.bats`.

_Basis für Change 2 (`factory-qa-lens`, T001814), der den Runner für die ausführende QA-Verifikation nutzt._

_Ticket: T001813_
