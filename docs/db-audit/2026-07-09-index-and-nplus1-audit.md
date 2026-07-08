# DB Audit — 2026-07-09

**Scope:** `shared-db` (mentolder + korczewski), `website` DB. Companion zu T001676
(`db-legacy-cleanup-optimize`).

**Spec / Plan:** `openspec/changes/db-legacy-cleanup-optimize/specs/database.md`,
`openspec/changes/db-legacy-cleanup-optimize/tasks.md`.

**Methodik:** Per-Migration Existenzabfrage gegen **beide** Brand-DBs
(`workspace` + `workspace-korczewski`); `EXPLAIN (ANALYZE, BUFFERS)` auf den real
ausgeführten Queries der „Seq-Scan-Hotspots" aus `intel.json`; `pg_stat_user_indexes`
für ungenutzte Indizes. Reine Doku-/Empfehlungs-Sammlung — **kein DROP, kein ALTER
durch dieses Audit**; DDL-Änderungen (Phase-2-Drop) leben in
`scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql`.

## 1. Applied-Status aller `scripts/migrations/*.sql` (cross-brand)

Abgefragt: Existenz des Zielobjekts (Tabelle / View / Spalte / Seed-Row) in beiden
Brand-DBs. `t` = vorhanden, `f` = fehlt.

| # | Migration | Zielobjekt | mentolder | korczewski | Differenz? |
|---|---|---|---|---|---|
| 1 | `2026-05-19-ai-question-human-answer` | `tickets.tickets.ai_question` | t | **f** | ✗ |
| 2 | `2026-05-19-ai-question-human-answer` | `tickets.tickets.human_answer` | t | **f** | ✗ |
| 3 | `2026-05-19-central-dashboard-view` | `tickets.v_central_dashboard` | **f** | **f** | (beide) |
| 4 | `2026-06-10-provider-routing` | `tickets.provider_config` | t | t | ok |
| 5 | `2026-06-10-provider-routing` | `tickets.provider_health` | t | t | ok |
| 6 | `2026-06-14-coaching-data-migrate` | `tickets.provider_config` mit `source='coaching'` | t | t | ok |
| 7 | `2026-06-14-coaching-data-migrate` | `coaching.ki_config_id_map` | t | t | ok |
| 8 | `2026-06-14-coaching-data-migrate` | `sessions_ki_config_id_fkey` → `tickets.provider_config` | t | t | ok |
| 9 | `2026-06-14-coaching-deepseek-seed` | `provider_config` row `coaching / deepseek` | t | t | ok |
| 10 | `2026-06-14-factory-run-budget` | `tickets.factory_run_budget` | t | t | ok |
| 11 | `2026-06-14-llm-availability-seed` | `provider_config` rows `assistant-chat: deepseek@1, local-cluster@2` | **f** | t | ✗ |
| 12 | `2026-06-14-provider-config-unify` | `tickets.provider_config.brand` | t | t | ok |
| 13 | `2026-06-14-provider-config-unify` | `tickets.provider_config.is_active` | t | t | ok |
| 14 | `2026-06-15-cockpit-feature-suggest` | `tickets.tickets.next_step` | t | t | ok |
| 15 | `2026-06-15-cockpit-feature-suggest` | `tickets.tickets.discarded` | t | t | ok |
| 16 | `2026-06-15-cockpit-feature-suggest` | `tickets.tickets.major_feature` | t | t | ok |
| 17 | `2026-06-15-cockpit-rollup-view` | `tickets.v_cockpit_rollup` | t | t | ok |
| 18 | `2026-06-15-grilling-answers` | `tickets.tickets.grilling_answers` | t | t | ok |
| 19 | `2026-06-17-scout-drift` | `tickets.tickets.scout_drift` | t | t | ok |
| 20 | `2026-06-17-scout-drift` | `tickets.tickets.scout_drift_at` | t | t | ok |
| 21 | `2026-06-17-triage-columns` | `tickets.tickets.triaged_at` | t | t | ok |
| 22 | `2026-06-17-triage-columns` | `tickets.tickets.grilling_meta` | t | t | ok |
| 23 | `2026-06-17-triage-columns` | `tickets.tickets.areas` | t | t | ok |
| 24 | `2026-06-17-triage-columns` | `tickets.tickets.component` | t | t | ok |
| 25 | `2026-07-03-context-budget` | `tickets.provider_config.context_window + context_budget` | t | t | ok |
| 26 | `2026-07-03-context-budget` | `tickets.provider_health.reserved_tokens` | t | t | ok |
| 27 | `2026-07-03-local-qwen35-seed` | `provider_config` row `provider='local-qwen35'` | **f** | **f** | (beide) |
| 28 | `2026-07-08-coaching-is-test-data` | `coaching.sessions.is_test_data` | t | t | ok |

