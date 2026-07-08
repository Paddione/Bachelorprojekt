## ADDED Requirements

### Requirement: Legacy coaching.ki_config Tables Dropped After Provider-Config Phase 2

Nach Abschluss der Datenmigration von `coaching.ki_config` in den vereinheitlichten Store
`tickets.provider_config` (`source='coaching'`) SHALL das System die Legacy-Tabellen
`coaching.ki_config` und `coaching.ki_config_id_map` in einer getaggten, idempotenten und
transaktionalen Migration löschen, aber erst nachdem eine Vorbedingungsprüfung bestätigt
hat, dass die Datenmigration vollständig ist. Die Spalte `coaching.sessions.ki_config_id`
und ihr Fremdschlüssel `sessions_ki_config_id_fkey` (der auf `tickets.provider_config`
zeigt) SHALL dabei unverändert bleiben, weil laufende Coaching-Sessions weiterhin über diese
Spalte auf ihre aktive Provider-Konfiguration verweisen.

#### Scenario: Drop-Migration entfernt beide Legacy-Tabellen

- **GIVEN** die Daten aus `coaching.ki_config` sind vollständig nach `tickets.provider_config` (`source='coaching'`) migriert und kein Laufzeit-Code liest oder schreibt die Legacy-Tabellen
- **WHEN** die Migration `scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql` gegen eine Brand-DB ausgeführt wird
- **THEN** existieren `coaching.ki_config` und `coaching.ki_config_id_map` danach nicht mehr (`to_regclass(...) IS NULL`), während `coaching.sessions.ki_config_id` und der FK `sessions_ki_config_id_fkey` unverändert vorhanden sind

#### Scenario: Vorbedingungs-Guard bricht ab, wenn die Migration nicht abgeschlossen ist

- **GIVEN** der FK `sessions_ki_config_id_fkey` zeigt nicht auf `tickets.provider_config` ODER mindestens eine `coaching.sessions.ki_config_id` verweist auf eine id, die nicht in `tickets.provider_config` existiert
- **WHEN** die Drop-Migration ausgeführt wird
- **THEN** bricht die Transaktion mit `RAISE EXCEPTION` ab, bevor irgendein `DROP TABLE` ausgeführt wird, und beide Legacy-Tabellen bleiben erhalten

#### Scenario: Migration ist idempotent und wird auf beide Brand-Namespaces angewendet

- **GIVEN** der fleet-Cluster betreibt `shared-db` in `workspace` (mentolder) und `workspace-korczewski` (korczewski)
- **WHEN** die Drop-Migration nach dem Merge gegen beide Brand-DBs ausgeführt und danach erneut ausgeführt wird
- **THEN** ist beide Male der Endzustand identisch (Tabellen fehlen), ohne Fehler beim zweiten Lauf (`DROP TABLE IF EXISTS`), und beide Brands weisen dasselbe Schema auf

### Requirement: Orphaned category Migration Removed

Das System SHALL keine verwaiste, nie angewendete Migration im Repository behalten. Die
Datei `scripts/migration/005-add-category-to-tickets.sql` (im Singular-Verzeichnis
`scripts/migration/`) SHALL gelöscht werden, weil die Spalte `tickets.tickets.category`
nicht in der Datenbank existiert, das zugehörige Feature nie live ging und kein
Laufzeit-Code die Spalte referenziert.

#### Scenario: Verwaiste Migrationsdatei ist entfernt

- **GIVEN** `scripts/migration/005-add-category-to-tickets.sql` wurde nie angewendet und `tickets.tickets.category` existiert in keiner Brand-DB
- **WHEN** das Repository nach der Bereinigung geprüft wird
- **THEN** existiert die Datei nicht mehr und keine `.ts`/`.js`-Laufzeitdatei referenziert eine `tickets.category`-Spalte

#### Scenario: Applied-Status wird cross-brand verifiziert

