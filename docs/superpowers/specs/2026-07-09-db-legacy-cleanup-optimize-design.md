---
title: "DB Legacy Cleanup & Optimization"
slug: db-legacy-cleanup-optimize
date: 2026-07-09
status: design
ticket_id: T001676
plan_ref: openspec/changes/db-legacy-cleanup-optimize/tasks.md
domains: [database, website]
---

# DB Legacy Cleanup & Optimization — Design Spec

> **Hinweis zum Prozess:** Das Brainstorming ist über eine strukturierte
> Explorations- + Scope-Q&A-Session konvergiert (Codebase-Memory, mcp-postgres,
> Explore-Agent, drei Scope-Entscheidungen des Users), nicht über ein interaktives
> Lavish-Board. Der Entscheidungsstand ist unten vollständig dokumentiert.

## WARUM (Intent)

Der User-Request lautete: „offene DB-Migrationen abschließen, danach die
Rückwärtskompatibilität entfernen (alle Interfaces auf die neuen Tabellen), danach
Best-Practice-Prinzipien für DB-Nutzung anwenden und optimieren."

Die Exploration hat gezeigt: Die eigentliche **Datenmigration ist bereits fertig** —
was aussieht wie „unfertige Migration" sind in Wahrheit zwei liegengebliebene
Aufräum-Schritte plus ein echtes, aber vom User bewusst ausgegliedertes
Best-Practice-Problem.

## AUSGANGSLAGE (Faktenbasis)

### Provider-Config-Vereinheitlichung — Phase 2 offen
- `coaching.ki_config` (ALT) → `tickets.provider_config` (source='coaching', NEU) ist
  datenseitig **vollständig migriert**: 9/9 Configs gemappt, 11 coaching-Rows im neuen
  Store, **0** Sessions referenzieren noch Alt-IDs.
- Migration `scripts/migrations/2026-06-14-coaching-data-migrate.sql:9` sagt explizit:
  „coaching.ki_config wird NICHT gedroppt (Rollback-Sicherheit; **Drop erst Phase 2**)".
- **Kein Laufzeit-Code** liest/schreibt die Alt-Tabellen mehr. Der Live-Adapter
  `website/src/lib/coaching-ki-config-db.ts` (Z84–214) arbeitet ausschließlich gegen
  `tickets.provider_config WHERE source='coaching'`.
- Übriggeblieben: die Tabellen `coaching.ki_config` + `coaching.ki_config_id_map`, der
  tote TS-Migrations-Spiegel `website/src/lib/schema/coaching-migrate.ts` (nur vom
  eigenen Test `coaching-migrate.test.ts` aufgerufen) und ein veralteter Kommentar in
  `coaching-ki-config-db.ts:7`.
- **NICHT anfassen:** Spalte `coaching.sessions.ki_config_id` + FK
  `sessions_ki_config_id_fkey` — zeigt jetzt korrekt auf `tickets.provider_config(id)`.

### Verwaiste, nicht-angewendete Migration
- `scripts/migration/005-add-category-to-tickets.sql` (Singular-Verzeichnis) ist
  **nicht angewendet** (`tickets.tickets.category` fehlt in der DB) und wird nirgends im
  Code referenziert. Das zugehörige Feature (T000725 Mishap-Kategorisierung) ist nie
  live gegangen.

### Zwei divergente Migrationssysteme (best-practice-relevant)
- `website/src/db/migrations/*.sql` — automatisch via `website/src/db/migrate.ts`
  (idempotent, transaktional, getrackt in `public.schema_migrations`, im Deploy vor
  Website-Rollout). Sauber.
- `scripts/migrations/*.sql` — manuell per `factory_psql < file` pro Brand-DB,
  **ungetrackt**. Fehleranfällig, kein Applied-History.

### Optimierungs-Befunde (ehrlich eingeordnet)
- Vermeintliche Seq-Scan-„Hotspots" (`questionnaire_assignments` 59k,
  `factory_phase_events` 23k, `ticket_links` 7.5k) sind **winzige Tabellen** (703/953/96
  Zeilen). Postgres wählt hier korrekt Seq-Scan — blindes Index-Hinzufügen wäre ein
  Anti-Pattern. → **EXPLAIN-getrieben**, nicht mechanisch.
- **Echte Wins:**
  1. **Pool-Proliferation:** zentrales, gehärtetes `website/src/lib/db-pool.ts`
     (fail-soft Timeouts, DNS-Workaround) existiert, aber ≥6 Module erzeugen eigene
     `new Pool()` (`ai-metrics.ts`, `knowledge-db.ts`, `codesearch-db.ts`,
     `notify-unread.ts`, `admin/ai-quality.ts`, `admin/knowledge/import/json.ts`) und
     umgehen damit die Härtung → Connection-Exhaustion-Risiko.
  2. **Viele Indizes mit `idx_scan=0`** — Kandidaten für Entfernung, ABER die Statistik
     stammt aus **einer** DB seit letztem Reset; Drop nur nach Verifikation gegen
     **Prod-Statistik beider Brands**.
