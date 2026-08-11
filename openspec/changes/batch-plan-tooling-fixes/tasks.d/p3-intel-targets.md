# p3 — plan-intel: mehrere --target-files akzeptieren (T003623)

## Ziel

`scripts/plan-intel.sh <slug> --target-files a b` bricht mit `Unknown option: b` ab —
der `--target-files`-Zweig (Zeile 15) liest genau EIN Argument. Für T003278 musste
intel.json daher mit nur `scripts/lib/run-bats.sh` erzeugt werden; die übrigen
betroffenen Dateien fehlten im intel-Bundle. Erwartung laut `opencode-flow-plan`
Step A.1.5: `bash scripts/plan-intel.sh <slug> --target-files <datei1> <datei2> ...`.

## Steps

1. **RED.** Neue Tests in `tests/spec/dev-flow-plan/plan-intel-risks-dedupe.bats`
   (Sandbox-Slug-Pattern der bestehenden Suite, `_t003623-*`):
   - Mehrere leerzeichen-getrennte Pfade: `--target-files scripts/plan-intel.sh
     scripts/plan-qa-check.sh scripts/plan-touched-files.sh` → `impact_files` enthält
     alle drei Pfade, exit 0. Alter Code: `Unknown option` → rot.
   - Komma-Form bleibt kompatibel: `--target-files a,b` → beide Pfade in
     `impact_files`. (Abwärtskompatibilität für die interne
     `_resolve_target_files`-Verdrahtung, die komma-vereinigt liefert.)
   `expected: FAIL`.

2. **GREEN.** In `scripts/plan-intel.sh` den `--target-files`-Zweig variadisch machen:
   - Nach `--target-files` alle folgenden Argumente sammeln, bis ein Argument mit `--`
     beginnt oder die Argumentliste endet; gesammelte Pfade komma-vereinigen (der
     Datei-Split weiter unten läuft bereits `IFS=',' read -ra FILES`).
   - `--out` bleibt einwertig.
   - Leere Sammlung (direkt `--`-Flag oder Ende) → bestehendes Verhalten: Fallback auf
     die `_resolve_target_files`-Auflösung aus tasks.md.
   - Usage-Kommentar (Zeile 3) und Fehlermeldung aktualisieren.

3. **Verifikation.** Fall aus T003623: alle real betroffenen Dateien eines Changes in
   EINEM Aufruf → `impact_files` vollständig; `plan-lint` I1 (Coverage aller
   target_files) besteht.

## Acceptance

- `--target-files <f1> <f2> …` erzeugt impact_files für ALLE Pfade (exit 0).
- `--target-files <f1>,<f2>` (Komma-Form) funktioniert unverändert.
- `--out`-Semantik und der tasks.md-Fallback bleiben unangetastet.
