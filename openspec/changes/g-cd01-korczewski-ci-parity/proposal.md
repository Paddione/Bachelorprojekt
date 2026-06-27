## Why

Die korczewski Website-Deploy-Pipeline hat eine Erfolgsrate von 53% (Ziel: ≥90%), weil beide Brands in einem einzigen sequentiellen CI-Job deployt werden — ein mentolder-Fehler überspringt den korczewski-Deploy still. T001182 hat den Secret-Drift behoben; dieser Change behebt die strukturelle Job-Kopplung und ergänzt fehlende CI-Tests für Brand-Parity.

## What Changes

- `.github/workflows/build-website.yml` wird in 3 unabhängige Jobs aufgeteilt: `build-image` (shared) → `deploy-mentolder` + `deploy-korczewski` (parallel, unabhängig)
- `tests/spec/ci-cd.bats` erhält G-CD01 BATS-Tests für Brand-Parity-Garantie
- `tests/unit/website-ci-deploy.bats` wird an die neue 3-Job-Struktur angepasst
- `openspec/specs/ci-cd.md` wird von veralteten `build-website-korczewski.yml`-Referenzen bereinigt (Spec-Drift aus T001229)

## Capabilities

### New Capabilities

- `korczewski-deploy-parity`: Unabhängiger CI-Deploy-Job für korczewski — schlägt fehl oder succeeds unabhängig von mentolder

### Modified Capabilities

- `ci-cd`: Website-Auto-Deploy-Requirement wird auf die neue 3-Job-Architektur aktualisiert; veraltete `build-website-korczewski.yml`-Scenarios werden entfernt; G-CD01-Requirement für Brand-Parity wird ergänzt

## Impact

- `.github/workflows/build-website.yml` — strukturell umgebaut (3 Jobs statt 1; Image-SHA als Job-Output; keine funktionale Logikänderung in Deploy-Commands)
- `tests/spec/ci-cd.bats` — neue Tests (G-CD01)
- `tests/unit/website-ci-deploy.bats` — Anpassung an neue Job-Namen und -Struktur
- `openspec/specs/ci-cd.md` — Spec bereinigt + G-CD01 Requirement ergänzt
- Keine API-Änderungen, keine Datenbankänderungen, keine Secret-Änderungen
