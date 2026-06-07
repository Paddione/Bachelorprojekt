---
title: Asset Generator Completion: End-to-End 3D Pipeline Implementation Plan
ticket_id: T000505
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
---

# Asset Generator Completion: End-to-End 3D Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Close every gap in the existing 3D asset-generation pipeline so that uploading an image in the admin UI produces a Mixamo-rigged GLB skin in Brett, with full CI coverage that runs without a GPU host.

**Architecture:** The website orchestrates a staged pipeline (`generating → rigging → uploading → done`). ComfyUI (Hunyuan3D-2) generates an unrigged GLB; a new FastAPI Rigger service (Blender headless) adds Mixamo-compatible bones; Brett validates and stores the rigged GLB. State lives in a new `assets.generation_jobs` table with a `stage` column. All external HTTP calls use injectable `fetchFn` so the pipeline is fully mockable in vitest. GPU-host setup is captured in idempotent scripts; a new K8s headless Service/Endpoints exposes the Rigger like the existing ComfyUI gateway.

**Tech Stack:** Astro (website API routes, TypeScript), vitest (website tests), Express + `tsx --test`/`node:test` (Brett), PostgreSQL 16 (`assets` schema), FastAPI + uvicorn + Blender (GPU host), Kustomize/envsubst (K8s manifests).

---

## File Structure

**Website (TypeScript):**
- `website/src/lib/generation-jobs.ts` — MODIFY: add `stage` to interface + queries, add `updateJobStage()`.
- `website/src/lib/rigger-client.ts` — CREATE: `rigGlb()` client with injectable `fetchFn` (mirrors `comfy-client.ts`).
- `website/src/pages/api/admin/generate-3d/status.ts` — MODIFY: insert the rigging stage between ComfyUI download and Brett upload; drive the stage machine.
- `website/src/lib/generate-3d-pipeline.test.ts` — CREATE: 8 vitest tests (ComfyUI + Rigger + Brett mocked).
- `website/src/db/migrations/20260607_add_model_3d_type.sql` — CREATE: enum extension.
- `website/src/db/migrations/20260607_create_generation_jobs.sql` — CREATE: add `stage` column (table already created earlier by `generate-3d.ts` callers expecting it; this migration is authoritative DDL).

**Brett (TypeScript):**
- `brett/src/server/skins-upload.ts` — CREATE: pure, unit-testable validation/storage helpers + an `attachSkinsUpload(app)` wirer.
- `brett/src/server/index.ts` — MODIFY: call `attachSkinsUpload(app)`.
- `brett/test/skins-upload.test.ts` — CREATE: 5 `node:test` tests.

**GPU-host scripts (repo, not deployed):**
- `scripts/setup-comfyui.sh` — CREATE: idempotent installer.
- `scripts/start-comfyui.sh` — CREATE: launch ComfyUI + Rigger in screen.
- `scripts/rigger_server.py` — CREATE: FastAPI `/rig`.
- `scripts/rig_for_mixamo.py` — CREATE: Blender headless rigging script.

**Infra / config:**
- `prod/rigger-gpu.yaml` — CREATE: headless Service + Endpoints (port 8190).
- `prod/kustomization.yaml` — MODIFY: add `rigger-gpu.yaml` to resources.
- `environments/schema.yaml` — MODIFY: register `RIGGER_HOST_IP`, `RIGGER_PORT`.
- `k3d/website.yaml` — MODIFY: expose `RIGGER_HOST_IP`, `RIGGER_PORT` env vars on the website Deployment.
- `Taskfile.yml` — MODIFY: add `RIGGER_HOST_IP`/`RIGGER_PORT` to the prod-deploy ENVSUBST list, the website ConfigMap envsubst lists, and export defaults.

---

## Important Pre-Read Context (do NOT skip)

