# Proposal: t001351-time-entry-default-date

## Why

`createTimeEntry()` in `website/src/lib/website-db.ts` sendet für die Spalte
`entry_date` (`DATE NOT NULL DEFAULT CURRENT_DATE`) immer einen expliziten
Parameterwert (`params.entryDate ?? null`). Postgres wendet einen
Spalten-`DEFAULT` nur an, wenn die Spalte im `INSERT` komplett weggelassen
wird — nicht, wenn explizit SQL-`NULL` übergeben wird. Fehlt `entryDate`
(z. B. leeres Formularfeld im Admin-Zeiterfassungs-Formular,
`src/pages/api/admin/zeiterfassung/create.ts`), wird `entry_date` also auf
SQL-`NULL` gesetzt, was die `NOT NULL`-Constraint verletzt. Der `INSERT`
schlägt komplett fehl (`null value in column "entry_date" violates not-null
constraint`), der Admin sieht nur einen generischen `Datenbankfehler`. Das
Feature „Zeiteintrag ohne Datum anlegen, Default = heute" funktioniert damit
aktuell überhaupt nicht.

Gefunden während T001350 (Vitest-Coverage-Erhöhung); gemäß Bug-Triage-
Konvention (CFR-Gate G-DORA03) als eigenes Ticket (T001351) erfasst statt
stillem Fix-Commit.

## What

`INSERT INTO time_entries (...)` in `createTimeEntry()` wird so geändert,
dass der `entry_date`-Parameterslot serverseitig auf `CURRENT_DATE`
zurückfällt, wenn kein Wert übergeben wird — via
`COALESCE($8::date, CURRENT_DATE)` statt eines rohen `$8`-Platzhalters. Das
reproduziert das ursprünglich beabsichtigte Spalten-DEFAULT-Verhalten ohne
den `INSERT`-Aufbau dynamisch zu machen (kein Query-Builder, YAGNI).

Betroffene Datei: `website/src/lib/website-db.ts` (1-Zeilen-Fix in der
INSERT-Query, Zeile ~1593). Keine Änderung an der Funktionssignatur, keine
Änderung am Caller (`src/pages/api/admin/zeiterfassung/create.ts`), der
bereits korrekt `entryDate: entryDate || undefined` durchreicht.

**Abhängigkeitshinweis:** Ticket T001352 (`seedInvoiceCounter`
ON-CONFLICT-Bug) betrifft denselben Bereich (website/db, vermutlich ebenfalls
`website-db.ts`). Bewusst NICHT parallel bearbeitet, um Datei-Konflikte zu
vermeiden — T001352 startet erst nach Merge dieses Fixes.

_Ticket: T001351_
