# DB-Audit-Playbook (shared-db, beide Brands)

Wiederverwendbares Vorgehen für strukturelle Datenbank-Audits (Orphan-Erkennung,
Index-Hygiene, Cross-Cluster-Drift). Destilliert aus dem ausgeführten Phase-5-Audit
(2026-05-23, Ergebnisse unter `docs/db-audit/2026-05-23-phase5/`) für künftige Läufe.
Vendor-Schemata (keycloak, nextcloud, vaultwarden, docuseal) sind für strukturelle
Änderungen IMMER out of scope.

## Detection-Module (alle read-only)

1. **Orphan-Erkennung** — Feature-Removal-Liste + `information_schema.tables` + Code-Grep.
   Orphan-Kandidat = Tabellenname passt zu entferntem Feature ODER null Code-Referenzen.
2. **Runtime-Statistiken** — `pg_stat_user_tables` / `pg_stat_user_indexes` snapshoten,
   `stats_reset` aus `pg_stat_database` festhalten (Interpretations-Gate, s.u.).
3. **Strukturelle Integrität** — fehlende FK-Indizes, TEXT-für-UUID, fehlende NOT NULL /
   FK-Constraints, redundante Indizes.
4. **Schema-Hygiene** — Tabellen in `public`, die in Domain-Schemata gehören; fehlende
   COMMENTs; Role-Grant-Matrix-Asymmetrien.
5. **Cross-Cluster-Drift** — Tabellen-/Spalten-/Constraint-/Index-Diff mentolder ↔
   korczewski. Das `arena`-Schema ist korczewski-only **by design** (erwarteter Drift).

## Tiering-Kriterien (Modul 2)

- **Cold table** (DROP-Kandidat, approval): `idx_scan == 0` AND `seq_scan <= 5`
  AND `n_live_tup > 0` AND `stats_reset` > 30 Tage alt.
- **Cold index** (non-PK, non-UNIQUE; autonom droppbar — per DDL reversibel):
  `idx_scan == 0` AND `stats_reset` > 30 Tage.
- **Empty table** (starker DROP-Kandidat): `n_live_tup == 0` AND `n_tup_ins == 0` > 30 Tage.
- **Hot table ohne Index** (autonomes CREATE INDEX): `seq_tup_read > 100k` ohne passenden Index.
- **Stats-Reset-Gate:** Ist `stats_reset` auf EINEM Cluster < 30 Tage alt, sind alle
  Modul-2-DROP-Vorschläge nur advisory — keine DROPs vorschlagen.

## Safety-Rails (nicht verhandelbar)

1. **Cluster-Kontext-Guard:** psql nur über `task workspace:psql ENV=<env>` — nie kubectl
   ohne explizites ENV-Mapping.
2. **Transaktional + idempotent:** Migrationen in `BEGIN; … COMMIT;` mit
   `IF EXISTS`/`IF NOT EXISTS`; Re-Run ist No-op.
3. **Backup vor DROP:** `task workspace:backup` pro Cluster VOR dessen DROP-Migration;
   Backup-Timestamp ins Decision-Log. Reihenfolge: backup-mentolder → drop-mentolder →
   verify-mentolder → backup-korczewski → drop-korczewski → verify-korczewski.
4. **Verifikation pro Migration:** `\d <objekt>`; bei DROPs bestätigt `SELECT count(*)`
   den Fehler 42P01; danach `task workspace:verify ENV=<env>`.
5. **Re-Grant nach Schema-Arbeit:** Nach `CREATE TABLE`/Schema-Änderung
   `task workspace:fix-tickets-grants ENV=<env>` (bzw. Generalisierung) laufen lassen.
6. **Beide Cluster oder keiner:** Schlägt eine Migration auf korczewski fehl, wird sie
   auf mentolder zurückgerollt oder sofort eskaliert — es gibt keinen
   „korczewski später"-Zustand.
7. **ER-Diagramm regenerieren:** `task db:diagram` am Ende; `docs/db-schema-diagram.md`
   im selben PR committen.
8. **Mishap-Tracker:** Jede Anomalie (Pod-Zustand, tote Grants, Drift) ins `MISHAP_LOG`,
   am Ende ticketen.
9. **Approval-Gate:** DROPs von Tabellen und alle App-Code-berührenden Änderungen
   (TEXT→UUID, Schema-Moves) nur mit expliziter Freigabe pro Item, festgehalten in
   einem `decision-log.md`.

## Bekannte offene Flanke

Migrationen liegen historisch in fünf Verzeichnissen (`scripts/migrations/`,
`scripts/datamodel/`, `scripts/one-shot/archive/`, `website/src/db/migrations/`,
`arena-server/src/db/migrations/`). Der getrackte Factory-Runner
(OpenSpec-Change `migrations-factory-runner`) konsolidiert davon nur
`scripts/migrations/` ↔ `website/src/db/migrations/` — `scripts/datamodel/` und
`scripts/one-shot/` bleiben unkonsolidiert und gehören in jedes künftige Audit.