- **Brett does NOT use vitest.** Its test runner is `MOCK_DB=true tsx --test test/*.test.ts` (Node's built-in `node:test`). Brett tests `import { test } from 'node:test'` and `import assert from 'node:assert/strict'`. Look at `brett/test/auth.test.ts` for the exact pattern. Do NOT introduce vitest/jest into Brett.
- **Website unit tests use vitest** (`vitest run`, config at `website/vitest.config.ts`, include glob `src/**/*.{test,spec}.ts`). Run a single website test file with `cd website && npx vitest run src/lib/generate-3d-pipeline.test.ts`.
- **`multer` is already a Brett dependency** (`brett/package.json` `dependencies.multer`) but currently unused. `@types/multer` is NOT installed — add it as a devDependency.
- **Migrations are NOT auto-applied.** There is no migration runner. These `.sql` files are artifacts applied manually via `kubectl exec ... psql`. Document the apply command in the migration files and in this plan; do not wire any runner.
- **The website code already expects `assets.generation_jobs` to exist** (`generation-jobs.ts` queries it) and `INSERT`s `type: 'model_3d'` into `assets.registry` (`status.ts:58`). So the DDL is currently *missing in the DB* — the migrations make the schema match the code. The `model_3d` enum value and the table must both be applied before the feature works in any live env.
- **`comfy-client.ts` is the DI template.** Every exported fn takes `fetchFn: typeof fetch = fetch` as its last arg. The new `rigger-client.ts` MUST follow this exact convention so tests can inject mocks.
- **Brett's `BRETT_OIDC_SECRET` auth pattern** already exists for `x-e2e-secret` (see `app.post('/auth/e2e-login')` at `index.ts:136` and `canCreateTemplate` at `index.ts:263`). Reuse the same header + `process.env.BRETT_OIDC_SECRET` check.

---

## Task 1: Add `stage` to generation-jobs lib

**Files:**
- Modify: `website/src/lib/generation-jobs.ts`

The `GenerationJob` interface and all queries currently lack the `stage` field. The DB column will be added in Task 6. We add the TypeScript surface here first (the lib is imported by `status.ts` which Task 4 rewrites).

- [x] **Step 1: Add `stage` to the interface and a `STAGE` union type**

In `website/src/lib/generation-jobs.ts`, replace the `GenerationJob` interface (lines 3–11) with:

```typescript
export type JobStage =
  | 'queued'
  | 'generating'
  | 'rigging'
  | 'uploading'
  | 'done'
  | 'error';

export interface GenerationJob {
  id: string;
  name: string;
  prompt_id: string | null;
  stage: JobStage;
  status: 'pending' | 'running' | 'done' | 'error';
  skin_id: string | null;
  error_msg: string | null;
  created_at: string;
}
```

- [x] **Step 2: Add `updateJobStage()` after `updateJobStatus()`**

Insert this function in `website/src/lib/generation-jobs.ts` immediately after the `updateJobStatus` function (after its closing brace, ~line 39). It updates `stage` and derives the legacy `status` column for backward compatibility (`done`→`done`, `error`→`error`, else `pending`):

```typescript
export async function updateJobStage(
  id: string,
  stage: JobStage,
  extra: { skin_id?: string; error_msg?: string } = {},
): Promise<void> {
  const status =
    stage === 'done' ? 'done' : stage === 'error' ? 'error' : 'pending';
  await pool.query(
    `UPDATE assets.generation_jobs
     SET stage = $1,
         status = $2,
         skin_id = COALESCE($3, skin_id),
         error_msg = COALESCE($4, error_msg)
     WHERE id = $5`,
    [stage, status, extra.skin_id ?? null, extra.error_msg ?? null, id],
  );
}
```

- [x] **Step 3: Surface `stage` in the SELECT-based reads**

`getJob` (currently `SELECT *`) and `listRecentJobs` (currently `SELECT *`) already return every column, so once the DB column exists they will include `stage`. No query change needed — but confirm both use `SELECT *` (they do). Leave them as-is.

- [x] **Step 4: Run the website unit suite to ensure nothing broke at type level**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/generation-jobs 2>&1 | tail -20`
Expected: no test file exists yet for this lib, so vitest reports "No test files found" for that pattern OR the broader suite passes. Either is acceptable; the goal is no TypeScript compile error in the file. If you want a hard type check: `cd /tmp/wt-asset-gen/website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep generation-jobs || echo "no type errors in generation-jobs.ts"`
Expected: `no type errors in generation-jobs.ts`

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-asset-gen
git add website/src/lib/generation-jobs.ts
git commit -m "feat(asset-gen): add stage field + updateJobStage to generation-jobs lib

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 2: Rigger client (website lib, TDD)

**Files:**
- Create: `website/src/lib/rigger-client.ts`
- Test: covered by Task 5's pipeline test (no standalone test file — the client is trivial passthrough exercised via the pipeline mocks). We still write a focused unit test inline here to keep TDD discipline.
- Test: `website/src/lib/rigger-client.test.ts`

- [x] **Step 1: Write the failing test**

Create `website/src/lib/rigger-client.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { rigGlb } from './rigger-client';

describe('rigGlb', () => {
  it('POSTs the GLB to /rig?method=blender and returns the rigged ArrayBuffer', async () => {
    const riggedBytes = new Uint8Array([1, 2, 3]).buffer;
    const fetchFn = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://rig-host:8190/rig?method=blender');
      expect(init?.method).toBe('POST');
      expect(init?.body).toBeInstanceOf(FormData);
      return new Response(riggedBytes, { status: 200 });
    }) as unknown as typeof fetch;

    const out = await rigGlb('http://rig-host:8190', new Uint8Array([9]).buffer, 'x.glb', fetchFn);
    expect(new Uint8Array(out)).toEqual(new Uint8Array([1, 2, 3]));
    expect(fetchFn).toHaveBeenCalledOnce();
  });

  it('throws on non-OK response', async () => {
    const fetchFn = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await expect(
      rigGlb('http://rig-host:8190', new Uint8Array([9]).buffer, 'x.glb', fetchFn),
    ).rejects.toThrow('Rigger failed: 500');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/rigger-client.test.ts 2>&1 | tail -15`
Expected: FAIL with a module-resolution error (`Cannot find module './rigger-client'`).

- [x] **Step 3: Write minimal implementation**

Create `website/src/lib/rigger-client.ts`:

```typescript
// Client for the GPU-host Rigger service (FastAPI, port 8190).
// Mirrors comfy-client.ts: every fn takes an injectable fetchFn for testing.

export async function rigGlb(
  baseUrl: string,
  glb: ArrayBuffer,
  filename: string,
  fetchFn: typeof fetch = fetch,
  method: 'blender' | 'mixamo' = 'blender',
): Promise<ArrayBuffer> {
  const form = new FormData();
  form.append('glb', new Blob([glb], { type: 'model/gltf-binary' }), filename);
  const res = await fetchFn(`${baseUrl}/rig?method=${method}`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error(`Rigger failed: ${res.status}`);
  return res.arrayBuffer();
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/rigger-client.test.ts 2>&1 | tail -15`
Expected: PASS (2 passing).

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-asset-gen
git add website/src/lib/rigger-client.ts website/src/lib/rigger-client.test.ts
git commit -m "feat(asset-gen): add rigger-client with injectable fetchFn

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Brett skins-upload helpers (pure, TDD)

**Files:**
- Create: `brett/src/server/skins-upload.ts`
- Test: `brett/test/skins-upload.test.ts`

We extract pure helpers (`checkSkinAuth`, `validateGlbSize`, `glbHasMixamoBones`) so they are unit-testable without spinning up Express, then a thin `attachSkinsUpload(app)` wirer used in Task 4-equivalent server wiring (Task 3b below). Brett uses `node:test`, NOT vitest.

- [x] **Step 1: Add `@types/multer` devDependency**

Run: `cd /tmp/wt-asset-gen/brett && pnpm add -D @types/multer`
Expected: `@types/multer` added to `brett/package.json` devDependencies. (`multer` itself is already a dependency.)

- [x] **Step 2: Write the failing test**

Create `brett/test/skins-upload.test.ts`. The GLB bone check parses the GLB binary's JSON chunk and looks for `mixamorigHips` in the glTF `nodes[].name` array. We build minimal valid GLBs in-memory.

```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSkinAuth,
  validateGlbSize,
  glbHasMixamoBones,
  MAX_SKIN_BYTES,
} from '../src/server/skins-upload';

// Build a minimal GLB (12-byte header + JSON chunk) carrying the given glTF JSON.
function makeGlb(gltf: object): Buffer {
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  // pad JSON chunk to 4-byte boundary with spaces
  const pad = (4 - (json.length % 4)) % 4;
  const jsonChunk = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(12);
  header.write('glTF', 0, 'ascii');
  header.writeUInt32LE(2, 4); // version
  header.writeUInt32LE(12 + 8 + jsonChunk.length, 8); // total length
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(jsonChunk.length, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'
  return Buffer.concat([header, chunkHeader, jsonChunk]);
}

const RIGGED = makeGlb({ nodes: [{ name: 'mixamorigHips' }, { name: 'mixamorigSpine' }] });
const UNRIGGED = makeGlb({ nodes: [{ name: 'Mesh' }] });

test('checkSkinAuth: true only when header matches BRETT_OIDC_SECRET', () => {
  const env = { BRETT_OIDC_SECRET: 'sek' } as NodeJS.ProcessEnv;
  assert.equal(checkSkinAuth('sek', env), true);
  assert.equal(checkSkinAuth('wrong', env), false);
  assert.equal(checkSkinAuth(undefined, env), false);
  assert.equal(checkSkinAuth('sek', {} as NodeJS.ProcessEnv), false); // no secret configured
});

test('validateGlbSize: rejects > 20 MB', () => {
  assert.equal(validateGlbSize(MAX_SKIN_BYTES), true);
  assert.equal(validateGlbSize(MAX_SKIN_BYTES + 1), false);
  assert.equal(validateGlbSize(1024), true);
});

test('glbHasMixamoBones: true when mixamorigHips node present', () => {
  assert.equal(glbHasMixamoBones(RIGGED), true);
});

test('glbHasMixamoBones: false when mixamorigHips absent', () => {
  assert.equal(glbHasMixamoBones(UNRIGGED), false);
});

test('glbHasMixamoBones: false on malformed/non-GLB buffer', () => {
  assert.equal(glbHasMixamoBones(Buffer.from('not a glb')), false);
});
```

- [x] **Step 3: Run test to verify it fails**

Run: `cd /tmp/wt-asset-gen/brett && MOCK_DB=true npx tsx --test test/skins-upload.test.ts 2>&1 | tail -20`
Expected: FAIL — `Cannot find module '../src/server/skins-upload'`.

- [x] **Step 4: Write the helpers**

Create `brett/src/server/skins-upload.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import multer from 'multer';

export const MAX_SKIN_BYTES = 20 * 1024 * 1024; // 20 MB

// Storage root: brett/public/assets/skins/<uuid>/
const SKINS_ROOT = path.join(__dirname, '..', '..', 'public', 'assets', 'skins');

export function checkSkinAuth(
  headerValue: string | undefined,
  env: NodeJS.ProcessEnv,
): boolean {
  const secret = env.BRETT_OIDC_SECRET;
  return !!secret && headerValue === secret;
}

export function validateGlbSize(byteLength: number): boolean {
  return byteLength <= MAX_SKIN_BYTES;
}

// Parse the GLB JSON chunk and check for a node named 'mixamorigHips'.
// Returns false on any parse failure (fail-closed).
export function glbHasMixamoBones(buf: Buffer): boolean {
  try {
    if (buf.length < 20) return false;
    if (buf.toString('ascii', 0, 4) !== 'glTF') return false;
    const jsonChunkLen = buf.readUInt32LE(12);
    const jsonChunkType = buf.readUInt32LE(16);
    if (jsonChunkType !== 0x4e4f534a) return false; // not 'JSON'
    const jsonStr = buf.toString('utf8', 20, 20 + jsonChunkLen);
    const gltf = JSON.parse(jsonStr);
    const nodes: Array<{ name?: string }> = Array.isArray(gltf.nodes) ? gltf.nodes : [];
    return nodes.some((n) => n.name === 'mixamorigHips');
  } catch {
    return false;
  }
}

export interface SkinMeta {
  id: string;
  name: string;
  source: string;
  animations: string[];
  created_at: string;
}

// Persist the GLB + meta.json; returns the generated skin id.
export function storeSkin(buf: Buffer, name: string): SkinMeta {
  const id = randomUUID();
  const dir = path.join(SKINS_ROOT, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'skin.glb'), buf);
  const meta: SkinMeta = {
    id,
    name,
    source: 'hunyuan3d-2',
    animations: [],
    created_at: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2));
  return meta;
}

// Wire POST /api/skins/upload onto the Express app.
export function attachSkinsUpload(app: Express): void {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_SKIN_BYTES + 1 }, // +1 so we can return 413 ourselves
  });

  app.post(
    '/api/skins/upload',
    upload.single('glb'),
    (req: Request & { file?: Express.Multer.File }, res: Response) => {
      if (!checkSkinAuth(req.header('x-e2e-secret') ?? undefined, process.env)) {
        return res.status(401).json({ error: 'unauthorized' });
      }
      const file = req.file;
      const name = String((req.body && req.body.name) || '').trim() || 'skin';
      if (!file) {
        return res.status(400).json({ error: 'glb file required' });
      }
      if (!validateGlbSize(file.size)) {
        return res.status(413).json({ error: 'glb exceeds 20 MB' });
      }
      if (!glbHasMixamoBones(file.buffer)) {
        return res.status(422).json({ error: 'missing mixamorigHips bone' });
      }
      const meta = storeSkin(file.buffer, name);
      return res.status(200).json({ id: meta.id, animations: meta.animations });
    },
  );
}
```

- [x] **Step 5: Run test to verify it passes**

Run: `cd /tmp/wt-asset-gen/brett && MOCK_DB=true npx tsx --test test/skins-upload.test.ts 2>&1 | tail -20`
Expected: PASS — 5 tests pass.

- [x] **Step 6: Commit**

```bash
cd /tmp/wt-asset-gen
git add brett/src/server/skins-upload.ts brett/test/skins-upload.test.ts brett/package.json brett/pnpm-lock.yaml
git commit -m "feat(brett): skins-upload validation helpers + multer route (TDD)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3b: Wire skins-upload into the Brett server + auth/size integration tests

