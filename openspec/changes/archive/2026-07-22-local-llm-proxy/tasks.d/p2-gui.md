# p2-gui — Steuerung-Tab-Panel, Sidekick-View & Admin-API

Rolle: **impl**. Partial p2 des Change `local-llm-proxy` (T002081). Baut den GUI- und
Website-API-Layer für den repo-verwalteten LLM-Proxy: den DB-Zugriff auf die neue
Backend-Registry, die vier `/api/admin/llm-proxy/*`-Endpunkte (CRUD + offline-toleranter
Status-Proxy) nach dem `/api/admin/ki/providers`-Muster, ein `LlmProxyPanel.svelte` im
Steuerung-Tab (`/admin/pipeline?tab=control`, control-extras) und eine kompakte
`LlmProxyView.svelte` als neue Sidekick-Drawer-View mit Menüeintrag.

Der Proxy-Prozess (`scripts/llm-proxy/`), die Migration `tickets.llm_proxy_backends` und die
`route-provider.sh`-Konsolidierung liegen in einem anderen Partial; alle Vitest-/BATS-Tests
liegen in `p3`. Dieses Partial legt **keine** Test-Dateien an und trägt **keinen** finalen
`task test:*`-Verify-Block (beides lebt in `p3` bzw. im Index `tasks.md`).

## API-Kontrakte, die dieses Partial bereitstellt

- `GET /api/admin/llm-proxy/backends` → `{ backends: LlmProxyBackend[] }`
- `POST /api/admin/llm-proxy/backends` → `{ id }` (201) · Whitelist-validiert
- `PUT /api/admin/llm-proxy/backends/[id]` → `{ ok: true }` · `DELETE` → `{ ok: true }`
  (letztes enabled lokales Backend nicht löschbar)
- `GET /api/admin/llm-proxy/status` → `<LLM_PROXY_URL>/admin/state` durchgereicht, bei
  Nichterreichbarkeit `200 { proxy: 'offline', backends: [DB-Stand] }`
- `POST /api/admin/llm-proxy/reload` → `<LLM_PROXY_URL>/admin/reload` durchgereicht,
  gleiche Offline-Toleranz.

Backend-Zeilenform (aus der `p`-Migration, hier nur konsumiert):
`{ id, name UNIQUE, kind ∈ {llamacpp,lmstudio,openai-remote}, base_url, api_key_env,
enabled, priority, fixups jsonb, model_aliases jsonb, updated_at }`. `api_key_env` speichert
**den Namen der Env-Variable** (z. B. `DEEPSEEK_API_KEY`), nie den Key selbst → kein Masking nötig.

## File-Budgets (S1)

Wirksame Schwellen aus `docs/code-quality/gates.yaml` bzw. `docs/code-quality/baseline.json`.
Neue Dateien werden mit Wachstumsreserve unter dem statischen Limit geschnitten.

| Datei | Status | Ist | Budget |
|-------|--------|-----|--------|
| `website/src/lib/llm-proxy-db.ts` | neu | 0 | 600 (`.ts`-Limit) |
| `website/src/pages/api/admin/llm-proxy/backends.ts` | neu | 0 | 600 (`.ts`-Limit) |
| `website/src/pages/api/admin/llm-proxy/backends/[id].ts` | neu | 0 | 600 (`.ts`-Limit) |
| `website/src/pages/api/admin/llm-proxy/status.ts` | neu | 0 | 600 (`.ts`-Limit) |
| `website/src/pages/api/admin/llm-proxy/reload.ts` | neu | 0 | 600 (`.ts`-Limit) |
| `website/src/components/factory/LlmProxyPanel.svelte` | neu | 0 | 500 (`.svelte`-Limit, strikt < 500 planen) |
| `website/src/components/assistant/LlmProxyView.svelte` | neu | 0 | 500 (`.svelte`-Limit) |
| `website/src/components/DevStatusTabs.svelte` | mod | 328 | **172** (nicht baselined, `.svelte` 500) |
| `website/src/components/PortalSidekick.svelte` | mod | 551 | **27** (baseline 578 — Zweig ≤ 12 Zeilen) |
| `website/src/components/assistant/SidekickHome.svelte` | mod | 306 | **194** (nicht baselined, `.svelte` 500) |

`LlmProxyPanel.svelte` ist die dichteste neue Datei; das Skelett unten hält Script + Markup + Styles
zusammen unter ~430 Zeilen. Wächst der Panel-Body beim Implementieren über ~400 Zeilen, die
Inline-Form in ein Kind-Component `LlmProxyBackendForm.svelte` **auslagern** (echter Split, kein
kosmetisches Zusammenziehen) statt das 500er-Limit auszureizen.

**Per-Task-Verify:** `cd website && pnpm astro:check` (`astro check` = @astrojs/check ⇒ svelte-check +
tsc-Diagnostik über das ganze Projekt; das repo-übliche Typprüf-Kommando — es gibt kein eigenes
`tsc`/`svelte-check`-Script in `website/package.json`). Für rein-TS-Dateien alternativ
`pnpm exec tsc --noEmit`.

