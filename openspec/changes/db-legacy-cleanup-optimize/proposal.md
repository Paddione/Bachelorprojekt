# Proposal: db-legacy-cleanup-optimize

## Why

Die Provider-Config-Vereinheitlichung (`coaching.ki_config` → `tickets.provider_config`
mit `source='coaching'`) ist datenseitig **abgeschlossen** — 9/9 Configs gemappt, kein
Laufzeit-Code liest die Alt-Tabellen mehr, 0 Sessions referenzieren Alt-IDs. Was übrig
blieb, ist die bewusst aufgeschobene „Phase 2": die Rollback-Sicherheits-Tabellen und
toter Migrations-Spiegel-Code. Zusätzlich existiert eine verwaiste, nie angewendete
Migration und mehrere Best-Practice-Schulden in der DB-Nutzung (Pool-Proliferation,
ungeprüfte Index-Situation). Dieses Cleanup schafft Schema-Klarheit, senkt das
Drift-Risiko und härtet die DB-Zugriffsschicht.

## What

**Stufe A — Offene Migration abschließen**
- `scripts/migration/005-add-category-to-tickets.sql` **löschen** (nie angewendet,
  `tickets.tickets.category` fehlt, im Code nirgends referenziert).
- Applied-Status aller `scripts/migrations/*.sql` gegen **beide** Brand-DBs
  (mentolder + korczewski) verifizieren und dokumentieren; Lücken nachziehen.

**Stufe B — Rückwärtskompatibilität entfernen (Phase 2)**
- Neue Drop-Migration `scripts/migrations/2026-07-09-coaching-phase2-drop-legacy.sql`
  (idempotent, transaktional, Vorbedingungs-Guard) für `coaching.ki_config` +
  `coaching.ki_config_id_map`, auf beide Brand-DBs.
- Toten Spiegel `website/src/lib/schema/coaching-migrate.ts` + `coaching-migrate.test.ts`
  löschen; veralteten Kommentar in `coaching-ki-config-db.ts` bereinigen.
- **Nicht anfassen:** Spalte `coaching.sessions.ki_config_id` + FK auf
  `tickets.provider_config`.

**Stufe C — Breiter DB-Audit + Optimierung**
- Pool-Konsolidierung: Ad-hoc `new Pool()`-Aufrufer auf den gehärteten geteilten
  `db-pool.ts` umstellen (pro Aufrufer begründet).
- EXPLAIN-getriebenes Index-Audit (keine mechanischen Index-Adds auf Kleintabellen).
- Ungenutzte Indizes: Empfehlungsliste, Drop erst nach Prod-Statistik-Gegencheck beider
  Brands.
- N+1-Query-Audit im Website-DAL; VACUUM/ANALYZE-Hygiene.

**Out of Scope (Folge-Ticket):** Migrations-System-Konsolidierung — `scripts/migrations/`
unter einen getrackten Runner (analog `website/src/db/migrate.ts`) bringen.

_Ticket: T001676_
