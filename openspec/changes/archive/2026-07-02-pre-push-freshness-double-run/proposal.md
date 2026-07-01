# Proposal: pre-push-freshness-double-run

## Why

`task freshness:regenerate` ist eine Umbrella-Kette, die u. a.
`openspec:status-map` (→ `website/src/data/openspec-status.json`) und
`loc:update-baseline` (→ `docs/code-quality/loc-budget.json`) triggert. Der
`.githooks/pre-commit`-Hook ruft diesen Umbrella-Task auf und versucht
anschließend, alle geänderten Dateien via `git add` zu stagen. Die zu
stagenende Datei-Liste ist aber **unvollständig**: die zwei oben genannten
Dateien werden regeneriert, aber nicht erfasst. Der Commit übernimmt
dadurch die alten Versionen, und CI `freshness:check` schlägt beim Push
fehl. Der User muss amend + re-push ausführen.

Konkrete Beobachtung: `02197c8e` (`chore: auto-regenerate freshness
artifacts [skip ci]`) zeigt exemplarisch den LOC-Drift — die Datei wurde
außerhalb des Hooks nachträglich korrigiert, weil der pre-commit-Hook sie
beim vorherigen Commit nicht mit aufgenommen hatte.

Mishap-Herkunft: T001367 M1 (Bündel mehrerer BATS-Anlage-Commits).

## What

- `.githooks/pre-commit`: `_FRESHNESS_FILES`-Array um
  `website/src/data/openspec-status.json` und
  `docs/code-quality/loc-budget.json` erweitern.
- Neue BATS-Datei `tests/spec/pre-commit-freshness.bats` mit zwei Tests:
  (1) RED-Sanity: aktueller Hook listet die zwei Dateien NICHT (reproduziert
  den Bug gegen main).
  (2) Drift-Guard: pre-commit-Liste ist Superset der
  `freshness:check`-Liste (verhindert künftige Regressionen).
- Keine Änderung an `Taskfile.yml`, kein neuer Hook, keine CI-Änderung.

_Ticket: T001388_
