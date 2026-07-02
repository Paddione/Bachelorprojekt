# g-test05-vitest-coverage

## Purpose

SSOT spec.

## Requirements

### Requirement: Der Mess-Command `cd website && pnpm exec vitest run --cover

The system SHALL der Mess-Command `cd website && pnpm exec vitest run --coverage && jq -r '.total.lines.pct' coverage/coverage-summary.json` ist reproduzierbar ausführbar und liefert einen numerischen Prozentwert für `total.lines.pct`.
- REQ-2: Die `vitest.config.ts` enthält `coverage.provider = 'v8'`, `coverage.include = ['src/lib/**/*.ts']`, und `coverage.thresholds.lines = 60`, sodass Vitest selbst bei Unterschreitung des Schwellenwerts mit Exit-Code 1 endet.
- REQ-3: Die CI-Pipeline (`ci.yml`) führt einen dedizierten Coverage-Gate-Schritt aus, der `coverage/coverage-summary.json` auswertet und bei `total.lines.pct < 60` mit `exit 1` abbricht.
- REQ-4: `scripts/health-goals-check.sh --only=G-TEST05` gibt eine `row target G-TEST05`-Zeile aus und zeigt grün, wenn die gemessene Coverage ≥ 60 % beträgt.
- REQ-5: `scripts/health-goals-check.sh --fast --only=G-TEST05` überspringt die Coverage-Messung und gibt `SKIP` aus, ohne den Exit-Code zu verfehlen.

## Acceptance Criteria

- THEN gibt `jq -r '.total.lines.pct' website/coverage/coverage-summary.json` nach einem lokalen `vitest run --coverage`-Lauf einen Wert ≥ 60 zurück.
- THEN endet `pnpm --dir website exec vitest run --coverage` mit Exit-Code 0 (Vitest-interner Threshold nicht verletzt).
- THEN schlägt der CI-Schritt "Vitest line coverage gate (>= 60% on src/lib)" in `.github/workflows/ci.yml` bei Coverage < 60 % mit Exit-Code 1 fehl und gibt `::error::Coverage gate failed` aus.
- THEN gibt `bash scripts/health-goals-check.sh --only=G-TEST05` die G-TEST05-Zeile mit einem aktuellen Messwert aus und beendet sich mit Exit-Code 0, wenn der Wert ≥ 60 ist.
- THEN gibt `bash scripts/health-goals-check.sh --fast --only=G-TEST05` `SKIP` für G-TEST05 aus und beendet sich mit Exit-Code 0.

<!-- merged from change delta g-test05-vitest-coverage.md on 2026-07-01 -->