**CQ02:** Alle neuen Funktionen/Handler sind explizit typisiert — kein `: any`, kein `as any`,
Fehlerpfade über `err instanceof Error`-Narrowing bzw. `(err as { code?: string })`-Narrowing wie im
`ki-config-db`/`providers.ts`-Referenzmuster. Die globale `any`-Zählung in `website/src` steigt nicht.

**S3:** Keine Brand-Domain-Literale. Der Proxy wird ausschließlich über `LLM_PROXY_URL`
(Env, Default `http://127.0.0.1:18235`) und relative Pfade (`/admin/pipeline?tab=control`) referenziert.

---

## Task 1: DB-Layer `website/src/lib/llm-proxy-db.ts`

Pure DB-Schicht analog `website/src/lib/ki-config-db.ts` — importiert **nur** `pool` aus
`./website-db`, keine API-/Route-Module (S2: kein neuer Zyklus).

- [ ] Datei anlegen mit Typen, `COLS`, CRUD und `countEnabledLocal`-Guard:

```ts
// Pure DB access for the LLM-Proxy backend registry admin UI.
// Reads/writes tickets.llm_proxy_backends. No imports of API/route modules (S2-safe).
import { pool } from './website-db';

export type BackendKind = 'llamacpp' | 'lmstudio' | 'openai-remote';
export const BACKEND_KINDS: BackendKind[] = ['llamacpp', 'lmstudio', 'openai-remote'];

/** Named request transformations implemented inside the proxy (design §1 Fixups).
 *  Whitelist — the API never accepts a fixup outside this set. */
export const KNOWN_FIXUPS = ['bonsai-system-role-fixup'] as const;
export type Fixup = (typeof KNOWN_FIXUPS)[number];

export interface LlmProxyBackend {
  id: number;
  name: string;
  kind: BackendKind;
  base_url: string;
  /** Name of the env var holding the API key (never the key itself). */
  api_key_env: string | null;
  enabled: boolean;
  priority: number;
  fixups: Fixup[];
  model_aliases: Record<string, string>;
  updated_at: string | null;
}

export interface NewBackend {
  name: string;
  kind: BackendKind;
  base_url: string;
  api_key_env: string | null;
  enabled: boolean;
  priority: number;
  fixups: Fixup[];
  model_aliases: Record<string, string>;
}

const COLS =
  'id, name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, updated_at';

export async function listBackends(): Promise<LlmProxyBackend[]> {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.llm_proxy_backends ORDER BY priority, name`,
  );
  return rows.map(mapRow);
}

export async function getBackend(id: number): Promise<LlmProxyBackend | null> {
  const { rows } = await pool.query(
    `SELECT ${COLS} FROM tickets.llm_proxy_backends WHERE id = $1`,
    [id],
  );
  return rows.length ? mapRow(rows[0]) : null;
}

/**
 * Count enabled *local* backends (kind <> 'openai-remote'), optionally excluding one id.
 * Used to refuse deleting/disabling the last enabled local backend (design §4) — the remote
 * backends (DeepSeek/opencode-zen) are a paid last resort and must never be the sole route.
 */
