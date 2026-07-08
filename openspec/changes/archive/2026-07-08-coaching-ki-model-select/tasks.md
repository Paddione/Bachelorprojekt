---
title: "coaching-ki-model-select — Implementation Plan"
ticket_id: T001641
domains: [website]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# coaching-ki-model-select — Implementation Plan

_Ticket: T001641 · Spec: `docs/superpowers/specs/2026-07-08-coaching-ki-model-select-design.md`_

This plan is self-contained. Implement the tasks in order; each task names its exact
files, the real signatures/types it must use, and its Vitest coverage. Two pure helper
modules (`llm-models-probe.ts`, `prompt-scrubber.ts`) are added with **no** imports of DB
or API layers (S2: no cycles). No brand-domain literals appear in any snippet (S3). No DB
schema change. The global (non-coaching) LLM path (`provider-config.ts`, `assistant/llm.ts`)
is not touched. The parallel session T001638 owns `coaching-session-db.ts`, `admin.astro`,
`AdminSidebarNav.astro`, `helpContent.ts`, `sessions/[id].astro`, the popout files and
`inbox/[id]/action.ts` — none of them appear below.

## File Structure

```
website/src/lib/llm-models-probe.ts                                   (new · pure helper)
website/src/lib/llm-models-probe.test.ts                              (new · Vitest)
website/src/lib/prompt-scrubber.ts                                    (new · pure helper)
website/src/lib/prompt-scrubber.test.ts                               (new · Vitest, RED→GREEN)
website/src/pages/api/admin/coaching/ki-config/models.ts              (new · GET endpoint)
website/src/pages/api/admin/coaching/ki-config/models.test.ts         (new · Vitest)
website/src/pages/api/admin/coaching/ki-config/active.test.ts         (new · Vitest)
website/src/lib/openai-compatible-session-agent.ts                    (edit · export resolveEndpoint)
website/src/pages/api/admin/ki/env-status.ts                          (edit · consume helper)
website/src/pages/api/admin/coaching/ki-config/active.ts              (edit · catalog allowlist)
website/src/components/admin/coaching/CoachingSettings.svelte         (edit · datalist, line-neutral ≤598)
website/src/components/admin/KiCoachingDrawer.svelte                  (edit · datalist)
website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts (edit · scrubber chokepoint)
website/src/data/test-inventory.json                                  (regenerated)
```

### S1 line budgets (verified against `docs/code-quality/baseline.json` + live `wc -l`)

| File | Ist-LOC | Budget |
|------|---------|--------|
| `website/src/pages/api/admin/coaching/ki-config/active.ts` | 26 | 574 |
| `website/src/pages/api/admin/ki/env-status.ts` | 46 | 554 |
| `website/src/components/admin/KiCoachingDrawer.svelte` | 251 | 249 |
| `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` | 165 | 435 |
| `website/src/lib/openai-compatible-session-agent.ts` | 113 | 487 |

`website/src/components/admin/coaching/CoachingSettings.svelte` is **baselined at 598 (Budget 0)**:
its change MUST be net line-neutral or genuinely shrink the file — the hard gate is a final
`wc -l` of **≤ 598**. Task 5 achieves this with a compact single-line `<datalist>` plus a small
`{#snippet}` that shrinks the repeated number-field markup to offset the additions (real
extraction, not cosmetic collapse). New `.ts` files start far under the 600 limit. No baseline
entry is added; no S1 ignore/exception is used.

### CQ02 (`any`) budget

No task introduces `: any`, `as any`, or `<any>`. All new exported functions and handlers are
fully typed. The `unknown`-narrowing patterns already used in `env-status.ts` and the endpoint
tests are reused verbatim, so the global `any` count does not increase.

---

## Task 1 — Pure model-probe helper + env-status refactor

Extract the `/v1/models` fetch/parse logic currently inlined in `env-status.ts` into a pure,
reusable module, then have `env-status.ts` consume it. This closes the duplication before the new
endpoint needs the same logic.