**Files:**
- Modify: `brett/src/server/index.ts`
- Test: `brett/test/skins-upload.test.ts` (extend)

The spec's 5 tests include "kein Auth → 401" and "GLB zu groß → 413" which exercise the *route*, not just helpers. We add route-level tests via Express directly (no listening socket needed; use `app` import + a lightweight request driver). Brett's `index.ts` exports `app`.

- [x] **Step 1: Add the route-level failing tests**

Append to `brett/test/skins-upload.test.ts`. Use `node:http` against the exported `server`-less app is awkward; instead import `attachSkinsUpload` onto a fresh express app and drive it with `supertest`-style raw http. Simplest: spin a throwaway express app + real listen on an ephemeral port.

```typescript
import express from 'express';
import { attachSkinsUpload } from '../src/server/skins-upload';
import { once } from 'node:events';

async function startApp(): Promise<{ port: number; close: () => void }> {
  const app = express();
  attachSkinsUpload(app);
  const srv = app.listen(0);
  await once(srv, 'listening');
  const addr = srv.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return { port, close: () => srv.close() };
}

async function postGlb(
  port: number,
  glb: Buffer,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append('glb', new Blob([glb]), 'skin.glb');
  form.append('name', 'test-skin');
  const res = await fetch(`http://127.0.0.1:${port}/api/skins/upload`, {
    method: 'POST',
    headers,
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

test('POST /api/skins/upload: 200 for valid rigged GLB with correct auth', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status, body } = await postGlb(port, RIGGED, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 200);
    assert.ok(typeof body.id === 'string');
    assert.deepEqual(body.animations, []);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 401 without auth header', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, RIGGED);
    assert.equal(status, 401);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 401 with wrong auth header', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, RIGGED, { 'x-e2e-secret': 'nope' });
    assert.equal(status, 401);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 422 for GLB missing mixamorigHips', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    const { status } = await postGlb(port, UNRIGGED, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 422);
  } finally {
    close();
  }
});

