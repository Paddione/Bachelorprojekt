---
title: Vereinheitlichte KI-API-Konfiguration — Implementierungsplan
date: 2026-06-14
slug: ki-unified-config
domains: [website]
status: plan_staged
ticket_id: T000711
spec_ref: docs/superpowers/specs/2026-06-14-ki-unified-config-design.md
---

# Plan: Vereinheitlichte KI-API-Konfiguration

Spec: `docs/superpowers/specs/2026-06-14-ki-unified-config-design.md` (Approach A, freigegeben).
TDD durchgehend. S1-Budgets: `.ts`=600, `.svelte`=500, `.astro`=400.
**Budget 0 (baselined):** `tickets-db.ts`(1106) → DDL auslagern (Netto-Reduktion);
`CoachingSettings.svelte`(600) → via Adapter **nicht** modifizieren.
`KiKonfiguration.svelte`(311) → Sub-Komponenten extrahieren, < 500 halten.

## Phase 1 — Katalog + Service-Registry (pure modules)
- [ ] `website/src/lib/ki-catalog.ts` — `KI_CATALOG` + Helper (`interfaceById`, `modelsFor`).
- [ ] `website/src/lib/ki-services.ts` — `KI_SERVICES`, `SOURCE` const.
- [ ] Tests `ki-catalog.test.ts` / `ki-services.test.ts`: Wohlgeformtheit, tier gültig,
      keine Brand-Domain-Literale, jede `ServiceDef.source` referenziert.

## Phase 2 — Source-Mismatch-Fix (Wahl wirkt)
- [ ] `claude.ts`, `assistant/llm.ts`, `ticket-triage.ts`: `SOURCE.*` statt String-Literalen.
- [ ] Regressionstest: `SOURCE.*` == real verwendete Strings (Anti-Drift).
- [ ] `provider-config.test.ts` bleibt grün.

## Phase 3 — Schema-Fusion + Modul-Split
- [ ] Neu `website/src/lib/schema/provider-config-schema.ts`: idempotente DDL
      (CREATE + ADD COLUMN IF NOT EXISTS für brand + Coaching-Felder; tier-CHECK
      `('sonnet','haiku','coaching')`; UNIQUE `(brand,source,tier,priority)`; Index).
- [ ] `tickets-db.ts`: provider_config/health-DDL **entfernen**, neues Modul aufrufen
      (Netto ≤ 0 Zeilen → kein S1-Ratchet-Trip).
- [ ] `.sql`-Spiegel `scripts/migrations/2026-06-10-provider-routing.sql` angleichen
      (+ neue Migration `2026-06-14-coaching-unify.sql`).
- [ ] Test: Schema-Idempotenz via pg-mem.

## Phase 4 — Unified Coaching-Layer + Adapter + Migration
- [ ] Unified Coaching-Funktionen gegen `provider_config` (source=coaching, tier=coaching).
- [ ] `coaching-ki-config-db.ts` → dünner Adapter (gleicher `KiConfig`-Typ/Signaturen).
- [ ] Daten-Migration coaching.ki_config → provider_config + `ki_config_id`-Remap (idempotent).
- [ ] Bestehende `coaching-ki-config-db.test.ts` grün gegen unified store; Migrations-Test
      (überführt korrekt, idempotent) — `vi.hoisted` für pg-mem DML.

## Phase 5 — API
- [ ] `/api/admin/ki/providers(+[id])`: brand + Coaching-Felder; tier=coaching; Katalog-Validierung.
- [ ] Neu `/api/admin/ki/catalog` (GET): Katalog + Registry.
- [ ] `embeddings`-Endpoint: Rerank-Status read-only ergänzen.
- [ ] Endpoint-Tests.

## Phase 6 — UI
- [ ] Sub-Komponenten `KiCard.svelte`, `KiProviderDrawer.svelte`, `KiCoachingDrawer.svelte`.
- [ ] `KiKonfiguration.svelte`: Karten aus `KI_SERVICES`, Katalog-Dropdowns, Coaching-Karte/Drawer; < 500 Z.
- [ ] tote Meetings-/`chat/*`-Karten entfernt.

## Phase 7 — Verifikation
- [ ] `task test:all` grün.
- [ ] `task freshness:regenerate` + `task freshness:check` grün (S1–S4).
- [ ] `task test:inventory` + Inventar committen (Test-Änderungen).
- [ ] Migration auf beide Brand-DBs dokumentieren (workspace + workspace-korczewski).
