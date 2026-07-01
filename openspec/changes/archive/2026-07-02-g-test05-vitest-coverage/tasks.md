---
title: "G-TEST05: Vitest Line-Coverage messen und Gate ≥60% einrichten"
ticket_id: T001288
domains: ["tests","website","ci"]
status: plan_staged
---

# g-test05-vitest-coverage — Implementation Plan

## File Structure

| Status | Datei | Änderung |
|--------|-------|----------|
| Geändert | `scripts/health-goals-check.sh` | `row target G-TEST05`-Block im TARGETS-Abschnitt ergänzen |
| Bereits fertig | `website/package.json` | `@vitest/coverage-v8 ^4.1.9` bereits in devDependencies |
| Bereits fertig | `website/vitest.config.ts` | Coverage-Konfiguration mit `thresholds.lines: 60` bereits aktiv |
| Bereits fertig | `.github/workflows/ci.yml` | "Vitest line coverage gate (>= 60% on src/lib)" bereits vorhanden |

## Task 0: Baseline messen (RED)

Vor der Implementierung den tatsächlichen Ist-Zustand beider Prüfpunkte feststellen.

- [ ] Coverage-Messung ausführen, um den echten Prozentwert zu ermitteln:
  ```bash
  cd website && pnpm exec vitest run --coverage --reporter=silent 2>/dev/null
  jq -r '.total.lines.pct' coverage/coverage-summary.json
  ```
- [ ] Lokale Gesundheitsprüfung für G-TEST05 ausführen:
  ```bash
  bash scripts/health-goals-check.sh --only=G-TEST05
  ```
  expected: FAIL (G-TEST05 ist nicht im Skript registriert; die `--only`-Filterung ergibt null Zeilen, kein grünes Signal)

## Task 1: G-TEST05 in health-goals-check.sh registrieren

Im TARGETS-Abschnitt von `scripts/health-goals-check.sh` direkt hinter dem letzten `row target`-Aufruf (aktuell `G-SEC05`) einen neuen Block einfügen:

```bash
# G-TEST05 — Vitest Line-Coverage (website/src/lib ≥ 60 %)
if [ "$FAST" = 0 ] && command -v pnpm >/dev/null 2>&1; then
  _cov_pct=$(
    (cd website && pnpm exec vitest run --coverage --reporter=silent 2>/dev/null) \
      && jq -r '.total.lines.pct // empty' website/coverage/coverage-summary.json 2>/dev/null \
      || echo "-"
  )
  _cov_int=$(echo "$_cov_pct" | awk -F'.' '{if ($1~/^[0-9]+$/) print $1+0; else print "-"}')
  row target G-TEST05 "$_cov_int" ge 60 "Vitest Line-Coverage website/src/lib"
else
  row target G-TEST05 "-" ge 60 "Vitest Line-Coverage website/src/lib (--fast übersprungen)"
fi
```

Begründung der Implementierungsentscheidungen:
- `--fast`-Guard: identisches Muster wie `G-CFG01` (timeout-geschützte Slow-Checks). Coverage-Läufe dauern mehrere Minuten und sind ungeeignet für schnelle Gate-Checks.
- `--reporter=silent`: unterdrückt die vollständige Testausgabe; das JSON-Summary-File wird trotzdem geschrieben.
- Integer-Floor via `awk`: `[ "$actual" -ge "$target" ]` in der `row`-Funktion erwartet einen ganzzahligen Bash-Wert; `63.5` würde zu einem Fehler führen.
- Pfad `website/coverage/coverage-summary.json`: `jq` wird vom Repo-Root aus aufgerufen (nach dem `cd website`-Subshell-Aufruf kehrt die äußere Shell ins Repo-Root zurück).

## Task 2: Lokale Verifikation nach Implementierung

- [ ] Health-Check-Skript erneut aufrufen und G-TEST05-Zeile prüfen:
  ```bash
  bash scripts/health-goals-check.sh --only=G-TEST05
  ```
  Erwartetes Ergebnis: G-TEST05 erscheint als Zeile mit aktuellem Coverage-Wert; grün wenn ≥ 60 %.
- [ ] Vollständigen Gate-Report ohne `--only` ausführen und sicherstellen, dass kein Gate-Verstoß eingeführt wurde:
  ```bash
  bash scripts/health-goals-check.sh
  ```
- [ ] Sicherstellen, dass `--fast`-Modus G-TEST05 korrekt als SKIP ausgibt:
  ```bash
  bash scripts/health-goals-check.sh --fast --only=G-TEST05
  ```

## Task 3 (Verify): Quality Gates

- [ ] `bash scripts/health-goals-check.sh --only=G-TEST05` — Ziel-Status grün (Coverage ≥ 60 %)
- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