test('POST /api/skins/upload: 413 for GLB over 20 MB', async () => {
  process.env.BRETT_OIDC_SECRET = 'sek';
  const { port, close } = await startApp();
  try {
    // 20 MB + 1 of valid-GLB-prefixed bytes. Build a big rigged GLB by padding.
    const big = Buffer.concat([RIGGED, Buffer.alloc(MAX_SKIN_BYTES, 0)]);
    const { status } = await postGlb(port, big, { 'x-e2e-secret': 'sek' });
    assert.equal(status, 413);
  } finally {
    close();
  }
});
```

> NOTE: multer's `limits.fileSize` is `MAX_SKIN_BYTES + 1`, so a file of exactly `MAX_SKIN_BYTES + N` is still read into memory and our `validateGlbSize` returns the 413. If multer aborts first with its own error, the 413 still surfaces via the generic handler — but here we keep the limit one byte above the threshold specifically so our explicit 413 path runs. Storing skins under `public/assets/skins/` during the 200-path test writes real files; that is acceptable for the test (they land under the worktree). Add `brett/public/assets/skins/` to `.gitignore` in Step 3 so test artifacts are never committed.

- [x] **Step 2: Wire the route into the real server**

In `brett/src/server/index.ts`, add the import near the other server imports (after line 20, the `undoStackModule` import):

```typescript
import { attachSkinsUpload } from './skins-upload';
```

Then add the wiring call immediately after the `/presets` routes block and BEFORE the generic error handler (`app.use((err: any, ...` at line 323). Place it right after the `app.delete('/presets/:id', ...)` block (ends ~line 320):

```typescript
// ─── Skins upload (3D asset-generation pipeline target) ───────────────────────
attachSkinsUpload(app);
```

- [x] **Step 3: Ignore generated skin artifacts**

Add to `brett/.gitignore` (create if absent) the line:

```
public/assets/skins/
```

- [x] **Step 4: Run the full Brett upload test file**

Run: `cd /tmp/wt-asset-gen/brett && MOCK_DB=true npx tsx --test test/skins-upload.test.ts 2>&1 | tail -25`
Expected: PASS — all 10 tests (5 helper + 5 route) pass.

- [x] **Step 5: Run the whole Brett suite to ensure the wiring did not break existing tests**

Run: `cd /tmp/wt-asset-gen/brett && pnpm test 2>&1 | tail -25`
Expected: all Brett tests pass (existing + new). If `index.ts` import of `skins-upload` triggers a side effect during other tests, confirm `attachSkinsUpload` is pure aside from route registration (it is).

- [x] **Step 6: Commit**

```bash
cd /tmp/wt-asset-gen
git add brett/src/server/index.ts brett/test/skins-upload.test.ts brett/.gitignore
git commit -m "feat(brett): wire POST /api/skins/upload route + route-level tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Insert the rigging stage into status.ts

**Files:**
- Modify: `website/src/pages/api/admin/generate-3d/status.ts`

Currently `finaliseJob` goes ComfyUI → Brett directly. We insert the Rigger call between the ComfyUI GLB download and the Brett upload, and drive the stage machine via `updateJobStage`. The tests in Task 5 mock all three services. We refactor `finaliseJob` to take an injectable `fetchFn` AND make the per-stage logic exported & testable.

- [x] **Step 1: Add config + imports**

In `website/src/pages/api/admin/generate-3d/status.ts`, update the imports (lines 3–4) to add the rigger client and the stage updater:

```typescript
import { getHistory, downloadOutput, findGlbOutput } from '../../../../lib/comfy-client';
import { rigGlb } from '../../../../lib/rigger-client';
import { getJob, updateJobStatus, updateJobStage, listRecentJobs } from '../../../../lib/generation-jobs';
```

Add Rigger config after the existing `BRETT_*` consts (after line 10):

```typescript
const RIGGER_HOST_IP = import.meta.env.RIGGER_HOST_IP ?? COMFY_HOST_IP;
const RIGGER_PORT = import.meta.env.RIGGER_PORT ?? '8190';

function riggerBase(): string {
  return `http://${RIGGER_HOST_IP}:${RIGGER_PORT}`;
}
```

- [x] **Step 2: Refactor `finaliseJob` into a stage-driven, injectable pipeline**

Replace the entire `finaliseJob` function (lines 16–64) with a version that takes injectable fetch functions and walks the stage machine. The pipeline runs in a single polling tick: ComfyUI complete → rig → upload → done.

```typescript
export interface PipelineDeps {
  comfyFetch?: typeof fetch;
  riggerFetch?: typeof fetch;
  brettFetch?: typeof fetch;
}

async function finaliseJob(
  jobId: string,
  promptId: string,
  name: string,
  deps: PipelineDeps = {},
): Promise<void> {
  const comfyFetch = deps.comfyFetch ?? fetch;
  const riggerFetch = deps.riggerFetch ?? fetch;
  const brettFetch = deps.brettFetch ?? fetch;

  // ── Stage: generating → wait for ComfyUI ────────────────────────────────────
  await updateJobStage(jobId, 'generating');
  const history = await getHistory(comfyBase(), promptId, comfyFetch);
  const entry = history[promptId];
  if (!entry) return; // still queued — stay in 'generating'

  if (!entry.status.completed) {
    if (entry.status.status_str === 'error') {
      await updateJobStage(jobId, 'error', { error_msg: 'ComfyUI reported generation error' });
    }
    return;
  }

  const glbFilename = findGlbOutput(entry.outputs);
  if (!glbFilename) {
    await updateJobStage(jobId, 'error', { error_msg: 'No .glb output found in ComfyUI history' });
    return;
  }

  const rawGlb = await downloadOutput(comfyBase(), glbFilename, comfyFetch);

  // ── Stage: rigging → Blender rig via Rigger service ─────────────────────────
  await updateJobStage(jobId, 'rigging');
  let riggedGlb: ArrayBuffer;
  try {
    riggedGlb = await rigGlb(riggerBase(), rawGlb, `${name}.glb`, riggerFetch);
  } catch (err) {
    await updateJobStage(jobId, 'error', {
      error_msg: `Rigging failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  // ── Stage: uploading → Brett ────────────────────────────────────────────────
  await updateJobStage(jobId, 'uploading');
  const form = new FormData();
  form.append('glb', new Blob([riggedGlb], { type: 'model/gltf-binary' }), `${name}.glb`);
  form.append('name', name);
  const brettRes = await brettFetch(`${BRETT_INTERNAL_URL}/api/skins/upload`, {
    method: 'POST',
    headers: { 'x-e2e-secret': BRETT_OIDC_SECRET },
    body: form,
  });

  if (!brettRes.ok) {
    const msg = await brettRes.text();
    await updateJobStage(jobId, 'error', { error_msg: `Brett upload failed: ${msg}` });
    return;
  }

  const brettData = await brettRes.json();
  const skinId: string = brettData.id;

  // Register in assets.registry (type: model_3d)
  await pool.query(
    `INSERT INTO assets.registry (name, type, file_path, metadata)
     VALUES ($1, 'model_3d', $2, $3)
     ON CONFLICT (file_path) DO UPDATE SET updated_at = now()`,
    [name, `skins/${skinId}/skin.glb`, JSON.stringify({ skin_id: skinId, source: 'hunyuan3d-2', animations: brettData.animations ?? [] })],
  );

  // ── Stage: done ─────────────────────────────────────────────────────────────
  await updateJobStage(jobId, 'done', { skin_id: skinId });
}

export { finaliseJob };
```

- [x] **Step 3: Update the timeout helper to set stage='error'**

Replace `timeoutOldJob` (lines 66–74) to use `updateJobStage` and check `stage` instead of `status`:

```typescript
// Timeout jobs older than 10 minutes that are not yet terminal.
async function timeoutOldJob(job: GenerationJob): Promise<boolean> {
  const age = Date.now() - new Date(job.created_at).getTime();
  const terminal = job.stage === 'done' || job.stage === 'error';
  if (age > 10 * 60 * 1000 && !terminal) {
    await updateJobStage(job.id, 'error', { error_msg: 'Generation timeout (>10 min)' });
    return true;
  }
  return false;
}
```

Add the type import at the top (extend the generation-jobs import in Step 1):

```typescript
import { getJob, updateJobStatus, updateJobStage, listRecentJobs, type GenerationJob } from '../../../../lib/generation-jobs';
```

(`updateJobStatus` may now be unused — if TypeScript/ESLint flags it, remove it from the import.)

- [x] **Step 4: Update the GET handler's terminal + finalise guards to use `stage`**

In the `GET` handler, replace the terminal check (lines 99–102) and the timeout-response block (lines 104–108):

```typescript
  // Already terminal
  if (job.stage === 'done' || job.stage === 'error') {
    return new Response(JSON.stringify(job), { headers: { 'Content-Type': 'application/json' } });
  }

  if (await timeoutOldJob(job)) {
    const updated = await getJob(id);
    return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
  }
```

And the finalise guard (lines 111–119) — drive it whenever a prompt exists and we are not yet terminal:

```typescript
  // Drive the pipeline forward one tick.
  if (job.prompt_id && job.stage !== 'done' && job.stage !== 'error') {
    try {
      await finaliseJob(job.id, job.prompt_id, job.name);
    } catch (err) {
      await updateJobStage(job.id, 'error', {
        error_msg: err instanceof Error ? err.message : String(err),
      });
    }
  }
```

- [x] **Step 5: Type-check the file**

Run: `cd /tmp/wt-asset-gen/website && npx tsc --noEmit -p tsconfig.json 2>&1 | grep -E 'status\.ts' || echo "no type errors in status.ts"`
Expected: `no type errors in status.ts` (remove any now-unused `updateJobStatus` import if flagged).

- [x] **Step 6: Commit**

```bash
cd /tmp/wt-asset-gen
git add website/src/pages/api/admin/generate-3d/status.ts
git commit -m "feat(asset-gen): insert rigging stage + stage machine into status pipeline

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Full pipeline tests (website, TDD)

**Files:**
- Create: `website/src/lib/generate-3d-pipeline.test.ts`

These 8 tests mock ComfyUI + Rigger + Brett and assert stage transitions. Because `status.ts` imports `pool` from `website-db` and `getJob`/`updateJobStage` hit the DB, we test `finaliseJob` by mocking the `generation-jobs` and `website-db` modules with `vi.mock`. The exported `finaliseJob(jobId, promptId, name, deps)` takes injectable fetch functions per service.

- [x] **Step 1: Write the failing test file**

Create `website/src/lib/generate-3d-pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Module mocks ───────────────────────────────────────────────────────────────
const stageCalls: Array<{ id: string; stage: string; extra?: any }> = [];
const registryInserts: any[][] = [];

vi.mock('../../../../lib/generation-jobs', () => ({
  updateJobStage: vi.fn(async (id: string, stage: string, extra?: any) => {
    stageCalls.push({ id, stage, extra });
  }),
  updateJobStatus: vi.fn(async () => {}),
  getJob: vi.fn(async () => null),
  listRecentJobs: vi.fn(async () => []),
}));

vi.mock('../../../../lib/website-db', () => ({
  pool: { query: vi.fn(async (...args: any[]) => { registryInserts.push(args); return { rows: [] }; }) },
}));

// Stub Astro's import.meta.env access used at module top-level.
vi.stubGlobal('import.meta', { env: {} });

import { finaliseJob } from '../pages/api/admin/generate-3d/status';

// ── Helpers ────────────────────────────────────────────────────────────────────
function comfyDoneFetch(): typeof fetch {
  // GET /history/<id> → completed with a .glb output; GET /view → bytes
  return vi.fn(async (url: string) => {
    if (url.includes('/history/')) {
      return new Response(JSON.stringify({
        'p1': {
          status: { status_str: 'success', completed: true },
          outputs: { '9': { glb: [{ filename: 'out.glb', subfolder: '', type: 'output' }] } },
        },
      }), { status: 200 });
    }
    if (url.includes('/view')) {
      return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as unknown as typeof fetch;
}

function lastStage(): string {
  return stageCalls[stageCalls.length - 1]?.stage;
}

beforeEach(() => {
  stageCalls.length = 0;
  registryInserts.length = 0;
  vi.clearAllMocks();
});

describe('generate-3d pipeline', () => {
  it('Stage generating: ComfyUI still queued → stays in generating, no rig/upload', async () => {
    const comfyFetch = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }), // empty history
    ) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch });
    expect(stageCalls.map((c) => c.stage)).toEqual(['generating']);
  });

  it('Stage generating → rigging: ComfyUI done downloads GLB and advances to rigging', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toContain('rigging');
  });

  it('Stage rigging → uploading: Rigger responds, advances to uploading', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toContain('uploading');
    expect(riggerFetch).toHaveBeenCalledOnce();
  });

  it('Stage uploading → done: Brett responds with skin id, stage done + skin_id set', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    const doneCall = stageCalls.find((c) => c.stage === 'done');
    expect(doneCall).toBeDefined();
    expect(doneCall?.extra?.skin_id).toBe('s1');
  });

  it('Integration: full pipeline reaches done in one tick and registers the asset', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response(JSON.stringify({ id: 's1', animations: [] }), { status: 200 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    expect(stageCalls.map((c) => c.stage)).toEqual(['generating', 'rigging', 'uploading', 'done']);
    expect(registryInserts.length).toBe(1);
  });

  it('Error: ComfyUI reports generation error → stage error', async () => {
    const comfyFetch = vi.fn(async () =>
      new Response(JSON.stringify({ p1: { status: { status_str: 'error', completed: false }, outputs: {} } }), { status: 200 }),
    ) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch });
    expect(lastStage()).toBe('error');
  });

  it('Error: Rigger 500 → stage error with rigging message', async () => {
    const riggerFetch = vi.fn(async () => new Response('boom', { status: 500 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch });
    const err = stageCalls.find((c) => c.stage === 'error');
    expect(err).toBeDefined();
    expect(err?.extra?.error_msg).toMatch(/Rigging failed/);
  });

  it('Error: Brett validation 422 → stage error with brett message', async () => {
    const riggerFetch = vi.fn(async () => new Response(new Uint8Array([4]).buffer, { status: 200 })) as unknown as typeof fetch;
    const brettFetch = vi.fn(async () => new Response('missing mixamorigHips bone', { status: 422 })) as unknown as typeof fetch;
    await finaliseJob('j1', 'p1', 'fig', { comfyFetch: comfyDoneFetch(), riggerFetch, brettFetch });
    const err = stageCalls.find((c) => c.stage === 'error');
    expect(err).toBeDefined();
    expect(err?.extra?.error_msg).toMatch(/Brett upload failed/);
  });
});
```

> NOTE on mock paths: `vi.mock` paths are resolved relative to the *test file*. The test sits in `website/src/lib/`, while `status.ts` imports `'../../../../lib/generation-jobs'`. vitest's `vi.mock` matches by the *resolved module id*, so the mock specifier must resolve to the same absolute file the SUT imports. If the relative path above does not intercept, switch to absolute aliases: `vi.mock(new URL('./generation-jobs.ts', import.meta.url).pathname, ...)` and `vi.mock(new URL('./website-db.ts', import.meta.url).pathname, ...)`. Verify interception by asserting `updateJobStage` is the mocked spy in the first run; if a real DB call is attempted (ECONNREFUSED), the path is wrong — fix it before proceeding.

- [x] **Step 2: Run to verify it fails first (red)**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/generate-3d-pipeline.test.ts 2>&1 | tail -30`
Expected: FAIL initially — most likely because mock paths don't intercept yet (real DB call) OR because `finaliseJob` was just added (it was, in Task 4) so failures here are about mock wiring, not missing code. Iterate on the mock specifier per the NOTE until red turns to green legitimately (no DB connection attempts).