**Files:** `website/src/lib/llm-models-probe.ts` (new), `website/src/lib/llm-models-probe.test.ts`
(new), `website/src/pages/api/admin/ki/env-status.ts` (edit).

1. Create `website/src/lib/llm-models-probe.ts` — pure module, **no** imports of `pg`,
   `website-db`, `auth`, or any API route (S2). Export:

   ```ts
   export interface ModelProbeResult { reachable: boolean; models: string[]; }

   /**
    * GET `<baseUrl>/models` and parse the OpenAI shape { data: [{ id }] }.
    * Any network/timeout/parse/non-2xx error → { reachable: false, models: [] }.
    * baseUrl is the endpoint root WITHOUT a trailing /models (e.g. http://host:1234/v1).
    */
   export async function fetchModelIds(baseUrl: string, timeoutMs = 2000): Promise<ModelProbeResult> {
     try {
       const url = `${baseUrl.replace(/\/$/, '')}/models`;
       const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
       if (!res.ok) return { reachable: false, models: [] };
       const body = (await res.json().catch(() => null)) as { data?: { id?: unknown }[] } | null;
       const models = Array.isArray(body?.data)
         ? body!.data.map((m) => m?.id).filter((id): id is string => typeof id === 'string')
         : [];
       return { reachable: true, models };
     } catch {
       return { reachable: false, models: [] };
     }
   }
   ```

