---
title: KI-Provider-Auswahl pro Sektion + GPU-Worker-Integration Implementation Plan
ticket_id: T000716
domains: [website, infra, db, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# KI-Provider-Auswahl pro Sektion + GPU-Worker-Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two localhost GPU-worker providers (`local-lmstudio`, `local-ollama`) to the KI catalog, rename the cluster provider `local-llm` → `local-cluster`, surface a GPU-worker reachability badge on `/admin/ki-konfiguration`, auto-fill `base_url` from the catalog when a localhost provider is picked, and make Coaching's provider field-mapping catalog-driven instead of a hardcoded 3-provider map.

**Architecture:** Pure data change in `ki-catalog.ts` (no new imports — stays S2-clean). The existing `/api/admin/ki/catalog` endpoint already streams `KI_CATALOG` to the dashboard dropdown, so new entries appear automatically. `env-status.ts` gains a server-side `localGpu` reachability probe (1 s timeout via `AbortSignal.timeout`) consumed by a new banner segment in `KiKonfiguration.svelte`. `CoachingSettings.svelte` swaps its hardcoded `KNOWN_FIELD_MAP`/`PROVIDER_BADGE` for a catalog-derived field resolver — **net line-neutral or shrinking** because this file is baselined at 600 (budget 0).

**Tech Stack:** Astro 5 API routes, Svelte 5 (runes: `$state`/`$derived`/`$effect`/`$props`), Vitest, TypeScript. No DB schema change.

---

## Ground Truth (read before starting — spec drifted from code)

The design spec (`docs/superpowers/specs/2026-06-14-ki-provider-selection-design.md`) was written against an **idealized** schema. The real code differs — this plan follows the **real code**:

| Spec said | Reality (use this) |
|-----------|--------------------|
| catalog field `kind` | `kinds: InterfaceKind[]` |
| catalog field `availableModels: string[]` | `suggestedModels: CatalogModel[]` (`{id,label,tier?}`) |
| catalog fields `apiKeyEnv: null`, `customEndpoint`, `perRowApiKey` | `apiKeyEnv?: string` (omit, not null), `custom?: boolean`, `perRowApiKey?: boolean`, `supportsParams?: ParamKey[]` |
| `KNOWN_FIELD_MAP` lives in `KiKonfiguration` | lives in `website/src/components/admin/coaching/CoachingSettings.svelte` (note `/coaching/` subdir) |
| `resolveProviderEndpoint` in `provider-config.ts` | actual fn is `getProviderConfig(source, tier)`; **no runtime change needed** — see Task 6 note |
| env-status returns `localGpu` only | env-status currently returns `{ANTHROPIC_API_KEY, VOYAGE_API_KEY, LLM_ENABLED, LLM_HOST_IP}`; we ADD `localGpu`, keep the rest |

**No DB migration. DeepSeek is already priority=1.** The "optional default rows" in `provider-config-schema.ts` are **descoped** (Task 5 explains why — adding INSERT rows there would be untested behaviour with no UI requirement; the table already accepts arbitrary `provider` strings).

---

## Quality-Gate Budgets (S1 ratchet — verified against `docs/code-quality/baseline.json`)

All files non-baselined EXCEPT CoachingSettings. Static limits: `.ts`=600, `.svelte`=500, `.astro`=400.

| File | Ext | Ist | Baseline | Wirksame Schwelle | **Budget** | Strategie |
|------|-----|-----|----------|-------------------|------------|-----------|
| `website/src/lib/ki-catalog.ts` | .ts | 138 | nicht-baselined | 600 | +462 | +2 Provider, rename 1 — trivial |
| `website/src/pages/api/admin/ki/env-status.ts` | .ts | 19 | nicht-baselined | 600 | +581 | +localGpu probe |
| `website/src/components/admin/KiKonfiguration.svelte` | .svelte | 339 | nicht-baselined | 500 | +161 | +badge, +autofill |
| `website/src/components/admin/coaching/CoachingSettings.svelte` | .svelte | **600** | **600** | **600** | **0** ⚠️ | **MUSS netto zeilenneutral oder kleiner** |
| `website/src/lib/schema/provider-config-schema.ts` | .ts | 68 | nicht-baselined | 600 | (descoped) | keine Änderung |
| `website/src/lib/ki-catalog.test.ts` | .ts | 53 | nicht-baselined | 600 | +547 | rename + neue Asserts |
| `website/src/pages/api/admin/ki/env-status.test.ts` | .ts | 37 | nicht-baselined | 600 | +563 | +localGpu tests |

⚠️ **CoachingSettings.svelte budget is 0.** The dynamic-mapper swap removes the `KNOWN_FIELD_MAP` (5 lines) + `PROVIDER_BADGE` (3 lines) constants and the `showField`/`providerBadgeLabel` bodies, replacing them with a catalog-derived resolver of **equal or fewer lines**. Verify with `wc -l` after editing (Task 4, Step 8); if the file grew by even 1 line, tighten the new code until `wc -l ≤ 600`. Do **not** add a baseline/ignore entry — `freshness:check` key-count assertion fails on baseline growth.

S2 (no import cycles): `ki-catalog.ts` stays a pure data module (zero imports). Coaching resolver imports only from `ki-catalog` (already a leaf). S3 (no brand-domain literals): all new strings are `localhost`/`api.deepseek.com` — no `*.mentolder.de`/`*.korczewski.de`. S4 (orphans): no new manifests/scripts.

---

### Task 1: Catalog — add `local-lmstudio` + `local-ollama`, rename `local-llm` → `local-cluster`

**Files:**
- Modify: `website/src/lib/ki-catalog.ts:70-80` (the `local-llm` entry)
- Test: `website/src/lib/ki-catalog.test.ts`

- [ ] **Step 1: Update the catalog test first (rename + new-provider assertions)**

In `website/src/lib/ki-catalog.test.ts`, the existing `arrayContaining` list still names `local-llm`, which will fail after the rename. Replace the first two `it` blocks' relevant lines and add a new block. Apply these exact edits:

Replace (lines 6-10):
```typescript
  it('enthält die angebotenen Provider', () => {
    const ids = KI_CATALOG.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining(['anthropic', 'deepseek', 'local-llm', 'openai', 'mistral', 'voyage', 'custom']),
    );
  });
```
with:
```typescript
  it('enthält die angebotenen Provider', () => {
    const ids = KI_CATALOG.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'anthropic', 'deepseek', 'local-cluster', 'local-lmstudio', 'local-ollama',
        'openai', 'mistral', 'voyage', 'custom',
      ]),
    );
  });

  it('hat KEINEN alten local-llm-Eintrag mehr (umbenannt zu local-cluster)', () => {
    expect(interfaceById('local-llm')).toBeUndefined();
    expect(interfaceById('local-cluster')).toBeDefined();
  });

  it('GPU-Worker-Provider zeigen auf localhost und brauchen keinen API-Key', () => {
    const lm = interfaceById('local-lmstudio')!;
    const ol = interfaceById('local-ollama')!;
    expect(lm.defaultBaseUrl).toBe('http://localhost:1234/v1');
    expect(ol.defaultBaseUrl).toBe('http://localhost:11434/v1');
    expect(lm.apiKeyEnv).toBeUndefined();
    expect(ol.apiKeyEnv).toBeUndefined();
    expect(lm.perRowApiKey).toBeFalsy();
    expect(ol.perRowApiKey).toBeFalsy();
    expect(lm.kinds).toContain('chat');
    expect(ol.kinds).toContain('chat');
  });
```

- [ ] **Step 2: Run the catalog tests — verify they FAIL**

Run: `cd /tmp/wt-ki-provider-selection/website && npx vitest run src/lib/ki-catalog.test.ts`
Expected: FAIL — `local-cluster`/`local-lmstudio`/`local-ollama` not found; `local-llm` still defined.

- [ ] **Step 3: Edit the catalog — rename + two new entries**

In `website/src/lib/ki-catalog.ts`, replace the entire `local-llm` block (lines 70-80):
```typescript
  {
    id: 'local-llm',
    label: 'Lokales LLM (llm-router / Ollama)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'llama3.1', label: 'Llama 3.1' },
    ],
    defaultBaseUrl: 'http://llm-gateway-chat.workspace.svc.cluster.local:11434/v1',
    supportsParams: COMMON_PARAMS,
  },
```
with:
```typescript
  {
    id: 'local-cluster',
    label: 'Lokales LLM — Cluster (llm-router)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'llama3.1', label: 'Llama 3.1' },
    ],
    defaultBaseUrl: 'http://llm-gateway-chat.workspace.svc.cluster.local:11434/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'local-lmstudio',
    label: 'LM Studio (GPU-Worker localhost:1234)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5-7b', label: 'Qwen 2.5 7B' },
      { id: 'deepseek-r1-7b', label: 'DeepSeek R1 7B' },
      { id: 'llama-3.1-8b', label: 'Llama 3.1 8B' },
      { id: 'mistral-7b', label: 'Mistral 7B' },
    ],
    defaultBaseUrl: 'http://localhost:1234/v1',
    supportsParams: COMMON_PARAMS,
  },
  {
    id: 'local-ollama',
    label: 'Ollama (GPU-Worker localhost:11434)',
    kinds: ['chat'],
    suggestedModels: [
      { id: 'qwen2.5', label: 'Qwen 2.5' },
      { id: 'llama3.1', label: 'Llama 3.1' },
      { id: 'mistral', label: 'Mistral' },
      { id: 'deepseek-r1', label: 'DeepSeek R1' },
    ],
    defaultBaseUrl: 'http://localhost:11434/v1',
    supportsParams: COMMON_PARAMS,
  },
```

- [ ] **Step 4: Run the catalog tests — verify they PASS**

Run: `cd /tmp/wt-ki-provider-selection/website && npx vitest run src/lib/ki-catalog.test.ts`
Expected: PASS (all blocks incl. the new ones; the existing "S3 no brand domains", "unique ids", "exactly one custom" blocks still pass).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-ki-provider-selection
git add website/src/lib/ki-catalog.ts website/src/lib/ki-catalog.test.ts
git commit -m "feat(ki-catalog): add local-lmstudio/local-ollama, rename local-llm->local-cluster"
```

---

### Task 2: env-status — GPU-worker reachability probe

**Files:**
- Modify: `website/src/pages/api/admin/ki/env-status.ts` (whole file)
- Test: `website/src/pages/api/admin/ki/env-status.test.ts`

**Design:** A server-side helper `checkLocalEndpoint(url)` does `fetch(url, { signal: AbortSignal.timeout(1000) })`, parses the OpenAI-style `{ data: [{id}, ...] }` model list on 2xx, and returns `{ reachable: boolean, models?: string[] }`. Any throw (timeout, ECONNREFUSED, parse error) → `{ reachable: false }` — **fail-soft is correct here** (the provider stays selectable; this is a connectivity hint, not an auth gate). The two probes run with `Promise.all`. The response adds a `localGpu` object alongside the existing keys.

- [ ] **Step 1: Rewrite the env-status test to cover localGpu (extend existing file)**

Replace the entire contents of `website/src/pages/api/admin/ki/env-status.test.ts` with:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const session = { sub: 'u1', preferred_username: 'admin', roles: ['admin'] };
const getSession = vi.fn();
const isAdmin = vi.fn();
vi.mock('../../../../lib/auth', () => ({
  getSession: (...a: unknown[]) => getSession(...a),
  isAdmin: (...a: unknown[]) => isAdmin(...a),
}));

import { GET } from './env-status';

const req = () => new Request('http://t/api/admin/ki/env-status', { headers: { cookie: 'x' } });
const ENV = { ...process.env };
const realFetch = global.fetch;

beforeEach(() => { getSession.mockReset(); isAdmin.mockReset(); });
afterEach(() => { process.env = { ...ENV }; global.fetch = realFetch; vi.restoreAllMocks(); });

it('401 without session', async () => {
  getSession.mockResolvedValue(null);
  expect((await GET({ request: req() } as never)).status).toBe(401);
});

it('reports booleans and host ip, never the secret value', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  process.env.ANTHROPIC_API_KEY = 'sk-secret';
  delete process.env.VOYAGE_API_KEY;
  process.env.LLM_ENABLED = 'true';
  process.env.LLM_HOST_IP = '10.0.0.3';
  global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.ANTHROPIC_API_KEY).toBe(true);
  expect(json.VOYAGE_API_KEY).toBe(false);
  expect(json.LLM_ENABLED).toBe(true);
  expect(json.LLM_HOST_IP).toBe('10.0.0.3');
  expect(JSON.stringify(json)).not.toContain('sk-secret');
});

it('localGpu: lmstudio reachable returns model ids, ollama unreachable returns reachable:false', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  global.fetch = vi.fn().mockImplementation((url: string) => {
    if (url.includes('1234')) {
      return Promise.resolve(new Response(
        JSON.stringify({ data: [{ id: 'qwen2.5-7b' }, { id: 'mistral-7b' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    }
    return Promise.reject(new Error('ECONNREFUSED'));
  }) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.localGpu.lmstudio.reachable).toBe(true);
  expect(json.localGpu.lmstudio.models).toEqual(['qwen2.5-7b', 'mistral-7b']);
  expect(json.localGpu.ollama.reachable).toBe(false);
});

it('localGpu: non-2xx response counts as unreachable', async () => {
  getSession.mockResolvedValue(session); isAdmin.mockReturnValue(true);
  global.fetch = vi.fn().mockResolvedValue(new Response('nope', { status: 500 })) as never;
  const json = await (await GET({ request: req() } as never)).json();
  expect(json.localGpu.lmstudio.reachable).toBe(false);
  expect(json.localGpu.ollama.reachable).toBe(false);
});
```

- [ ] **Step 2: Run env-status tests — verify they FAIL**

Run: `cd /tmp/wt-ki-provider-selection/website && npx vitest run src/pages/api/admin/ki/env-status.test.ts`
Expected: FAIL — `json.localGpu` is undefined.

- [ ] **Step 3: Rewrite env-status.ts with the localGpu probe**

Replace the entire contents of `website/src/pages/api/admin/ki/env-status.ts` with:
```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

interface LocalEndpointStatus { reachable: boolean; models?: string[]; }

// Server-side reachability probe for the local GPU worker. Fail-soft: any error
// (timeout/ECONNREFUSED/parse) → reachable:false. The provider stays selectable;
// this is only a UI hint, never an auth gate. 1s timeout to keep the page snappy.
async function checkLocalEndpoint(url: string): Promise<LocalEndpointStatus> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(1000) });
    if (!res.ok) return { reachable: false };
    const body = await res.json().catch(() => null) as { data?: { id?: string }[] } | null;
    const models = Array.isArray(body?.data)
      ? body!.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string')
      : undefined;
    return { reachable: true, ...(models && models.length ? { models } : {}) };
  } catch {
    return { reachable: false };
  }
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  if (!isAdmin(session)) return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });

  const has = (k: string) => Boolean(process.env[k] && process.env[k]!.trim());
  const [lmstudio, ollama] = await Promise.all([
    checkLocalEndpoint('http://localhost:1234/v1/models'),
    checkLocalEndpoint('http://localhost:11434/v1/models'),
  ]);
  const body = {
    ANTHROPIC_API_KEY: has('ANTHROPIC_API_KEY'),
    VOYAGE_API_KEY: has('VOYAGE_API_KEY'),
    LLM_ENABLED: process.env.LLM_ENABLED === 'true',
    LLM_HOST_IP: process.env.LLM_HOST_IP?.trim() || null,
    localGpu: { lmstudio, ollama },
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 4: Run env-status tests — verify they PASS**

Run: `cd /tmp/wt-ki-provider-selection/website && npx vitest run src/pages/api/admin/ki/env-status.test.ts`
Expected: PASS (all four `it` blocks).

- [ ] **Step 5: Commit**

```bash
cd /tmp/wt-ki-provider-selection
git add website/src/pages/api/admin/ki/env-status.ts website/src/pages/api/admin/ki/env-status.test.ts
git commit -m "feat(ki/env-status): add localGpu reachability probe for LM Studio + Ollama"
```

---

### Task 3: KiKonfiguration.svelte — GPU-worker badge + base_url autofill

**Files:**
- Modify: `website/src/components/admin/KiKonfiguration.svelte` (interface `EnvStatus` ~13-16, banner ~195-201, import line 3, form provider `<select>` ~286-289)

**Design:** Two independent changes, no new test (Svelte component has no unit test; covered by Vitest catalog/env-status tests + manual check). (1) Extend the `EnvStatus` interface with `localGpu` and render a third banner row. (2) When the provider `<select>` changes to a catalog entry whose `defaultBaseUrl` is set AND the current `base_url` is empty, prefill it from the catalog (editable).

- [ ] **Step 1: Extend the `EnvStatus` interface**

In `website/src/components/admin/KiKonfiguration.svelte`, replace the interface (lines 13-16):
```typescript
  interface EnvStatus {
    ANTHROPIC_API_KEY: boolean; VOYAGE_API_KEY: boolean;
    LLM_ENABLED: boolean; LLM_HOST_IP: string | null;
  }
```
with:
```typescript
  interface LocalGpuStatus { reachable: boolean; models?: string[]; }
  interface EnvStatus {
    ANTHROPIC_API_KEY: boolean; VOYAGE_API_KEY: boolean;
    LLM_ENABLED: boolean; LLM_HOST_IP: string | null;
    localGpu?: { lmstudio: LocalGpuStatus; ollama: LocalGpuStatus };
  }
```

- [ ] **Step 2: Import `interfaceById` from the catalog (for autofill)**

Replace the import (line 3):
```typescript
  import { modelsFor, type InterfaceDef } from '../../lib/ki-catalog';
```
with:
```typescript
  import { modelsFor, interfaceById, type InterfaceDef } from '../../lib/ki-catalog';
```

- [ ] **Step 3: Add the base_url autofill handler**

Add this function immediately after `blankForm()` (after line 48, before `cardFor`):
```typescript
  // When a GPU-worker / cluster provider is chosen and base_url is still empty,
  // prefill it from the catalog default (stays editable for advanced use).
  function onProviderChange() {
    const def = interfaceById(form.provider);
    if (def?.defaultBaseUrl && !form.base_url.trim()) {
      form.base_url = def.defaultBaseUrl;
    }
  }
```

- [ ] **Step 4: Wire the handler into the provider `<select>`**

Replace the provider select (lines 286-289):
```svelte
    <select bind:value={form.provider}>
      <option value="" disabled>— Schnittstelle wählen —</option>
      {#each catalog as ic (ic.id)}<option value={ic.id}>{ic.label}</option>{/each}
    </select>
```
with:
```svelte
    <select bind:value={form.provider} onchange={onProviderChange}>
      <option value="" disabled>— Schnittstelle wählen —</option>
      {#each catalog as ic (ic.id)}<option value={ic.id}>{ic.label}</option>{/each}
    </select>
```

- [ ] **Step 5: Add the GPU-worker banner row**

Replace the keys banner block (lines 195-201):
```svelte
  {#if env}
    <div class="banner keys">
      <span>ANTHROPIC_API_KEY {env.ANTHROPIC_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>VOYAGE_API_KEY {env.VOYAGE_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>LLM {env.LLM_ENABLED ? `✓ (${env.LLM_HOST_IP ?? 'kein Host'})` : 'aus'}</span>
    </div>
  {/if}
```
with:
```svelte
  {#if env}
    <div class="banner keys">
      <span>ANTHROPIC_API_KEY {env.ANTHROPIC_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>VOYAGE_API_KEY {env.VOYAGE_API_KEY ? '✓' : '⚠ fehlt'}</span>
      <span>LLM {env.LLM_ENABLED ? `✓ (${env.LLM_HOST_IP ?? 'kein Host'})` : 'aus'}</span>
    </div>
    {#if env.localGpu}
      <div class="banner gpu">
        <span class="gpu-pill {env.localGpu.lmstudio.reachable ? 'on' : 'off'}">
          LM Studio {env.localGpu.lmstudio.reachable
            ? `✓ (${env.localGpu.lmstudio.models?.length ?? 0} Modelle)`
            : 'nicht erreichbar'}
        </span>
        <span class="gpu-pill {env.localGpu.ollama.reachable ? 'on' : 'off'}">
          Ollama {env.localGpu.ollama.reachable
            ? `✓ (${env.localGpu.ollama.models?.length ?? 0} Modelle)`
            : 'nicht erreichbar'}
        </span>
      </div>
    {/if}
  {/if}
```

- [ ] **Step 6: Add styles for the GPU banner**

In the `<style>` block, find the existing `.banner` rule and add these rules immediately after it (search for `.banner` to locate; if a `.banner.keys` rule exists, add after that). Insert:
```css
  .banner.gpu { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.4rem; }
  .gpu-pill { font-size: 0.78rem; padding: 0.2rem 0.6rem; border-radius: 99px; border: 1px solid; }
  .gpu-pill.on { color: #4ade80; border-color: #16a34a44; background: #16a34a22; }
  .gpu-pill.off { color: #a1a1aa; border-color: #52525b44; background: #52525b22; }
```

- [ ] **Step 7: Typecheck the website (Svelte + TS)**

Run: `cd /tmp/wt-ki-provider-selection/website && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | tail -20`
Expected: no NEW errors referencing `KiKonfiguration.svelte`, `localGpu`, `onProviderChange`, or `EnvStatus`. (Pre-existing repo-wide warnings unrelated to these symbols are acceptable — compare against a clean `git stash` run if unsure.)

- [ ] **Step 8: Verify line budget (limit 500)**

Run: `cd /tmp/wt-ki-provider-selection && wc -l website/src/components/admin/KiKonfiguration.svelte`
Expected: well under 500 (≈360). If somehow ≥500, that's a hard CI fail — but with ~20 added lines from 339 this cannot happen.

- [ ] **Step 9: Commit**

```bash
cd /tmp/wt-ki-provider-selection
git add website/src/components/admin/KiKonfiguration.svelte
git commit -m "feat(ki-konfiguration): GPU-worker reachability badge + base_url autofill from catalog"
```

---

### Task 4: CoachingSettings.svelte — catalog-driven field mapper (budget 0 — net line-neutral)

**Files:**
- Modify: `website/src/components/admin/coaching/CoachingSettings.svelte` (import block top, `KNOWN_FIELD_MAP` lines 86-95, `PROVIDER_BADGE` lines 97-103)

⚠️ **This file is baselined at 600 lines, budget 0.** The swap removes the hardcoded `KNOWN_FIELD_MAP` (record + body) and `PROVIDER_BADGE` (record + body) and replaces them with a catalog-derived resolver. The new code MUST be ≤ the removed code. Step 8 verifies `wc -l ≤ 600`.

**Design:** Coaching field keys (`apiKey`, `apiEndpoint`, `modelName`, `temperature`, `maxTokens`, `topP`, `topK`, `thinkingMode`, `presencePenalty`, `frequencyPenalty`, `safePrompt`, `randomSeed`, `organizationId`, `euEndpoint`, `systemPrompt`, `notes`) map onto catalog `ParamKey`s + a few always-on fields. A pure mapper `fieldsForCatalog(def)` derives the enabled-field list from `def.supportsParams` + `def.perRowApiKey`/`apiKeyEnv` + `def.custom`. The existing `showField(p, field)` keeps its `p.enabledFields !== null` branch (custom providers store their own field list) and only changes its fallback to consult the catalog. `providerBadgeLabel` falls back to the catalog `label`.

The coaching `provider` strings (e.g. `openai`, `mistral`, `lumo`) match catalog ids 1:1, so `interfaceById(p.provider)` resolves directly. `local-lmstudio`/`local-ollama` become available automatically (they have `supportsParams: COMMON_PARAMS` → temperature/maxTokens/topP/systemPrompt + apiEndpoint + modelName, no apiKey).

- [ ] **Step 1: Add the catalog import**

In `website/src/components/admin/coaching/CoachingSettings.svelte`, after the existing imports (after line 3 `import type { StepTemplate }...`), add:
```typescript
  import { interfaceById, type InterfaceDef, type ParamKey } from '../../../lib/ki-catalog';
```
Path depth: this file's sibling import is `import type { KiConfig } from '../../../lib/coaching-ki-config-db'` — **three** `../` reaches `website/src/lib/`. Use three `../` exactly as shown above.

- [ ] **Step 2: Replace `KNOWN_FIELD_MAP` + `showField` with a catalog-derived resolver**

Replace the block (lines 86-95):
```typescript
  const KNOWN_FIELD_MAP: Record<string, string[]> = {
    openai:  ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'presencePenalty', 'frequencyPenalty', 'organizationId', 'systemPrompt', 'notes'],
    mistral: ['apiKey', 'apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'topK', 'safePrompt', 'randomSeed', 'euEndpoint', 'systemPrompt', 'notes'],
    lumo:    ['apiEndpoint', 'modelName', 'temperature', 'maxTokens', 'topP', 'systemPrompt', 'notes'],
  };

  function showField(p: KiConfig, field: string): boolean {
    if (p.enabledFields !== null) return p.enabledFields.includes(field);
    return (KNOWN_FIELD_MAP[p.provider] ?? []).includes(field);
  }
```
with:
```typescript
  // Coaching-Feldliste aus dem Katalog ableiten (ein SSOT statt hardcodierter Map).
  // ParamKey-Felder kommen aus supportsParams; apiKey nur wenn der Provider Keys hat;
  // modelName/apiEndpoint/notes sind generell verfügbar.
  function fieldsForCatalog(def: InterfaceDef | undefined): string[] {
    const params: ParamKey[] = def?.supportsParams ?? ['temperature', 'maxTokens', 'topP', 'systemPrompt'];
    const out = ['apiEndpoint', 'modelName', ...params, 'notes'];
    if (!def || def.apiKeyEnv || def.perRowApiKey || def.custom) out.push('apiKey');
    return out;
  }

  function showField(p: KiConfig, field: string): boolean {
    if (p.enabledFields !== null) return p.enabledFields.includes(field);
    return fieldsForCatalog(interfaceById(p.provider)).includes(field);
  }
```

- [ ] **Step 3: Replace `PROVIDER_BADGE` + `providerBadgeLabel` with a catalog fallback**

Replace the block (lines 97-103):
```typescript
  const PROVIDER_BADGE: Record<string, string> = {
    openai: 'OpenAI', mistral: 'Mistral AI', lumo: 'Lumo',
  };

  function providerBadgeLabel(p: KiConfig): string {
    return PROVIDER_BADGE[p.provider] ?? (p.displayName || p.provider);
  }
```
with:
```typescript
  function providerBadgeLabel(p: KiConfig): string {
    return interfaceById(p.provider)?.label ?? (p.displayName || p.provider);
  }
```

- [ ] **Step 4: Confirm the `ParamKey` ⊃ coaching-field overlap**

The catalog `ParamKey` union is `temperature | maxTokens | topP | topK | systemPrompt | presencePenalty | frequencyPenalty | safePrompt | randomSeed | organizationId | euEndpoint | thinkingMode`. These are exactly the coaching field keys consumed by `showField` checks in the template (`topK`, `thinkingMode`, `presencePenalty`, `frequencyPenalty`, `safePrompt`, `randomSeed`, `organizationId`, `euEndpoint`, `temperature`, `maxTokens`, `topP`, `systemPrompt`). No mapping/translation needed — they share the same string keys. This step is verification only; no edit.

- [ ] **Step 5: Verify the provider-badge CSS classes still resolve**

The template uses `class="provider-badge {isCustom(p) ? 'custom' : p.provider}"`. The `<style>` block has `.provider-badge.openai/.mistral/.lumo/.custom`. New providers (`local-lmstudio` etc.) produce class `provider-badge local-lmstudio` with no matching style rule — the base `.provider-badge` styling still applies (pill shape, padding), just no accent color. **This is acceptable** (graceful default). No edit needed; this step is verification only.

- [ ] **Step 6: Run the coaching ki-config tests**

Run: `cd /tmp/wt-ki-provider-selection/website && npx vitest run src/lib/coaching-ki-config-db.test.ts`
Expected: PASS (these test the DB layer, not the Svelte component, but confirm the `provider`/`enabledFields` contract this component relies on is unbroken).

- [ ] **Step 7: Typecheck**

Run: `cd /tmp/wt-ki-provider-selection/website && npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep -i coaching/CoachingSettings || echo "no CoachingSettings errors"`
Expected: `no CoachingSettings errors`.

- [ ] **Step 8: Verify line budget — MUST be ≤ 600**

Run: `cd /tmp/wt-ki-provider-selection && wc -l website/src/components/admin/coaching/CoachingSettings.svelte`
Expected: **≤ 600**. If > 600: the removed code (KNOWN_FIELD_MAP 5 lines + showField 4 lines + PROVIDER_BADGE 3 lines + providerBadgeLabel 3 lines = ~15 lines removed; new code = fieldsForCatalog 8 lines + showField 4 lines + providerBadgeLabel 3 lines + 1 import = ~16 lines) is near-neutral. If 601-602, tighten `fieldsForCatalog` (e.g. inline the `params` const) until ≤ 600. Do NOT add a baseline entry.

- [ ] **Step 9: Commit**

```bash
cd /tmp/wt-ki-provider-selection
git add website/src/components/admin/coaching/CoachingSettings.svelte
git commit -m "feat(coaching): derive provider field map from KI catalog (drop hardcoded 3-provider map)"
```

---

### Task 5: Confirm NO change to `provider-config-schema.ts` and `provider-config.ts` (descope verification)

**Files:** none modified — this task documents why two spec items are descoped.

- [ ] **Step 1: Confirm no schema default rows are added**

The spec's "optional default rows" (priority=50, disabled) for the new providers are **descoped**: (a) no acceptance criterion requires them; (b) `tickets.provider_config` already accepts any `provider` string, so an admin can add a `local-lmstudio` row via the UI (Task 3); (c) adding INSERTs to `provider-config-schema.ts` would also require mirroring into `scripts/migrations/*.sql` (per the file's own header comment) and would be untested. Leave `website/src/lib/schema/provider-config-schema.ts` unchanged. No edit.

- [ ] **Step 2: Confirm no runtime-routing change in `provider-config.ts`**

`getProviderConfig(source, tier)` reads `provider`, `model_id`, `base_url` from the DB and resolves the API key via `apiKeyForProvider(provider)`, which returns `''` for any non-deepseek/non-anthropic provider. For `local-lmstudio`/`local-ollama` the empty key is fine — OpenAI-compatible local servers ignore the key (the SDK sends `Authorization: Bearer` with whatever, including empty). The `base_url` from the DB row routes the call to localhost. **No code change needed in `provider-config.ts`.** If a future ticket shows a local server rejecting an empty key, add a `'sk-local'` dummy in `apiKeyForProvider` then — out of scope now. No edit.

- [ ] **Step 3: No commit (no files changed).**

---

### Task 6: Full verification suite + freshness + inventory

**Files:** none (verification only).

- [ ] **Step 1: Regenerate the test inventory (Vitest test counts changed in Tasks 1 & 2)**

Run: `cd /tmp/wt-ki-provider-selection && task test:inventory`
Then confirm the generated file is staged:
```bash
git add website/src/data/test-inventory.json
```
Expected: `test-inventory.json` reflects the new env-status + catalog test blocks.

- [ ] **Step 2: Run the full offline test suite**

Run: `cd /tmp/wt-ki-provider-selection && task test:all`
Expected: PASS (BATS units, kustomize structure, Taskfile dry-run, AND the website Vitest suite incl. the new/changed tests). If the inventory check inside `test:all` fails, re-run Step 1 and re-commit.

- [ ] **Step 3: Regenerate freshness artifacts**

Run: `cd /tmp/wt-ki-provider-selection && task freshness:regenerate`
Then stage any regenerated artifacts:
```bash
git add docs/generated docs/code-quality/repo-index.json k3d/docs-content-built 2>/dev/null || true
git status --short
```

- [ ] **Step 4: Run the CI-equivalent freshness + quality gate (S1–S4 ratchet + baseline assertion)**

Run: `cd /tmp/wt-ki-provider-selection && task freshness:check`
Expected: PASS. Critical checks:
- S1 ratchet: `CoachingSettings.svelte` did NOT grow past 600 (Task 4 Step 8 guaranteed this). All other files non-baselined and under their static limit.
- Baseline key-count unchanged (we added no baseline entries).
- S3: no brand-domain literals introduced (all new literals are `localhost`/`api.deepseek.com`).
If S1 reports `CoachingSettings.svelte` worsened, STOP and shrink that file (do not add a baseline entry).

- [ ] **Step 5: Commit any regenerated artifacts**

```bash
cd /tmp/wt-ki-provider-selection
git add -A
git commit -m "chore: regenerate freshness + test-inventory artifacts for ki-provider-selection" || echo "nothing to commit"
```

- [ ] **Step 6: Manual smoke (documented, not blocking — requires a running dev website)**

If a dev website is running: open `/admin/ki-konfiguration`, verify (a) the GPU-worker banner row shows LM Studio / Ollama pills (green when localhost:1234/11434 answer, grey otherwise); (b) opening any non-embed card → "+ Provider hinzufügen" → selecting "LM Studio (GPU-Worker localhost:1234)" auto-fills `base_url` with `http://localhost:1234/v1`; (c) `/admin/coaching/settings` → KI-Provider tab still renders existing provider cards with correct field visibility. No code change here.

---

## Self-Review

**Spec coverage:**
- Spec §1 (catalog +2 providers, rename) → Task 1 ✓
- Spec §2 (env-status localhost check) → Task 2 ✓
- Spec §3 (UI status banner) → Task 3 Steps 5-6 ✓
- Spec §4 (provider dropdown + base_url autofill) → Task 3 Steps 2-4 ✓ (dropdown auto-populates via existing `/api/admin/ki/catalog` endpoint — no code needed there)
- Spec §5 (Coaching dynamic field mapper) → Task 4 ✓
- Spec §6 (runtime routing for localhost) → Task 5 Step 2 (verified no change needed) ✓
- Spec "DB changes / optional default rows" → Task 5 Step 1 (descoped with rationale) ✓
- Spec test strategy items 1-4 → Tasks 1, 2, 4 (Vitest); item 5 (manual) → Task 6 Step 6 ✓

**Placeholder scan:** No TBD/TODO/"add error handling"/"similar to Task N". All code blocks are complete and copy-pasteable.

**Type consistency:** `LocalGpuStatus`/`LocalEndpointStatus` shape `{reachable, models?}` is identical in env-status.ts (Task 2), its test (Task 2), and KiKonfiguration.svelte (Task 3). `fieldsForCatalog(def: InterfaceDef | undefined)` and `interfaceById` signatures match `ki-catalog.ts`. `ParamKey`/`InterfaceDef` imported from the real module with **three** `../` (`'../../../lib/ki-catalog'`), matching the sibling `coaching-ki-config-db` import. Catalog field names (`kinds`/`suggestedModels`/`supportsParams`/`apiKeyEnv`/`perRowApiKey`/`custom`/`defaultBaseUrl`) match the actual `InterfaceDef`.