- [x] **Step 3: Make all 8 tests pass**

Adjust ONLY the `vi.mock` specifier paths and the SUT import path until the spies intercept. Do NOT weaken assertions. The production code from Task 4 already implements the behavior; this step is purely about correct mock resolution.

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/generate-3d-pipeline.test.ts 2>&1 | tail -20`
Expected: PASS — 8 passing.

- [x] **Step 4: Run the rigger-client test too (regression)**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/rigger-client.test.ts src/lib/generate-3d-pipeline.test.ts 2>&1 | tail -15`
Expected: PASS — 10 total.

- [x] **Step 5: Commit**

```bash
cd /tmp/wt-asset-gen
git add website/src/lib/generate-3d-pipeline.test.ts
git commit -m "test(asset-gen): 8 mocked pipeline tests (ComfyUI+Rigger+Brett)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Database migrations (SQL artifacts)

**Files:**
- Create: `website/src/db/migrations/20260607_add_model_3d_type.sql`
- Create: `website/src/db/migrations/20260607_create_generation_jobs.sql`

There is NO migration runner — these are applied manually via `kubectl exec ... psql`. Each migration is idempotent. The `generation_jobs` table must include the `stage` column added in Task 1.

- [x] **Step 1: Create the enum-extension migration**

Create `website/src/db/migrations/20260607_add_model_3d_type.sql`:

```sql
-- Migration: add 'model_3d' to assets.asset_type enum.
-- Apply manually (no auto-runner):
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260607_add_model_3d_type.sql
-- ADD VALUE cannot run inside a transaction block on older PG; PG16 allows it.
ALTER TYPE assets.asset_type ADD VALUE IF NOT EXISTS 'model_3d';
```

- [x] **Step 2: Create the generation_jobs table migration**

Create `website/src/db/migrations/20260607_create_generation_jobs.sql`. This includes the `stage` column (NOT in the original spec snippet — required by Task 1 lib + Task 4 status code):

```sql
-- Migration: create assets.generation_jobs (3D asset-generation pipeline state).
-- Apply manually (no auto-runner):
--   kubectl exec -n <workspace-ns> deploy/shared-db -- \
--     psql -U website -d website -f - < website/src/db/migrations/20260607_create_generation_jobs.sql
--
-- stage  values: queued | generating | rigging | uploading | done | error
-- status values: pending | running | done | error  (legacy, derived from stage)

