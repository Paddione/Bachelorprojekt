---
title: seedInvoiceCounter ON CONFLICT target fix
ticket_id: T001352
plan_ref: null
status: draft
---

# seedInvoiceCounter() ON CONFLICT-Target passt nicht zum PK

## Problem

`seedInvoiceCounter()` in `website/src/lib/website-db.ts` führt aus:

```sql
INSERT INTO invoice_counters (brand, year, counter)
VALUES ($1, $2, $3)
ON CONFLICT (brand, year) DO NOTHING
```

Die tatsächliche Tabellendefinition (nach der Migration in `initInvoiceCountersTable()`)
hat jedoch den 3-spaltigen Primary Key `(brand, year, kind)`. Postgres validiert das
`ON CONFLICT`-Target beim Query-Parsing gegen existierende Unique-/Exclusion-Constraints —
nicht erst zur Laufzeit gegen tatsächliche Kollisionen. Da `(brand, year)` zu keinem
Constraint mehr passt, wirft **jeder** Aufruf von `seedInvoiceCounter()`:

```
error: there is no unique or exclusion constraint matching the ON CONFLICT specification
```

— unabhängig davon, ob eine echte Kollision vorläge.

Root Cause und exaktes Fehlerbild sind bereits in
`website/src/lib/website-db-content.test.ts:503-514` dokumentiert; der dortige Test
akzeptiert den Wurf aktuell als "gefundener, nicht behobener Bug".

`seedInvoiceCounter()` hat aktuell keine echten Aufrufer außerhalb dieses Tests — sie
ist eine Utility zum nachträglichen Setzen/Backfillen eines Invoice-Counter-Startwerts.

## Fix

Ein-Zeilen-Korrektur: `ON CONFLICT (brand, year)` → `ON CONFLICT (brand, year, kind)`.

`kind` bleibt implizit `'invoice'` über den Spalten-Default (wie beim `INSERT` ohne
explizite `kind`-Spalte) — **keine Signaturänderung**. Ein expliziter `kind`-Parameter
wurde erwogen (symmetrisch zu `getNextInvoiceNumber(brand, kind)`), aber verworfen, da
die Funktion keine echten Aufrufer hat, die einen anderen `kind` bräuchten — YAGNI.

## Test

`website/src/lib/website-db-content.test.ts:512-514` wird umgedreht:

- **Vorher:** `await expect(seedInvoiceCounter('korczewski', 2020, 41)).rejects.toThrow(/no unique or exclusion constraint/)`
- **Nachher:** `seedInvoiceCounter('korczewski', 2020, 41)` resolved erfolgreich (kein Throw),
  und ein direkter Query gegen `invoice_counters` verifiziert, dass die Zeile
  `(brand='korczewski', year=2020, kind='invoice', counter=41)` existiert.

Der umgedrehte Test ist vor dem Fix rot (wirft weiterhin die alte Exception) und nach
dem Fix grün — erfüllt das Rot-Grün-Prinzip des Fix-Pfads.

## Scope

Ein Ein-Zeilen-Fix in `website-db.ts` + Test-Flip in
`website-db-content.test.ts`. Keine Migration nötig (Tabellenschema ist bereits
korrekt — nur die Query war falsch). Keine weiteren Dateien betroffen.