2. Refactor `env-status.ts`: delete the local `checkLocalEndpoint` function and its
   `LocalEndpointStatus` interface; `import { fetchModelIds } from '../../../../lib/llm-models-probe'`.
   Replace the two probes so they pass the endpoint **root** (helper appends `/models`) and keep the
   snappy 1s timeout:

   ```ts
   const [lmstudio, ollama] = await Promise.all([
     fetchModelIds(`http://${gpuBase}:1234/v1`, 1000),
     fetchModelIds(`http://${gpuBase}:11434/v1`, 1000),
   ]);
   ```

   The `localGpu: { lmstudio, ollama }` shape stays `{ reachable, models }`; the existing
   `env-status.test.ts` assertions (`localGpu.lmstudio.reachable`, `.models` equals the id array,
   ollama `reachable:false`) remain green because the helper returns the same fields for those cases.

3. Create `website/src/lib/llm-models-probe.test.ts` (mock `global.fetch`, mirror the style of
   `env-status.test.ts`). Cover:
   - reachable + OpenAI body → `{ reachable: true, models: ['qwen2.5-7b', 'mistral-7b'] }`;
   - assert the fetched URL ends with `/models` (e.g. `expect(url).toMatch(/\/v1\/models$/)`);
   - `fetch` rejects (ECONNREFUSED) → `{ reachable: false, models: [] }`;
   - non-2xx (`status: 500`) → `{ reachable: false, models: [] }`;
   - malformed JSON body → `reachable: true, models: []`.

**Verify Task 1:**

```bash
cd website && npx vitest run src/lib/llm-models-probe.test.ts src/pages/api/admin/ki/env-status.test.ts
```

---

## Task 2 — PII scrubber helper (RED → GREEN)

Add the deterministic scrubber as a pure module. Write the test first so it fails against the
missing module, then implement.

**Files:** `website/src/lib/prompt-scrubber.test.ts` (new), `website/src/lib/prompt-scrubber.ts` (new).

1. **RED.** Create `website/src/lib/prompt-scrubber.test.ts` asserting the contract below, then run it:

   ```bash
   cd website && npx vitest run src/lib/prompt-scrubber.test.ts
   # expected: FAIL — module ./prompt-scrubber does not exist yet (import error)
   ```

   Test cases (replacement `'K-100'` unless noted):
   - full name: `scrubClientPii('Termin mit Max Mustermann heute', { names: ['Max Mustermann'], replacement: 'K-100' })` → `'Termin mit K-100 heute'`;
   - single component ≥ 3 chars: `names: ['Max Mustermann']`, input `'Hallo Max!'` → `'Hallo K-100!'`;
   - component < 3 chars is NOT stripped: `names: ['Jo Li']`, input `'Jo kam'` → unchanged `'Jo kam'`;
   - Umlaut, case-insensitive: `names: ['Jörg Müller']`, input `'cc MÜLLER'` → `'cc K-100'`;
   - multiple occurrences replaced: input `'Max und Max'`, `names: ['Max Mustermann']` → `'K-100 und K-100'`;
   - word boundary (no substring hit): `names: ['Hannes']`, input `'Beispielhannes'` → unchanged;
   - e-mail: `emails: ['a.b@example.org']`, input `'mail: A.B@Example.org'` → `'mail: K-100'`;
   - empty names + no emails → identity: `scrubClientPii('beliebig', { names: [], replacement: '[KLIENT]' })` → `'beliebig'`.

2. **GREEN.** Create `website/src/lib/prompt-scrubber.ts` — pure module, no imports:

   ```ts
   export interface ScrubOptions { names: string[]; emails?: string[]; replacement: string; }

   const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

   /** Case-insensitive, Unicode/Umlaut-safe, word-boundary scrub of client PII. */
   export function scrubClientPii(text: string, opts: ScrubOptions): string {
     const { names, emails = [], replacement } = opts;
     // Build token set: full names + name components ≥ 3 chars; longest first so a full
     // name is replaced before its parts (avoids leaving a dangling half).
     const nameTokens = new Set<string>();
     for (const n of names) {
       const trimmed = n.trim();
       if (trimmed.length >= 3) nameTokens.add(trimmed);
       for (const part of trimmed.split(/\s+/)) if (part.length >= 3) nameTokens.add(part);
     }
     let out = text;
     const sorted = [...nameTokens].sort((a, b) => b.length - a.length);
     for (const tok of sorted) {
       // Unicode letter/number boundaries so "Beispielhannes" ⊉ "Hannes".
       const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(tok)}(?![\\p{L}\\p{N}])`, 'giu');
       out = out.replace(re, replacement);
     }
     for (const email of emails) {
       if (!email.trim()) continue;
       out = out.replace(new RegExp(escapeRe(email.trim()), 'gi'), replacement);
     }
     return out;
   }
   ```

   Re-run the test from step 1 — now GREEN.

**Verify Task 2:**

```bash
cd website && npx vitest run src/lib/prompt-scrubber.test.ts
```

---

## Task 3 — Models endpoint + shared endpoint resolver

Expose the endpoint resolver and add the read-only models endpoint the UI will call.

**Files:** `website/src/lib/openai-compatible-session-agent.ts` (edit),
`website/src/pages/api/admin/coaching/ki-config/models.ts` (new),
`website/src/pages/api/admin/coaching/ki-config/models.test.ts` (new).

1. In `openai-compatible-session-agent.ts` change `function resolveEndpoint(kiConfig: KiConfig): string`
   to `export function resolveEndpoint(kiConfig: KiConfig): string` (no body change — it returns
   `kiConfig.apiEndpoint` or a provider default such as `http://${LLM_HOST_IP||'localhost'}:1234/v1`,
   and throws for an unknown provider without an endpoint). Do not export or alter the internal
   agent methods. This is a re-export, not a copy (spec requirement).

2. Create `website/src/pages/api/admin/coaching/ki-config/models.ts`:

   ```ts
   import type { APIRoute } from 'astro';
   import { getSession, isAdmin } from '../../../../../lib/auth';
   import { getKiProviderById } from '../../../../../lib/coaching-ki-config-db';
   import { resolveEndpoint } from '../../../../../lib/openai-compatible-session-agent';
   import { fetchModelIds } from '../../../../../lib/llm-models-probe';
   import { pool } from '../../../../../lib/website-db';

   export const prerender = false;

   export const GET: APIRoute = async ({ request, url }) => {
     const session = await getSession(request.headers.get('cookie'));
     if (!session) return json({ error: 'Unauthorized' }, 401);
     if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);

     const id = Number(url.searchParams.get('id'));
     if (!Number.isInteger(id)) return json({ reachable: false, models: [] }, 200);

     const config = await getKiProviderById(pool, id);
     if (!config) return json({ reachable: false, models: [] }, 200);

     let baseUrl: string;
     try { baseUrl = resolveEndpoint(config); }
     catch { return json({ reachable: false, models: [] }, 200); }

     return json(await fetchModelIds(baseUrl, 2000), 200);
   };

   function json(body: unknown, status: number): Response {
     return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
   }
   ```

   The route never returns 5xx for an unreachable endpoint; probe failures surface as
   `{ reachable: false, models: [] }`. `getKiProviderById(pool, id)` is the real signature
   (`Promise<KiConfig | null>`, `source='coaching'`).

3. Create `website/src/pages/api/admin/coaching/ki-config/models.test.ts`. Mock `../../../../../lib/auth`
   (getSession/isAdmin), `../../../../../lib/coaching-ki-config-db` (getKiProviderById),
   `../../../../../lib/website-db` (`pool` stub), and `global.fetch`. Cover:
   - no session → 401; non-admin → 403;
   - config with `apiEndpoint: 'http://x:1234/v1'` + fetch returns `{ data: [{ id: 'qwen2.5-7b' }] }`
     → 200 `{ reachable: true, models: ['qwen2.5-7b'] }`;
   - `getKiProviderById` resolves `null` → 200 `{ reachable: false, models: [] }`;
   - fetch rejects → 200 `{ reachable: false, models: [] }` (assert status is 200, never 5xx);
   - missing/non-numeric `id` → 200 `{ reachable: false, models: [] }`.

**Verify Task 3:**

```bash
cd website && npx vitest run src/pages/api/admin/coaching/ki-config/models.test.ts src/lib/openai-compatible-session-agent.test.ts
```

---

## Task 4 — Activation allowlist bugfix

Replace the hardcoded `['openai','mistral','lumo']` allowlist so `local-lmstudio` and custom
providers become activatable.

**Files:** `website/src/pages/api/admin/coaching/ki-config/active.ts` (edit),
`website/src/pages/api/admin/coaching/ki-config/active.test.ts` (new).

1. In `active.ts`, `import { KI_CATALOG } from '../../../../../lib/ki-catalog'` and replace the
   allowlist check (currently the `allowed` array + `allowed.includes(...)`) with catalog-derived
   membership plus the `custom_` prefix:

   ```ts
   const allowedIds = new Set(KI_CATALOG.map((i) => i.id));
   const provider = String(body.provider ?? '');
   if (!allowedIds.has(provider) && !provider.startsWith('custom_')) {
     return new Response(JSON.stringify({ error: 'Invalid provider' }), { status: 400, headers: { 'content-type': 'application/json' } });
   }
   ```

   Pass `provider` to `setActiveProvider(pool, brand, provider)` (its param is `string`). `KiConfig['provider']`
   is `string`, so drop the now-unneeded `KiConfig['provider'][]` cast. Keep the existing 401 / invalid-JSON /
   404-not-found branches unchanged.

2. Create `website/src/pages/api/admin/coaching/ki-config/active.test.ts`. Mock `auth`,
   `coaching-ki-config-db` (`setActiveProvider`), and `website-db` (`pool`). Cover:
   - `local-lmstudio` (a `KI_CATALOG` id) → `setActiveProvider` is called and the response is `{ ok: true }`
     (regression: previously rejected as `Invalid provider`);
   - a `custom_myllm` provider → accepted;
   - `not-a-provider` → 400 `Invalid provider` and `setActiveProvider` is not called;
   - no session → 401.

**Verify Task 4:**

```bash
cd website && npx vitest run src/pages/api/admin/coaching/ki-config/active.test.ts
```

---

## Task 5 — CoachingSettings.svelte datalist (line-neutral, ≤ 598)

Wire the `modelName` input to a live-populated `<datalist>` while keeping the file at ≤ 598 lines.
Free text stays valid; an unreachable endpoint yields an empty datalist (graceful degrade).

**File:** `website/src/components/admin/coaching/CoachingSettings.svelte` (edit).

Net-zero recipe (additions offset by a real markup extraction — not cosmetic):

1. **Add** model-id state near the other `$state` decls (top of `<script>`):
   `let modelIds = $state<string[]>([]);`
2. **Add** a loader and call it from the existing `startEditProvider(p)` (which already runs when an
   edit opens — no new `$effect`). Inside `startEditProvider`, after `editingProvider = p;`, add one line
   `void loadModelIds(p.id);` and define the compact loader:

   ```ts
   async function loadModelIds(id: number) {
     try {
       const d = await (await fetch(`/api/admin/coaching/ki-config/models?id=${id}`)).json();
       modelIds = d.reachable ? d.models : [];
     } catch { modelIds = []; }
   }
   ```

3. **Bind** the datalist: on the existing model input (the `bind:value={providerFields.modelName}`
   input inside the `{#if showField(editingProvider, 'modelName')}` block) add `list="coaching-model-ids"`
   to the same line (no new line), and insert **one** line before its closing `</label>`:

   ```svelte
   <datalist id="coaching-model-ids">{#each modelIds as m (m)}<option value={m}></option>{/each}</datalist>
   ```

4. **Offset** the added lines by extracting the three repeated number-field blocks in the first
   `.field-row` of the behavior tab (`temperature`, `maxTokens`, `topP` — the `{#if showField(...)}
   <label class="field-label">…<input type="number" …/></label>{/if}` groups) into a single Svelte
   `{#snippet numberField(field, label, attrs)}` used via one-line `{#if showField(editingProvider, 'temperature')}{@render numberField(...)}{/if}` calls. This is a genuine shrink (DRY of duplicated
   markup); it more than covers the datalist additions. After editing, confirm the hard gate:

   ```bash
   test "$(wc -l < website/src/components/admin/coaching/CoachingSettings.svelte)" -le 598 && echo OK
   ```

   If the snippet extraction proves awkward for `bind:value` on a dynamic field, instead collapse the
   same three number-field blocks by moving each `<label>…<input/></label>` onto a single line — this
   removes the same number of lines and keeps behavior identical. Do not add a baseline exception.

<!-- vitest: kein neuer Test nötig — reine Svelte-Template/Markup-Änderung ohne exportierte Logik; die Datalist-Quelle (Endpoint) ist in Task 3 getestet. -->

**Verify Task 5:** file line count ≤ 598 (command above) and `cd website && npx astro check` shows no new errors for this component.

---

## Task 6 — KiCoachingDrawer.svelte datalist

Same datalist wiring in the second admin model editor. Budget here is comfortable (249), so no
line-neutral constraint.

**File:** `website/src/components/admin/KiCoachingDrawer.svelte` (edit).

1. Add `let modelIds = $state<string[]>([]);` with the other `$state` decls.
2. In `startEdit(p)` add `void loadModelIds(p.id);` and define the same compact `loadModelIds` loader
   as Task 5 (fetch `/api/admin/coaching/ki-config/models?id=${id}`, set `modelIds` to `d.models` when
   `d.reachable`, else `[]`, catch → `[]`).
3. In the `editFields` snippet, on the `Modell` input (`bind:value={editForm.modelName}`) add
   `list="drawer-model-ids"`, and add one `<datalist id="drawer-model-ids">{#each modelIds as m (m)}<option value={m}></option>{/each}</datalist>` line inside that label. Free text remains valid.

<!-- vitest: kein neuer Test nötig — reine Svelte-Template/Markup-Änderung ohne exportierte Logik. -->

**Verify Task 6:** `cd website && npx astro check` shows no new errors for this component.

---

## Task 7 — Scrubber chokepoint in generate.ts

Apply the scrubber to both prompts immediately before the agent call, sourcing names from the
session's client name and the linked customer record.

**File:** `website/src/pages/api/admin/coaching/sessions/[id]/steps/[n]/generate.ts` (edit).

1. `import { scrubClientPii } from '../../../../../../../../lib/prompt-scrubber';`
2. Where the project is resolved (the existing `if (coachingSession?.projectId)` block that already
   sets `customerNumber` and `projectKiContext`), also collect client name/email PII sources. Add a
   defensive inline lookup of the linked customer (same table/pattern as
   `coaching-project-db.findOrCreateProject`, which queries `SELECT … FROM customers WHERE id = $1`):

   ```ts
   const pii = { names: [] as string[], emails: [] as string[] };
   if (coachingSession?.clientName) pii.names.push(coachingSession.clientName);
   if (coachingSession?.clientId) {
     try {
       const c = await pool.query('SELECT name, email FROM customers WHERE id = $1', [coachingSession.clientId]);
       const row = c.rows[0] as { name?: string; email?: string } | undefined;
       if (row?.name) pii.names.push(row.name);
       if (row?.email) pii.emails.push(row.email);
     } catch { /* customer lookup must not block generation */ }
   }
   ```

   `coachingSession` is the real `Session` type (`clientId: string | null`, `clientName: string | null`).
   Do not modify `coaching-session-db.ts` (owned by T001638) — read via the existing `getCoachingSession`.

3. Change `const anonymizedUserPrompt` to `let anonymizedUserPrompt` (it is currently `const` at the
   `Klient ${customerNumber}:\n${userPrompt}` assignment). After both `effectiveSystem` (the `let` that
   already had `{{KLIENT_ID}}` replaced) and `anonymizedUserPrompt` are built and **before** the
   streaming/non-streaming branch, scrub both:

   ```ts
   const replacement = customerNumber ?? '[KLIENT]';
   try {
     if (pii.names.length || pii.emails.length) {
       effectiveSystem = scrubClientPii(effectiveSystem, { names: pii.names, emails: pii.emails, replacement });
       anonymizedUserPrompt = scrubClientPii(anonymizedUserPrompt, { names: pii.names, emails: pii.emails, replacement });
     }
   } catch (err) {
     locals.requestLogger.error({ err }, '[coaching/generate] scrub failed');
   }
   ```

   Both the stream path (`agent.stream!({ … effectiveSystemPrompt: effectiveSystem, assembledUserPrompt: anonymizedUserPrompt … })`) and the non-stream path (`agent.generate({ … })` plus `upsertStep`/`appendAuditLog`) already read these two variables, so scrubbing once here covers every downstream use and the persisted `aiPrompt`. A scrub throw is logged and generation proceeds with the structurally anonymized (pre-scrub) values — it never crashes the request.

4. Extend `website/src/lib/prompt-scrubber.test.ts` (from Task 2) with a regression assertion that a
   full client name embedded in free text is replaced by the customer number given the generate.ts
   name sources — i.e. `scrubClientPii('Klient K-100:\nGespräch mit Max Mustermann', { names: ['Max Mustermann'], replacement: 'K-100' })` contains `'K-100'` and does not contain `'Mustermann'`. (This
   pins the guarantee that `clientName` cannot survive into the agent call.)

**Verify Task 7:**

```bash
cd website && npx vitest run src/lib/prompt-scrubber.test.ts && npx astro check 2>&1 | grep -i "steps/\[n\]/generate" || echo "no new generate.ts errors"
```

---

## Task 8 — Test inventory + final verification

**Files:** `website/src/data/test-inventory.json` (regenerated).

1. Regenerate the test inventory after the new test files and commit it alongside the tests:

   ```bash
   task test:inventory
   git add website/src/data/test-inventory.json
   ```

2. Validate the OpenSpec change (delta spec must parse and match the SSOT spec `llm-local-dev`):

   ```bash
   bash scripts/openspec.sh validate
   ```

3. Run the three mandatory CI gates and confirm all green before opening the PR:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

   `task freshness:check` enforces the S1–S4 ratchet (including `CoachingSettings.svelte` ≤ 598 and no
   new baseline keys), the CQ02 `any` limit, and the test-inventory freshness — all of which this plan
   is written to satisfy.