CREATE TABLE IF NOT EXISTS assets.generation_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  prompt_id   TEXT,
  stage       TEXT NOT NULL DEFAULT 'queued',
  status      TEXT NOT NULL DEFAULT 'pending',
  skin_id     TEXT,
  error_msg   TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Idempotent: add stage column if the table predates this migration.
ALTER TABLE assets.generation_jobs
  ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'queued';

GRANT ALL PRIVILEGES ON assets.generation_jobs TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA assets GRANT ALL ON TABLES TO website;
```

- [x] **Step 3: Validate SQL syntax locally (best-effort, no live DB required)**

Run: `cd /tmp/wt-asset-gen && for f in website/src/db/migrations/20260607_*.sql; do echo "== $f =="; cat "$f" >/dev/null && echo "readable"; done`
Expected: both files print `== ... ==` then `readable`. (No live DB in CI; syntax is reviewed by eye. If `psql` is available locally: `psql -d postgres --no-psqlrc -f <file>` against a throwaway DB with the `assets` schema seeded — optional.)

- [x] **Step 4: Commit**

```bash
cd /tmp/wt-asset-gen
git add website/src/db/migrations/20260607_add_model_3d_type.sql website/src/db/migrations/20260607_create_generation_jobs.sql
git commit -m "feat(asset-gen): migrations for model_3d enum + generation_jobs.stage

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 7: Rigger K8s manifest

**Files:**
- Create: `prod/rigger-gpu.yaml`
- Modify: `prod/kustomization.yaml`

Mirror `prod/comfy-gpu.yaml`: a headless-style Service + Endpoints pinning the Rigger to `${RIGGER_HOST_IP}:${RIGGER_PORT}` on the GPU host. The website resolves `rigger:8190` via `RIGGER_HOST_IP` env, but the cluster Service name keeps a stable in-cluster DNS target if other workloads need it.

- [x] **Step 1: Create the manifest**

Create `prod/rigger-gpu.yaml`:

```yaml
# prod/rigger-gpu.yaml — Rigger (Blender headless) GPU-host service.
# ${RIGGER_HOST_IP} and ${RIGGER_PORT} filled by envsubst at deploy time.
# Defaults: RIGGER_HOST_IP == COMFY_HOST_IP, RIGGER_PORT == 8190.
apiVersion: v1
kind: Service
metadata:
  name: rigger-gateway
spec:
  ports:
    - name: http
      port: 8190
      targetPort: 8190
---
apiVersion: v1
kind: Endpoints
metadata:
  name: rigger-gateway
subsets:
  - addresses:
      - ip: ${RIGGER_HOST_IP}
    ports:
      - name: http
        port: 8190
```

- [x] **Step 2: Register it in the prod kustomization**

In `prod/kustomization.yaml`, add `- rigger-gpu.yaml` immediately after the existing `- comfy-gpu.yaml` line (line 10):

```yaml
  - comfy-gpu.yaml
  - rigger-gpu.yaml
```

- [x] **Step 3: Validate the kustomize build**

Run: `cd /tmp/wt-asset-gen && RIGGER_HOST_IP=10.0.0.1 RIGGER_PORT=8190 COMFY_HOST_IP=10.0.0.1 COMFY_PORT=8189 kustomize build prod/ --load-restrictor=LoadRestrictionsNone 2>&1 | grep -A2 'name: rigger-gateway' | head`
Expected: the rigger-gateway Service appears in the build output. (Note: `${RIGGER_HOST_IP}` stays literal in raw kustomize build — envsubst runs in the Taskfile deploy. Literal `${...}` in the build output is expected and fine for validation.)

- [x] **Step 4: Commit**

```bash
cd /tmp/wt-asset-gen
git add prod/rigger-gpu.yaml prod/kustomization.yaml
git commit -m "feat(infra): rigger-gpu headless Service + Endpoints (port 8190)

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 8: Env schema + website ConfigMap + Taskfile wiring

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `k3d/website.yaml`
- Modify: `Taskfile.yml`

Register `RIGGER_HOST_IP` / `RIGGER_PORT`, expose them to the website Deployment, and add them to every envsubst list that renders `comfy-gpu.yaml`/`rigger-gpu.yaml`/`website.yaml`.

- [x] **Step 1: Add the vars to the schema**

In `environments/schema.yaml`, immediately after the `COMFY_PORT` block (ends at the `description:` line ~242), add:

```yaml
  - name: RIGGER_HOST_IP
    required: false
    default_dev: ""
    description: "Mesh IP of the GPU host running the Blender Rigger service. Defaults to COMFY_HOST_IP when empty."

  - name: RIGGER_PORT
    required: false
    default_dev: "8190"
    description: "Port the Rigger FastAPI service listens on. Default 8190."
```

- [x] **Step 2: Expose the vars on the website Deployment**

In `k3d/website.yaml`, after the `COMFY_PORT` env entry (lines 402–403), add:

```yaml
            - name: RIGGER_HOST_IP
              value: "${RIGGER_HOST_IP}"
            - name: RIGGER_PORT
              value: "${RIGGER_PORT}"
```

- [x] **Step 3: Add to the prod-deploy ENVSUBST list + exports**

In `Taskfile.yml`, find the prod-deploy ENVSUBST block. After line 2035 (`ENVSUBST_VARS="$ENVSUBST_VARS \$COMFY_HOST_IP \$COMFY_PORT"`), add:

```yaml
          ENVSUBST_VARS="$ENVSUBST_VARS \$RIGGER_HOST_IP \$RIGGER_PORT"
```

And after the `export COMFY_PORT=...` line (line 2055), add (defaulting RIGGER_HOST_IP to COMFY_HOST_IP):

```yaml
          export RIGGER_HOST_IP="${RIGGER_HOST_IP:-${COMFY_HOST_IP:-}}"
          export RIGGER_PORT="${RIGGER_PORT:-8190}"
```

- [x] **Step 4: Add to the website ConfigMap envsubst lists**

In `Taskfile.yml`, the website-render block (lines 3066–3092) has TWO `envsubst "..."` invocations that both end with `\$COMFY_HOST_IP \$COMFY_PORT`. In BOTH, append ` \$RIGGER_HOST_IP \$RIGGER_PORT` to the variable list. Also add the two `export` lines next to the existing `COMFY_HOST_IP=` / `COMFY_PORT=` exports at lines 3066–3067 and 3088–3089:

```yaml
          RIGGER_HOST_IP="${RIGGER_HOST_IP:-${COMFY_HOST_IP:-}}" \
          RIGGER_PORT="${RIGGER_PORT:-8190}" \
```

(Add this pair immediately after each `COMFY_PORT="${COMFY_PORT:-}" \` line at 3067 and 3089.)

- [x] **Step 5: Validate the env schema**

Run: `cd /tmp/wt-asset-gen && bash scripts/task-oracle.sh 'validate environment variable schema' 2>/dev/null || task env:validate ENV=dev 2>&1 | tail -20`
Expected: schema validation passes (no "unknown variable" / "missing from schema" error for RIGGER_*). If `env:validate` requires an env file, run with `ENV=dev`.

- [x] **Step 6: Validate the website render does not emit literal RIGGER placeholders**

Run: `cd /tmp/wt-asset-gen && grep -c 'RIGGER_HOST_IP\|RIGGER_PORT' k3d/website.yaml`
Expected: `2` (the two env entries added in Step 2). Confirm the envsubst lists in `Taskfile.yml` reference both vars: `grep -c 'RIGGER_HOST_IP' Taskfile.yml` → expect ≥ 3 (one ENVSUBST_VARS + two website envsubst lists + exports).

- [x] **Step 7: Commit**

```bash
cd /tmp/wt-asset-gen
git add environments/schema.yaml k3d/website.yaml Taskfile.yml
git commit -m "feat(infra): register RIGGER_HOST_IP/RIGGER_PORT in schema, website, Taskfile

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 9: GPU-host scripts

**Files:**
- Create: `scripts/setup-comfyui.sh`
- Create: `scripts/start-comfyui.sh`
- Create: `scripts/rigger_server.py`
- Create: `scripts/rig_for_mixamo.py`

These run on the user-provided GPU host (not in CI / not in cluster). They are committed artifacts; CI does not execute them. Keep them exactly as specced (the spec provides authoritative content). Make the shell scripts executable.

- [x] **Step 1: Create `scripts/setup-comfyui.sh`**

Create `scripts/setup-comfyui.sh` with the exact content from the spec ("GPU-Host Setup → scripts/setup-comfyui.sh" section): the idempotent installer covering venv + PyTorch cu128, ComfyUI clone, kijai/ComfyUI-Hunyuan3D-2 custom nodes, Hunyuan3D-2 weights via huggingface-cli, Blender apt install, and FastAPI/uvicorn/python-multipart. (Reproduce the spec block verbatim.)

- [x] **Step 2: Create `scripts/start-comfyui.sh`**

