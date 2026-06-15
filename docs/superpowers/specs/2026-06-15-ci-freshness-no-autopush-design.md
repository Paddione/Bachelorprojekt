---
ticket_id: T000785
plan_ref: null
created: 2026-06-15
status: design
---

# Design: CI freshness check ohne Auto-Push auf PR-Branches

## Problem

Der CI-Workflow (ci.yml) auto-pushed stale freshness artifacts via GH_PAT auf den PR-Branch.
GitHub Actions unterdrückt daraufhin den nächsten Workflow-Run (Loop-Prevention), erzeugt eine
Check-Suite mit `conclusion:action_required` und 0 Jobs. Branch Protection sieht keine Checks → PR BLOCKED.

Alle 4 offenen PRs (#1706, #1707, #1708, #1711) sind betroffen.

## Lösung

**Entferne den Auto-Push aus dem PR-CI-Job.** Stattdessen: `freshness:check` schlägt fehl, wenn
Artefakte stale sind. Der Entwickler muss `task freshness:regenerate` lokal ausführen und pushen.

Der post-merge Workflow `freshness-regen.yml` (push auf main) bleibt unverändert — er fängt
versehentlich gemergte stale Artifacts auf main ab.

## Betroffene Datei

- `.github/workflows/ci.yml` — `offline-tests` Job, Step "Ensure freshness artifacts are up to date"

## Risiken

- Minimal: Entwickler müssen `task freshness:regenerate` manuell ausführen (wie in AGENTS.md dokumentiert).
- Kein Breaking Change: `freshness:check` existiert bereits und läuft nach dem Auto-Fix.
