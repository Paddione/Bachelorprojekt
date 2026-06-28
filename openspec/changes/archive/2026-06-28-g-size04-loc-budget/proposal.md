## Why

Die Codebasis hat keine Gesamt-LOC-Schranke — nur Einzel-Datei-Limits (S1). Ohne ein aggregiertes Budget können PRs die Gesamtgröße unkontrolliert wachsen lassen, ohne dass dies im CI sichtbar wird. Ein LOC-Budget-Gate macht übermäßiges Wachstum pro PR sichtbar und erzwingbar.

_Ticket: T001280_

## What Changes

- **Neues Skript** `scripts/check-loc-budget.mjs`: misst die Gesamtzahl der Quellcode-Zeilen über das S1-Scan-Universum und vergleicht diese mit einer committed Baseline.
- **Neue Baseline-Datei** `docs/code-quality/loc-budget.json`: hält die aktuelle LOC-Zahl, den Messzeitpunkt sowie die Schwellenwerte (warn_pct, fail_pct, absolute_cap).
- **Zwei neue Taskfile-Tasks**: `loc:check` (CI-Gate) und `loc:update-baseline` (Baseline-Aktualisierung).
- **Integration** in `task test:code-quality` (check, läuft immer in CI) und `task freshness:regenerate` (baseline update, läuft post-merge).
- **Neue Scenarios** in `openspec/specs/ci-cd.md` (S6 LOC-Budget-Requirement).
- **BATS-Tests** in `tests/spec/ci-cd.bats` für alle exit-code-Fälle.

## Capabilities

### New Capabilities

- `loc-budget`: Aggregiertes LOC-Budget-Gate — misst Gesamtzeilen im S1-Scan-Universum, warnt bei >5% Wachstum über Baseline, schlägt fehl bei >15% oder bei Überschreitung des absoluten Caps (350.000 Zeilen).

### Modified Capabilities

- `ci-cd`: Neue Requirement + Scenarios für S6 LOC-Budget-Gate hinzugefügt.

## Impact

- **Neu**: `scripts/check-loc-budget.mjs` (Node ESM, nur builtins + import aus `scripts/code-quality/scan.mjs`)
- **Neu**: `docs/code-quality/loc-budget.json` (generated artifact, im freshness-Manifest)
- **Geändert**: `Taskfile.yml` — neue Tasks `loc:check`, `loc:update-baseline`; Wiring in `test:code-quality` und `freshness:regenerate`
- **Geändert**: `openspec/specs/ci-cd.md` — S6-Requirement + Scenarios
- **Geändert**: `tests/spec/ci-cd.bats` — BATS-Tests für S6
- **Geändert**: `website/src/data/test-inventory.json` — Regenerierung nach neuen Tests
- Kein Impact auf Frontend, Kubernetes-Manifeste, Secrets oder Auth-Flow
