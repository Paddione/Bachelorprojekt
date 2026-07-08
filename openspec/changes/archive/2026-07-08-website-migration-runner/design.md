## Context

`website/src/db/migrations/*.sql` ist ein flaches Verzeichnis mit ~30 datumspräfixierten
SQL-Dateien (`YYYYMMDD_*.sql`). Es gibt aktuell keinen Code, der sie liest und anwendet — anders
als `studio-server/src/db/migrate.ts`, `brett/src/server/db.ts` und `VideoVault/server/migrate.ts`,
die je einen eigenen `readdirSync`-Runner mit Tracking-Tabelle besitzen. Prod-DB
(`shared-db.workspace`, fleet) wich dadurch nachweislich von dem ab, was die Migrationsdateien
beschreiben (T001652).

## Goals / Non-Goals

**Goals:**
- Alle `website/src/db/migrations/*.sql`-Dateien deterministisch, idempotent und nachvollziehbar
  gegen eine Ziel-DB anwenden können.
- Den Migrationsschritt als festen, automatisierten Teil des Deploy-Ablaufs (`workspace:deploy`)
  verankern, statt manuellem `kubectl exec … psql`.
- Sicheres Erstlauf-Verhalten gegen eine DB, die bereits (unvollständig, manuell) migriert wurde.

**Non-Goals:**
- Kein Rollback-/Down-Migrations-Mechanismus (bestehende Migrationsdateien haben keine
  Down-Skripte; das einzuführen wäre ein eigener, größerer Change).
- Kein CI-Drift-Check/Dry-Run-Reporting (Follow-up, falls gewünscht).
- Kein automatischer Migrationslauf bei jedem Pod-Boot (vermeidet konkurrierende Läufe bei
  mehreren Replicas).

## Decisions

**Runner als eigenständiges TS-Modul (`website/src/db/migrate.ts`), nicht als API-Route.**
Konsistent mit dem bestehenden Muster in `studio-server`/`brett`/`VideoVault` im selben Repo.
Alternative (Migration über eine Astro-API-Route beim ersten Request) wurde verworfen, weil sie
Race Conditions bei Multi-Replica-Rollouts einführen würde und Migrationsfehler erst bei
Nutzeranfragen sichtbar würden statt beim Deploy.

**Tracking-Tabelle `schema_migrations(filename PK, applied_at)`, keine externe Lib
(z. B. node-pg-migrate).** Die drei existierenden Runner im Repo verwenden alle dasselbe
Handrolled-Muster ohne externe Migrations-Library — Konsistenz mit dem Repo-Stil wiegt schwerer
als Funktionsumfang einer Library, zumal kein Rollback benötigt wird.

**Backfill via Fehlerklassen-Erkennung statt manuellem Seed-Skript.** Da mehrere Migrationen in
Prod bereits real (aber ungetrackt) angewendet sind, wird beim Ausführen einer Datei ein
Postgres-Fehler mit SQLSTATE `42P07` (relation already exists), `42710` (object already exists)
o. ä. abgefangen, die Datei trotzdem als `applied` getrackt, und der Lauf fortgesetzt. Alternative
(einmaliges manuelles Backfill-Skript, das alle bereits vorhandenen Tabellen prüft und
`schema_migrations` vorab befüllt) wurde verworfen, weil es einen zusätzlichen manuellen Schritt
pro Umgebung erfordert hätte, statt dass der Runner selbst robust gegen diesen Zustand ist.

**Task-Einbindung vor dem website-Rollout, nicht als separater optionaler Schritt.** Der Bug
(T001652) entstand genau dadurch, dass der Migrationsschritt kein *fester* Teil des Deploy-Ablaufs
war. Ein optionaler `task website:migrate`, den man manuell aufrufen kann, existiert weiterhin für
Debugging/Erstlauf — aber `workspace:deploy` ruft ihn automatisch mit auf.

## Risks / Trade-offs

- **[Risk] Backfill-Fehlerklassen-Erkennung ist Postgres-fehlercode-spezifisch und könnte echte
  Fehler maskieren, wenn ein SQLSTATE-Code fälschlich als "already applied" interpretiert wird.**
  → Mitigation: nur eine eng gefasste Allowlist an SQLSTATE-Codes (42P07 relation exists, 42710
  object exists, 42701 column exists) wird als "already applied" behandelt; alle anderen Fehler
  brechen den Lauf mit vollem Fehlertext ab.
- **[Risk] Migrationslauf während des Deploys verlängert die Rollout-Zeit und ist ein neuer
  Fehlerpunkt, der den Deploy blockieren kann.** → Mitigation: Runner läuft mit kurzem Timeout pro
  Statement und bricht bei echten (nicht Allowlist-)Fehlern früh und mit klarer Fehlermeldung ab,
  bevor der website-Rollout startet — besser ein blockierter Deploy als eine DB, die erneut
  stillschweigend abweicht.
- **[Trade-off] Kein Rollback-Mechanismus.** Akzeptiert, weil bestehende Migrationen ohnehin keine
  Down-Skripte haben; Rollback bliebe weiterhin ein manueller DB-Restore wie bisher.

## Migration Plan

1. Bootstrap-Migration `20260708_create_schema_migrations.sql` hinzufügen.
2. Runner + Task lokal gegen eine Test-DB verifizieren (leere DB → alle Dateien laufen durch;
   DB mit Teilzustand wie Prod → Backfill-Pfad greift).
3. Gegen die Prod-DB (fleet/workspace, DB `website`) einmalig manuell mit `task website:migrate
   ENV=mentolder` ausführen, um den aktuellen Rückstand nachzuziehen (verifiziert per
   `schema_migrations`-Inhalt).
4. `workspace:deploy`-Einbindung mergen — ab dann läuft der Schritt automatisch bei jedem Deploy.

## Open Questions

- Keine offenen Fragen — Scope ist bewusst minimal gehalten (siehe Non-Goals).
