---
ticket_id: T000720
spec_ref: docs/superpowers/specs/2026-06-14-token-budget-tracking.md
status: active
date: 2026-06-14
domains: [website, scripts]
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Plan: Token-Budget-Tracking per Factory-Run

## Ziel

Pro Factory-Run Token-/USD-Kosten **vorab schätzen**, in `tickets.factory_run_budget`
speichern, ein **Tages-Budget als Hard-Stop** vor jedem Pipeline-Launch durchsetzen
und die Kosten im **Admin-Bereich** sichtbar machen. Genauigkeit ±20 %.

## Architektur-Überblick

```
Dispatcher (PREP)
  ├─ slot claim
  ├─ budget-guard.sh <brand>     ── Exit 1 ─→ ticket=blocked, phaseEvent('blocked'), skip
  │      (SUM cost_usd_act heute vs. factory_control['budget-limit-daily-usd'])
  ├─ budget-estimate.sh <ticket> <brand>  ── schreibt Estimate-Rows in factory_run_budget
  └─ parallel(launch …)          ── Pipeline läuft (pipeline.js UNVERÄNDERT)

Website (Admin)
  api/factory-budget.ts  ── GET summary / POST limit
  factory-budget.ts (DAL)  ── getDailyBudgetSummary / getRunBudgetByTicket / getBudgetLimit / setBudgetLimit
  BudgetPanel.svelte  ── eingebunden in dev-status.astro
  admin/factory-budget.astro  ── Limit-Config + Tages-/Ticket-Übersicht
```

Estimate-Heuristik (Tokens je Phase): Scout 15k, Design 15k, Plan 15k,
Implement 50k, Verify 20k, Deploy 20k (in≈out grob 50/50 für die Schätzung).
Preise: Claude in $3 / out $15 pro Mtok; DeepSeek in $0.27 / out $1.10 pro Mtok;
GPU $0 (Token-Äquivalent dennoch gespeichert).

## S1-Budget-Analyse

| Datei | Ist | Limit | Budget | Plan |
|-------|-----|-------|--------|------|
| `scripts/factory/pipeline.js` | 777 | 600 | EXCEPTION | nicht anfassen |
| `scripts/factory/dispatcher.js` | 198 | 600 | 402 | +~82 → ~280 |
| `website/src/lib/factory-floor.ts` | 540 | 600 | 60 | +1–2 (Re-Export) |
| `website/src/components/FactoryFloor.svelte` | 486 | 500 | 14 | 0 — nicht anfassen |
| `website/src/components/FactoryDashboard.svelte` | 70 | 500 | 430 | nicht nötig |
| `website/src/pages/dev-status.astro` | 30 | 400 | 370 | +Panel-Einbindung |
| `website/src/lib/website-db.ts` | 4482 | 600 | EXCEPTION | nicht anfassen |

### Neue Dateien (alle unter Limit)

| Neue Datei | Typ | Limit | geplant |
|------------|-----|-------|---------|
| `scripts/migrations/2026-06-14-factory-run-budget.sql` | sql | — | ~35 |
| `scripts/factory/budget-estimate.sh` | sh | 500 | ~60 |
| `scripts/factory/budget-guard.sh` | sh | 500 | ~80 |
| `website/src/lib/factory-budget.ts` | ts | 600 | ~200 |
| `website/src/components/factory/BudgetPanel.svelte` | svelte | 500 | ~120 |
| `website/src/pages/admin/factory-budget.astro` | astro | 400 | ~120 |
| `website/src/pages/api/factory-budget.ts` | ts | 600 | ~100 |

## Dateistruktur

**Neu:** Migration, 2× `.sh` (estimate, guard), `factory-budget.ts` (DAL),
`factory/BudgetPanel.svelte`, `admin/factory-budget.astro`, `api/factory-budget.ts`.
**Geändert (minimal):** `dispatcher.js` (Guard+Estimate vor `parallel()`),
`factory-floor.ts` (1–2 Zeilen Re-Export), `dev-status.astro` (Panel-Einbindung).

---

## Task 1 — DB-Migration `factory_run_budget`

- [x] Lege `scripts/migrations/2026-06-14-factory-run-budget.sql` an (idempotent,
      `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`):

```sql
CREATE TABLE IF NOT EXISTS tickets.factory_run_budget (
  id          bigserial PRIMARY KEY,
  ticket_id   uuid REFERENCES tickets.tickets(id) ON DELETE CASCADE,
  run_date    date NOT NULL DEFAULT CURRENT_DATE,
  provider    text NOT NULL,  -- 'anthropic'|'deepseek'|'gpu'
  model_id    text NOT NULL,
  phase       text,           -- scout/design/plan/implement/verify/deploy
  tokens_in_est   int,        -- pre-run estimate
  tokens_out_est  int,
  cost_usd_est    numeric(10,6),
  tokens_in_act   int,        -- post-run actual (NULL bis phase done)
  tokens_out_act  int,
  cost_usd_act    numeric(10,6),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS factory_run_budget_ticket_date_idx
  ON tickets.factory_run_budget (ticket_id, run_date);
CREATE INDEX IF NOT EXISTS factory_run_budget_date_provider_idx
  ON tickets.factory_run_budget (run_date, provider);
-- Budget-Limit lebt in factory_control:
--   key='budget-limit-daily-usd', value='5.00'
```

- [x] Migration gegen **beide** Brand-DBs (`workspace` + `workspace-korczewski`) anwendbar
      dokumentieren (cross-brand, siehe CLAUDE.md — separate Deployments).

## Task 2 — Budget-Estimate-Script

