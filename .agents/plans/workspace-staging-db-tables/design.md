---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-07
---

# Design — T900819 workspace-staging DB-Tabellen + admin-API-500s

## Root Cause (kompakt)

- **RC-A/B — Zwei-Quellen-Schema ohne Ensure für migrate-only Tabellen:**
  Website-DDL lebt in zwei Systemen — `components/website/src/db/migrations/*.sql`
  (via `runMigrations`, **nur manuell** per `pnpm db:migrate`, nie beim Boot) und
  `k3d/website-schema.yaml` Ensure-Skripten (idempotent, jeder `shared-db`-postStart).
  `admin_actions` + `error_log` existieren **nur** im ersten System. Jede
  Staging-DB ohne manuellen Migrate-Lauf (frisch, restauriert) startet ohne sie;
  der Cleanup-CronJob (`ON_ERROR_STOP=1`) fällt dann deterministisch durch.
  `messages` + `knowledge.collections` sind in beiden Systemen abgedeckt —
  deren Fehlen am 09-28 war transient (vor Ensure-/Migrate-Stand), heute vorhanden.
- **RC-C/D — Billing-Routen ohne Fehlerpfad:** `dunning/run.ts` ohne try/catch,
  `create-monthly-invoices.ts` nur schleifen-intern gesichert. Referenzmuster für
  den Zielzustand: `purge.ts:34-40` (`try` → `requestLogger.error` →
  `purge_failed`/500).
- **Nicht-Ursachen:** `sessions/purge` ist dateibasiert (H6 widerlegt, T900801-Sache);
  Billing-500s hängen nicht an den vier Ticket-Tabellen (H4 widerlegt).

## Entscheidungen

- **D1 — Fix im Ensure-System, nicht im Boot:** `runMigrations` an den
  Website-Start zu hängen wäre die größere Architekturänderung (zwei
  DB-URL-Variablen `DATABASE_URL` vs. `SESSIONS_DATABASE_URL`, T002681-Falle,
  Delivery-Risiko). Stattdessen werden die zwei fehlenden Tabellen als
  idempotente `CREATE TABLE IF NOT EXISTS`-Blöcke (DDL 1:1 aus den
  Migrationsdateien inkl. Indexe, Grants, `OWNER TO website`) in
  `ensure-meetings-schema.sh` ergänzt — läuft jeden postStart, No-op auf
  Prod. Kein `shared-db.yaml`-Umbau nötig (Hook bereits verdrahtet).
- **D2 — Scope diszipliniert:** Nur `admin_actions` + `error_log` wandern ins
  Ensure-System (Ticket-Scope). Die übrigen 21 ungetrackten Migrationsdateien
  (assets, cockpit, …) sind kein akutes Staging-Risiko (Staging-Probe:
  `assets` 0, aber kein Ticket-Symptom daran gekoppelt) und bleiben bewusst
  draußen — Follow-up-Ticket statt Scope-Creep.
- **D3 — Routen-Härtung ohne Verhaltensänderung:** Nur Fehlerpfad dazu
  (strukturiertes JSON + `requestLogger.error`), Erfolgsantworten byte-identisch.
  Keine neuen `any`-Typen (CQ02), keine Brand-Literale (S3).
- **D4 — Failing Test zuerst:** `tests/spec/workspace-staging-db-tables.bats`
  (Stage-Commit, RED: 4 Fail / 2 Anker grün) dreht nach P1+P2 auf grün.
  Vitest-Coverage für beide Routen nach dem colocated Muster
  (`.../api/cron/error-log-retention.test.ts`), danach `task test:inventory`.

## Fix-Ansatz (Partials, disjunkt)

| Partial | Ziel | Dateien |
|---|---|---|
| p1-schema-ensure | Ensure-Blöcke für `admin_actions` + `error_log` | `k3d/website-schema.yaml` |
| p2-billing-route-hardening | try/catch + 500 + Log in beiden Routen + Vitest-Tests | `.../dunning/run.ts`, `.../create-monthly-invoices.ts`, 2× colocated `.test.ts` (neu) |
| p3-tests-verify | BATS grün, Inventar, Verify-Gates | `tests/spec/workspace-staging-db-tables.bats`, `components/website/src/data/test-inventory.json` |

## Risiken

- ConfigMap-Edit an `website-schema.yaml`: Syntax validieren
  (`task workspace:validate` + `./tests/runner.sh local` für Manifest-Tests);
  Rollout läuft über die normale Deploy-Pipeline, nicht per Hand-`apply`.
- `error_log`-Tabelle im Ensure-Scope kollidiert nicht mit `migrate.ts`
  (beide `IF NOT EXISTS`; DDL wortgleich zur Migration).
