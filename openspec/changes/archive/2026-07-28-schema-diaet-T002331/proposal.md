# Proposal: schema-diaet-T002331

## Why

Teil D (Schluss) des Epics T002326 (Ticketsystem-Konsolidierung). Von 59 Spalten in
`tickets.tickets` sind ~27 tot — entweder 100 % leer, konstant auf dem Default-Wert,
oder unter 2 % gefüllt. Trotzdem sind alle im Code referenziert: halbfertige Features,
kein vergessener Ballast.

Der Rückbau muss jede Referenzstelle mitnehmen, sonst bricht der Code. Betroffen
sind 20+ Dateien.

## What

1. **Inventur:** Spalten-Fillrate gegen beide Brand-DBs (mentolder + korczewski).
   Tabelle der 27 Kandidaten mit Fillrate, Code-Referenz-Orten und Entscheidung
   (entfernen oder behalten).
2. **Code-Rückbau:** Pro toter Spalte alle Referenzen in TypeScript, SQL, Tests
   und Views entfernen. Kaskadierende Löschungen: wenn eine ganze Feature-Funktion
   nur die tote Spalte bedient, fällt sie mit.
3. **DDL-Rückbau:** `DROP COLUMN IF EXISTS`-Migration für beide Brands. Alle
   `ADD COLUMN IF NOT EXISTS`-Aufrufe für tote Spalten aus dem Schema-Code
   entfernen (CREATE TABLE, ALTER TABLE, systemtest-linkback, migrations).
4. **CI-Gates:** `task test:changed`, `task freshness:check`, S1-Ratchet
   (negative Zeilenbilanz erwünscht).

## Nicht enthalten

- **Kein Verhaltens-Feature.** Reiner Rückbau. Ändert keine API-Signatur,
  kein UI, kein Geschäftslogik-Verhalten.
- **Kein Umbau von alive columns.** Werden nicht umbenannt, nicht migriert.
- **Kein Verteilen** über mehrere PRs (im Gegensatz zu A-C). Ein PR, da die
  DDL-Änderung atomar ausgerollt werden muss.

_Ticket: T002331_