- [x] `scripts/factory/budget-estimate.sh <ticket_id> <brand>` (< 500 Zeilen, ~60):
  - [x] Ticket-Effort aus `tickets.tickets` lesen (Fallback: Medium).
  - [x] Provider/Modell aus `tickets.provider_config` lesen (Fallback: Anthropic-Default).
  - [x] Tokens je Phase (Scout/Design/Plan 15k, Implement 50k, Verify/Deploy 20k).
  - [x] Kosten je Provider: Claude in $3 / out $15; DeepSeek in $0.27 / out $1.10;
        GPU $0 (Tokens dennoch geführt) — pro Mtok.
  - [x] Estimate-Rows (`*_est`-Spalten) je Phase in `factory_run_budget` schreiben.
  - [x] JSON ausgeben: `{estimate_usd, tokens_est, provider, model_id}`.
  - [x] Keine Brand-Hostnamen hardcoden; Brand-Namespace/DB über `env-resolve.sh` ableiten.

## Task 3 — Budget-Guard-Script (Hard-Stop)

- [x] `scripts/factory/budget-guard.sh <brand>` (< 500 Zeilen, ~80):
  - [x] `used = SUM(cost_usd_act) WHERE run_date=CURRENT_DATE` aus `factory_run_budget`.
  - [x] `limit = factory_control['budget-limit-daily-usd']`.
  - [x] Kein Limit gesetzt → Exit 0 (unbegrenzt).
  - [x] `used >= limit` → Exit 1 (Hard-Stop).
  - [x] DB nicht erreichbar → **fail-closed** Exit 1.
  - [x] Brand-Auflösung über `env-resolve.sh`; keine Hostnamen hardcoden.

## Task 4 — Dispatcher-Integration

- [x] In `scripts/factory/dispatcher.js` (Ziel ≤ 280 Zeilen) nach Slot-Claim und
      **vor** `parallel(prep.launch.map(...))`:
  - [x] Pro geclaimtem Ticket `budget-guard.sh <brand>` via `execFileSync`.
  - [x] Guard Exit 1 → Ticket-Status `blocked` setzen, `phaseEvent` → `blocked`
        (Detail „daily budget exceeded"), Operator-Notify über bestehenden
        Escalation-Mechanismus, Ticket aus dem Launch-Set entfernen (skip).
  - [x] Guard Exit 0 → `budget-estimate.sh <ticket_id> <brand>` aufrufen
        (best-effort: Fehler loggen, NICHT blockieren), dann normal launchen.
  - [x] `pipeline.js` bleibt unverändert (SANCTIONED EXCEPTION).

## Task 5 — DAL: `factory-budget.ts`

- [x] Neue Datei `website/src/lib/factory-budget.ts` (< 600 Zeilen, ~200):
  - [x] `getDailyBudgetSummary(date?)` → `{ used, limit, byProvider[] }`.
  - [x] `getRunBudgetByTicket(ticketId)` → Phasen-Zeilen (est + act).
  - [x] `getBudgetLimit()` / `setBudgetLimit(usd)` (Letzteres via `writeControl` aus
        `factory-floor.ts`, key `budget-limit-daily-usd`).
  - [x] Typ `FactoryRunBudget` exportieren.
- [x] `website/src/lib/factory-floor.ts`: NUR Re-Export von `FactoryRunBudget`
      (1–2 Zeilen, Budget=60 strikt einhalten).

## Task 6 — Admin-UI

- [x] `website/src/components/factory/BudgetPanel.svelte` (< 500 Zeilen, ~120):
  - [x] Zeigt heutiges Budget used/limit (Balken), Provider-Aufschlüsselung,
        letzte 5 Runs.
  - [x] Holt Daten von `api/factory-budget.ts` (GET). Kein Realtime/Polling.
- [x] `website/src/pages/dev-status.astro` (≤ 400): `BudgetPanel` einbinden
      (NICHT in `FactoryFloor.svelte` — Budget=0).
- [x] `website/src/pages/admin/factory-budget.astro` (< 400 Zeilen, ~120):
  - [x] Admin-geschützt (bestehende Auth/Session-Guard-Konvention der `admin/*`-Seiten).
  - [x] Tages-Limit konfigurierbar (POST an API → `setBudgetLimit`).
  - [x] Tages-Übersicht + per-Ticket-Kosten (`getRunBudgetByTicket`).
  - [x] Keine Brand-Hostnamen hardcoden.

## Task 7 — API-Endpoint

- [x] `website/src/pages/api/factory-budget.ts` (< 600 Zeilen, ~100):
  - [x] `GET` → `getDailyBudgetSummary()` (täglich + Provider-Aufschlüsselung)
        + optional `?ticketId=` → `getRunBudgetByTicket`.
  - [x] `POST` → Limit setzen via `setBudgetLimit`; **Admin-only** → sonst 403.

## Task 8 — Taskfile-Erreichbarkeit (S4)

- [x] Beide neuen `.sh`-Scripts über den Taskfile erreichbar machen
      (z. B. `factory:budget:estimate`, `factory:budget:guard`), inkl. `ENV=`-Passing.
- [x] Migration über bestehenden Migrations-Task / Runbook anwendbar dokumentieren.

## Task 9 — Verifikation (PFLICHT, letzter Task)

- [x] `task test:all`
- [x] `task freshness:regenerate`
- [x] `task freshness:check`
- [x] Manuell: Guard Exit-Codes (Limit gesetzt/überschritten/fehlt/DB-down) prüfen;
      Estimate-JSON validieren; Panel rendert; API GET/POST + 403 ohne Admin.