Create `scripts/start-comfyui.sh` with the exact content from the spec: two `screen -dmS` sessions — `comfyui` (ComfyUI `main.py --listen 0.0.0.0 --port 8189`) and `rigger` (`uvicorn scripts.rigger_server:app --host 0.0.0.0 --port 8190`), each tee'd to a logfile.

- [x] **Step 3: Create `scripts/rigger_server.py`**

Create `scripts/rigger_server.py` with the exact FastAPI content from the spec: `POST /rig` accepting `glb` UploadFile + `method` query (`blender|mixamo`), `_rig_blender` shelling out to `blender --background --python rig_for_mixamo.py -- <in> <out>` with a 120s timeout, and `_rig_mixamo` raising `HTTPException(501, ...)` (out of scope per spec).

- [x] **Step 4: Create `scripts/rig_for_mixamo.py`**

Create `scripts/rig_for_mixamo.py` with the spec's Blender-headless content: factory-reset, import GLB, find the mesh, compute bounding box, add an armature, the documented simplified bone hierarchy placeholder + `ARMATURE_AUTO` parenting, and GLB export. Preserve the spec's implementation-hint comments verbatim (bone coordinates are emergent and calibrated during real GPU-host bring-up, which is out of CI scope).

- [x] **Step 5: Make shell scripts executable**

Run: `cd /tmp/wt-asset-gen && chmod +x scripts/setup-comfyui.sh scripts/start-comfyui.sh && ls -l scripts/setup-comfyui.sh scripts/start-comfyui.sh`
Expected: both show `-rwxr-xr-x` (executable bit set).

- [x] **Step 6: Syntax-check the scripts (no execution)**

Run: `cd /tmp/wt-asset-gen && bash -n scripts/setup-comfyui.sh && bash -n scripts/start-comfyui.sh && echo "bash OK"; python3 -m py_compile scripts/rigger_server.py scripts/rig_for_mixamo.py 2>&1 && echo "py OK"`
Expected: `bash OK` then `py OK`. (If `fastapi`/`bpy` aren't installed locally, `py_compile` still passes — it only checks syntax, not imports.)

- [x] **Step 7: Commit**

```bash
cd /tmp/wt-asset-gen
git add scripts/setup-comfyui.sh scripts/start-comfyui.sh scripts/rigger_server.py scripts/rig_for_mixamo.py
git commit -m "feat(asset-gen): GPU-host setup, launch, rigger server + Blender rig script

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 10: Test inventory + full offline gate

**Files:**
- Modify: `website/src/data/test-inventory.json` (regenerated, not hand-edited)

CI re-runs `task test:inventory` and fails if the committed `test-inventory.json` differs. New tests were added, so regenerate it. Then run the full offline gate locally before opening the PR.

- [x] **Step 1: Regenerate the test inventory**

Run: `cd /tmp/wt-asset-gen && task test:inventory 2>&1 | tail -10`
Expected: `website/src/data/test-inventory.json` regenerated (may or may not change depending on whether the build script scans these new files; if it scans `*.test.ts` it will pick up the new ones).

- [x] **Step 2: Run the full offline test gate**

Run: `cd /tmp/wt-asset-gen && task test:all 2>&1 | tail -40`
Expected: all offline tests pass (BATS units, kustomize structure, Taskfile dry-run, factory tests). If a kustomize-structure test validates `prod/`, confirm `rigger-gpu.yaml` is well-formed.

- [x] **Step 3: Run website + brett unit suites explicitly**

Run: `cd /tmp/wt-asset-gen/website && npx vitest run src/lib/ 2>&1 | tail -15 && cd /tmp/wt-asset-gen/brett && pnpm test 2>&1 | tail -15`
Expected: website lib tests (incl. rigger-client + pipeline) pass; all brett tests (incl. skins-upload) pass.

- [x] **Step 4: Run the freshness check**

Run: `cd /tmp/wt-asset-gen && task freshness:check 2>&1 | tail -15 || task freshness:regenerate 2>&1 | tail -15`
Expected: no generated-artifact drift. If `freshness:check` reports drift, run `freshness:regenerate` and stage the result.

- [x] **Step 5: Commit the inventory (and any regenerated artifacts)**

```bash
cd /tmp/wt-asset-gen
git add website/src/data/test-inventory.json
# stage any other regenerated artifacts freshness:regenerate touched
git status --porcelain
git commit -m "chore(asset-gen): regenerate test inventory for new pipeline/skins tests

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Self-Review Notes (verification the plan covers the spec)

- **`assets.generation_jobs` table** → Task 6 (migration 2). ✅
- **`model_3d` enum value** → Task 6 (migration 1). ✅
- **Brett `/api/skins/upload`** (auth, ≤20 MB, mixamorigHips check, uuid storage + meta.json, `{id, animations}`) → Tasks 3 + 3b. ✅
- **Rigging stage (ComfyUI→Brett gap)** → Task 2 (client) + Task 4 (status orchestration). ✅
- **`generation-jobs.ts` stage field + `updateJobStage`** → Task 1. ✅
- **status.ts ComfyUI→Rigger→Brett, stage machine** → Task 4. ✅
- **GPU-host scripts (setup/start/rigger_server/rig_for_mixamo)** → Task 9. ✅
- **`prod/rigger-gpu.yaml`** → Task 7. ✅
- **`environments/schema.yaml` RIGGER_HOST_IP/PORT** → Task 8. ✅
- **CI tests: 8 pipeline + 5 skins-upload** → Task 5 (8) + Tasks 3/3b (5+ route). ✅
- **test:inventory regen** → Task 10. ✅
- **Migrations applied manually (no runner)** documented in Task 6 + Pre-Read. ✅
- **Mixamo automation out of scope** (501) → preserved in Task 9 `rigger_server.py`. ✅

**Stage/type consistency:** `JobStage` union (Task 1) = `queued|generating|rigging|uploading|done|error`; `updateJobStage(id, stage, extra)` signature is identical in Task 1 (def), Task 4 (calls), Task 5 (mock). `rigGlb(baseUrl, glb, filename, fetchFn, method)` identical in Task 2 (def) and Task 4 (call, 4-arg form). `finaliseJob(jobId, promptId, name, deps)` identical in Task 4 (def/export) and Task 5 (call). Brett helper names `checkSkinAuth`/`validateGlbSize`/`glbHasMixamoBones`/`storeSkin`/`attachSkinsUpload`/`MAX_SKIN_BYTES` identical across Tasks 3 and 3b.

---

## Execution Handoff

This plan is staged for `dev-flow-execute`. Recommended approach: **Subagent-Driven** (REQUIRED SUB-SKILL: superpowers:subagent-driven-development) — one fresh subagent per task with two-stage review between tasks, since several tasks (4, 5, 8) have subtle integration points (mock-path resolution, envsubst list parity) that benefit from per-task review.