- Der FK-Index `idx_coaching_sessions_ki_config_id` existiert bereits.

## WAS (Scope, mit Scope-Entscheidungen des Users)

**In Scope (dieser Plan, gestaffelt):**

1. **Stufe A — Offene Migration abschließen**
   - `scripts/migration/005-add-category-to-tickets.sql` **löschen** (User-Entscheid:
     tote Migration; category wird nirgends genutzt).
   - Applied-Status aller `scripts/migrations/*.sql` gegen **beide Brand-DBs**
     verifizieren und dokumentieren (mentolder + korczewski). Falls Lücken → nachziehen.

2. **Stufe B — Rückwärtskompatibilität entfernen (Phase 2)**
   - Neue getaggte Drop-Migration `scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql`:
     `DROP TABLE IF EXISTS coaching.ki_config_id_map; DROP TABLE IF EXISTS coaching.ki_config;`
     (idempotent, transaktional, mit Vorbedingungs-Guard: FK zeigt bereits auf
     provider_config; 0 Sessions mit Alt-IDs). Auf **beide** Brand-DBs.
   - `website/src/lib/schema/coaching-migrate.ts` + `coaching-migrate.test.ts` löschen
     (toter Code).
   - Veralteten/irreführenden Kommentarblock in `coaching-ki-config-db.ts:7` bereinigen.

3. **Stufe C — Breiter DB-Audit + Optimierung** (User-Entscheid: breiter Audit)
   - **Pool-Konsolidierung:** Ad-hoc `new Pool()`-Aufrufer auf den geteilten
     `db-pool.ts`-Export umstellen (dort, wo dieselbe `website`-DB verwendet wird und
     kein bewusster Sonder-Pool nötig ist). Pro Migration begründen.
   - **Index-Audit (EXPLAIN-getrieben):** Für jeden vermeintlichen Hotspot `EXPLAIN
     (ANALYZE, BUFFERS)` fahren; Index nur hinzufügen, wenn er messbar gewinnt. Ergebnis
     als Audit-Notiz dokumentieren (auch die Nicht-Änderungen begründen).
   - **Ungenutzte Indizes:** Liste der `idx_scan=0`-Indizes erstellen, aber Drop nur nach
     Prod-Statistik-Gegencheck beider Brands; als Audit-Empfehlung liefern, riskante
     Drops NICHT blind ausführen.
   - **N+1-Audit:** Website-DAL-Module stichprobenartig auf Query-in-Loop prüfen;
     konkrete Funde beheben oder als Follow-up dokumentieren.
   - **Hygiene:** `VACUUM (ANALYZE)` / `ANALYZE`-Empfehlung; `ticket_plans`-Content-Guard
     (SSOT database.md) respektieren.

**Out of Scope (ausgegliedert):**
- **Migrations-System-Konsolidierung** (`scripts/migrations/` unter getrackten Runner
  bringen) → **separates Folge-Ticket** (User-Entscheid). Wird im tasks.md als Follow-up
  vermerkt und als eigenes Ticket angelegt.

## Risiken / Trade-offs

- **Prod-DB-Drops (beide Brands):** unwiderruflich. Mitigation: idempotent + Guard-Query
  vor Drop; Backup-Pipeline (SSOT backup-pipeline.md) deckt Rollback ab; Datenmigration
  ist verifiziert abgeschlossen.
- **Index-Drops auf Basis einer DB-Momentaufnahme:** Risiko, produktiv genutzte Indizes
  zu entfernen. Mitigation: nur Empfehlung, Drop erst nach Prod-Stat-Gegencheck.
- **Pool-Konsolidierung:** Sonder-Pools (andere DB / andere Timeouts) dürfen nicht naiv
  zusammengelegt werden. Mitigation: pro Aufrufer prüfen, ob wirklich dieselbe DB/Config.

## Verifikation

- Cross-Brand-Anwendung der Drop-Migration bestätigen (database.md-Requirement
  „Cross-Brand Schema Migrations Apply to Both Fleet Namespaces").
- BATS-Test in `tests/spec/database.bats`: Alt-Tabellen existieren nach Drop nicht mehr,
  `coaching.sessions.ki_config_id`-FK unverändert vorhanden.
- `task test:changed`, `task freshness:regenerate`, `task freshness:check`.
