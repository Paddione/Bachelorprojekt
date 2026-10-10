---
title: website:migrate target safety (fail-closed env, ephemeral port, ordering, loud backfill)
ticket_id: T901750
domains: [website, db, taskfile]
status: staged
---

# t901750-migrate-safety — Implementation Plan

Single-Plan (kleine Änderung, ein Subsystem + Tests). Root-Cause-Analyse und
Entscheidungen: `design.md` im selben Ordner.

## File Structure

| Datei | Änderung |
|---|---|
| `taskfiles/Taskfile.web.yml` | Preconditions-Whitelist, ephemerer Port, Forward-Verify, Ziel-Echo |
| `components/website/src/db/migrate.ts` | Backfill-Meldung info → warn mit Handlungsanweisung |
| `components/website/src/db/migrate.test.ts` | Assertion auf die Warnung im Backfill-Pfad |
| `components/website/src/db/migrations/20260917_application_pipeline_match_score.sql` | Rename → `20260918_application_pipeline_match_score.sql` |
| `tests/py/spec/native_ported/spec/test_migrate_target_safety.py` | RED-Test (neu, bereits im Branch, ca. 60 Zeilen) |
| `components/website/src/data/test-inventory.json` | Regenerieren falls verändert |

`components/website/src/db/migrate.ts` hat Ist 113 bei Budget 787.
`components/website/src/db/migrate.test.ts` hat Ist 169 bei Budget 731.
`taskfiles/Taskfile.web.yml` und die `.sql`-Dateien sind nicht S1-vermessen;
das neue pytest-Modul bleibt deutlich unter dem `.py`-Limit.

## Task 1 — RED-Bestätigung

- Step: `PYTEST_JOBS=0 bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_migrate_target_safety.py` — expected: FAIL, beide Tests rot, Anker-Zeilen grün.
- Acceptance: exakt die beiden neuen Tests scheitern, kein anderer.

## Task 2 — Task-Härtung in `taskfiles/Taskfile.web.yml`

- Preconditions am Task `website:migrate` ergänzen (Idiom der Sibling-Tasks):
  ENV muss einer von `dev`, `mentolder`, `korczewski`, `staging` sein.
- Festen Port `5432:5432` ersetzen: `kubectl port-forward svc/shared-db :5432`
  wählen lassen, den vergebenen Port aus der Zeile `Forwarding from 127.0.0.1:PORT`
  parsen, bei Parse-Fehlschlag fail-closed abbrechen.
- `sleep 3` ersetzen durch TCP-Ready-Poll mit Timeout plus `kill -0`-Liveness
  des Forward-Prozesses; bei Timeout abbrechen (Trap zum Aufräumen behalten).
- Vor dem Migrate resolved `context`/`namespace` echoen (Operator-Sichtbarkeit).
- `DATABASE_URL` auf `127.0.0.1` mit dem vergebenen Port zeigen lassen;
  der `pnpm --dir components/website db:migrate`-Aufruf bleibt erhalten.
- Constraints: Task-Name `website:migrate` unverändert lassen; `ENV=dev` muss
  weiter per dry-run rendern (bestehender Guard); kein neues Skript (S4).

## Task 3 — Migrations-Reihenfolge per Rename

- Step: `git mv` der Datei `20260917_application_pipeline_match_score.sql` auf
  `20260918_application_pipeline_match_score.sql` (Inhalt unverändert).
- Acceptance: lexikographische Sortierung legt schema vor match_score;
  SQL ist `IF NOT EXISTS`-idempotent, bereits getrackte DBs laufen die Datei
  einmalig als No-Op nach.

## Task 4 — Backfill laut machen (`migrate.ts` + vitest)

- In `migrate.ts` die Backfill-Meldung von `logger.info` auf `logger.warn`
  heben, mit Dateiname, SQLSTATE und dem Hinweis, die Objekte manuell zu
  verifizieren. Tracking-Verhalten unverändert lassen (bindender Vertrag,
  bestehender `it.each`-Test bleibt grün).
- In `migrate.test.ts` eine Assertion ergänzen, dass der Backfill-Pfad die
  Warnung emittiert (bestehende Mock-Struktur wiederverwenden).
- Constraints: keine neuen `any`-Typen (CQ02), keine neuen Importe (S2),
  keine Brand-Domain-Literale in Snippets (S3).

## Task 5 — Verify

- Steps:
  - `bash scripts/pytest-run.sh tests/py/spec/native_ported/spec/test_migrate_target_safety.py` (grün)
  - `task test:changed`
  - `task test:inventory` falls Test-Inventar betroffen, Artefakt mitcommitten
  - `cd components/website && npx astro check`
  - `task freshness:regenerate`
  - Artefakte committen
  - `task freshness:check`
- Acceptance: alle drei Kommandos `task test:changed`,
  `task freshness:regenerate`, `task freshness:check` laufen erfolgreich.
