# p1 — @test-Namen transliterieren

## Ziel
Alle `@test`-Namen in `TARGET` sind ASCII. Der Guard bleibt unveraendert.

## Schritte
1. `bash scripts/lib/bats-nonascii-testnames.sh .` laufen lassen, Beanstandungen
   notieren (erwartet: genau ein Treffer, `brain-ingest-prune.bats`).
2. Nur den **Namen** transliterieren: `Rückverweis` -> `Rueckverweis`.
3. Die Zeile `source:: Rückverweis: Bachelorprojekt live.md` in der Fixture
   **nicht** anfassen — sie ist Produktverhalten (T002679).
4. `scripts/lib/bats-nonascii-testnames.sh` nicht veraendern.
5. `bash checks/run.sh` — muss exit 0 liefern.

## Fertig, wenn
- Guard exit 0
- Guard-Skript byte-identisch
- Fixture-Zeile mit `Rückverweis` weiterhin vorhanden
- beide Tests noch existieren