export async function countEnabledLocal(excludeId?: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT count(*)::int AS n FROM tickets.llm_proxy_backends
       WHERE enabled = true AND kind <> 'openai-remote'
         AND ($1::bigint IS NULL OR id <> $1)`,
    [excludeId ?? null],
  );
  return Number(rows[0]?.n ?? 0);
}

export async function createBackend(b: NewBackend): Promise<number> {
  const { rows } = await pool.query(
    `INSERT INTO tickets.llm_proxy_backends
       (name, kind, base_url, api_key_env, enabled, priority, fixups, model_aliases, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb, now())
     RETURNING id`,
    [b.name, b.kind, b.base_url, b.api_key_env, b.enabled, b.priority,
     JSON.stringify(b.fixups), JSON.stringify(b.model_aliases)],
  );
  return Number(rows[0].id);
}

const UPDATABLE = [
  'name', 'kind', 'base_url', 'api_key_env', 'enabled', 'priority', 'fixups', 'model_aliases',
] as const;
type Updatable = (typeof UPDATABLE)[number];

export async function updateBackend(
  id: number,
  patch: Partial<Record<Updatable, unknown>>,
): Promise<boolean> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  for (const col of UPDATABLE) {
    if (!(col in patch)) continue;
    const jsonb = col === 'fixups' || col === 'model_aliases';
    vals.push(jsonb ? JSON.stringify(patch[col]) : patch[col]);
    sets.push(`${col} = $${vals.length}${jsonb ? '::jsonb' : ''}`);
  }
  if (sets.length === 0) return false;
  vals.push(id);
  const r = await pool.query(
    `UPDATE tickets.llm_proxy_backends SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${vals.length}`,
    vals,
  );
  return (r.rowCount ?? 0) > 0;
}

export async function deleteBackend(id: number): Promise<boolean> {
  const r = await pool.query('DELETE FROM tickets.llm_proxy_backends WHERE id = $1', [id]);
  return (r.rowCount ?? 0) > 0;
}

function mapRow(r: Record<string, unknown>): LlmProxyBackend {
  return {
    id: Number(r.id),
    name: String(r.name),
    kind: r.kind as BackendKind,
    base_url: String(r.base_url),
    api_key_env: (r.api_key_env as string | null) ?? null,
    enabled: Boolean(r.enabled),
    priority: Number(r.priority),
    fixups: Array.isArray(r.fixups) ? (r.fixups as Fixup[]) : [],
    model_aliases:
      r.model_aliases && typeof r.model_aliases === 'object'
        ? (r.model_aliases as Record<string, string>)
        : {},
    updated_at: r.updated_at ? new Date(r.updated_at as string).toISOString() : null,
  };
}
```

- [ ] **Verify:** `cd website && pnpm astro:check` — keine neuen Typfehler, keine neuen `any`.

## Task 2: CRUD-API `backends.ts` + `backends/[id].ts`

Beide Handler spiegeln `website/src/pages/api/admin/ki/providers.ts` (+`/[id].ts`) exakt:
`prerender = false`, lokaler `json()`-Helper, `guard()` mit `getSession`/`isAdmin`,
Whitelist-Validierung, `23505`→409 bei Namens-Kollision, `locals.requestLogger.error` im
Catch-Pfad.

- [ ] `website/src/pages/api/admin/llm-proxy/backends.ts` (GET-Liste + POST-Anlage):

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import {
  listBackends, createBackend, BACKEND_KINDS, KNOWN_FIXUPS,
  type NewBackend, type BackendKind, type Fixup,
} from '../../../../lib/llm-proxy-db';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

/** Validate & coerce a POST body into a NewBackend. Whitelist per design §4. */
function parseNew(body: Record<string, unknown>): { error: string } | { value: NewBackend } {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const base_url = typeof body.base_url === 'string' ? body.base_url.trim() : '';
  if (!name || !base_url) return { error: 'name und base_url sind erforderlich' };
  if (!BACKEND_KINDS.includes(body.kind as BackendKind))
    return { error: 'kind muss llamacpp, lmstudio oder openai-remote sein' };
  const priority = Number(body.priority);
  if (!Number.isInteger(priority) || priority < 0)
    return { error: 'priority muss eine nicht-negative Ganzzahl sein' };
  const fixupsRaw = Array.isArray(body.fixups) ? body.fixups : [];
  if (!fixupsRaw.every((f) => KNOWN_FIXUPS.includes(f as Fixup)))
    return { error: 'fixups enthält einen unbekannten Wert' };
  const aliasesRaw = body.model_aliases;
  const model_aliases =
    aliasesRaw && typeof aliasesRaw === 'object' && !Array.isArray(aliasesRaw)
      ? (aliasesRaw as Record<string, string>)
      : {};
  const apiKeyEnv = typeof body.api_key_env === 'string' ? body.api_key_env.trim() : '';
  return {
    value: {
      name, kind: body.kind as BackendKind, base_url,
      api_key_env: apiKeyEnv || null,
      enabled: body.enabled === undefined ? true : Boolean(body.enabled),
      priority,
      fixups: fixupsRaw as Fixup[],
      model_aliases,
    },
  };
}

export const GET: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const backends = await listBackends();
    return json({ backends });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends] GET error:');
    return json({ error: 'fetch_failed' }, 500);
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parseNew(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  try {
    const id = await createBackend(parsed.value);
    return json({ id }, 201);
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      return json({ error: 'Ein Backend mit diesem Namen existiert bereits.' }, 409);
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends] POST error:');
    return json({ error: 'create_failed' }, 500);
  }
};
```

- [ ] `website/src/pages/api/admin/llm-proxy/backends/[id].ts` (PUT-Update + DELETE mit
      Letztes-lokales-Backend-Schutz):

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import {
  updateBackend, deleteBackend, getBackend, countEnabledLocal,
  BACKEND_KINDS, KNOWN_FIXUPS, type BackendKind, type Fixup,
} from '../../../../../lib/llm-proxy-db';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

const PATCHABLE = ['name', 'kind', 'base_url', 'api_key_env', 'enabled', 'priority', 'fixups', 'model_aliases'];

function parsePatch(body: Record<string, unknown>): { error: string } | { patch: Record<string, unknown> } {
  const patch: Record<string, unknown> = {};
  for (const k of PATCHABLE) {
    if (!(k in body)) continue;
    const v = body[k];
    if (k === 'kind') {
      if (!BACKEND_KINDS.includes(v as BackendKind)) return { error: 'ungültiger kind-Wert' };
      patch[k] = v;
    } else if (k === 'priority') {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) return { error: 'priority muss eine Ganzzahl ≥ 0 sein' };
      patch[k] = n;
    } else if (k === 'enabled') {
      patch[k] = Boolean(v);
    } else if (k === 'fixups') {
      if (!Array.isArray(v) || !v.every((f) => KNOWN_FIXUPS.includes(f as Fixup)))
        return { error: 'fixups enthält einen unbekannten Wert' };
      patch[k] = v;
    } else if (k === 'model_aliases') {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'model_aliases muss ein Objekt sein' };
      patch[k] = v;
    } else if (k === 'api_key_env') {
      const s = typeof v === 'string' ? v.trim() : '';
      patch[k] = s || null;
    } else {
      const s = typeof v === 'string' ? v.trim() : '';
      if (!s) return { error: `${k} darf nicht leer sein` };
      patch[k] = s;
    }
  }
  if (Object.keys(patch).length === 0) return { error: 'Keine gültigen Felder zum Aktualisieren.' };
  return { patch };
}

export const PUT: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  let body: Record<string, unknown>;
  try { body = (await request.json()) as Record<string, unknown>; }
  catch { return json({ error: 'invalid_json' }, 400); }

  const parsed = parsePatch(body);
  if ('error' in parsed) return json({ error: parsed.error }, 400);

  // Disabling the last enabled local backend is refused (same rule as delete).
  if (parsed.patch.enabled === false) {
    const row = await getBackend(id);
    if (row && row.enabled && row.kind !== 'openai-remote') {
      const remaining = await countEnabledLocal(id);
      if (remaining === 0)
        return json({ error: 'Das letzte aktive lokale Backend kann nicht deaktiviert werden.' }, 409);
    }
  }

  try {
    const ok = await updateBackend(id, parsed.patch);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    if ((err as { code?: string }).code === '23505')
      return json({ error: 'Ein Backend mit diesem Namen existiert bereits.' }, 409);
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends/[id]] PUT error:');
    return json({ error: 'update_failed' }, 500);
  }
};

export const DELETE: APIRoute = async ({ request, params, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  const id = Number(params.id);
  if (!Number.isInteger(id) || id <= 0) return json({ error: 'invalid_id' }, 400);

  try {
    const row = await getBackend(id);
    if (!row) return json({ error: 'not_found' }, 404);
    if (row.enabled && row.kind !== 'openai-remote') {
      const remaining = await countEnabledLocal(id);
      if (remaining === 0)
        return json({ error: 'Das letzte aktive lokale Backend kann nicht gelöscht werden.' }, 409);
    }
    const ok = await deleteBackend(id);
    if (!ok) return json({ error: 'not_found' }, 404);
    return json({ ok: true });
  } catch (err) {
    locals.requestLogger.error({ err }, '[api/admin/llm-proxy/backends/[id]] DELETE error:');
    return json({ error: 'delete_failed' }, 500);
  }
};
```

