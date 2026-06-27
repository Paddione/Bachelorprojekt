# t1224-lockfile-drift

## Purpose

Verhindert Lockfile-Drift im Repository durch ein neues Code-Quality-Gate S5, das zulässige und verbotene Lockfiles pro Subprojekt prüft. Die fälschlicherweise getrackte `website/package-lock.json` wird entfernt und in `website/.gitignore` ignoriert, sodass pnpm als alleiniger Lockfile-Manager für `website/` gilt.

## Requirements

### Requirement: Code-Quality-Gate S5 — Lockfile-Pfad-Validierung

The system SHALL provide `scripts/code-quality/gates/s5-lockfiles.mjs` which reads `s5.rules` from `docs/code-quality/gates.yaml` and fails (exit 1) when a forbidden lockfile exists at any checked path. The gate is integrated into `scripts/code-quality/check.mjs` and runs as part of the standard quality suite.

#### Scenario: Verbotenes Lockfile wird erkannt

- **GIVEN** `docs/code-quality/gates.yaml` deklariert `website/package-lock.json` als verboten
- **WHEN** `node scripts/code-quality/check.mjs` ausgeführt wird
- **THEN** schlägt das S5-Gate fehl (Exit 1) mit einem Hinweis auf die verbotene Datei

#### Scenario: Erlaubtes Lockfile besteht das Gate

- **GIVEN** `website/pnpm-lock.yaml` existiert und `website/package-lock.json` existiert nicht
- **WHEN** `node scripts/code-quality/gates/s5-lockfiles.mjs` ausgeführt wird
- **THEN** ist Exit-Code 0

### Requirement: website/package-lock.json ist nicht getrackt

The system SHALL NOT have `website/package-lock.json` under git tracking, and SHALL list it in `website/.gitignore`. pnpm (`website/pnpm-lock.yaml`) remains the sole lockfile for `website/`.

### Requirement: S5-Konfig-Validierung in validate.mjs

The system SHALL validate `s5.rules` in `docs/code-quality/gates.yaml` via `scripts/code-quality/validate.mjs` so the gate fails-fast at config load time on malformed rules (unknown keys, missing `forbid:`/`allow:` blocks, non-string paths).

<!-- from archive/2026-06-27-t1224-lockfile-drift/tasks.md lines 1-50 + 2026-06-27-t1224-lockfile-drift/design doc -->