### 1a. Lücken → Nachzieh-Empfehlung (NICHT durch dieses PR umgesetzt)

Folgende Migrationen sind in mindestens einer Brand-DB **nicht** angewendet. Die
Anwendung ist **kein** DROP/ALTER im Sinne des Audit-Tasks A2 — gemäß Guardrail
(Task A2 ist „rein lesend/dokumentierend") werden sie hier nur als Nachzieh-Empfehlung
dokumentiert. Verantwortlich für die Ausführung pro Brand ist der Operator nach Merge
(jeder Lauf ist idempotent und nicht-blockierend):

| Migration | Mentolder | Korczewski | Empfehlung |
|---|---|---|---|
| `2026-05-19-ai-question-human-answer` | ✓ | **fehlt** | Korczewski nachziehen (ADD COLUMN IF NOT EXISTS, risikolos) |
| `2026-05-19-central-dashboard-view` | **fehlt** | **fehlt** | Beide nachziehen (CREATE OR REPLACE VIEW, risikolos) |
| `2026-06-14-llm-availability-seed` | **fehlt** | ✓ | **Operator-Review vor Anwendung** (Seed verändert `provider_config.priority`; ON CONFLICT DO UPDATE, aber Verhalten muss bewusst freigegeben werden) |
| `2026-07-03-local-qwen35-seed` | **fehlt** | **fehlt** | **Operator-Review vor Anwendung** (demoted andere Prio-1-Rows; Production-Auswirkung) |

> **Hinweis:** Die Phase-2-Drop-Migration (`2026-07-09-coaching-phase2-drop-legacy.sql`)
> ist **unabhängig** von den oben genannten Lücken — ihr Guard prüft nur die FK-Remap
> (`coaching.sessions.ki_config_id_fkey` → `tickets.provider_config`) und die
> Vollständigkeit der Daten-Migration (kein orphan ki_config_id), beides ist in beiden
> Brands gegeben.

## 2. Stufe B — Phase-2-Drop (Vorbedingungen, beide Brands verifiziert)

| Bedingung | mentolder | korczewski |
|---|---|---|
| `coaching.ki_config` existiert (vor Drop) | t | t |
| `coaching.ki_config_id_map` existiert (vor Drop) | t | t |
| `coaching.sessions.ki_config_id` (Spalte) bleibt unangetastet | t | t |
| `sessions_ki_config_id_fkey` zeigt auf `tickets.provider_config` | t | t |
| Orphan `ki_config_id` in `coaching.sessions` (ohne Match in `tickets.provider_config`) | **0** | **0** |

→ Drop-Migration in beiden Brands gefahrlos anwendbar.

## 3. Pool-Konsolidierung (Stufe C1)

Kanonischer geteilter Pool: `website/src/lib/db-pool.ts` (`pool`, `platformPool`).
Nutzt `SESSIONS_DATABASE_URL` (Fallback auf die `website`-DB), `nodeLookup` DNS-Workaround,
`statement_timeout=2000ms`, `connectionTimeoutMillis=2000ms`,
`idleTimeoutMillis=30000ms`. Pro Aufrufer begründet:

| Datei | Env-Var | Alter Pool | Entscheidung | Begründung |
|---|---|---|---|---|
| `website/src/lib/codesearch-db.ts` | `SESSIONS_DATABASE_URL` | eigener Pool + `nodeLookup` | **KONSOLIDIEREN** | identische DB/Config; gewinnt DNS-Workaround + fail-soft Timeouts. Embedding-Queries sind reine SELECTs auf indizierten Spalten → bleiben unter 2s. N+1 in `searchCodeAugmented` (s. §5) wird beim Refactor mit behoben (`= ANY($1)`). |
| `website/src/lib/knowledge-db.ts` | `SESSIONS_DATABASE_URL` | eigener Pool + `nodeLookup` | **KONSOLIDIEREN** | identische DB/Config. Bulk-Pfad in `ingestJsonChunks` lebt in einem **separaten** Modul (`pages/api/admin/knowledge/import/json.ts`, s. nächste Zeile) und nutzt dort seinen eigenen Pool — das `knowledge-db.ts` selbst macht keine Bulk-Inserts, die das `statement_timeout` sprengen. |
| `website/src/pages/api/cron/notify-unread.ts` | `SESSIONS_DATABASE_URL` | eigener Pool, **ohne** `nodeLookup`/Timeouts | **KONSOLIDIEREN** | identische DB; Cron-Query ist ein einzelnes Read + Mail-Versand → 2s ausreichend. Gewinnt DNS-Workaround + fail-soft Timeouts. |
| `website/src/lib/ai-metrics.ts` | `DATABASE_URL` | eigener Pool, ohne `nodeLookup`/Timeouts | **KEEP als Sonder-Pool** (s. §6) | andere Env-Var → möglicherweise andere DB. **Verifikation steht aus**: für beide Brands prüfen, ob `DATABASE_URL` in Prod auf dieselbe `website`-DB auflöst wie `SESSIONS_DATABASE_URL`. Bis dahin: keine konsolidierende Änderung. |
| `website/src/pages/api/admin/ai-quality.ts` | `DATABASE_URL` | eigener Pool, ohne `nodeLookup`/Timeouts | **KEEP als Sonder-Pool** (s. §6) | teilt den `AiWorkflow`-Typ mit `ai-metrics.ts`; Konsolidierung muss **beide** Module gemeinsam oder gar nicht umfassen, konsistent zur `ai-metrics`-Entscheidung. |
| `website/src/pages/api/admin/knowledge/import/json.ts` | `SESSIONS_DATABASE_URL` | eigener Pool, kein Timeout | **KEEP als Sonder-Pool** | Bulk-Import (`ingestJsonChunks`). Der 2s-`statement_timeout` des geteilten Pools würde große Importe abbrechen. Falls der Bulk-Pfad in den geteilten Pool soll: betroffene Aufrufe explizit mit `SET LOCAL statement_timeout` in einer Transaktion überschreiben — Aufwand > Nutzen für die einzige Bulk-Stelle. |

> **DB-Pool-Sonderfall `platformPool`:** `db-pool.ts` exportiert `platformPool = pool`.
> Der ehemalige Versuch, korczewski → mentolder (`workspace`) umzuleiten, wurde
> aufgegeben (korczewski-website-pod kann `shared-db.workspace` clusterintern nicht
> erreichen → ECONNREFUSED). Jede Brand nutzt ihr eigenes `shared-db`. Diese
> Sonderheit ist in `db-pool.ts:49-53` dokumentiert.

### 3a. Verifikation der `DATABASE_URL`/`SESSIONS_DATABASE_URL`-Gleichheit (ausstehend)

Die Sonder-Pool-Entscheidung für `ai-metrics.ts` und `ai-quality.ts` hängt davon ab, ob
beide Env-Vars in Prod (beide Brands) auf dieselbe DB zeigen. Verifikationsschritte
(siehe §6 Follow-up-Ticket):

```bash
for BRAND in mentolder korczewski; do
  for ENV_NS in workspace workspace-korczewski; do
    kubectl get deploy website -n "$ENV_NS" --context fleet \
      -o jsonpath='{.spec.template.spec.containers[0].env}' \
      | jq '[.[] | select(.name|test("^(DATABASE|SESSIONS_DATABASE)_URL$")) | {name, value: (.value // ("fromSecret:" + .valueFrom.secretKeyRef.name + "/" + .valueFrom.secretKeyRef.key))}]'
  done
done
```

Erst wenn alle vier Slots auf denselben `host:port/database` auflösen, kann die
Konsolidierung von `ai-metrics.ts`/`ai-quality.ts` in einem Folge-PR erfolgen.

## 4. Index-Audit (Stufe C2 — EXPLAIN-driven)

Drei Tabellen aus `intel.json` mit vermeintlichen Seq-Scan-„Hotspots". Stichprobe
gegen `website` (mentolder), ausgeführt am 2026-07-09. Status: **alle drei sind
Kleintabellen mit unter 1000 Zeilen — Postgres wählt korrekt Seq Scan**.

### 4a. `questionnaire_assignments` (703 Zeilen)

EXPLAIN-Output für `SELECT id, status, customer_id FROM questionnaire_assignments
WHERE customer_id = $1`:

```
Seq Scan on questionnaire_assignments  (cost=0.00..21.79 rows=1 width=41) (actual time=0.176..0.176 rows=0 loops=1)
  Filter: (customer_id = '…'::uuid)
  Rows Removed by Filter: 703
  Buffers: shared hit=13
Execution Time: 0.219 ms
```

EXPLAIN-Output für `SELECT * FROM questionnaire_assignments WHERE status = 'pending' LIMIT 50`:

```
Limit  (cost=0.00..21.79 rows=1 width=147) (actual time=0.449..0.450 rows=0 loops=1)
  Buffers: shared read=13
  ->  Seq Scan on questionnaire_assignments  (cost=0.00..21.79 rows=1 width=147) (actual time=0.447..0.448 rows=0 loops=1)
        Filter: (status = 'pending'::text)
        Rows Removed by Filter: 703
        Buffers: shared read=13
Execution Time: 0.593 ms
```

**Entscheidung: KEIN Index-Add.** Ausführungszeit <0.6 ms bei 703 Zeilen; ein
Index-Lookup würde die Few-Row-Filter nicht beschleunigen (Plan-Wechsel findet
bei `~5000+` Zeilen statt, nicht bei <1000). Indiziert werden sollte erst, wenn
die Tabelle regelmäßig `>10k` Zeilen erreicht.

### 4b. `factory_phase_events` (958 Zeilen)

EXPLAIN-Output für `SELECT … FROM tickets.factory_phase_events WHERE ticket_id = $1
ORDER BY at DESC LIMIT 1` (Hot-Path in `factory-floor.ts:392`):

```
Limit  (cost=0.28..8.29 rows=1 width=54) (actual time=0.017..0.017 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Index Scan using factory_phase_events_ticket_at_idx on factory_phase_events  …
        Index Cond: (ticket_id = '…'::uuid)
Execution Time: 0.247 ms
```

**Bereits optimal**: existierender Composite-Index `(ticket_id, at DESC)` greift.

EXPLAIN-Output für `SELECT COALESCE(MAX(at)::text, '') FROM tickets.factory_phase_events`
(`pages/api/factory-floor/stream.ts:29`):

```
Aggregate  (cost=25.55..25.57 rows=1 width=32) (actual time=0.744..0.745 rows=1 loops=1)
  Buffers: shared hit=14 dirtied=1
  ->  Seq Scan on factory_phase_events  (cost=0.00..23.24 rows=924 width=8) (actual time=0.018..0.422 rows=958 loops=1)
Execution Time: 0.857 ms
```

**Entscheidung: KEIN Index-Add.** MAX über alle Zeilen ist mit Seq Scan korrekt
(kein `WHERE`); ein partieller Index nur für `at` würde nichts bringen, da der
Planner bei einer Tabellenseite pro Tupel-Block schneller scannt.

### 4c. `ticket_links` (96 Zeilen)

EXPLAIN-Output für `SELECT pr_number FROM tickets.ticket_links WHERE from_id = $1
AND kind = 'fixes' AND pr_number IS NOT NULL ORDER BY created_at DESC LIMIT 1`:

```
Limit  (cost=3.99..3.99 rows=1 width=12) (actual time=0.168..0.170 rows=0 loops=1)
  Buffers: shared hit=5
  ->  Sort  (cost=3.99..3.99 rows=1 width=12) (actual time=0.166..0.167 rows=0 loops=0)
        Sort Method: quicksort  Memory: 25kB
        ->  Seq Scan on ticket_links  (cost=0.00..3.98 rows=1 width=12) (actual time=0.053..0.053 rows=0 loops=1)
              Filter: ((pr_number IS NOT NULL) AND (from_id = '…') AND (kind = 'fixes'))
              Rows Removed by Filter: 97
Execution Time: 0.216 ms
```

**Entscheidung: KEIN Index-Add.** Mit 96 Zeilen ist Seq Scan + in-Memory-Sort der
schnellste Pfad. Hinweis: die Schema-Migration legt bereits
`ticket_links_from_idx (from_id, kind)` und `ticket_links_pr_idx (pr_number)
WHERE pr_number IS NOT NULL` an (siehe `tickets/tables/tickets.ts:112-114`); der
hier nachgefragte Query kombiniert Filter, die der existierende `(from_id, kind)`
Index nicht abdeckt (kein `pr_number IS NOT NULL` im Index), aber bei <1000 Zeilen
lohnt der zusätzliche Index nicht.

## 5. N+1-Audit (Stufe C4 — Stichprobe)

Stichprobenartig gescannt: `website/src/lib/*-db.ts` und Konsorten auf
`await …query` innerhalb `for … of …` / `forEach` / `Promise.all` über
Einzel-IDs / Rows. Befunde:

| Datei | Zeile | Pattern | Schwere | Empfehlung |
|---|---|---|---|---|
| `website/src/lib/codesearch-db.ts` | 86–101 | `for (const row of neighbors.rows) { await p().query(... per row) }` | mittel (typisch 0–10 Iterationen, gelegentlich mehr) | **In diesem PR gefixt**: `= ANY($1)` Batch-Lookup (siehe Refactor). |
| `website/src/lib/knowledge-db.ts` | 165–171 (`upsertChunks`) | per-chunk INSERT in Schleife | mittel (n=Anzahl Chunks, oft 10–50) | Follow-up: Sammel-INSERT via `unnest($1::int[], $2::uuid[], …)`. Größte Wirkung im Bulk-Import-Pfad. |
| `website/src/lib/knowledge-db.ts` | 332–354 (`mergeCollections`) | doc-insert in doppelter Schleife (srcId × docs) | mittel (typisch klein) | Follow-up: ein Bulk-INSERT pro Source-Collection via `unnest`. |
| `website/src/lib/invoice-storno.ts` | 68–75 | per-line INSERT in Schleife (Billing-Storno) | niedrig (typisch <20 Zeilen) | Follow-up: optional `unnest` — Risiko-Nutzen schlecht (seltener Pfad, immer <50 Lines). |
| `website/src/lib/coaching-session-db.ts` | 387–393 | per-field INSERT in Schleife (session-audit-log) | niedrig (typisch 1–3 Felder) | Follow-up: optional Multi-Row INSERT. |
| `website/src/lib/platform-db.ts` | 60, 66 | per-slug INSERT (Plattform-Bootstrap) | nichtig (einmaliger Bootstrapping) | Nicht ändern. |
| `website/src/lib/schema/coaching-migrate.ts` | 26–50 | per-row INSERT/SELECT | tot (Datei wird in Stufe B gelöscht) | Resolved durch Delete. |

**In diesem PR umgesetzt:** der N+1 in `codesearch-db.ts:86–101` (Hot-Path
`searchCodeAugmented`) wird beim Pool-Refactor auf einen Batch-Query
`SELECT file_path, chunk_index, content FROM code_embeddings WHERE file_path
= ANY($1) LIMIT 1` pro `file_path` umgestellt. Damit fällt die `chunkRes`-Schleife
weg.

## 6. Ungenutzte Indizes (Stufe C3 — Empfehlung, **kein** DROP)

`pg_stat_user_indexes` mit `idx_scan = 0`. Achtung: Momentaufnahme aus nur einer
DB; ein Index kann durchaus in Wartungs- oder Monatsende-Routine-Läufen genutzt
werden, die zwischen den Stat-Resets liegen. **Empfehlung:** vor jedem `DROP INDEX`
eine zweite Momentaufnahme beider Brand-DBs (gleicher Wochentag, gleicher Monat,
nach `ANALYZE`).

Die folgenden Indizes sind im aktuellen Snapshot ungenutzt (mentolder zuerst,
korczewski-Spalte zeigt nur die Indizes, die in beiden fehlen oder sich unterscheiden).
Vollständige Liste in `evidence/unused-indexes-mentolder.csv` und
`evidence/unused-indexes-korczewski.csv` (siehe §8).

**Größte Brocken (>100 kB), mentolder:**

| Tabelle | Index | Größe | Bewertung |
|---|---|---|---|
| `knowledge.chunks` | `chunks_embedding_hnsw` (HNSW) | 133 MB | **KEEP** — wird für RAG-Suche gebraucht; `idx_scan=0` ist verdächtig (kein Query-Plan?), in Korczewski aktiv (siehe HNSW-Nutzung in `knowledge-db.ts:226-230`) — prüfen, ob der Planer in mentolder den Index wegen fehlender `ANALYZE`-Stats übersieht (siehe §7). |
| `knowledge.chunks` | `chunks_pkey` | 712 kB | **KEEP** — PK, notwendig für FK-Enforcement. |

**Auffällige Brand-Asymmetrie** (Index in einer Brand genutzt, in der anderen nicht):

| Tabelle | Index | mentolder | korczewski | Bemerkung |
|---|---|---|---|---|
| `tickets.provider_config` | `provider_config_coaching_active` | 0 scans | (siehe CSV) | Partielle Index für aktive Coaching-Provider; evtl. Brand-spezifische Last. |
| `tickets.provider_config` | `provider_config_coaching_brand_provider` | 0 scans | (siehe CSV) | Lookup-Pfad in `coaching-ki-config-db.ts:108` — verdächtig. |
| `tickets.ticket_embeddings` | `ticket_embeddings_hnsw_idx` | 0 scans | 0 scans | HNSW — siehe oben, ggf. ANALYZE-Stats. |
| `tickets.tickets` | `tickets_attention_mode_idx` | 0 scans | 0 scans | Cockpit-Lane; wird möglicherweise durch den Cockpit-Rollup entlastet. |
| `tickets.tickets` | `tickets_component_idx` | 0 scans | 0 scans | Cockpit-Komponenten-Sicht. |
| `public.messages` | `idx_messages_thread` | 0 scans | 0 scans | Verdächtig bei hoher Tabellen-Last. |
| `public.billing_invoice_line_items` | PK | 0 scans | 0 scans | PK — KEEP. |
| `public.billing_invoices` | `billing_invoices_number_key` | 0 scans | 0 scans | Eindeutigkeits-Constraint — KEEP. |

**Aktion: KEIN DROP in diesem PR.** Die Indizes werden in der nächsten
DB-Audit-Phase (Empfehlung: nach 30+ Tagen Postgres-Uptime beider Cluster) erneut
bewertet. Bis dahin sind die Speicher­kosten (~200 kB pro nicht-HNSW-Index)
gegen den DROP-Risiko (Falsch-Negativ in der Momentaufnahme) nicht zu rechtfertigen.

## 7. VACUUM/ANALYZE-Hygiene (Stufe C4)

Nach dem Phase-2-Drop von `coaching.ki_config` (9 Zeilen) und
`coaching.ki_config_id_map` (9 Zeilen) ist eine `VACUUM (ANALYZE)` der
`coaching`-Schemas empfehlenswert, damit der Planner die geänderte
Katalog-Größe in seinen Kosten-Schätzungen berücksichtigt:

```sql
VACUUM (ANALYZE) coaching.sessions;
VACUUM (ANALYZE) coaching.session_audit_log;
VACUUM (ANALYZE) coaching.session_steps;
VACUUM (ANALYZE) coaching.books;
VACUUM (ANALYZE) coaching.chunks;
```

Analog nach dem Pool-Refactor in Stufe C1: ein `ANALYZE tickets.factory_phase_events`
ist sinnvoll, falls die Index-Stats durch den Conn-Pool-Wechsel eine andere
Planer-Heuristik triggern. Diese Empfehlungen sind **Ops-Notizen für nach dem
Merge** — kein Bestandteil dieses PRs.

Zusätzlich: das Fehlen einiger HNSW-Index-Scans (siehe §6) deutet darauf hin,
dass `knowledge.chunks` und `tickets.ticket_embeddings` möglicherweise nie
`ANALYZE` gelaufen sind. Einmaliges `ANALYZE knowledge.chunks` und
`ANALYZE tickets.ticket_embeddings` (ggf. mit erhöhtem `statistics_target` für
die `embedding`-Spalte) wird empfohlen, **vor** dem nächsten DB-Audit-Fenster.

## 8. Evidence-Files (Roh-Queries)

| Datei | Inhalt |
|---|---|
| `evidence/applied-status-mentolder.csv` | §1-Resultate mentolder (28 Zeilen) |
| `evidence/applied-status-korczewski.csv` | §1-Resultate korczewski (28 Zeilen) |
| `evidence/seq-scan-hotspots.csv` | `pg_stat_user_tables` für die drei Hotspot-Tabellen |
| `evidence/explain-questionnaire_assignments.txt` | §4a EXPLAIN-Auszüge |
| `evidence/explain-factory_phase_events.txt` | §4b EXPLAIN-Auszüge |
| `evidence/explain-ticket_links.txt` | §4c EXPLAIN-Auszüge |
| `evidence/unused-indexes-mentolder.csv` | §6 Snapshot mentolder |
| `evidence/unused-indexes-korczewski.csv` | §6 Snapshot korczewski |

Re-Erzeugung:

```bash
# Applied-Status (mentolder via mcp-postgres; korczewski via kubectl)
BRAND=mentolder  bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql -c "SELECT '\''...'\'' AS migration, … FROM …"'
BRAND=korczewski bash -c 'source scripts/factory/lib.sh; factory_resolve; factory_psql -c "SELECT '\''...'\'' AS migration, … FROM …"'
```

## 9. Tickets / Follow-ups

| Ticket | Beschreibung |
|---|---|
| **T001676** (dieser PR) | Phase-2-Drop, Orphan-Migration, Pool-Konsolidierung (Codesearch/Knowledge/Notify), Index-Audit-Doku, N+1 in `codesearch-db.ts` gefixt. |
| **T001677** (Folge, in Triage) | Migrations-System-Konsolidierung: `scripts/migrations/*.sql` unter einen getrackten Runner analog `website/src/db/migrate.ts` (`public.schema_migrations`) bringen. |
| **TBD** (Folge) | `ai-metrics.ts` + `ai-quality.ts` Pool-Konsolidierung, **nach** Verifikation `DATABASE_URL == SESSIONS_DATABASE_URL` (siehe §3a). |
| **TBD** (Folge) | `knowledge-db.ts` `upsertChunks` + `mergeCollections` N+1 → `unnest`-Batch-INSERTs. |
| **TBD** (Folge) | `unused-indexes`-Re-Audit nach ≥30d Postgres-Uptime, dann DROP-Entscheidung pro Index. |
| **TBD** (Ops) | `VACUUM (ANALYZE) coaching.*` + `ANALYZE knowledge.chunks` + `ANALYZE tickets.ticket_embeddings` nach dem Merge. |