- [ ] **Verify:** `cd website && pnpm astro:check`.

## Task 3: Status- & Reload-Proxy `status.ts` + `reload.ts`

Beide reichen an den host-lokalen Proxy durch. **Offline-Toleranz ist Pflicht:** Die
Cluster-Website erreicht `127.0.0.1:18235` nicht → ein nicht erreichbarer Proxy darf **niemals**
einen 500 auslösen. `LLM_PROXY_URL` kommt aus `process.env`, Default `http://127.0.0.1:18235`.

- [ ] `website/src/pages/api/admin/llm-proxy/status.ts`:

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listBackends } from '../../../../lib/llm-proxy-db';

export const prerender = false;

const PROXY_URL = process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const GET: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`${PROXY_URL}/admin/state`, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json(await res.json());
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    // Offline-tolerant: the cluster website cannot reach the host-local proxy.
    // Fall back to the DB registry so the GUI can still render backends.
    locals.requestLogger.warn({ err }, '[api/admin/llm-proxy/status] proxy offline, DB fallback');
    const backends = await listBackends();
    return json({ proxy: 'offline', backends });
  }
};
```

- [ ] `website/src/pages/api/admin/llm-proxy/reload.ts` (POST → `/admin/reload`, gleiche Toleranz):

```ts
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';

export const prerender = false;

const PROXY_URL = process.env.LLM_PROXY_URL ?? 'http://127.0.0.1:18235';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

