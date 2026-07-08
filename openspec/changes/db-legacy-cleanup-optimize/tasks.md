---
title: "db-legacy-cleanup-optimize — Implementation Plan"
ticket_id: T001676
domains: [database, website]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# db-legacy-cleanup-optimize — Implementation Plan

_Ticket: T001676 · Delta-Target-Spec: `database` (SSOT `openspec/specs/database.md`)_

Staged in three tiers (A → offene Migration abschließen, B → Rückwärtskompatibilität
entfernen, C → breiter DB-Audit), plus ein Follow-up-Task und ein RED→GREEN-Test-Task.
Die Datenmigration `coaching.ki_config → tickets.provider_config (source='coaching')` ist
laut Faktenbasis bereits vollständig (9/9 Configs gemappt, 0 Sessions mit Alt-IDs, kein
Laufzeit-Leser der Alt-Tabellen). Dieser Plan schließt die bewusst aufgeschobene „Phase 2"
ab und härtet die DB-Zugriffsschicht.

## File Structure

```
scripts/migration/005-add-category-to-tickets.sql                     [DELETE  — orphaned, never applied]
scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql         [CREATE  — idempotent+transactional guarded drop]
website/src/lib/schema/coaching-migrate.ts                            [DELETE  — dead TS mirror, 80 LOC]
website/src/lib/schema/coaching-migrate.test.ts                       [DELETE  — only caller of the dead mirror, 79 LOC]
website/src/lib/coaching-ki-config-db.ts                              [EDIT    — refresh stale legacy comment (~line 7)]
website/src/lib/codesearch-db.ts                                      [EDIT    — Stufe C: consolidate onto shared pool (candidate)]
website/src/lib/knowledge-db.ts                                       [EDIT    — Stufe C: consolidate onto shared pool (candidate)]
website/src/pages/api/cron/notify-unread.ts                           [EDIT    — Stufe C: consolidate onto shared pool (candidate)]
website/src/lib/ai-metrics.ts                                         [AUDIT   — Stufe C: DATABASE_URL differs; verify before touching]
website/src/pages/api/admin/ai-quality.ts                             [AUDIT   — Stufe C: DATABASE_URL differs; verify before touching]
website/src/pages/api/admin/knowledge/import/json.ts                  [AUDIT   — Stufe C: bulk import vs 2s statement_timeout; likely KEEP]
docs/db-audit/2026-07-09-index-and-nplus1-audit.md                    [CREATE  — Stufe C EXPLAIN/index/N+1/unused-index findings]
tests/spec/database.bats                                              [CREATE  — RED→GREEN Phase-2 drop assertions]
website/src/data/test-inventory.json                                 [REGEN   — after tests/spec change]
```

### S1-Zeilenbudget (wirksame Schwelle = Baseline, sonst statisches Limit)

Alle betroffenen TS-Dateien sind **nicht-baselined** → wirksame Schwelle ist das statische
`.ts`-Limit (600). Ist-Werte (`wc -l`) und Restbudget (Schwelle − Ist):

| Datei | Ist | Budget |
|---|---|---|
| `website/src/lib/coaching-ki-config-db.ts` | 215 | 385 |
| `website/src/lib/codesearch-db.ts` | 104 | 496 |
| `website/src/lib/knowledge-db.ts` | 472 | 128 |
| `website/src/pages/api/cron/notify-unread.ts` | 129 | 471 |
| `website/src/lib/ai-metrics.ts` | 71 | 529 |
| `website/src/pages/api/admin/ai-quality.ts` | 125 | 475 |
| `website/src/pages/api/admin/knowledge/import/json.ts` | 80 | 520 |

Erwartete Richtung: `coaching-ki-config-db.ts` netto ~0 (nur Kommentar); die drei
konsolidierten Pool-Callsites (`codesearch-db.ts`, `knowledge-db.ts`, `notify-unread.ts`)
schrumpfen (Pool-Boilerplate entfällt); die DATABASE_URL-/Bulk-Callsites nur bei Audit-
Freigabe geändert. Alle Budgets komfortabel positiv, kein Split nötig.

Deletions (`coaching-migrate.ts`/`.test.ts`) und die neue SQL-Datei sind für S1 irrelevant
(SQL ist kein S1-Extension; Deletions senken Metriken). Die neue Markdown-Audit-Datei ist
für S1 irrelevant. Kein Split nötig — keine Datei nähert sich 80 % ihrer Schwelle.

