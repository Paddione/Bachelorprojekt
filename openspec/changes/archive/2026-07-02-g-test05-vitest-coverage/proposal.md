# Proposal: g-test05-vitest-coverage

_Ticket: T001288_

## Why

233 `*.test.ts`-Dateien existieren im Website-Verzeichnis, aber bis zum Stand der Baseline-Erfassung gab es keine aktive Coverage-Messung. Ohne Kenntnis des tatsächlichen Line-Coverage-Werts für `website/src/lib` kann nicht beurteilt werden, ob die Tests die Kernlogik ausreichend abdecken — Regressionen bleiben unentdeckt, solange Tests zwar laufen, aber bedeutungslos weite Codepfade nie berühren.

Ein ≥ 60 %-Gate auf Line-Coverage schließt diese Lücke: Es macht die Testgesundheit messbar und verhindert, dass zukünftige PRs Coverage abbauen, ohne dass CI rot wird.

## What

Zum Zeitpunkt der Implementierung sind `@vitest/coverage-v8` (`^4.1.9`) bereits als devDependency eingetragen und `vitest.config.ts` enthält bereits `coverage.provider = 'v8'`, `coverage.include = ['src/lib/**/*.ts']` sowie `coverage.thresholds.lines = 60`. Der CI-Schritt "Vitest line coverage gate (>= 60% on src/lib)" ist bereits in `.github/workflows/ci.yml` vorhanden.

Die einzige verbleibende Lücke ist die lokale Gesundheitsprüfung: `scripts/health-goals-check.sh` kennt G-TEST05 noch nicht — ein `--only=G-TEST05`-Aufruf erzeugt keine Ausgabe und kann kein grünes Signal liefern. Der Plan schließt diese Lücke durch:

1. Erst-Messung der tatsächlichen Line-Coverage (Baseline-Wert erstmalig ermitteln).
2. Eintrag einer `row target G-TEST05`-Zeile in `health-goals-check.sh`, die bei `--fast`-Flag übersprungen wird und sonst `coverage/coverage-summary.json` auswertet (erzeugt via `pnpm exec vitest run --coverage`).

## Impact

**Geänderte Dateien:**
- `scripts/health-goals-check.sh` — neuer `row target G-TEST05`-Block im TARGETS-Abschnitt

**Bereits erledigt (keine Änderung nötig):**
- `website/package.json` — `@vitest/coverage-v8` bereits eingetragen
- `website/vitest.config.ts` — Coverage-Konfiguration mit Threshold bereits aktiv
- `.github/workflows/ci.yml` — Coverage-Gate-Schritt bereits vorhanden

**Risiken:**
- Der Coverage-Check in `health-goals-check.sh` führt `vitest run --coverage` aus, was mehrere Minuten dauern kann. Deshalb wird er hinter `--fast` versteckt (identisches Muster wie `G-CFG01`).
- Liegt die tatsächliche Coverage unter 60 %, schlägt der CI-Schritt (via `thresholds.lines`) bereits jetzt beim nächsten PR fehl — in diesem Fall müssen zuerst Tests nachgezogen werden.

**Out-of-Scope:**
- Erhöhung des Threshold über 60 % hinaus (separates Ziel)
- Coverage-Messung für andere Verzeichnisse als `src/lib`
- Branch- oder Function-Coverage-Gates
