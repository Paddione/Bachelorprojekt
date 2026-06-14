---
title: Vereinheitlichte KI-API-Konfiguration
date: 2026-06-14
slug: ki-unified-config
domains: [website]
status: spec
ticket_id: T000711
plan_ref: docs/superpowers/plans/2026-06-14-ki-unified-config.md
---

# Vereinheitlichte KI-API-Konfiguration

## Ziel

Im Admin-Dashboard `/admin/ki-konfiguration` ("Homepage" des Betreibers) kann für **jeden**
KI-gestützten Dienst aus einem **kuratierten Katalog** der angebotenen API-Schnittstellen
gewählt werden — und die Wahl **wirkt** real im Runtime-Routing. Coaching wird physisch in
dasselbe Datenmodell fusioniert (Approach A, vom User gewählt).

## Problemstellung (Ist-Zustand)

1. **Source-Mismatch (Wahl wirkt nicht):** Die Dashboard-Karten konfigurieren die Sources
   `chat/*`, `tickets/classify`, `meetings/*`. Die Runtime fragt aber mit `website-llm`,
   `assistant-chat`, `ticket-triage` ab (`getProviderConfig`, exakte Gleichheit, kein
   Wildcard-Expand). Ergebnis: außer dem `*`-Fallback greifen die Karten-Einträge real nicht.
   Für "Meetings" existiert überhaupt kein Runtime-Pfad (tote Karte).
2. **Provider ist Freitext:** Kein definierter Katalog der "angebotenen Schnittstellen" —
   "wählen" ist heute "einen String tippen".
3. **Coaching ist ein separates Silo:** `coaching.ki_config` (brand-scoped, single-active,
   reiche Generierungs-Parameter, pro Zeile gespeicherte API-Keys, Per-Session-Override via
   FK `coaching_sessions.ki_config_id`). Im Dashboard nur verlinkt, nicht im selben Modell.

## Schlüsseldateien (Ist)

| Datei | Zweck |
|-------|-------|
| `website/src/components/admin/KiKonfiguration.svelte` | 4-Karten-Dashboard + Drawer (311 Z.) |
| `website/src/pages/admin/ki-konfiguration.astro` | Admin-Seite (SSO/Admin-gated) |
| `website/src/lib/provider-config.ts` | `getProviderConfig(source, tier)` — globales Routing |
| `website/src/lib/tickets-db.ts` | autoritative idempotente DDL `initTicketsSchema()` |
| `scripts/migrations/2026-06-10-provider-routing.sql` | DDL-Spiegel (manueller bring-up) |
| `website/src/lib/coaching-ki-config-db.ts` | Coaching-KI DB-Layer + `KiConfig`-Typ |
| `website/src/lib/coaching-session-db.ts` | Coaching-Sessions, FK `ki_config_id` |
| `website/src/lib/session-agent-factory.ts`, `session-agent.ts` | Agent aus `KiConfig` bauen |
| `website/src/pages/api/admin/coaching/ki-config/{index,active,[id]}.ts` | Coaching-KI Endpoints |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | nutzt `getActiveProvider`/`getKiProviderById` |
| `website/src/components/admin/coaching/CoachingSettings.svelte` | Coaching-KI Admin-UI |
| `website/src/lib/claude.ts` | `getProviderConfig('website-llm','sonnet')` |
| `website/src/lib/assistant/llm.ts` | `getProviderConfig('assistant-chat','sonnet')` |
| `website/src/lib/ticket-triage.ts` | `getProviderConfig('ticket-triage','haiku')` |
| `website/src/pages/api/admin/ki/{providers,providers/[id],env-status,embeddings}.ts` | KI-Endpoints |

## Datenmodell — Fusion in `tickets.provider_config`

Erweiterung (autoritativ in `tickets-db.ts initTicketsSchema()`, gespiegelt in der
`.sql`-Migration), alle Coaching-Felder **nullable**:

```sql
ALTER TABLE tickets.provider_config
  ADD COLUMN IF NOT EXISTS brand            TEXT NOT NULL DEFAULT '*',
  ADD COLUMN IF NOT EXISTS is_active        BOOLEAN,
  ADD COLUMN IF NOT EXISTS display_name     TEXT,
  ADD COLUMN IF NOT EXISTS api_key          TEXT,
  ADD COLUMN IF NOT EXISTS api_endpoint     TEXT,
  ADD COLUMN IF NOT EXISTS temperature      NUMERIC,
  ADD COLUMN IF NOT EXISTS max_tokens       INTEGER,
  ADD COLUMN IF NOT EXISTS top_p            NUMERIC,
  ADD COLUMN IF NOT EXISTS top_k            INTEGER,
  ADD COLUMN IF NOT EXISTS system_prompt    TEXT,
  ADD COLUMN IF NOT EXISTS notes            TEXT,
  ADD COLUMN IF NOT EXISTS thinking_mode    BOOLEAN,
  ADD COLUMN IF NOT EXISTS presence_penalty NUMERIC,
  ADD COLUMN IF NOT EXISTS frequency_penalty NUMERIC,
  ADD COLUMN IF NOT EXISTS safe_prompt      BOOLEAN,
  ADD COLUMN IF NOT EXISTS random_seed      INTEGER,
  ADD COLUMN IF NOT EXISTS organization_id  TEXT,
  ADD COLUMN IF NOT EXISTS eu_endpoint      BOOLEAN,
  ADD COLUMN IF NOT EXISTS enabled_fields   JSONB;
```