<!-- vitest: kein neuer Vitest-Test nötig — Stufe B löscht toten Code (mitsamt seinem
einzigen Test); Stufe C ist Pool-Rewiring ohne neue Logik/Signaturen. Die Verhaltensprüfung
der Phase-2-Drop-Migration erfolgt über den BATS-DB-Test in tests/spec/database.bats. -->

### CQ02 (any-Typen) Baseline

```bash
grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

Dieser Plan darf die Zählung nicht erhöhen. Die Pool-Umstellung ersetzt `new Pool(...)`
durch den bereits typisierten `pool`-Export aus `db-pool.ts` — keine neuen `any`. Die
`as unknown as import('pg').PoolConfig`-Casts in den Callsites entfallen bei Konsolidierung
(Reduktion, keine Erhöhung).

---

## Stufe A — Offene Migration abschließen

### Task A1 — Verwaiste `category`-Migration löschen

- [ ] `git rm scripts/migration/005-add-category-to-tickets.sql` (Singular-Verzeichnis
      `scripts/migration/`, nicht `scripts/migrations/`).
- [ ] Bestätigen, dass `tickets.tickets.category` nirgends im Code referenziert wird und
      das Feature nie live ging.

**Acceptance:**

```bash
# Datei ist weg
test ! -e scripts/migration/005-add-category-to-tickets.sql && echo "deleted OK"

# Keine Code-Nutzung einer tickets.category-Spalte (Treffer nur in Migrations-/Doku-Historie,
# nicht in Laufzeit-TS/JS). Erwartung: 0 Treffer in website/src und scripts/factory.
grep -rniE "tickets\.category|\.category\b" website/src scripts/factory --include='*.ts' \
  --include='*.js' --include='*.cjs' --include='*.mjs' | grep -vi 'test' || echo "no runtime usage"
