# Proposal: t001349-korczewski-deploy-rate-metric

## Why

Der G-CD01-Messbefehl in `.claude/lib/goals.md` (`gh-axi run list --workflow
build-website-korczewski.yml ...`) zeigt auf eine Workflow-Datei, die seit PR #2167 (T001229,
2026-06-27) gelöscht ist. GitHub Actions liefert dafür dauerhaft dieselben 15 eingefrorenen
historischen Runs vom Konsolidierungstag zurück (8/15 = 53 % — exakt der Ticket-Wert, kann sich
per Konstruktion nie mehr ändern). Der reale, aktuelle Deploy-Status des konsolidierten Jobs
`deploy-korczewski` in `.github/workflows/build-website.yml` liegt bei ~94–100 % (verifiziert via
`gh api .../actions/runs/<id>/jobs`) — über dem 90 %-Ziel. Der strukturelle Fix (T001276,
unabhängige parallele Deploy-Jobs) funktioniert bereits; nur die Messung selbst ist kaputt. Das
Vorgänger-Ticket T001276 wurde als `done` geschlossen, ohne dass sich der Messwert je verbessern
konnte — dieses Ticket behebt die Messung selbst und sichert das strukturell gegen Wiederholung ab.

## What Changes

- `.claude/lib/goals.md`: G-CD01-Messbefehl auf Job-Level `gh api`-Abfrage gegen den aktuellen
  Workflow (`build-website.yml`, Job `"Deploy Website (korczewski)"`) umstellen; Messwert
  aktualisieren; G-CD01 von Priorität A nach Priorität C (Ziel erreicht) verschieben.
- `tests/spec/ci-cd.bats`: neuer, generischer Regressionsguard — schlägt fehl, wenn `goals.md`
  einen `--workflow <datei>.yml`-Verweis auf eine nicht mehr existierende
  `.github/workflows/*.yml`-Datei enthält (fängt jede künftige Workflow-Umbenennung ab, nicht nur
  diesen Fall).
- `openspec/specs/website-core.md`: Spec-Drift korrigieren — Scenario "korczewski Build-Workflow
  enthält kubectl set image" referenziert noch die gelöschte Datei
  `build-website-korczewski.yml`; auf `build-website.yml` (Job `deploy-korczewski`) aktualisieren.

## Capabilities

### Modified Capabilities

- `ci-cd`: neue Requirement "Health-Goal-Messbefehle referenzieren nur existierende
  Workflow-Dateien" (Guard gegen Mess-Drift bei Workflow-Konsolidierung/-Umbenennung).

_Ticket: T001349_
