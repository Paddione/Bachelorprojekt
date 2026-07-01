---
ticket_id: T001351
plan_ref: openspec/changes/t001351-time-entry-default-date/tasks.md
status: active
date: 2026-07-01
---

# T001351 — createTimeEntry() umgeht DEFAULT CURRENT_DATE bei entryDate=null

## Root Cause (verifiziert)

`createTimeEntry()` in `website/src/lib/website-db.ts` (Zeile 1581–1621) führt folgendes INSERT aus:

```sql
INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, leistung_key, entry_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
```

mit `params.entryDate ?? null` als Wert für `$8`. Die Spalte ist definiert als
`entry_date DATE NOT NULL DEFAULT CURRENT_DATE`.

Postgres wendet einen Spalten-`DEFAULT` **nur an, wenn die Spalte im INSERT komplett
weggelassen wird** (oder explizit das Schlüsselwort `DEFAULT` verwendet wird) — nicht,
wenn ein Parameter mit dem Wert SQL-`NULL` übergeben wird. Der `node-pg`-Treiber
serialisiert JS `null` als SQL-`NULL`, nicht als "Parameter weglassen".

**Konkrete Auswirkung (verifiziert durch Analyse, nicht durch Live-Repro):** Wenn
`params.entryDate` `undefined` ist (z. B. leeres Formularfeld im Caller
`src/pages/api/admin/zeiterfassung/create.ts`, der volatile bereits korrekt
`entryDate: entryDate || undefined` durchreicht), wird `$8` zu SQL-`NULL`. Das verletzt
die `NOT NULL`-Constraint der Spalte — der INSERT schlägt mit einer
`null value in column "entry_date" violates not-null constraint`-Exception fehl. Diese
wird im Caller (`create.ts`, `catch`-Block) abgefangen und dem Admin als generischer
`Datenbankfehler`-Redirect angezeigt. Das Feature "Zeiteintrag ohne Datum anlegen,
Default = heute" funktioniert aktuell **überhaupt nicht** — es ist kein stiller
Datenfehler, sondern ein harter Fehlschlag der gesamten Aktion.

## Fix-Ansatz

**Gewählt: Option 1 — `COALESCE` in der Query.**

Statt die Spalte dynamisch aus dem INSERT herauszulassen (Query-Builder, mehr Code,
mehr Testfläche), wird der Parameter-Slot in der Query selbst abgesichert:

```sql
INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, leistung_key, entry_date)
VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8::date, CURRENT_DATE))
```

`params.entryDate ?? null` bleibt als Parameterwert unverändert (bleibt `null`, wenn kein
Datum übergeben wurde) — die Fallback-Logik verlagert sich von "Spalte weglassen" auf
"COALESCE in der Query", was serverseitig identisches Verhalten zum echten Spalten-DEFAULT
erzeugt (`CURRENT_DATE`, Server-Zeitzone von Postgres — unverändert zum bisherigen
DEFAULT-Verhalten, keine neue Zeitzonen-Problematik).

**Verworfen: Option 2 — dynamischer Query-Builder** (Spalte weglassen, wenn kein
`entryDate`). Verworfen wegen höherer Komplexität (zwei Query-Varianten oder
String-Konkatenation der Spaltenliste) für denselben funktionalen Effekt wie `COALESCE`.
YAGNI.

## Edge Cases

- **Ungültiges Datumsformat vom Formular** (z. B. `entryDate=abc`): `$8::date`-Cast
  wirft bereits heute (unverändert durch den Fix) eine Postgres-Typkonvertierungs-
  Exception, die vom bestehenden `catch`-Block in `create.ts` abgefangen wird
  (`Datenbankfehler`-Redirect). Kein Regressions-Risiko, keine Änderung am
  Fehlerverhalten für diesen Fall.
- **`entryDate` ist leerer String `''` statt `undefined`:** Caller `create.ts` wandelt
  bereits `entryDate || undefined` — ein leerer String wird zu `undefined` vor dem
  Aufruf von `createTimeEntry()`. `website-db.ts` selbst erhält also nie `''`, nur
  `string | undefined`. Kein zusätzlicher Guard nötig.
- **Zeitzone bei `CURRENT_DATE`:** Unverändert zum bisherigen Spalten-DEFAULT-Verhalten
  (Postgres-Server-Zeitzone). Der Fix ändert nur den Mechanismus (COALESCE statt
  Spalten-DEFAULT), nicht die Zeitzonen-Semantik.
- **Bestehende Aufrufe mit explizitem `entryDate`:** Unverändert — `COALESCE` reicht
  einen Nicht-NULL-Wert unverändert durch.

## Betroffene Dateien

- `website/src/lib/website-db.ts` — 1-Zeilen-Fix in der INSERT-Query (Zeile ~1593).
  Datei hat 2890 Zeilen, ist **nicht** in `docs/code-quality/baseline.json` gebaselined
  (`nicht-baselined`) → S1-Budget = das reguläre Limit, nicht 0. Ein 1-Zeilen-Diff ohne
  Netto-Wachstum bleibt in jedem Fall unkritisch.
- `website/src/lib/website-db.test.ts` (oder neue, co-lokalisierte Testdatei nach dem
  Muster von `website-db.content-store.test.ts`) — Vitest-Unit-Test mit gemocktem
  `pg`-Pool nach dem etablierten Muster (`vi.mock('pg', …)`), da `createTimeEntry()`
  eine reine SQL-Parameter-Frage ist und kein Live-DB-Test nötig ist (anders als
  `listTimeline` in derselben Datei, das `describe.skipIf(!dbAvailable)` mit echter
  DB nutzt). Failing Test asserted, dass die INSERT-Query `COALESCE($8::date,
  CURRENT_DATE)` statt eines rohen `$8`-Platzhalters für `entry_date` enthält (Query-
  String-Assertion) — das reproduziert den Bug direkt am Symptom (Query-Struktur),
  ohne eine echte Datenbank zu benötigen.

## Warum kein Vitest-Test, der die tatsächliche NOT-NULL-Exception simuliert?

Der gemockte `pg`-Pool würde bei einem `mockResolvedValueOnce` **nie** eine echte
Postgres-Constraint-Verletzung werfen — das Mock kennt keine Constraints. Ein Test, der
die reale Fehlermeldung reproduzieren will, bräuchte eine echte (Test-)Datenbank
(wie `website-db.test.ts`s `describe.skipIf(!dbAvailable)`-Suite). Für dieses Ticket
reicht die Query-String-Assertion (COALESCE vorhanden), weil sie den strukturellen Bug
exakt trifft: fehlt `COALESCE`, wird `$8` roh übergeben → das ist die Zeile, die den
Bug verursacht. Diese Assertion ist deterministisch, schnell (kein DB-Fixture) und
regressionssicher.

## Abhängigkeitshinweis: T001352

Ticket T001352 (`seedInvoiceCounter` ON-CONFLICT-Bug) betrifft denselben Bereich
(`website`/`db`, vermutlich ebenfalls `website-db.ts` oder eine benachbarte Datei im
Billing-Kontext). **Bewusste Entscheidung:** T001351 und T001352 werden NICHT parallel
bearbeitet, um Merge-Konflikte auf derselben Datei zu vermeiden. T001352 sollte erst
gestartet werden, nachdem der PR für T001351 gemerged ist (oder umgekehrt, aber nicht
gleichzeitig in zwei Worktrees).

## Scope-Grenze

Kein Refactoring von `createTimeEntry()` über den Bugfix hinaus (kein Query-Builder,
keine Änderung der Funktionssignatur, kein Anfassen von `listTimeEntries` oder anderen
Nachbarfunktionen in derselben Datei).