```

### Task A2 — Cross-Brand Applied-Status aller `scripts/migrations/*.sql` verifizieren

Die korczewski-Brand-DB wurde in der Planungs-Session NICHT verifiziert (nur eine
mcp-postgres-Verbindung, siehe `intel.json` risks). Dieser Task MUSS **beide** Brand-DBs
explizit abfragen: `workspace` (mentolder) UND `workspace-korczewski` (korczewski).

- [ ] Für jede Datei in `scripts/migrations/*.sql` das erwartete Zielobjekt (Tabelle/Spalte/
      View/Seed-Row) bestimmen und dessen Existenz gegen beide Brand-DBs prüfen.
- [ ] Ergebnis-Tabelle (Datei × Brand × applied?) in
      `docs/db-audit/2026-07-09-index-and-nplus1-audit.md` (Abschnitt „Applied-Status") festhalten.
- [ ] Falls Lücken (in einer Brand angewendet, in der anderen nicht) → in derselben Datei als
      Nachzieh-Empfehlung dokumentieren und die fehlende Datei per `factory_psql` gegen die
      betroffene Brand-DB nachziehen.

**Acceptance:** pro Brand eine Existenzabfrage je Migration; Beispiel-Sondierung für die
zwei neuesten Migrationen:

```bash
for BRAND in mentolder korczewski; do
  echo "== brand: $BRAND =="
  BRAND=$BRAND bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql <<SQL
SELECT to_regclass('"'"'coaching.ki_config'"'"')                          AS ki_config_present,
       to_regclass('"'"'tickets.provider_config'"'"')                     AS provider_config_present,
       EXISTS(SELECT 1 FROM information_schema.columns
              WHERE table_schema='"'"'coaching'"'"' AND table_name='"'"'sessions'"'"'
                AND column_name='"'"'ki_config_id'"'"')                    AS sessions_col_present;
SQL'
done
```

**Guardrail:** dieser Task ist rein lesend/dokumentierend — kein DROP, kein ALTER hier.

---

## Stufe B — Rückwärtskompatibilität entfernen (Phase 2)

### Task B1 — Getaggte Drop-Migration schreiben (idempotent + transaktional + Guard)

- [ ] Neue Datei `scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql` anlegen.
- [ ] Header-Kommentar analog zu `scripts/migrations/2026-06-14-coaching-data-migrate.sql`:
      Zweck, Reihenfolge (NACH `2026-06-14-coaching-data-migrate.sql`), Cross-Brand-Anwendungs-
      befehl für **beide** Brands, Idempotenz-Hinweis.
- [ ] Vorbedingungs-Guard in einem `DO`-Block, der die Transaktion abbricht (`RAISE EXCEPTION`),
      BEVOR gedroppt wird, wenn: (a) der FK `coaching.sessions.ki_config_id_fkey` NICHT auf
      `tickets.provider_config` zeigt, oder (b) ≥1 `coaching.sessions.ki_config_id` auf eine id
      verweist, die NICHT in `tickets.provider_config` existiert.
- [ ] Danach `DROP TABLE IF EXISTS coaching.ki_config_id_map;` und
      `DROP TABLE IF EXISTS coaching.ki_config;` (Reihenfolge: erst die Map, dann die Basistabelle —
      die Map referenziert konzeptuell die alten IDs).

Referenz-Snippet (der Autor implementiert exakt diese Semantik; die BATS-Assertions in
Task T1 sind gegen dieses Snippet konsistent):

```sql
-- 2026-07-09-coaching-phase2-drop-legacy.sql
-- CLEANUP-Migration (Phase 2): Drop der Legacy-Coaching-Provider-Tabellen.
-- Reihenfolge: NACH 2026-06-14-coaching-data-migrate.sql (Datenmigration abgeschlossen).
-- Auf BEIDE Brand-DBs anwenden (workspace UND workspace-korczewski):
--   BRAND=mentolder   bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql'
--   BRAND=korczewski  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql < scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql'
-- Idempotent (DROP ... IF EXISTS) und transaktional (BEGIN/COMMIT mit ON_ERROR_STOP).
-- NICHT betroffen: coaching.sessions.ki_config_id + FK sessions_ki_config_id_fkey.
\set ON_ERROR_STOP on
BEGIN;

DO $$
DECLARE
  fk_target regclass;
  orphan_count bigint;
BEGIN
  -- Guard (a): FK muss bereits auf tickets.provider_config zeigen.
  SELECT confrelid::regclass INTO fk_target
  FROM pg_constraint
  WHERE conname = 'sessions_ki_config_id_fkey'
    AND connamespace = 'coaching'::regnamespace;

  IF fk_target IS DISTINCT FROM 'tickets.provider_config'::regclass THEN
    RAISE EXCEPTION
      'Phase-2 abort: sessions_ki_config_id_fkey zeigt auf %, erwartet tickets.provider_config',
      fk_target;
  END IF;

  -- Guard (b): keine Session darf eine id referenzieren, die nicht im neuen Store existiert.
  SELECT count(*) INTO orphan_count
  FROM coaching.sessions s
  WHERE s.ki_config_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM tickets.provider_config p WHERE p.id = s.ki_config_id
    );

  IF orphan_count > 0 THEN
    RAISE EXCEPTION
      'Phase-2 abort: % Sessions referenzieren eine config-id ohne Eintrag in tickets.provider_config',
      orphan_count;
  END IF;
END $$;

DROP TABLE IF EXISTS coaching.ki_config_id_map;
DROP TABLE IF EXISTS coaching.ki_config;

COMMIT;
```

**GUARDRAIL (verbatim als Acceptance):** `coaching.sessions.ki_config_id` und der FK
`sessions_ki_config_id_fkey` dürfen NICHT gedroppt oder geändert werden. Das Migrations-SQL
enthält kein `ALTER TABLE coaching.sessions` und kein `DROP CONSTRAINT sessions_ki_config_id_fkey`.

**Acceptance:**

```bash
# Guard vorhanden, Zieltabellen werden gedroppt, sessions-Spalte/FK werden NICHT angefasst
grep -q "sessions_ki_config_id_fkey" scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql
grep -q "DROP TABLE IF EXISTS coaching.ki_config_id_map"  scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql
grep -q "DROP TABLE IF EXISTS coaching.ki_config"         scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql
! grep -qiE "ALTER TABLE +coaching\.sessions|DROP CONSTRAINT +sessions_ki_config_id_fkey" \
  scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql && echo "sessions untouched OK"
```

### Task B2 — Toten TS-Migrations-Spiegel löschen

- [ ] `git rm website/src/lib/schema/coaching-migrate.ts` (Funktion `migrateCoachingKiConfig`,
      laut intel.json nur vom eigenen Test aufgerufen).
- [ ] `git rm website/src/lib/schema/coaching-migrate.test.ts`.
- [ ] Bestätigen, dass es außerhalb dieser beiden Dateien keinen Importeur gibt.

**Acceptance:**

```bash
test ! -e website/src/lib/schema/coaching-migrate.ts
test ! -e website/src/lib/schema/coaching-migrate.test.ts
# kein verbliebener Import des gelöschten Moduls
grep -rn "coaching-migrate\|migrateCoachingKiConfig" website/src && echo "STILL REFERENCED — abort" || echo "no references OK"
```

### Task B3 — Veralteten Kommentar in `coaching-ki-config-db.ts` bereinigen

- [ ] Kommentarblock um Zeile 7 (`… coaching.ki_config wird nicht mehr gelesen/geschrieben.`)
      so aktualisieren, dass er nicht mehr auf die (nach Stufe B nicht mehr existierenden)
      Tabellen `coaching.ki_config` / `coaching.ki_config_id_map` als vorhandene Objekte
      verweist. Der Adapter selbst (Queries gegen `tickets.provider_config`) bleibt unverändert.

**Acceptance:**

```bash
# Datei erwähnt die gedroppten Tabellen nicht mehr als existierende Legacy-Objekte
grep -n "ki_config" website/src/lib/coaching-ki-config-db.ts   # nur noch ki_config_id-Bezüge / historischer Verweis auf Fusion
# Adapter unverändert: weiterhin gegen den neuen Store
grep -q "provider_config" website/src/lib/coaching-ki-config-db.ts && echo "adapter intact OK"
```

---

## Stufe C — Breiter DB-Audit + Optimierung

### Task C1 — Pool-Konsolidierung, pro Aufrufer begründet

Kanonischer geteilter Pool: `website/src/lib/db-pool.ts` → `export const pool` (gehärtet:
`nodeLookup`-DNS-Workaround, `connectionTimeoutMillis`/`idleTimeoutMillis`/`statement_timeout`).
Er nutzt `SESSIONS_DATABASE_URL` (Fallback auf die `website`-DB). **Jeder** Aufrufer aus
`intel.json → pool_proliferation_callsites` wird als eigener Sub-Schritt geprüft; nur bei
identischer DB/Config konsolidieren, sonst dokumentiert belassen.

- [ ] **`website/src/lib/codesearch-db.ts`** — nutzt `SESSIONS_DATABASE_URL` + eigenes
      `nodeLookup`. Gleiche DB/Config wie der geteilte Pool → **konsolidieren**: eigenen
      `new Pool(...)` durch `import { pool } from './db-pool'` ersetzen; lokalen `nodeLookup`
      und die `PoolConfig`-Casts entfernen. Prüfen, dass die Embedding-Queries innerhalb des
      2s-`statement_timeout` bleiben (reine SELECT/INSERT auf indizierte Spalten → ja).
- [ ] **`website/src/lib/knowledge-db.ts`** — nutzt `SESSIONS_DATABASE_URL` + `nodeLookup`.
      Gleiche DB/Config → **konsolidieren**. ABER: falls eine Ingest-/Bulk-Query > 2s laufen
      kann, diesen einzelnen Aufruf messen (EXPLAIN/timing); überschreitet er das Statement-
      Timeout, den betroffenen Aufruf explizit mit `SET LOCAL statement_timeout` in einer
      Transaktion überschreiben statt den geteilten Pool aufzuweichen. Entscheidung in der
      Audit-Datei begründen.
- [ ] **`website/src/pages/api/cron/notify-unread.ts`** — nutzt `SESSIONS_DATABASE_URL`,
      OHNE `nodeLookup`/Timeouts. Gleiche DB → **konsolidieren** (gewinnt DNS-Workaround +
      fail-soft Timeouts). Cron-Query ist ein einzelnes Read + Mail-Versand → 2s ausreichend.
- [ ] **`website/src/lib/ai-metrics.ts`** — nutzt `DATABASE_URL` (nicht `SESSIONS_DATABASE_URL`).
      Abweichende Env-Var → potenziell andere DB/Config. **Vor jeder Änderung** verifizieren, ob
      `DATABASE_URL` in Prod (beide Brands) auf dieselbe `website`-DB auflöst wie
      `SESSIONS_DATABASE_URL`. Nur bei nachgewiesener Gleichheit konsolidieren; sonst als
      bewussten Sonder-Pool in der Audit-Datei dokumentieren und unverändert lassen.
- [ ] **`website/src/pages/api/admin/ai-quality.ts`** — nutzt ebenfalls `DATABASE_URL`;
      dieselbe Verifikation wie ai-metrics.ts. Teilt zudem den `AiWorkflow`-Typ mit ai-metrics —
      Konsolidierung beider gemeinsam oder gar nicht, konsistent zur ai-metrics-Entscheidung.
- [ ] **`website/src/pages/api/admin/knowledge/import/json.ts`** — nutzt `SESSIONS_DATABASE_URL`,
      ist aber ein **Bulk-Import** (`ingestJsonChunks`). Der 2s-`statement_timeout` des geteilten
      Pools würde große Importe abbrechen → **wahrscheinlich KEEP** als bewusster Sonder-Pool.
      Entscheidung (KEEP + Grund, oder konsolidieren mit per-Statement-Timeout-Override) in der
      Audit-Datei festhalten.

**Acceptance:**

```bash
# Konsolidierte Module importieren den geteilten Pool und erzeugen keinen eigenen mehr
for f in website/src/lib/codesearch-db.ts website/src/lib/knowledge-db.ts \
         website/src/pages/api/cron/notify-unread.ts; do
  grep -q "db-pool" "$f" && echo "$f -> shared pool" || echo "$f -> DECISION documented in audit"
done
# Jede NICHT konsolidierte Callsite hat eine Begründung in der Audit-Datei
grep -qi "ai-metrics\|ai-quality\|knowledge/import" docs/db-audit/2026-07-09-index-and-nplus1-audit.md \
  && echo "special-pool rationale documented OK"
```

### Task C2 — EXPLAIN-getriebenes Index-Audit (nicht mechanisch)

- [ ] Für die vermeintlichen Seq-Scan-„Hotspots" aus intel.json (`questionnaire_assignments`
      703 Zeilen, `factory_phase_events` 953, `ticket_links` 96) `EXPLAIN (ANALYZE, BUFFERS)`
      auf die real ausgeführten Queries fahren. Kleintabellen-Anti-Pattern beachten: bei
      wenigen hundert Zeilen wählt Postgres korrekt Seq-Scan; ein Index bringt hier meist nichts.
- [ ] Index NUR hinzufügen, wenn EXPLAIN einen messbaren Gewinn zeigt (Planwechsel + niedrigere
      tatsächliche Kosten/Buffers). Jeden Befund — auch jede **Nicht-Änderung** — in
      `docs/db-audit/2026-07-09-index-and-nplus1-audit.md` mit dem EXPLAIN-Auszug begründen.

**Acceptance:** Audit-Datei enthält je Hotspot einen EXPLAIN-Auszug + Entscheidung
(Index angelegt / bewusst nicht). Kein Index-`CREATE` ohne zugehörigen EXPLAIN-Beleg.

### Task C3 — Ungenutzte Indizes: nur Empfehlungsliste (kein blinder Drop)

- [ ] `idx_scan=0`-Indizes über `pg_stat_user_indexes` gegen **beide** Brand-DBs abfragen
      (die Momentaufnahme aus der Planung stammt aus nur einer DB seit letztem Stat-Reset).
- [ ] Ergebnis als **Empfehlungsliste** in die Audit-Datei schreiben. KEIN `DROP INDEX` in
      diesem Plan — Drop erst nach Prod-Statistik-Gegencheck beider Brands (separater Vorgang).

**Acceptance:**

```bash
# Audit-Datei hat einen Abschnitt "Ungenutzte Indizes (Empfehlung, kein Drop)"
grep -qi "Ungenutzte Indizes" docs/db-audit/2026-07-09-index-and-nplus1-audit.md
# und dieser Plan führt keinen Index-Drop aus
! grep -rniE "DROP +INDEX" scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql \
  && echo "no blind index drop OK"
```

### Task C4 — N+1-Audit (Stichprobe) + VACUUM/ANALYZE-Hygiene

- [ ] Website-DAL-Module (`website/src/lib/*-db.ts`) stichprobenartig auf Query-in-Loop
      (`await …query` innerhalb `for`/`map`/`Promise.all` über Einzel-IDs) prüfen. Konkrete
      Funde entweder in dieser PR beheben (Batch-Query / `= ANY($1)`) oder als Follow-up in der
      Audit-Datei dokumentieren.
- [ ] `VACUUM (ANALYZE)` / `ANALYZE`-Hygiene-Empfehlung für die nach dem Drop veränderten
      Kataloge und die größeren Tabellen als Ops-Notiz in die Audit-Datei aufnehmen.
- [ ] Den SSOT-`ticket_plans`-Content-Guard respektieren: keine neue Query, die
      `ticket_plans.content` ohne Row-Filter selektiert (database.md-Requirement).

**Acceptance:** Audit-Datei enthält die Abschnitte „N+1-Stichprobe" und „VACUUM/ANALYZE-Hygiene";
kein neuer `SELECT … content … FROM ticket_plans` ohne `WHERE`.

---

## Follow-up (nicht in diesem Plan umsetzen)

### Task FU1 — Folge-Ticket „Migrations-System-Konsolidierung" anlegen

Die Konsolidierung der zwei divergenten Migrationssysteme (`scripts/migrations/*.sql`
manuell/ungetrackt unter einen getrackten Runner analog `website/src/db/migrate.ts` mit
`public.schema_migrations`-Tracking bringen) ist per User-Entscheid **OUT OF SCOPE** dieses
Plans und darf hier NICHT umgesetzt werden.

- [ ] Separates Ticket anlegen und in der Audit-Datei verlinken:

```bash
bash scripts/ticket.sh create --type task \
  --title "Migrations-System-Konsolidierung: scripts/migrations/ unter getrackten Runner"
```

**Acceptance:** neues Ticket existiert; seine ID ist in
`docs/db-audit/2026-07-09-index-and-nplus1-audit.md` vermerkt. In diesem Branch wird KEIN
Runner-/Tracking-Code geändert.

---

## Test — RED → GREEN (Phase-2-Drop)

### Task T1 — BATS-Test in `tests/spec/database.bats`

`tests/spec/database.bats` existiert noch nicht → neu anlegen (Vorlage:
`tests/spec/software-factory.bats` — `_skip_if_no_db` + `kubectl exec … psql`-Muster).
SSOT-Kommentar `# SSOT: openspec/specs/database.md`. Offline/CI ohne Cluster: `_skip_if_no_db`
überspringt die DB-Tests.

Der Test prüft nach der Drop-Migration: (1) `coaching.ki_config` existiert NICHT mehr,
(2) `coaching.ki_config_id_map` existiert NICHT mehr, (3) `coaching.sessions.ki_config_id`
(Spalte) existiert WEITERHIN, (4) FK `sessions_ki_config_id_fkey` existiert WEITERHIN. Diese
Assertions sind konsistent mit dem Migrations-Snippet aus Task B1 (droppt genau die zwei
Tabellen, fasst Spalte + FK nie an).

- [ ] **Failing-Test-Step (RED).** Test hinzufügen und gegen eine DB laufen lassen, auf der
      die Legacy-Tabellen noch existieren (Migration noch nicht angewendet). Die „Tabelle weg"-
      Assertions schlagen dann fehl.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/database.bats
# expected: FAIL  (rot — coaching.ki_config/-_id_map existieren noch, Drop noch nicht angewendet)
```

- [ ] **Fix-Step (GREEN).** Drop-Migration aus Task B1 gegen die DB anwenden
      (`factory_psql < scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql`), Test
      erneut laufen lassen → alle vier Assertions grün (Tabellen weg, Spalte + FK erhalten).

Assertion-Referenz (die vier `@test`-Kerne):

```bash
# (1)+(2) Legacy-Tabellen weg
run psql_db "SELECT to_regclass('coaching.ki_config') IS NULL AND to_regclass('coaching.ki_config_id_map') IS NULL"
# erwartet: t
# (3) sessions-Spalte erhalten
run psql_db "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='coaching' AND table_name='sessions' AND column_name='ki_config_id')"
# erwartet: t
# (4) FK erhalten
run psql_db "SELECT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='sessions_ki_config_id_fkey' AND connamespace='coaching'::regnamespace)"
# erwartet: t
```

- [ ] **Test-Inventar regenerieren.** Nach der Test-Änderung:

```bash
task test:inventory
```

Committe `website/src/data/test-inventory.json` zusammen mit `tests/spec/database.bats`
(CI-Inventar-Check failt sonst).

---

## Final — Verifikation (Pflicht-Gates)

### Task V1 — Mandatory CI-Gates

- [ ] `task workspace:validate` (Manifeste unverändert, aber Sicherheits-Check der Repo-Struktur).
- [ ] Delta-Spec validieren: `task test:openspec` (bzw. `bash scripts/openspec.sh validate`).
- [ ] Die drei Pflicht-Verify-Commands:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
