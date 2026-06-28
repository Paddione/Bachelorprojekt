# loc-budget

<!-- baseline SSOT — generated from G-SIZE04 implementation 2026-06-28 -->

## Purpose

Dieses Dokument beschreibt das LOC-Budget-Quality-Gate (G-SIZE04) des Bachelorprojekt-Repositories.
Es enforces growth thresholds für die Gesamtzahl der Source-Code-Zeilen (Lines of Code) im S1-Scan-Universum,
gemessen gegen eine committed Baseline in `docs/code-quality/loc-budget.json`.

---

## Requirements

### Requirement: LOC-Budget-Messung

The system SHALL measure the total line count of all source files in the S1-scan-universe
(same `code_roots` and `ignore_globs` as `docs/code-quality/gates.yaml`) and compare
it against a committed baseline in `docs/code-quality/loc-budget.json`.

#### Scenario: LOC-Wachstum unter warn_pct — PASS

- **GIVEN** the current LOC is within `warn_pct` percent of `baseline.total_lines`
- **WHEN** `task loc:check` runs
- **THEN** exits 0 with a PASS message

#### Scenario: LOC-Wachstum zwischen warn_pct und fail_pct — WARN (exit 0)

- **GIVEN** current LOC exceeds `baseline.total_lines * (1 + warn_pct/100)` but not `fail_pct`
- **WHEN** `task loc:check` runs
- **THEN** exits 0 and prints a WARNING line including the delta percentage

#### Scenario: LOC-Wachstum über fail_pct — FAIL

- **GIVEN** current LOC exceeds `baseline.total_lines * (1 + fail_pct/100)`
- **WHEN** `task loc:check` runs
- **THEN** exits 1 with a FAIL message including the delta percentage

#### Scenario: Gesamtzahl überschreitet absolute_cap — FAIL

- **GIVEN** current LOC > `thresholds.absolute_cap`
- **WHEN** `task loc:check` runs
- **THEN** exits 1 with "absolute cap exceeded" regardless of delta_pct

#### Scenario: LOC hat abgenommen — PASS (immer)

- **GIVEN** the current LOC is lower than `baseline.total_lines`
- **WHEN** `task loc:check` runs
- **THEN** exits 0 unconditionally (shrinkage is always allowed)

#### Scenario: Baseline-Datei fehlt — FAIL mit Hinweis

- **GIVEN** `docs/code-quality/loc-budget.json` does not exist
- **WHEN** `task loc:check` runs
- **THEN** exits 1 with an actionable error message suggesting `task loc:update-baseline`

---

### Requirement: LOC-Baseline-Aktualisierung

The system SHALL update `docs/code-quality/loc-budget.json` with the current LOC count,
file count, commit SHA and ISO timestamp when `task loc:update-baseline` is called,
and SHALL preserve the `thresholds` block from the existing file.

#### Scenario: Baseline-Update schreibt valides JSON

- **GIVEN** `task loc:update-baseline` runs in a clean git worktree
- **WHEN** the command completes
- **THEN** `docs/code-quality/loc-budget.json` exists, is valid JSON, and contains
  `total_lines` (integer > 0), `file_count` (integer > 0), `commit` (non-empty string),
  `measured_at` (ISO-8601 string), and `thresholds` (object with warn_pct, fail_pct, absolute_cap)

#### Scenario: Bestehende thresholds werden beim Update erhalten

- **GIVEN** `docs/code-quality/loc-budget.json` enthält einen angepassten `warn_pct`-Wert
- **WHEN** `task loc:update-baseline` ausgeführt wird
- **THEN** bleibt der `thresholds`-Block unverändert — nur `total_lines`, `file_count`, `commit` und `measured_at` werden aktualisiert

<!-- merged from change delta loc-budget.md on 2026-06-28 -->

### Requirement: LOC-Budget-Messung

The system SHALL measure the total line count of all source files in the S1-scan-universe
(same `code_roots` and `ignore_globs` as `docs/code-quality/gates.yaml`) and compare
it against a committed baseline.

#### Scenario: LOC-Wachstum unter warn_pct

- **GIVEN** `docs/code-quality/loc-budget.json` enthält `total_lines: 252878` und `thresholds.warn_pct: 5`
- **WHEN** `task loc:check` ausgeführt wird und die aktuelle LOC-Zahl ≤ 265.521 (105% von 252.878) ist
- **THEN** gibt das Skript exit 0 zurück und zeigt „PASS" an

#### Scenario: LOC-Wachstum zwischen warn_pct und fail_pct

- **GIVEN** the baseline has `total_lines: 252878`, `warn_pct: 5`, `fail_pct: 15`
- **WHEN** `task loc:check` runs and current LOC is 263.000 (delta ≈ 4% — above warn threshold)
- **THEN** the script exits 0 (no CI block) and prints a WARNING line including the delta percentage

#### Scenario: LOC-Wachstum über fail_pct

- **GIVEN** the baseline has `total_lines: 252878` and `fail_pct: 15`
- **WHEN** `task loc:check` runs and current LOC exceeds 290.810 (115% of baseline)
- **THEN** the script exits 1 and prints a FAIL message with the delta percentage

#### Scenario: Gesamtzahl überschreitet absolute_cap

- **GIVEN** the baseline file contains `thresholds.absolute_cap: 350000`
- **WHEN** `task loc:check` runs and current LOC is 351.000
- **THEN** the script exits 1 with "absolute cap exceeded" regardless of delta_pct

#### Scenario: LOC hat abgenommen (Schrumpfung)

- **GIVEN** the current LOC is lower than `baseline.total_lines`
- **WHEN** `task loc:check` runs
- **THEN** the script exits 0 unconditionally (shrinkage is always allowed)

#### Scenario: Baseline-Datei fehlt

- **GIVEN** `docs/code-quality/loc-budget.json` does not exist
- **WHEN** `task loc:check` runs
- **THEN** the script exits 1 with an actionable error message suggesting `task loc:update-baseline`

### Requirement: LOC-Baseline-Aktualisierung

The system SHALL update `docs/code-quality/loc-budget.json` with the current LOC count,
file count, commit SHA and ISO timestamp when `task loc:update-baseline` is called,
and SHALL preserve the `thresholds` block from the existing file.

#### Scenario: Baseline-Update schreibt valides JSON

- **GIVEN** `task loc:update-baseline` runs in a clean git worktree
- **WHEN** the command completes
- **THEN** `docs/code-quality/loc-budget.json` exists, is valid JSON, and contains
  `total_lines` (integer > 0), `file_count` (integer > 0), `commit` (non-empty string),
  `measured_at` (ISO-8601 string), and `thresholds` (object with warn_pct, fail_pct, absolute_cap)
