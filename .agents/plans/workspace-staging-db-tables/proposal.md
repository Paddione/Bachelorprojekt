# Proposal — T900819 workspace-staging: fehlende Website-DB-Tabellen + admin-API-500s

## Symptom (Fakt, beobachtet 2026-09-28)

1. `public.admin_actions`, `public.error_log`, `public.messages`,
   `knowledge.collections` fehlten in der Staging-DB.
2. `POST /api/admin/sessions/purge` → 500 (keine Erholung nach Key-Restorierung).
3. `POST /api/admin/billing/dunning/run` → 500.
4. `POST /api/admin/billing/create-monthly-invoices` → 500.
5. CronJobs `admin-actions-cleanup-29843610` / `-29843640` → Failed.

## Hypothese vs. Beleg (T002448-M5 — Trennung vor Lösungsdesign)

| # | Hypothese | Beleg (lesend, 2026-10-07) | Urteil |
|---|---|---|---|
| H1 | Tabellen fehlen, weil `runMigrations` nie automatisch läuft | `components/website/Dockerfile` CMD ohne migrate-Hook; einziger Einstieg `pnpm db:migrate` (manuell). Staging-`schema_migrations` trackt **2 von 25** Dateien — exakt die zwei Ticket-Tabellen im migrate-Scope, beide `applied_at 2026-09-28 20:00Z` (= 7 min nach Ticketerstellung, manuelle Remediation). 23 Dateien inkl. `20260708_create_schema_migrations.sql` ungetrackt. | **Belegt (RC-A/B)** |
| H2 | `admin_actions`/`error_log` haben keinen zweiten Heilungspfad | `k3d/website-schema.yaml` Ensure-Skripte enthalten `CREATE TABLE` für `messages` (2×) und `knowledge.collections`, aber **kein** `admin_actions`/`error_log`. Billing-Tabellen heilen sich dagegen per `initBillingTables()` auf dem Query-Pfad. | **Belegt (RC-A/B)** |
| H3 | CronJob-Fails = fehlende Tabelle `admin_actions` | `k3d/admin-actions-cronjobs.yaml:44,95` — `UPDATE`/`DELETE` auf `public.admin_actions` mit `ON_ERROR_STOP=1`. Fehlende Tabelle → psql-Exit ≠ 0 → Job Failed. Aktuell `UPDATE 0` + Complete (Tabelle da). | **Belegt (RC-A)** |
| H4 | Billing-500s = fehlende der vier Ticket-Tabellen | `dunning/run.ts` trifft `v_billing_invoices_with_state` + `billing_invoice_dunnings` (existieren live), `create-monthly-invoices.ts` trifft Billing-/Time-Entry-Tabellen — **keine** der vier Ticket-Tabellen. Billing-Tabellen + View existieren heute alle. | **Widerlegt als Direktursache** |
| H5 | Billing-500s = unbehandelte DB-Fehler ohne Log-Kontext | `dunning/run.ts` (28 Zeilen) hat **kein** try/catch; `create-monthly-invoices.ts` sichert nur die Pro-Kunde-Schleife, Top-Level-Awaits ungesichert. Jeder transiente DB-Fehler → 500 ohne Diagnose. | **Belegt (RC-C/D)** |
| H6 | sessions-purge-500 = fehlende Tabelle | `purge.ts` → `purgeOldSessions()` ist **dateibasiert** (`SESSION_HUB_REGISTRY`), kein DB-Zugriff. T900801-RC1: `SESSIONS_CRON_TOKEN` fehlte live (CreateContainerConfigError). Heute `sessions-purge-t900806` Complete. | **Widerlegt (Key-Problem, bereits geheilt)** |

## Live-Gegenprobe (alle lesend, `fleet`, PRE=99551e3ab-Umgebung)

```bash
# Alle vier Tabellen existieren heute, Owner website:
kubectl --context fleet -n workspace-staging exec deployment/shared-db -- \
  psql -U website -d website -tAc \
  "SELECT schemaname||'.'||tablename FROM pg_tables \
    WHERE tablename IN ('admin_actions','error_log','messages','collections') ORDER BY 1;"
# → knowledge.collections, public.admin_actions, public.error_log, public.messages
# Billing-Side intakt:
#   billing_*-Tabellen (10) + v_billing_invoices_with_state vorhanden
# Jobs: admin-actions-cleanup-29856780 Complete (UPDATE 0),
#   billing-dunning-detection-t900806 + sessions-purge-t900806 Complete
```

## Scope-Entscheidung

- Akutsymptom ist **geheilt** (manueller `db:migrate` 09-28 + Key-Restorierung).
- Dieser Plan fixt die **systemische Lücke**, damit keine frische/restaurierte
  Staging-DB je wieder in diesen Zustand fällt, und härtet die zwei
  Billing-Routen (strukturierte 500s mit Log statt unbehandelter Throws).
- T900801 bleibt unberührt (needs_human, separater Auftrag).
- Kein `kubectl apply/scale/delete` in der Umsetzung; Staging-Verifikation nur
  lesend (`logs`/`get`/`exec … SELECT`).