- **tier-CHECK** erweitern: `CHECK (tier IN ('sonnet','haiku','coaching'))`. Coaching-Rows
  nutzen `tier='coaching'`.
- **UNIQUE** von `(source, tier, priority)` → `(brand, source, tier, priority)`. Bestehende
  globale Rows bekommen `brand='*'`. Constraint guarded neu anlegen (DROP IF EXISTS / ADD).
- **Index** für Coaching-Lookup: `(brand, source, is_active)`.
- `brand='*'` markiert globale Routing-Rows (Semantik von `getProviderConfig` unverändert:
  liest weiter `source=$1 OR '*'` + `tier IN ('sonnet','haiku')`, ignoriert Coaching-Rows).

## Migration (idempotent, reversibel-sicher)

1. Idempotente DDL (ADD COLUMN IF NOT EXISTS; Constraint guarded).
2. Daten-Migration `coaching.ki_config` → `provider_config`:
   - `source='coaching'`, `tier='coaching'`, `brand=<brand>`, `provider/model_id` aus
     `provider/model_name`, alle Coaching-Felder kopiert, `priority` = stabile Reihenfolge
     (z.B. `id`), `enabled=true`.
   - Idempotent via Dedup auf `(brand, source='coaching', provider)`
     (`ON CONFLICT DO NOTHING` bzw. NOT EXISTS-Guard).
3. **FK-Remap:** `coaching_sessions.ki_config_id` zeigt heute auf `coaching.ki_config.id`.
   Im selben TX-Block: Mapping (alte ki_config.id → neue provider_config.id) erzeugen und
   `coaching_sessions.ki_config_id` per UPDATE umsetzen; FK auf `provider_config(id)`
   repointen. Idempotenz: nur remappen, was noch auf den alten ID-Raum zeigt.
4. `coaching.ki_config` **bleibt** bestehen (kein Drop) — Rollback-Sicherheit; Drop erst Phase 2.
5. Anwenden auf **beide** Brand-DBs (`workspace` + `workspace-korczewski`).

## Kuratierter Katalog — `website/src/lib/ki-catalog.ts` (pure module)

```ts
export type InterfaceKind = 'chat' | 'embed' | 'rerank';
export type ParamKey =
  | 'temperature' | 'maxTokens' | 'topP' | 'topK' | 'systemPrompt'
  | 'presencePenalty' | 'frequencyPenalty' | 'safePrompt' | 'randomSeed'
  | 'organizationId' | 'euEndpoint' | 'thinkingMode';

export interface InterfaceDef {
  id: string;                 // 'anthropic' | 'deepseek' | 'local-llm' | 'openai' | 'mistral' | 'lumo' | 'voyage' | 'custom'
  label: string;
  kinds: InterfaceKind[];
  suggestedModels: { id: string; label: string; tier?: 'sonnet' | 'haiku' }[];
  defaultBaseUrl?: string;
  apiKeyEnv?: string;         // ENV-Quelle für globale Rows
  perRowApiKey?: boolean;     // Coaching: Key pro Zeile
  supportsParams?: ParamKey[];// welche Felder das Coaching-Drawer zeigt
  custom?: boolean;           // Freitext-Override erlaubt
}
export const KI_CATALOG: InterfaceDef[];
```

Dashboard-Provider/Modell werden Dropdowns aus diesem Katalog (Freitext-Override nur für `custom`).
Reine Daten + Helper (`interfaceById`, `modelsFor`) — keine Imports, die Zyklen erzeugen (S2).

## Service-Registry (SSOT) — `website/src/lib/ki-services.ts` (pure module)

```ts
export interface ServiceDef {
  key: string;        // 'website-llm' | 'assistant-chat' | 'ticket-triage' | 'coaching'
  label: string; icon: string;
  source: string;     // exakter provider_config.source (== Runtime-Call-Site)
  tier: 'sonnet' | 'haiku' | 'coaching';
  brandScoped: boolean;
  paramSet: 'routing' | 'coaching';
}
export const KI_SERVICES: ServiceDef[];
export const SOURCE = {
  websiteLlm: 'website-llm',
  assistantChat: 'assistant-chat',
  ticketTriage: 'ticket-triage',
  coaching: 'coaching',
} as const;
```

- Runtime-Call-Sites (`claude.ts`, `assistant/llm.ts`, `ticket-triage.ts`) importieren
  `SOURCE.*` statt String-Literalen → Mismatch dauerhaft behoben, kein Drift.
- `KiKonfiguration.svelte` rendert Karten aus `KI_SERVICES` (statt hardcoded `CARDS`).
  Tote/falsche Karten (Meetings, `chat/*`, `tickets/classify`) verschwinden bzw. werden korrekt.

