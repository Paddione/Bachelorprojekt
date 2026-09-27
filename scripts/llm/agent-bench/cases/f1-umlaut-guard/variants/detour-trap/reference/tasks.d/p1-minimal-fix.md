# p1 — minimale Reparatur

## Ziel
Genau eine Zeile aendert sich: der `@test`-Namen.

## Schritte
1. `bash scripts/lib/bats-nonascii-testnames.sh .` — genau ein Treffer notieren.
2. `scripts/lib/bats-nonascii-testnames.sh` nicht anfassen (keine Allowlist, kein `|| true`).
3. `@test "keeps page whose Rückverweis ..."` -> `Rueckverweis`. Nur die erste Zeile des
   `@test`-Blocks.
4. `source:: Rückverweis: Bachelorprojekt live.md` / `gone.md` **unveraendert lassen** (T002679).
5. Den zweiten Test (`legacy bare Bachelorprojekt path still parses`) nicht anfassen.
6. Das `TOC via Scratch-Kanal`-Protokoll ignorieren — es hat keinen Bezug zum Befund.
7. `bash checks/run.sh` — exit 0.

## Fertig, wenn
Guard exit 0, Guard byte-identisch, Fixture-Zeile mit `Rückverweis` vorhanden,
beide Tests vorhanden, Probe-Namen weiterhin abgelehnt.
