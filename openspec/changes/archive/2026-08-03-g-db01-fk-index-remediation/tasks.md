---
title: "g-db01-fk-index-remediation — Implementation Plan"
ticket_id: T001946
domains: [database]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# g-db01-fk-index-remediation — Implementation Plan

_Ticket: T001946_

> **For agentic workers:** Use `superpowers:subagent-driven-development` or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking. Implement tasks in order; each ends
> with an independently testable deliverable.

**Goal:** G-DB01 ("FK-Spalten ohne Index") faelschlich als "gefixt" markiert
(T001905, Baseline 4) neu beheben mit dem tatsaechlichen Live-Befund (34
mentolder / 49 korczewski fehlende Single-Column-FK-Indizes, gemessen
2026-07-19) — inklusive der vier T001905-Spalten, die trotz als "applied"
getrackter `schema_migrations`-Zeile auf der mentolder-DB weiterhin
unindiziert waren.

**Architecture:** Rein additive PostgreSQL-Migration nach dem bestehenden
Muster aus `website/src/db/migrations/20260717_add_missing_fk_indexes.sql`
(`to_regclass(...)`-Existenz-Guard + `CREATE INDEX IF NOT EXISTS`), angewendet
via `website/src/db/migrate.ts` (laeuft bei `task workspace:deploy` /
`pnpm --dir website db:migrate` fuer jede Brand-DB separat). Keine
Verhaltensaenderung, keine Schema-Aenderung außer neuen Indizes.

**Tech Stack:** PostgreSQL 16, BATS, `website/src/db/migrate.ts` (Node/pg).

## Global Constraints

- Additive-only: keine `DROP`, keine `ALTER COLUMN`, keine Datenaenderung.
- Jede `CREATE INDEX`-Anweisung MUSS in einem `IF to_regclass('<schema.table>')
  IS NOT NULL THEN ... END IF;`-Block stehen (brand-uebergreifende Sicherheit —
  `studio.*`/`sessions.*` existieren nur bei mentolder, `bugs.*` nur bei
  korczewski).
- `arena.match_players.brand` bewusst NICHT indizieren — das Schema `arena`
  gehoert der DB-Rolle `arena_app`, nicht `website`; ein Dry-Run
  (`BEGIN; ... ROLLBACK;`) waehrend der Planung ergab
  `ERROR: must be owner of table match_players`. Diese eine Spalte bleibt als
  dokumentierter Restwert im goals.md-Eintrag (bereits in dieser Planungsphase
  aktualisiert) — kein Blocker fuer dieses Ticket.
- Kein Live-DB-Test in CI (siehe `tests/spec/database.bats`, dort bereits wegen
  "live cluster migration mismatch" geskippt) — Testabdeckung ist statisch
  (Datei-Existenz + erwartete `CREATE INDEX`-Statements per `grep`), analog zum
  bestehenden Muster in `tests/spec/db-quality-goals.bats`.

## File Structure

| File | Status | S1 budget |
|------|--------|-----------|
| `tests/spec/db-quality-goals.bats` | bereits erweitert (RED-Test, dieser Plan-Stage-Commit) — nicht-baselined | kein Limit |
| `website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql` | NEU — von Task 1 zu erstellen | kein Limit (neue Migrationsdatei, keine God-File-Gefahr) |
| `.claude/lib/goals.md` | bereits korrigiert (Plan-Stage-Commit, reine Doku) — nicht-baselined | kein Limit |

---

### Task 1: Migration erstellen (GREEN) und lokal validieren

**Files:**
- Create: `website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql`

**Interfaces:**
- Konsumiert von: `website/src/db/migrate.ts::runMigrations()` — liest jede
  `*.sql`-Datei aus `website/src/db/migrations/` alphabetisch sortiert, fuehrt
  sie in einer Transaktion aus (`BEGIN; <sql>; INSERT INTO schema_migrations
  (filename) VALUES ($1); COMMIT;`), trackt den Dateinamen in
  `schema_migrations`.

