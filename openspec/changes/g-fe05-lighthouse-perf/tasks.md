---
ticket: T001842
health_goal: G-FE05
---

# Tasks: G-FE05 Lighthouse Performance Score

## Task 1: Lighthouse-Audit in CI einbinden

**Datei:** `.github/workflows/ci.yml`

Neuer Job nach dem Build:
- `treosh/lighthouse-ci-action@v12` mit `urls: ['https://web.mentolder.de']`
- Budget: `budgetPath: ./lighthouse-budget.json`
- Output: JSON + Summary

**Verify:**
1. `yamllint .github/workflows/ci.yml` kein Fehler
2. Lighthouse-Job ist im Workflow sichtbar

## Task 2: Lighthouse-Budget anlegen

**Datei:** `lighthouse-budget.json`

Performance Score ≥ 90 als Budget definieren.

**Verify:**
1. Datei ist valid JSON
2. Enthält `performance: 90` als Threshold

## Task 3: Baseline erfassen und goals.md aktualisieren

**Datei:** `.claude/lib/goals.md`

Ersten Lighthouse-Run ausführen, Score dokumentieren.

**Verify:**
1. `grep -A2 'G-FE05' .claude/lib/goals.md` zeigt aktuellen Score
