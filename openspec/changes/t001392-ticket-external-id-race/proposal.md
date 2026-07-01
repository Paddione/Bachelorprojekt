# Proposal: t001392-ticket-external-id-race

## Why

Zwei parallele `scripts/ticket.sh create`-Aufrufe schlugen mit
`duplicate key value violates unique constraint "tickets_external_id_key"` fehl — beide
generierten IDs (`T001370`, `T001371`) waren bereits von anderen parallelen
Sessions/Worktrees beansprucht worden, bevor der eigene INSERT landete. Nur der dritte
Versuch (`T001372`) war erfolgreich.

Root Cause: `tickets.fn_assign_external_id()` vergibt `external_id` bereits korrekt über
`nextval('tickets.external_id_seq')` (atomar, kollisionsfrei). Das eigentliche Problem liegt
in `applyLegacyMigrations()` (`website/src/lib/tickets/migrations.ts`), das bei **jedem**
Schema-Init (Website-Pod-Boot/Rollout) die Sequenz per
`setval('tickets.external_id_seq', MAX(external_id), true)` **unconditionally überschreibt**.
Läuft dieser Reseed parallel zu einer noch nicht committeten `nextval()`-Transaktion (z. B.
eines laufenden `ticket.sh create`), sieht `MAX(external_id)` die uncommittete Zeile nicht und
setzt die Sequenz **zurück** — der nächste `nextval()`-Aufruf vergibt dieselbe Nummer erneut.
Reproduziert und verifiziert gegen eine echte Postgres-16-Instanz (siehe Design-Spec).

## What

- `applyLegacyMigrations()`'s periodischer Sequenz-Reseed wird **monoton** gemacht: der
  neue Sequenzwert ist `GREATEST(MAX(external_id aus Tabelle), aktueller last_value der
  Sequenz)` statt eines bedingungslosen Overwrites auf `MAX(external_id)`. Die Sequenz kann
  dadurch nur noch vorwärts, nie rückwärts bewegt werden — ein bereits per `nextval()`
  vergebener (auch noch uncommitteter) Wert kann nicht erneut ausgegeben werden.
- Additiv/nicht-destruktiv: keine Schema-/Spalten-/Constraint-Änderung, keine neue
  Migrationsversion — nur die Reseed-Formel innerhalb der bereits idempotenten
  `applyLegacyMigrations()`-Anweisung ändert sich. Rückwärtskompatibel für alle bestehenden
  INSERT-Pfade (`scripts/ticket.sh create`, `ticket-mcp`, `pipeline.js`, u. a.).
- Regressionstest, der das monotone Verhalten der Reseed-Formel gegen ein absichtlich
  regressierendes Szenario (Sequenz bereits weiter fortgeschritten als der Tabellen-MAX)
  prüft.

## Impact

- `website/src/lib/tickets/migrations.ts` — Reseed-SQL in `applyLegacyMigrations()`
- `tests/unit/ticket-external-id-sequence.bats` — neue Regressionsassertion (monotoner
  Reseed via `GREATEST(`)
- Keine Datenbank-Schema-Änderungen, keine Breaking Changes für externe Consumers.