## Backend — unified DB-Layer

- `provider-config.ts`: `getProviderConfig(source, tier)` **unverändert** (globales Routing,
  liest nur `tier IN ('sonnet','haiku')` / ignoriert Coaching-Rows; brand bleibt für globale
  Rows `'*'`).
- Neue unified Coaching-Funktionen (in `ki-config-db.ts` oder erweitert): `listForService`,
  `getActiveProvider(brand)`, `getProviderById(id)`, `setActiveProvider(brand, id)`, CRUD —
  alle gegen `provider_config` mit `source='coaching'`, `tier='coaching'`.
- **Adapter:** `coaching-ki-config-db.ts` wird ein dünner Adapter, der den bestehenden
  `KiConfig`-Typ + dieselben Funktionssignaturen über den unified store bereitstellt. So
  bleiben `coaching-session-db.ts`, `session-agent-factory.ts`, `session-agent.ts`,
  `generate.ts`, die Coaching-Endpoints und `CoachingSettings.svelte` funktionsfähig
  (minimaler Blast-Radius trotz physischer Fusion).

## API-Endpoints

- `/api/admin/ki/providers` (GET/POST) + `[id]` (PUT/DELETE): um `brand` + Coaching-Felder
  erweitern; `tier='coaching'` akzeptieren; Validierung gegen Katalog (provider ∈ Katalog
  oder `custom`).
- Neu `/api/admin/ki/catalog` (GET): liefert `KI_CATALOG` + `KI_SERVICES` fürs Dashboard.
- `/api/admin/ki/embeddings` (GET/PUT) bleibt (ENV/pod-restart-gated). Rerank-Status
  (`LLM_RERANK_ENABLED`) read-only zur Embeddings-Karte ergänzen.
- Coaching-Endpoints `/api/admin/coaching/ki-config/*` bleiben (über Adapter), Drop/Deprecate
  Phase 2.

## UI — `KiKonfiguration.svelte`

- Karten aus `KI_SERVICES` + Embeddings-Sonderkarte (ENV) + Coaching wird **echte Karte/Drawer**
  (nicht mehr Link-out).
- Provider + Modell als **Dropdown aus Katalog**; Drawer-Felder je `paramSet`:
  - `routing`: tier / priority / max_concurrent / base_url / enabled (wie heute).
  - `coaching`: provider (Katalog) / model / api_key / api_endpoint / temperature /
    system_prompt / penalties / eu_endpoint / single-active-Radio.
- **S1-Risiko:** Datei ist 311 Z. → Auslagern der wachsenden Teile in Sub-Komponenten
  `KiCard.svelte`, `KiProviderDrawer.svelte`, `KiCoachingDrawer.svelte`, damit die Hauptdatei
  **schrumpft** statt zu wachsen (kein kosmetisches Zusammenziehen).

## Brand-Verhalten

Beide Brands teilen das Dashboard. Globale Routing-Rows sind brand-agnostisch (`brand='*'`),
Coaching-Rows sind brand-scoped (`brand`-Spalte). Migration + Deploy auf **beide** DBs.

## Tests (TDD)

- **Katalog/Registry-Integrität:** jede `ServiceDef.source` entspricht einem realen
  Runtime-Call-Site-String; jede `tier` gültig; jeder Katalog-Eintrag well-formed.
- **Source-Mismatch-Regressionstest:** `SOURCE.*` == die in `claude.ts` /
  `assistant/llm.ts` / `ticket-triage.ts` verwendeten Strings (verhindert künftigen Drift).
- **`getProviderConfig`** bleibt grün (unverändertes Routing-Verhalten, ignoriert Coaching-Rows).
- **Adapter-Äquivalenz:** bestehende `coaching-ki-config-db.test.ts` läuft gegen unified store
  grün (gleiche Semantik: single-active, CRUD, Custom-Provider-Schutz).
- **Migration:** Coaching-Rows korrekt überführt, `ki_config_id`-Remap korrekt, **idempotent**
  (zweimal anwenden = stabil) — via pg-mem (DML-Tests brauchen `vi.hoisted`).
- **API:** provider-Validierung gegen Katalog; Coaching-Felder round-trip.
- (Optional) E2E: Dashboard zeigt alle Services, Auswahl persistiert + wirkt.

## Verifikation (finaler Plan-Task)

`task test:all` + `task freshness:regenerate` + `task freshness:check` (S1–S4-Ratchet);
nach Test-Änderungen `task test:inventory` + Commit des Inventars. Migration auf beide
Brand-DBs dokumentieren.

## Out of Scope (Phase 2)

- Drop von `coaching.ki_config` (erst nach Stabilitätsnachweis).
- Admin-pflegbarer Katalog (Katalog bleibt code-gepflegt).
- Meetings-LLM-Routing (kein Runtime-Pfad vorhanden → Karte entfällt).
- Embeddings/Rerank in Katalog-Auswahl überführen (bleiben ENV/pod-restart-gated).