- **GIVEN** die `scripts/migrations/*.sql` werden manuell und ungetrackt pro Brand-DB angewendet
- **WHEN** der Applied-Status vor dem Cleanup geprüft wird
- **THEN** wird jede Migration explizit gegen beide Brand-DBs (`workspace` und `workspace-korczewski`) auf Existenz ihres Zielobjekts abgefragt und das Ergebnis dokumentiert, sodass Lücken zwischen den Brands sichtbar werden

### Requirement: Website DB Access Uses Shared Hardened Pool

Website-Module, die dieselbe `website`-Datenbank mit derselben Konfiguration wie der
kanonische Pool ansprechen, SHALL den gehärteten geteilten Pool aus
`website/src/lib/db-pool.ts` verwenden (mit `nodeLookup`-DNS-Workaround und fail-soft
Connection-/Statement-Timeouts), statt einen eigenen `new Pool(...)` zu erzeugen. Module,
die bewusst eine andere Datenbank, andere Umgebungsvariable oder abweichende
Timeout-Anforderungen haben (z. B. Bulk-Import ohne engen `statement_timeout`), SHALL als
dokumentierter Sonder-Pool bestehen bleiben und dürfen NICHT naiv zusammengelegt werden.

#### Scenario: Gleiche DB/Config wird auf den geteilten Pool umgestellt

- **GIVEN** ein Modul erzeugt einen eigenen `pg.Pool` über `SESSIONS_DATABASE_URL` mit derselben Ziel-DB wie `website/src/lib/db-pool.ts`
- **WHEN** die Pool-Konsolidierung angewendet wird
- **THEN** importiert das Modul `pool` aus `db-pool.ts`, erzeugt keinen eigenen Pool mehr und profitiert von DNS-Workaround und fail-soft Timeouts

#### Scenario: Abweichende DB/Config bleibt als dokumentierter Sonder-Pool

- **GIVEN** ein Modul nutzt eine andere Umgebungsvariable (z. B. `DATABASE_URL` statt `SESSIONS_DATABASE_URL`) oder benötigt einen längeren `statement_timeout` (Bulk-Import)
- **WHEN** die Pool-Konsolidierung geprüft wird
- **THEN** wird das Modul nicht auf den geteilten Pool umgestellt, und die Begründung (abweichende DB oder abweichende Timeout-Anforderung) wird in der DB-Audit-Notiz festgehalten

### Requirement: Index and Query Audit Is EXPLAIN-Driven and Non-Destructive

Optimierungsentscheidungen an der Datenbank SHALL evidenzbasiert getroffen werden. Ein Index
SHALL nur hinzugefügt werden, wenn `EXPLAIN (ANALYZE, BUFFERS)` auf der real ausgeführten
Query einen messbaren Gewinn zeigt; auf Kleintabellen (wenige hundert Zeilen) SHALL kein
Index mechanisch hinzugefügt werden, weil Postgres dort korrekt Seq-Scan wählt. Ungenutzte
Indizes (`idx_scan=0`) SHALL nur als Empfehlungsliste erfasst und NICHT blind gedroppt
werden, weil die Statistik-Momentaufnahme aus nur einer DB stammt; ein Drop erfolgt erst nach
Gegencheck der Prod-Statistik beider Brands.

#### Scenario: Kein Index auf Kleintabelle ohne EXPLAIN-Beleg

- **GIVEN** eine Tabelle mit nur wenigen hundert Zeilen zeigt in `pg_stat` einen Seq-Scan
- **WHEN** ein Index in Erwägung gezogen wird
- **THEN** wird `EXPLAIN (ANALYZE, BUFFERS)` auf die reale Query gefahren, und ein Index wird nur angelegt, wenn der Plan messbar günstiger wird; andernfalls wird die Nicht-Änderung mit dem EXPLAIN-Auszug begründet

#### Scenario: Ungenutzte Indizes werden nur empfohlen, nicht gedroppt

- **GIVEN** mehrere Indizes zeigen `idx_scan=0` in einer einzelnen DB-Momentaufnahme
- **WHEN** das Index-Audit durchgeführt wird
- **THEN** entsteht eine Empfehlungsliste in der DB-Audit-Notiz, und es wird in dieser Änderung kein `DROP INDEX` ausgeführt