- [ ] **Step 1: Vorpruefung — Test ist bereits RED (siehe Stage-Commit dieses Plans).**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-quality-goals.bats
# expected: FAIL (rot) — 4 der 8 Tests schlagen fehl, da die Migrationsdatei
# noch nicht existiert:
#   not ok 4 20260719_add_missing_fk_indexes_batch2.sql existiert
#   not ok 5 batch2-Migration reicht die 4 urspruenglichen T001905-Indizes ...
#   not ok 6 batch2-Migration deckt neu gefundene FK-Spalten aus beiden Brands ab
#   not ok 7 batch2-Migration guardet jeden Block mit to_regclass ...
```

- [ ] **Step 2: Migrationsdatei exakt mit folgendem Inhalt anlegen** (verifiziert
      per `BEGIN; ... ROLLBACK;`-Dry-Run gegen beide Brand-Datenbanken waehrend
      der Planung — 58 Statements liefen fehlerfrei, mehrere Indizes existierten
      auf der jeweils anderen Brand-DB bereits, was die `IF NOT EXISTS`-Wahl
      bestaetigt):

```sql
-- Migration: add remaining missing indexes on single-column FK constraints — T001946 (G-DB01).
-- Applied automatically by website/src/db/migrate.ts (task workspace:deploy runs
-- `pnpm --dir website db:migrate` against the target brand's `website` database).
--
-- Identified via the G-DB01 health-goal query (.claude/lib/goals.md#G-DB01), run live
-- against both brand databases (mentolder `workspace`, korczewski `workspace-korczewski`)
-- on 2026-07-19. Live count was 34 (mentolder) / 49 (korczewski) missing FK indexes —
-- far above the '4' baseline recorded when T001905/20260717_add_missing_fk_indexes.sql
-- was written. Investigation found the four original columns
-- (onboarding_state.brand, sessions.templates.created_from_template_id,
-- studio.sessions.client_id/template_of) were STILL unindexed on the mentolder DB
-- despite schema_migrations recording that migration as applied — this migration
-- re-includes them (idempotent CREATE INDEX IF NOT EXISTS, harmless no-op if already
-- present) alongside every column newly added since the 2026-07-17 baseline.
--
-- Guarded with to_regclass() rather than bare CREATE INDEX IF NOT EXISTS: several
-- schemas are brand-specific (`studio.*`/`sessions.*` mentolder-only; `bugs.*`
-- korczewski-only) and this migrations directory is shared by every brand's
-- `db:migrate` run — an unguarded statement against a table that doesn't exist on
-- another brand's database would abort that brand's entire migration run.

DO $$
BEGIN
  IF to_regclass('public.onboarding_state') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_onboarding_state_brand
      ON public.onboarding_state (brand);
  END IF;

  IF to_regclass('sessions.templates') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sessions_templates_created_from_template_id
      ON sessions.templates (created_from_template_id);
  END IF;

  IF to_regclass('studio.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_client_id
      ON studio.sessions (client_id);
    CREATE INDEX IF NOT EXISTS idx_studio_sessions_template_of
      ON studio.sessions (template_of);
  END IF;

  IF to_regclass('bachelorprojekt.features') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_brand
      ON bachelorprojekt.features (brand);
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_features_requirement_id
      ON bachelorprojekt.features (requirement_id);
  END IF;

  IF to_regclass('bachelorprojekt.pipeline') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_pipeline_req_id
      ON bachelorprojekt.pipeline (req_id);
  END IF;

  IF to_regclass('bachelorprojekt.test_results') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bachelorprojekt_test_results_req_id
      ON bachelorprojekt.test_results (req_id);
  END IF;

  IF to_regclass('bugs.bug_tickets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_bugs_bug_tickets_brand
      ON bugs.bug_tickets (brand);
  END IF;

  IF to_regclass('coaching.drafts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_drafts_resulting_snippet_id
      ON coaching.drafts (resulting_snippet_id);
  END IF;

  IF to_regclass('coaching.sessions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_sessions_ki_config_id
      ON coaching.sessions (ki_config_id);
  END IF;

  IF to_regclass('coaching.snippet_clusters') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_snippet_clusters_parent_id
      ON coaching.snippet_clusters (parent_id);
  END IF;

  IF to_regclass('coaching.snippets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coaching_snippets_knowledge_chunk_id
      ON coaching.snippets (knowledge_chunk_id);
  END IF;

  IF to_regclass('knowledge.collections') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_knowledge_collections_brand
      ON knowledge.collections (brand);
  END IF;

  IF to_regclass('public.assets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_assets_brand
      ON public.assets (brand);
  END IF;

  IF to_regclass('public.billing_customers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_customers_customers_id
      ON public.billing_customers (customers_id);
  END IF;

  IF to_regclass('public.billing_invoice_dunnings') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_invoice_dunnings_brand
      ON public.billing_invoice_dunnings (brand);
  END IF;

  IF to_regclass('public.billing_invoice_payments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_invoice_payments_brand
      ON public.billing_invoice_payments (brand);
  END IF;

  IF to_regclass('public.billing_nachweis') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_nachweis_brand
      ON public.billing_nachweis (brand);
  END IF;

  IF to_regclass('public.billing_quotes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_quotes_brand
      ON public.billing_quotes (brand);
  END IF;

  IF to_regclass('public.chat_message_reads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_message_reads_customer_id
      ON public.chat_message_reads (customer_id);
  END IF;

  IF to_regclass('public.chat_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_customer_id
      ON public.chat_messages (sender_customer_id);
  END IF;

  IF to_regclass('public.chat_room_members') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_room_members_customer_id
      ON public.chat_room_members (customer_id);
  END IF;

  IF to_regclass('public.chat_rooms') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_chat_rooms_direct_customer_id
      ON public.chat_rooms (direct_customer_id);
  END IF;

  IF to_regclass('public.document_assignments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_document_assignments_template_id
      ON public.document_assignments (template_id);
  END IF;

  IF to_regclass('public.free_time_windows') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_free_time_windows_brand
      ON public.free_time_windows (brand);
  END IF;

  IF to_regclass('public.inbox_items') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_inbox_items_bug_ticket_id
      ON public.inbox_items (bug_ticket_id);
  END IF;

  IF to_regclass('public.message_threads') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_message_threads_customer_id
      ON public.message_threads (customer_id);
  END IF;

  IF to_regclass('public.messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_messages_sender_customer_id
      ON public.messages (sender_customer_id);
  END IF;

  IF to_regclass('public.newsletter_send_log') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_newsletter_send_log_campaign_id
      ON public.newsletter_send_log (campaign_id);
    CREATE INDEX IF NOT EXISTS idx_newsletter_send_log_subscriber_id
      ON public.newsletter_send_log (subscriber_id);
  END IF;

  IF to_regclass('public.questionnaire_answer_options') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options_dimension_id
      ON public.questionnaire_answer_options (dimension_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answer_options_question_id
      ON public.questionnaire_answer_options (question_id);
  END IF;

  IF to_regclass('public.questionnaire_answers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_answers_question_id
      ON public.questionnaire_answers (question_id);
  END IF;

  IF to_regclass('public.questionnaire_assignments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_project_id
      ON public.questionnaire_assignments (project_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_assignments_template_id
      ON public.questionnaire_assignments (template_id);
  END IF;

  IF to_regclass('public.questionnaire_dimensions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_dimensions_template_id
      ON public.questionnaire_dimensions (template_id);
  END IF;

  IF to_regclass('public.questionnaire_questions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_questions_template_id
      ON public.questionnaire_questions (template_id);
  END IF;

  IF to_regclass('public.questionnaire_test_evidence') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_evidence_question_id
      ON public.questionnaire_test_evidence (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_fixtures') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_fixtures_question_id
      ON public.questionnaire_test_fixtures (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_seed_registry') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_seed_registry_question_id
      ON public.questionnaire_test_seed_registry (question_id);
  END IF;

  IF to_regclass('public.questionnaire_test_status') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status_evidence_id
      ON public.questionnaire_test_status (evidence_id);
    CREATE INDEX IF NOT EXISTS idx_questionnaire_test_status_last_failure_ticket_id
      ON public.questionnaire_test_status (last_failure_ticket_id);
  END IF;

  IF to_regclass('public.supplier_invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_supplier_invoices_brand
      ON public.supplier_invoices (brand);
    CREATE INDEX IF NOT EXISTS idx_supplier_invoices_supplier_id
      ON public.supplier_invoices (supplier_id);
  END IF;

  IF to_regclass('public.tax_mode_changes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tax_mode_changes_brand
      ON public.tax_mode_changes (brand);
  END IF;

  IF to_regclass('public.time_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_time_entries_task_id
      ON public.time_entries (task_id);
  END IF;

  IF to_regclass('tickets.tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tags_brand
      ON tickets.tags (brand);
  END IF;

  IF to_regclass('tickets.ticket_activity') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_activity_actor_id
      ON tickets.ticket_activity (actor_id);
  END IF;

  IF to_regclass('tickets.ticket_attachments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_attachments_uploaded_by
      ON tickets.ticket_attachments (uploaded_by);
  END IF;

  IF to_regclass('tickets.ticket_comments') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_comments_author_id
      ON tickets.ticket_comments (author_id);
  END IF;

  IF to_regclass('tickets.ticket_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_links_created_by
      ON tickets.ticket_links (created_by);
  END IF;

  IF to_regclass('tickets.ticket_tags') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_tags_tag_id
      ON tickets.ticket_tags (tag_id);
  END IF;

  IF to_regclass('tickets.ticket_watchers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_ticket_watchers_user_id
      ON tickets.ticket_watchers (user_id);
  END IF;

  IF to_regclass('tickets.tickets') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_brand
      ON tickets.tickets (brand);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_reporter_id
      ON tickets.tickets (reporter_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_assignment_id
      ON tickets.tickets (source_test_assignment_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_tickets_source_test_result_id
      ON tickets.tickets (source_test_result_id);
  END IF;

END
$$;

```

- [ ] **Step 3: Test erneut ausfuehren — jetzt GREEN.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/db-quality-goals.bats
# expected: alle 8 Tests PASS
```

- [ ] **Step 4: Erneuter Dry-Run gegen beide Brand-DBs (read-only, kein Commit)**
      als letzte Sicherheitspruefung vor dem echten Deploy — bestaetigt, dass
      sich seit der Planungsphase kein neues Schema geaendert hat, das die
      Migration brechen wuerde:

```bash
kubectl get pod -n workspace --context fleet -l app=shared-db -o name
kubectl get pod -n workspace-korczewski --context fleet -l app=shared-db -o name
# Fuer jeden gefundenen Pod (POD, NS):
cat website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql \
  | kubectl exec -i "$POD" -n "$NS" --context fleet -c postgres -- \
      psql -U website -d website -v ON_ERROR_STOP=1 -c "BEGIN;" -f /dev/stdin -c "ROLLBACK;"
# expected: "DO" gefolgt von "ROLLBACK", keine ERROR-Zeilen (NOTICE "already
# exists, skipping" ist erwartet und unschaedlich)
```

- [ ] **Step 5: Commit.**

```bash
git add website/src/db/migrations/20260719_add_missing_fk_indexes_batch2.sql
git commit -m "fix(db): add remaining missing FK indexes for G-DB01 [T001946]"
```

> **Hinweis Commit-Praefix:** Dieser Commit enthaelt echten Production-Code
> (die Migrationsdatei) — daher `fix(db):`, NICHT `chore(plans):` (der davor
> liegende Plan-Stage-Commit dieses Tickets nutzt korrekt `chore(plans):`, da
> er nur Test + Plan-Artefakte enthielt, siehe dev-flow-plan Fix-Pfad-Konvention).

---

### Task 2: Deploy & Live-Verifikation

**Files:** keine Code-Aenderung — reiner Deploy- und Mess-Task.

- [ ] **Step 1: Deploy anstoßen** (push-based, kein manuelles `kubectl apply`
      der Migration — `db:migrate` laeuft automatisch als Teil von
      `task workspace:deploy`):

```bash
bash scripts/vda.sh oracle 'deploy website to mentolder and korczewski brands'
```

- [ ] **Step 2: G-DB01 live neu messen** (beide Brands):

```bash
HG_DB_NS=workspace         HG_DB_CTX=fleet bash scripts/health-goals-check.sh --only=G-DB01
HG_DB_NS=workspace-korczewski HG_DB_CTX=fleet bash scripts/health-goals-check.sh --only=G-DB01
# expected: mentolder 0, korczewski 1 (der dokumentierte arena.match_players-Restwert)
```

- [ ] **Step 3: `.claude/lib/goals.md` G-DB01-Eintrag final aktualisieren**
      (Baseline-Update-Zeile mit dem neuen gemessenen Wert ergaenzen, analog zu
      den bestehenden `**Baseline-Update <datum>**`-Eintraegen weiter unten in
      der Datei).

---

### Task 3: Abschluss-Verifikation

- [ ] **Step 1: Verify.**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
