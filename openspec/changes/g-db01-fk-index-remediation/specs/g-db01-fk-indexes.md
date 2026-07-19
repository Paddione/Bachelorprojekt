## ADDED Requirements

### Requirement: Alle bekannten Single-Column-FK-Spalten ohne Index werden indiziert

Die G-DB01-Introspektionsquery (`.claude/lib/goals.md#G-DB01`, identisch mit dem
`db_scalar`-Aufruf in `scripts/health-goals-check.sh`) MUSS gegen jede Brand-Datenbank,
die vom `website`-Migrationsrunner verwaltet wird, auf 0 fehlende Indizes konvergieren —
mit Ausnahme von FK-Spalten in Schemas, die nicht der `website`-DB-Rolle gehören
(dokumentierter, expliziter Ausschluss, siehe Non-Goal unten).

**Scenarios:**

- **GIVEN** die Migration `20260719_add_missing_fk_indexes_batch2.sql` wurde auf einer
  Brand-Datenbank angewendet
  **WHEN** die G-DB01-Query erneut läuft
  **THEN** ist der Messwert 0 für alle Tabellen, die dem `website`-Rollen-Owner gehören,
  oder — falls Fremd-Owner-Tabellen betroffen sind — exakt die Anzahl der dokumentierten
  Ausnahmen (aktuell: 1, `arena.match_players.brand`).

### Requirement: Migration ist additiv, idempotent und brand-übergreifend sicher

Jede `CREATE INDEX`-Anweisung MUSS mit `to_regclass(...)` auf Tabellenexistenz geprüft
und mit `IF NOT EXISTS` idempotent formuliert sein, da dieselbe Migrationsdatei gegen
mehrere Brand-Datenbanken mit unterschiedlichem Schema-Bestand läuft.

**Scenarios:**

- **GIVEN** eine Brand-Datenbank besitzt ein brand-spezifisches Schema nicht
  (z. B. `studio.*` existiert nur bei mentolder)
  **WHEN** die Migration angewendet wird
  **THEN** wird der zugehörige Block übersprungen, ohne die restliche Migration
  abzubrechen

- **GIVEN** ein Index existiert bereits (z. B. weil eine vorherige Teilanwendung ihn
  bereits angelegt hat)
  **WHEN** die Migration erneut läuft
  **THEN** wird kein Fehler geworfen (`IF NOT EXISTS`), nur eine informative
  `NOTICE`-Ausgabe

## Non-Goals (Scope-Ausschluss, dokumentiert)

- `arena.match_players.brand` bleibt absichtlich unindiziert durch diese Migration:
  das `arena`-Schema gehört der DB-Rolle `arena_app`, nicht `website` — der
  `website`-Migrationsrunner hat dort kein `CREATE INDEX`-Privileg. Fix erfordert
  eine `arena_app`-eigene Migration oder ein separates Follow-up-Ticket.