async function guard(request: Request): Promise<Response | null> {
  const session = await getSession(request.headers.get('cookie'));
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!isAdmin(session)) return json({ error: 'Forbidden' }, 403);
  return null;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const blocked = await guard(request);
  if (blocked) return blocked;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    try {
      const res = await fetch(`${PROXY_URL}/admin/reload`, { method: 'POST', signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return json({ ok: true });
    } finally {
      clearTimeout(timer);
    }
  } catch (err) {
    locals.requestLogger.warn({ err }, '[api/admin/llm-proxy/reload] proxy offline');
    return json({ proxy: 'offline', reloaded: false });
  }
};
```

- [ ] **Verify:** `cd website && pnpm astro:check`.

## Task 4: Steuerung-Panel `website/src/components/factory/LlmProxyPanel.svelte`

Svelte-5-Runes-Component (`$state`/`$derived`, `onMount`) im Stil von `FactoryModelSlots.svelte`:
`.factory-model-slots`-Container-Muster, `--ink-*`/`--brass`/`--line`-CSS-Variablen, `ff-pill`-Buttons.
Datenquellen: `GET /api/admin/llm-proxy/status` (Proxy-State **oder** `{ proxy:'offline', backends }`)
und `GET /api/factory-model-slots` (`{ slots, catalog }`) für die „Effektive Auflösung". Mutationen
über `PUT /api/admin/llm-proxy/backends/[id]` (Toggle, Priorität ↑↓), `POST …/backends` (Anlage),
`POST …/llm-proxy/reload` („Jetzt proben").

- [ ] Script-Teil — Typen + Load + Aktionen:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface DiscoveredModel { id: string; loaded?: boolean }
  interface BackendState {
    id: number; name: string; kind: string; base_url: string;
    enabled: boolean; priority: number; health: 'ok' | 'unhealthy' | 'disabled';
    fixups: string[]; models: DiscoveredModel[];
  }
  interface ProxyState {
    proxy: 'online' | 'offline';
    port?: number; uptimeSec?: number; version?: string;
    backends: BackendState[];
  }
  interface ModelSlot { phase: string; provider: string; modelId: string; baseUrl: string | null }

  const KINDS = ['llamacpp', 'lmstudio', 'openai-remote'] as const;

  let state = $state<ProxyState | null>(null);
  let slots = $state<ModelSlot[]>([]);
  let loading = $state(true);
  let error = $state<string | null>(null);
  let probing = $state(false);
  let expanded = $state<Record<number, boolean>>({});

  // Inline create/edit form (FactoryModelSlots-Muster — kein Drawer).
  let editId = $state<number | null>(null);
  let form = $state(blankForm());

  function blankForm() {
    return { name: '', kind: 'llamacpp' as string, base_url: '', api_key_env: '', priority: 10, enabled: true };
  }

  const isOffline = $derived(state?.proxy === 'offline');

  async function load() {
    try {
      loading = true;
      const [stRes, slotRes] = await Promise.all([
        fetch('/api/admin/llm-proxy/status', { credentials: 'same-origin' }),
        fetch('/api/factory-model-slots', { credentials: 'same-origin' }),
      ]);
      if (!stRes.ok) throw new Error(`HTTP ${stRes.status}`);
      state = (await stRes.json()) as ProxyState;
      if (slotRes.ok) slots = (await slotRes.json()).slots ?? [];
      error = null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Laden fehlgeschlagen';
    } finally {
      loading = false;
    }
  }

  async function probe() {
    try {
      probing = true;
      await fetch('/api/admin/llm-proxy/reload', { method: 'POST', credentials: 'same-origin' });
      await load();
    } finally {
      probing = false;
    }
  }

  async function patchBackend(id: number, patch: Record<string, unknown>) {
    const res = await fetch(`/api/admin/llm-proxy/backends/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { error = `Update fehlgeschlagen (HTTP ${res.status})`; return; }
    await load();
  }

  function toggleEnabled(b: BackendState) { patchBackend(b.id, { enabled: !b.enabled }); }
  function bump(b: BackendState, delta: number) { patchBackend(b.id, { priority: Math.max(0, b.priority + delta) }); }

  async function saveForm() {
    const url = editId ? `/api/admin/llm-proxy/backends/${editId}` : '/api/admin/llm-proxy/backends';
    const res = await fetch(url, {
      method: editId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, api_key_env: form.api_key_env.trim() || null }),
    });
    if (!res.ok) { error = `Speichern fehlgeschlagen (HTTP ${res.status})`; return; }
    editId = null; form = blankForm();
    await load();
  }

  function startEdit(b: BackendState) {
    editId = b.id;
    form = { name: b.name, kind: b.kind, base_url: b.base_url, api_key_env: '', priority: b.priority, enabled: b.enabled };
  }

  // Effektive Auflösung: pro Factory-Phase das Modell, das der Proxy JETZT bedienen würde.
  // Exakt-Treffer in einem gesunden Backend → dieses Modell; sonst Fallback aufs erste Modell
  // des höchstprioren gesunden Backends (design §2).
  function resolvePhase(slot: ModelSlot): { served: string; fallback: boolean; backend: string } {
    const healthy = (state?.backends ?? [])
      .filter((b) => b.enabled && b.health === 'ok')
      .sort((a, b) => a.priority - b.priority);
    for (const b of healthy) {
      if (b.models.some((m) => m.id === slot.modelId)) return { served: slot.modelId, fallback: false, backend: b.name };
    }
    const top = healthy[0];
    if (top && top.models[0]) return { served: top.models[0].id, fallback: true, backend: top.name };
    return { served: '—', fallback: false, backend: '—' };
  }

  onMount(load);
</script>
```

- [ ] Markup-Teil — Status-Zeile, Backend-Tabelle (Health-Badge, Priorität ↑↓, enabled-Toggle,
      aufklappbare Modelle mit loaded-Badge), „Jetzt proben", Inline-Form, „Effektive Auflösung":

```svelte
<div class="llm-proxy-panel">
  <div class="lp-header">
    <h3>LLM-Proxy</h3>
    <button class="ff-pill ff-pill--ghost" onclick={probe} disabled={probing}>
      {probing ? 'Probe läuft…' : 'Jetzt proben'}
    </button>
  </div>

  {#if loading}
    <div class="lp-loading">Status wird geladen…</div>
  {:else if error && !state}
    <div class="lp-error"><p>{error}</p><button class="ff-pill ff-pill--ghost" onclick={load}>Erneut</button></div>
  {:else if state}
    {#if isOffline}
      <div class="lp-offline">Proxy offline — Start: <code>task llm:proxy:start</code></div>
    {:else}
      <div class="lp-status">
        <span class="lp-dot lp-dot--ok"></span> online · Port {state.port ?? '—'} ·
        Uptime {state.uptimeSec ? `${Math.floor(state.uptimeSec / 60)}m` : '—'} · v{state.version ?? '—'}
      </div>
    {/if}

    <table class="lp-table">
      <thead><tr><th>Name</th><th>Kind</th><th>URL</th><th>Health</th><th>Prio</th><th>An</th><th></th></tr></thead>
      <tbody>
        {#each state.backends as b (b.id)}
          <tr>
            <td>{b.name}</td>
            <td>{b.kind}</td>
            <td class="lp-url">{b.base_url}</td>
            <td><span class="lp-badge lp-badge--{b.health}">{b.health}</span></td>
            <td class="lp-prio">
              {b.priority}
              <button aria-label="höher" onclick={() => bump(b, -1)} disabled={isOffline}>↑</button>
              <button aria-label="niedriger" onclick={() => bump(b, 1)} disabled={isOffline}>↓</button>
            </td>
            <td><input type="checkbox" checked={b.enabled} onchange={() => toggleEnabled(b)} /></td>
            <td>
              <button class="ff-pill ff-pill--ghost" onclick={() => (expanded[b.id] = !expanded[b.id])}>Modelle</button>
              <button class="ff-pill ff-pill--ghost" onclick={() => startEdit(b)}>Bearbeiten</button>
            </td>
          </tr>
          {#if expanded[b.id]}
            <tr class="lp-models-row"><td colspan="7">
              {#if b.models.length === 0}
                <span class="lp-mute">keine Modelle entdeckt</span>
              {:else}
                {#each b.models as m}
                  <span class="lp-model">{m.id}{#if m.loaded}<span class="lp-badge lp-badge--ok">loaded</span>{/if}</span>
                {/each}
              {/if}
            </td></tr>
          {/if}
        {/each}
      </tbody>
    </table>

    <!-- Inline-Form: Anlage/Edit (FactoryModelSlots-Muster, kein Drawer) -->
    <div class="lp-form">
      <h4>{editId ? 'Backend bearbeiten' : 'Backend anlegen'}</h4>
      <input placeholder="Name" bind:value={form.name} />
      <select bind:value={form.kind}>{#each KINDS as k}<option value={k}>{k}</option>{/each}</select>
      <input placeholder="Base URL" bind:value={form.base_url} />
      <input placeholder="API-Key-Env-Name (optional)" bind:value={form.api_key_env} />
      <input type="number" min="0" bind:value={form.priority} />
      <label><input type="checkbox" bind:checked={form.enabled} /> enabled</label>
      <button class="ff-pill" onclick={saveForm}>{editId ? 'Speichern' : 'Anlegen'}</button>
      {#if editId}<button class="ff-pill ff-pill--ghost" onclick={() => { editId = null; form = blankForm(); }}>Abbrechen</button>{/if}
    </div>

    <div class="lp-resolution">
      <h4>Effektive Auflösung pro Phase</h4>
      {#each slots as slot (slot.phase)}
        {@const r = resolvePhase(slot)}
        <div class="lp-res-row">
          <span class="lp-phase">{slot.phase}</span>
          <span>{r.served} <span class="lp-mute">@ {r.backend}</span></span>
          {#if r.fallback}<span class="lp-fallback">→ Fallback auf {r.served}</span>{/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  /* Übernimmt die --ink-*/--brass/--line/--radius-*-Variablen und das ff-pill-Muster aus
     FactoryModelSlots.svelte; kompakt gehalten (< 500 Zeilen Gesamtdatei). Health-Badges:
     --ok = grün/brass, --unhealthy = var(--danger), --disabled = var(--mute). */
  .llm-proxy-panel { background: var(--ink-850); border: 1px solid var(--line); border-radius: var(--radius-lg); padding: 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
  .lp-header { display: flex; align-items: center; justify-content: space-between; }
  .lp-offline { color: var(--danger); font-family: var(--mono); font-size: 13px; }
  .lp-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .lp-badge--unhealthy { color: var(--danger); }
  .lp-fallback { color: var(--brass); font-size: 12px; }
</style>
```

- [ ] **Verify:** `cd website && pnpm astro:check`. Zeilenzahl prüfen:
      `wc -l website/src/components/factory/LlmProxyPanel.svelte` muss < 500 sein — sonst Inline-Form
      in `LlmProxyBackendForm.svelte` extrahieren.

## Task 5: `LlmProxyPanel` im Steuerung-Tab rendern (`DevStatusTabs.svelte`, Budget 172)

Neben `FactoryModelSlots`/`KiRoutingPanel` in den bestehenden `control-extras`-Container — **kein
neuer Tab** (`'control'` existiert bereits, Z20/Z155/Z170-172).

- [ ] **Anker Z7** — Import ergänzen (nach `KiRoutingPanel`-Import):

```svelte
  import LlmProxyPanel from './factory/LlmProxyPanel.svelte';
```

- [ ] **Anker Z172** — den `control-extras`-Zweig ersetzen (fügt das Panel als drittes Kind hinzu):

```svelte
{:else if activeTab === 'control'}
  <ControlPanel />
  <div class="control-extras"><FactoryModelSlots /><KiRoutingPanel /><LlmProxyPanel /></div>
```

(Das Panel spannt bei drei Kindern die bestehende `.control-extras`-2-Spalten-Grid-Regel Z244-248
in eine zweite Reihe — akzeptabel; optional `grid-template-columns` unverändert lassen. Netto
+2 Zeilen, weit im 172er-Budget.)

- [ ] **Verify:** `cd website && pnpm astro:check`.

## Task 6: Sidekick-Drawer-View `website/src/components/assistant/LlmProxyView.svelte`

Kompakte Version des Panels für den Sidekick-Drawer (Muster: `AiQualitySidekickView.svelte` /
der `agent-settings`-View mit „Im Steuerung-Tab bearbeiten"-Link, PortalSidekick Z303). Nur
Read + enabled-Toggle + Reload; kein Anlegen/Editieren (das lebt im Steuerung-Tab).

- [ ] Datei anlegen:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  interface BackendState { id: number; name: string; kind: string; enabled: boolean; health: 'ok' | 'unhealthy' | 'disabled' }
  interface ProxyState { proxy: 'online' | 'offline'; backends: BackendState[] }

  let state = $state<ProxyState | null>(null);
  let loading = $state(true);
  let busy = $state(false);

  async function load() {
    try {
      loading = true;
      const res = await fetch('/api/admin/llm-proxy/status', { credentials: 'same-origin' });
      state = res.ok ? ((await res.json()) as ProxyState) : null;
    } finally {
      loading = false;
    }
  }

  async function reload() {
    try { busy = true; await fetch('/api/admin/llm-proxy/reload', { method: 'POST', credentials: 'same-origin' }); await load(); }
    finally { busy = false; }
  }

  async function toggle(b: BackendState) {
    busy = true;
    await fetch(`/api/admin/llm-proxy/backends/${b.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: !b.enabled }),
    });
    await load(); busy = false;
  }

  onMount(load);
</script>

<div class="lpv">
  {#if loading}
    <p class="lpv-mute">Status wird geladen…</p>
  {:else if !state || state.proxy === 'offline'}
    <p class="lpv-offline">Proxy offline — Start: <code>task llm:proxy:start</code></p>
  {:else}
    <p class="lpv-status"><span class="lpv-dot lpv-dot--ok"></span> online · {state.backends.length} Backends</p>
    <ul class="lpv-list">
      {#each state.backends as b (b.id)}
        <li>
          <span class="lpv-dot lpv-dot--{b.health}"></span>
          <span class="lpv-name">{b.name}</span>
          <span class="lpv-kind">{b.kind}</span>
          <input type="checkbox" checked={b.enabled} disabled={busy} onchange={() => toggle(b)} />
        </li>
      {/each}
    </ul>
  {/if}
  <div class="lpv-actions">
    <button onclick={reload} disabled={busy}>{busy ? 'Lädt…' : 'Neu proben'}</button>
    <a href="/admin/pipeline?tab=control">Im Steuerung-Tab bearbeiten</a>
  </div>
</div>

<style>
  .lpv { display: flex; flex-direction: column; gap: 12px; padding: 16px 22px; }
  .lpv-offline { color: var(--danger); font-family: var(--mono); font-size: 13px; }
  .lpv-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .lpv-list li { display: grid; grid-template-columns: 12px 1fr auto auto; align-items: center; gap: 10px; }
  .lpv-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--mute); }
  .lpv-dot--ok { background: var(--brass); }
  .lpv-dot--unhealthy { background: var(--danger); }
  .lpv-actions { display: flex; gap: 12px; align-items: center; }
  .lpv-actions a { color: var(--brass); font-size: 13px; }
</style>
```

- [ ] **Verify:** `cd website && pnpm astro:check`.

## Task 7: Sidekick-Verdrahtung `PortalSidekick.svelte` (Budget 27 — Zweig ≤ 12 Zeilen)

**Alle Logik lebt in `LlmProxyView.svelte`.** Hier nur drei minimale Edits (netto +3 Zeilen):

- [ ] **Anker Z13** — `'llm-proxy'` in die `View`-Union aufnehmen (Edit in-place, 0 netto):

```svelte
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'terminal' | 'cockpit' | 'ai-quality' | 'logs' | 'agent-settings' | 'llm-proxy';
```

- [ ] **Anker Z61** — nach dem `'agent-settings': 'Agenten-Einstellungen',`-Eintrag der `titleMap`
      die neue Zeile einfügen (+1):

```svelte
    'llm-proxy': 'LLM-Proxy',
```

- [ ] **Anker Z292** — nach dem `logs`-Lazy-Zweig (vor `{:else if view === 'agent-settings'}`)
      den Lazy-Import-Zweig einfügen (+2):

```svelte
    {:else if view === 'llm-proxy'}
      {#await import('./assistant/LlmProxyView.svelte') then { default: V }}<V />{/await}
```

- [ ] **Verify:** `cd website && pnpm astro:check` **und** `wc -l website/src/components/PortalSidekick.svelte`
      muss ≤ 578 bleiben (Ist 551 + 3 = 554, im Budget).

## Task 8: Menüeintrag `SidekickHome.svelte` (Budget 194)

- [ ] **Anker Z2** — `'llm-proxy'` in die lokale `View`-Union aufnehmen (Edit in-place, muss mit
      PortalSidekicks Union deckungsgleich sein):

```svelte
  type View = 'home' | 'support' | 'questionnaire' | 'help' | 'agent-guide' | 'mediaviewer' | 'terminal' | 'cockpit' | 'ai-quality' | 'logs' | 'agent-settings' | 'llm-proxy';
```

- [ ] **Anker Z31** — nach dem `agent-settings`-Item (`no: '05'`) genau **eine** neue Item-Zeile
      einfügen und die `no:`-Nummern der nachfolgenden Items um eins verschieben. Die neue Zeile:

```svelte
    { id: 'llm-proxy', no: '06', title: 'LLM-Proxy', sub: 'Backends · Modelle · Routing', show: isAdmin },
```

- [ ] **Anker Z32-Z36** — die `no:`-Werte der fünf Folge-Items (nur der `isAdmin`-Zweig des
      ternären Ausdrucks) um eins erhöhen, damit die Nummerierung lückenlos bleibt
      (`questionnaire` → `isAdmin ? '07'`, `support` → `'08'`, `agent-guide` → `'09'`,
      `mediaviewer` → `'10'`, `help` → `'11'`). Beispiel `questionnaire`:

```svelte
    { id: 'questionnaire', no: isAdmin ? '07' : '01', title: 'Fragebögen', sub: 'Aufgaben beantworten', badge: pendingQuestionnaires > 0 ? pendingQuestionnaires : undefined, show: true },
```

  (Die Nicht-Admin-Nummern `'01'`–`'05'` bleiben unverändert — `llm-proxy` ist `show: isAdmin`
  und erscheint für Nicht-Admins nicht.)

- [ ] **Verify:** `cd website && pnpm astro:check`. Netto +1 Zeile (306 → 307, Budget 194).

## Abhängigkeiten & Reihenfolge

- Tasks 1→3 (DB + API) vor 4/6 (Components fetchen gegen die Endpunkte), 4 vor 5, 6 vor 7/8.
  Zur Compile-Zeit sind alle Dateien disjunkt zu `p1`/`p3`.
- Zur **Laufzeit** liefert erst der laufende Proxy (`p`-Partial, `task llm:proxy:start`) echte
  `/admin/state`-Daten; bis dahin rendert die GUI über den offline-toleranten `status.ts`-Fallback
  sauber den DB-Stand mit „Proxy offline"-Hinweis statt eines Fehlers.
- Kein Brand-Domain-Literal (S3), kein neues Manifest (S4 für `.svelte`/`.ts` in `website/src`
  nicht einschlägig — die neuen API-Routen sind über Astro-File-Routing automatisch erreichbar).
- Vitest-Abdeckung für `llm-proxy-db.ts` und `status.ts` (offline-Pfad) liegt in `p3` (Design §Testing).
