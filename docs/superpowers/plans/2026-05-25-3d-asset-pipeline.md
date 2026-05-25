---
title: 3D Asset Generation Pipeline Implementation Plan
ticket_id: T000271
domains: []
status: active
pr_number: null
---

# 3D Asset Generation Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admin-only pipeline — upload image → ComfyUI (Hunyuan3D-2) → Mixamo-rigged GLB → Brett Mayhem character skin registered in `assets.registry`.

**Architecture:** Website API as orchestrator. `POST /api/admin/generate-3d` uploads image to ComfyUI, queues the Hunyuan3D-2 workflow, and returns a job ID immediately. A polling endpoint `GET /api/admin/generate-3d/status` checks ComfyUI history; on completion it downloads the GLB, forwards it to Brett's internal `/api/skins/upload` (authenticated via `x-e2e-secret`), then upserts `assets.registry`. Brett handles GLB validation (requires `mixamorigHips` bone) and filesystem writes. No shared PVC needed.

**Tech Stack:** TypeScript (Astro API routes, Svelte), PostgreSQL (`assets.generation_jobs`), ComfyUI REST API, Brett Node.js (`x-e2e-secret` bypass), vitest for unit tests.

---

## Files

| Action | Path | Purpose |
|--------|------|---------|
| Create | `prod/comfy-gpu.yaml` | K8s Service+Endpoints → ComfyUI GPU host |
| Modify | `prod/kustomization.yaml` | add comfy-gpu.yaml resource |
| Modify | `environments/schema.yaml` | register COMFY_HOST_IP, COMFY_PORT |
| Modify | `environments/mentolder.yaml` | set actual COMFY_* values |
| Modify | `environments/korczewski.yaml` | set actual COMFY_* values |
| Modify | `Taskfile.yml` | add COMFY_HOST_IP, COMFY_PORT to ENVSUBST_VARS |
| Modify | `k3d/website.yaml` | add COMFY_HOST_IP, COMFY_PORT, BRETT_OIDC_SECRET env vars |
| Create | `website/src/config/comfy-workflow-hunyuan3d.json` | parameterised workflow template |
| Create | `website/src/lib/comfy-client.ts` | typed ComfyUI REST client |
| Create | `website/src/lib/comfy-client.test.ts` | vitest unit tests (fetch mocked) |
| Create | `website/src/lib/generation-jobs.ts` | DB helpers for `assets.generation_jobs` |
| Create | `website/src/pages/api/admin/generate-3d.ts` | POST — start generation job |
| Create | `website/src/pages/api/admin/generate-3d/status.ts` | GET — poll + finalise job |
| Create | `website/src/pages/admin/asset-generation.astro` | admin page |
| Create | `website/src/components/admin/AssetGenerationStudio.svelte` | upload + status UI |
| Modify | `website/src/layouts/AdminLayout.astro` | add nav link |
| Modify | `scripts/assets-index.sh` | classify .glb/.gltf as model_3d |

---

## Task 1: DB Migrations

**Files:**
- Run SQL against `shared-db` (mentolder cluster, then korczewski)

- [ ] **Step 1.1: Add `model_3d` enum value**

```bash
PGPOD=$(kubectl get pod -n workspace --context mentolder -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c \
  "ALTER TYPE assets.asset_type ADD VALUE IF NOT EXISTS 'model_3d';"
```

Expected: `ALTER TYPE`

- [ ] **Step 1.2: Create generation_jobs table**

```bash
kubectl exec "$PGPOD" -n workspace --context mentolder -- \
  psql -U website -d website -c "
CREATE TABLE IF NOT EXISTS assets.generation_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  prompt_id  TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','running','done','error')),
  skin_id    TEXT,
  error_msg  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);"
```

Expected: `CREATE TABLE`

- [ ] **Step 1.3: Repeat for korczewski**

```bash
PGPOD_K=$(kubectl get pod -n workspace-korczewski --context korczewski -l app=shared-db -o name | head -1)
kubectl exec "$PGPOD_K" -n workspace-korczewski --context korczewski -- \
  psql -U website -d website -c \
  "ALTER TYPE assets.asset_type ADD VALUE IF NOT EXISTS 'model_3d';"
kubectl exec "$PGPOD_K" -n workspace-korczewski --context korczewski -- \
  psql -U website -d website -c "
CREATE TABLE IF NOT EXISTS assets.generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  prompt_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending','running','done','error')),
  skin_id TEXT,
  error_msg TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);"
```

- [ ] **Step 1.4: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add -A
git commit -m "chore(db): add model_3d enum + generation_jobs table migration notes"
```

---

## Task 2: Env Vars + Taskfile

**Files:**
- Modify: `environments/schema.yaml`
- Modify: `environments/mentolder.yaml`
- Modify: `environments/korczewski.yaml`
- Modify: `Taskfile.yml`

- [ ] **Step 2.1: Add to `environments/schema.yaml`** after the `LLM_RERANK_ENABLED` block (~line 222):

```yaml
  - name: COMFY_HOST_IP
    required: false
    default_dev: ""
    description: "Mesh IP of the GPU host running ComfyUI. Empty disables 3D generation (returns 503)."

  - name: COMFY_PORT
    required: false
    default_dev: ""
    description: "Port ComfyUI listens on. Must NOT be 8188 (conflicts with Janus WebSocket)."
```

- [ ] **Step 2.2: Add values to `environments/mentolder.yaml`** in the `env_vars:` section (after `LLM_HOST_IP`):

```yaml
  COMFY_HOST_IP: "100.102.71.114"   # same GPU box as LLM_HOST_IP
  COMFY_PORT: "8189"                 # confirm with user — must not be 8188
```

- [ ] **Step 2.3: Add values to `environments/korczewski.yaml`** (same GPU box, same port):

```yaml
  COMFY_HOST_IP: "100.102.71.114"
  COMFY_PORT: "8189"
```

- [ ] **Step 2.4: Add to `Taskfile.yml` ENVSUBST_VARS** — two edits:

**Edit A** (~line 1486): append to the ENVSUBST_VARS build block:
```
# find:
ENVSUBST_VARS="$ENVSUBST_VARS \$LLM_HOST_IP \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL \$LLM_EMBED_URL"
# add after:
ENVSUBST_VARS="$ENVSUBST_VARS \$COMFY_HOST_IP \$COMFY_PORT"
```

**Edit B** (~line 1500): add explicit exports alongside the LLM exports:
```bash
# find:
export LLM_HOST_IP="${LLM_HOST_IP:-}"
export LLM_ENABLED="${LLM_ENABLED:-false}"
# add after:
export COMFY_HOST_IP="${COMFY_HOST_IP:-}"
export COMFY_PORT="${COMFY_PORT:-}"
```

- [ ] **Step 2.5: Validate schema**

```bash
bash scripts/env-validate.sh 2>/dev/null || task env:validate ENV=mentolder
```

- [ ] **Step 2.6: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add environments/schema.yaml environments/mentolder.yaml environments/korczewski.yaml Taskfile.yml
git commit -m "chore(env): add COMFY_HOST_IP and COMFY_PORT env vars"
```

---

## Task 3: K8s Service (prod/comfy-gpu.yaml)

**Files:**
- Create: `prod/comfy-gpu.yaml`
- Modify: `prod/kustomization.yaml`

- [ ] **Step 3.1: Create `prod/comfy-gpu.yaml`**

```yaml
# prod/comfy-gpu.yaml — ComfyUI GPU host (Hunyuan3D-2 3D generation)
# ${COMFY_HOST_IP} and ${COMFY_PORT} filled by envsubst at deploy time.
# COMFY_PORT must NOT be 8188 (conflicts with Janus WebSocket).
apiVersion: v1
kind: Service
metadata:
  name: comfy-gateway
spec:
  ports:
    - name: http
      port: 8189
      targetPort: 8189
---
apiVersion: v1
kind: Endpoints
metadata:
  name: comfy-gateway
subsets:
  - addresses:
      - ip: ${COMFY_HOST_IP}
    ports:
      - name: http
        port: 8189
```

> **Note:** Port is hardcoded to 8189 in this manifest because `Endpoints.subsets[].ports[].port` must be a literal integer — envsubst cannot substitute here. If your ComfyUI runs on a different port, change 8189 in both places. The `COMFY_PORT` env var is used by the website pod to construct the URL dynamically.

- [ ] **Step 3.2: Add to `prod/kustomization.yaml`** in the `resources:` list after `llm-gpu.yaml`:

```yaml
  - comfy-gpu.yaml
```

- [ ] **Step 3.3: Validate kustomize builds**

```bash
kustomize build prod-mentolder/ --load-restrictor=LoadRestrictionsNone 2>&1 | grep -E "error|comfy" | head -10
kustomize build prod-korczewski/ --load-restrictor=LoadRestrictionsNone 2>&1 | grep -E "error|comfy" | head -10
```

Expected: no errors, `comfy-gateway` Service appears.

- [ ] **Step 3.4: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add prod/comfy-gpu.yaml prod/kustomization.yaml
git commit -m "feat(infra): add comfy-gateway K8s Service for ComfyUI GPU host"
```

---

## Task 4: Website Pod — Add Env Vars

**Files:**
- Modify: `k3d/website.yaml`

- [ ] **Step 4.1: Add env vars to website container** in `k3d/website.yaml`, in the container `env:` list (after the existing LLM env vars):

```yaml
            - name: COMFY_HOST_IP
              value: "${COMFY_HOST_IP}"
            - name: COMFY_PORT
              value: "${COMFY_PORT}"
            - name: BRETT_OIDC_SECRET
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: BRETT_OIDC_SECRET
```

- [ ] **Step 4.2: Add COMFY_HOST_IP + COMFY_PORT to the website:deploy envsubst line** in `Taskfile.yml` (~line 2460 — the website-specific envsubst line):

Find:
```
envsubst "\$WEBSITE_IMAGE ... \$LLM_ENABLED \$LLM_RERANK_ENABLED \$LLM_ROUTER_URL"
```

Append before the closing quote:
```
\$COMFY_HOST_IP \$COMFY_PORT
```

- [ ] **Step 4.3: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add k3d/website.yaml Taskfile.yml
git commit -m "feat(website): mount COMFY env vars and BRETT_OIDC_SECRET in website pod"
```

---

## Task 5: ComfyUI Client Library (TDD)

**Files:**
- Create: `website/src/lib/comfy-client.ts`
- Create: `website/src/lib/comfy-client.test.ts`

- [ ] **Step 5.1: Write failing tests** — create `website/src/lib/comfy-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadImage, queuePrompt, getHistory, downloadOutput, findGlbOutput } from './comfy-client';

const BASE = 'http://comfy-gateway:8189';

function mockFetch(responses: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    const key = Object.keys(responses).find(k => url.includes(k));
    if (!key) throw new Error(`unmocked url: ${url}`);
    return {
      ok: true,
      json: async () => responses[key],
      arrayBuffer: async () => responses[key] as ArrayBuffer,
    };
  });
}

beforeEach(() => { vi.restoreAllMocks(); });

describe('uploadImage', () => {
  it('POSTs to /upload/image and returns filename', async () => {
    const fetch = mockFetch({ '/upload/image': { name: 'abc123.png', subfolder: '', type: 'input' } });
    const result = await uploadImage(BASE, new Uint8Array([1, 2, 3]).buffer, 'photo.png', fetch as any);
    expect(result).toBe('abc123.png');
    expect(fetch).toHaveBeenCalledWith(
      `${BASE}/upload/image`,
      expect.objectContaining({ method: 'POST' }),
    );
  });
});

describe('queuePrompt', () => {
  it('POSTs workflow to /prompt and returns prompt_id', async () => {
    const fetch = mockFetch({ '/prompt': { prompt_id: 'pid-001' } });
    const id = await queuePrompt(BASE, { nodes: {} }, fetch as any);
    expect(id).toBe('pid-001');
  });
});

describe('getHistory', () => {
  it('returns empty object when job is still queued', async () => {
    const fetch = mockFetch({ '/history/pid-001': {} });
    const h = await getHistory(BASE, 'pid-001', fetch as any);
    expect(h).toEqual({});
  });

  it('returns history when job is complete', async () => {
    const completed = {
      'pid-001': {
        status: { status_str: 'success', completed: true },
        outputs: { '12': { glb: [{ filename: 'output.glb', subfolder: '', type: 'output' }] } },
      },
    };
    const fetch = mockFetch({ '/history/pid-001': completed });
    const h = await getHistory(BASE, 'pid-001', fetch as any);
    expect(h['pid-001'].status.completed).toBe(true);
  });
});

describe('findGlbOutput', () => {
  it('returns filename of first .glb output', () => {
    const outputs = {
      '12': { glb: [{ filename: 'model.glb', subfolder: '', type: 'output' }] },
      '5': { images: [{ filename: 'preview.png', subfolder: '', type: 'output' }] },
    };
    expect(findGlbOutput(outputs)).toBe('model.glb');
  });

  it('returns null when no .glb output exists', () => {
    expect(findGlbOutput({ '1': { images: [{ filename: 'x.png' }] } })).toBeNull();
  });
});

describe('downloadOutput', () => {
  it('GETs /view with filename and returns ArrayBuffer', async () => {
    const buf = new Uint8Array([0x67, 0x6c, 0x54, 0x46]).buffer;
    const fetch = mockFetch({ '/view': buf });
    const result = await downloadOutput(BASE, 'output.glb', fetch as any);
    expect(result).toBe(buf);
  });
});
```

- [ ] **Step 5.2: Run tests — expect FAIL (module not found)**

```bash
cd /tmp/wt-3d-asset-pipeline/website
pnpm vitest run src/lib/comfy-client.test.ts 2>&1 | tail -15
```

Expected: `Cannot find module './comfy-client'`

- [ ] **Step 5.3: Implement `website/src/lib/comfy-client.ts`**

```typescript
export interface ComfyOutput {
  filename: string;
  subfolder: string;
  type: string;
}

export interface ComfyHistory {
  [promptId: string]: {
    status: { status_str: string; completed: boolean };
    outputs: { [nodeId: string]: { [key: string]: ComfyOutput[] } };
  };
}

export async function uploadImage(
  baseUrl: string,
  buffer: ArrayBuffer,
  filename: string,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const form = new FormData();
  form.append('image', new Blob([buffer]), filename);
  const res = await fetchFn(`${baseUrl}/upload/image`, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`ComfyUI upload failed: ${res.status}`);
  const data = await res.json();
  return data.name as string;
}

export async function queuePrompt(
  baseUrl: string,
  workflow: object,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const res = await fetchFn(`${baseUrl}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow }),
  });
  if (!res.ok) throw new Error(`ComfyUI queue failed: ${res.status}`);
  const data = await res.json();
  return data.prompt_id as string;
}

export async function getHistory(
  baseUrl: string,
  promptId: string,
  fetchFn: typeof fetch = fetch,
): Promise<ComfyHistory> {
  const res = await fetchFn(`${baseUrl}/history/${promptId}`);
  if (!res.ok) throw new Error(`ComfyUI history failed: ${res.status}`);
  return res.json() as Promise<ComfyHistory>;
}

export function findGlbOutput(
  outputs: { [nodeId: string]: { [key: string]: unknown[] } },
): string | null {
  for (const node of Object.values(outputs)) {
    for (const files of Object.values(node)) {
      for (const f of files as ComfyOutput[]) {
        if (typeof f.filename === 'string' && f.filename.endsWith('.glb')) {
          return f.filename;
        }
      }
    }
  }
  return null;
}

export async function downloadOutput(
  baseUrl: string,
  filename: string,
  fetchFn: typeof fetch = fetch,
): Promise<ArrayBuffer> {
  const url = `${baseUrl}/view?filename=${encodeURIComponent(filename)}&type=output`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`ComfyUI download failed: ${res.status}`);
  return res.arrayBuffer();
}
```

- [ ] **Step 5.4: Run tests — expect PASS**

```bash
cd /tmp/wt-3d-asset-pipeline/website
pnpm vitest run src/lib/comfy-client.test.ts 2>&1 | tail -10
```

Expected: `✓ 7 tests passed`

- [ ] **Step 5.5: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/lib/comfy-client.ts website/src/lib/comfy-client.test.ts
git commit -m "feat(website): add ComfyUI REST client with tests"
```

---

## Task 6: Generation Jobs DB Helpers

**Files:**
- Create: `website/src/lib/generation-jobs.ts`

- [ ] **Step 6.1: Create `website/src/lib/generation-jobs.ts`**

```typescript
import { pool } from './website-db';

export interface GenerationJob {
  id: string;
  name: string;
  prompt_id: string | null;
  status: 'pending' | 'running' | 'done' | 'error';
  skin_id: string | null;
  error_msg: string | null;
  created_at: string;
}

export async function insertJob(name: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO assets.generation_jobs (name) VALUES ($1) RETURNING id',
    [name],
  );
  return rows[0].id;
}

export async function setJobPromptId(id: string, promptId: string): Promise<void> {
  await pool.query(
    "UPDATE assets.generation_jobs SET prompt_id = $1, status = 'pending' WHERE id = $2",
    [promptId, id],
  );
}

export async function updateJobStatus(
  id: string,
  status: GenerationJob['status'],
  extra: { skin_id?: string; error_msg?: string } = {},
): Promise<void> {
  await pool.query(
    `UPDATE assets.generation_jobs
     SET status = $1, skin_id = COALESCE($2, skin_id), error_msg = COALESCE($3, error_msg)
     WHERE id = $4`,
    [status, extra.skin_id ?? null, extra.error_msg ?? null, id],
  );
}

export async function getJob(id: string): Promise<GenerationJob | null> {
  const { rows } = await pool.query<GenerationJob>(
    'SELECT * FROM assets.generation_jobs WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function listRecentJobs(limit = 10): Promise<GenerationJob[]> {
  const { rows } = await pool.query<GenerationJob>(
    'SELECT * FROM assets.generation_jobs ORDER BY created_at DESC LIMIT $1',
    [limit],
  );
  return rows;
}
```

- [ ] **Step 6.2: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/lib/generation-jobs.ts
git commit -m "feat(website): add generation_jobs DB helpers"
```

---

## Task 7: Workflow Config Template

**Files:**
- Create: `website/src/config/comfy-workflow-hunyuan3d.json`

- [ ] **Step 7.1: Export your Hunyuan3D-2 workflow from ComfyUI**

In ComfyUI: `Settings → Enable Dev Mode Options`, then click `Save (API Format)` on the workflow canvas. This exports a flat JSON dict of nodes.

- [ ] **Step 7.2: Find the LoadImage node ID**

In the exported JSON, look for a node with `"class_type": "LoadImage"`. Note its key (e.g. `"1"`).

- [ ] **Step 7.3: Find the output node with the GLB**

Look for a node with `"class_type"` containing `"Save"` or `"GLB"`. Verify this is the node that writes the `.glb` output.

- [ ] **Step 7.4: Create `website/src/config/comfy-workflow-hunyuan3d.json`**

Replace the `"image"` value in the LoadImage node with the literal string `"__INPUT_IMAGE__"`:

```json
{
  "_meta": {
    "input_image_node": "1",
    "description": "Hunyuan3D-2 image-to-3D workflow. __INPUT_IMAGE__ is replaced at runtime with the uploaded filename."
  },
  "1": {
    "class_type": "LoadImage",
    "inputs": {
      "image": "__INPUT_IMAGE__",
      "upload": "image"
    }
  }
}
```

Paste your full exported workflow JSON here, with only the LoadImage `"image"` field changed to `"__INPUT_IMAGE__"`.

- [ ] **Step 7.5: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/config/comfy-workflow-hunyuan3d.json
git commit -m "feat(website): add Hunyuan3D-2 ComfyUI workflow template"
```

---

## Task 8: API Route — POST /api/admin/generate-3d

**Files:**
- Create: `website/src/pages/api/admin/generate-3d.ts`

- [ ] **Step 8.1: Create `website/src/pages/api/admin/generate-3d.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../lib/auth';
import { uploadImage, queuePrompt } from '../../../lib/comfy-client';
import { insertJob, setJobPromptId, updateJobStatus } from '../../../lib/generation-jobs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const COMFY_HOST_IP = import.meta.env.COMFY_HOST_IP ?? '';
const COMFY_PORT = import.meta.env.COMFY_PORT ?? '';

function comfyBase(): string {
  return `http://${COMFY_HOST_IP}:${COMFY_PORT}`;
}

function loadWorkflow(imageFilename: string): object {
  const configPath = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../../src/config/comfy-workflow-hunyuan3d.json',
  );
  const raw = readFileSync(configPath, 'utf8');
  return JSON.parse(raw.replace(/"__INPUT_IMAGE__"/g, JSON.stringify(imageFilename)));
}

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!COMFY_HOST_IP || !COMFY_PORT) {
    return new Response(
      JSON.stringify({ error: 'ComfyUI not configured (COMFY_HOST_IP/COMFY_PORT missing)' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const form = await request.formData();
  const imageFile = form.get('image') as File | null;
  const name = (form.get('name') as string | null)?.trim();

  if (!imageFile || !name) {
    return new Response(JSON.stringify({ error: 'image and name required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const jobId = await insertJob(name);

  try {
    const imageBuffer = await imageFile.arrayBuffer();
    const comfyFilename = await uploadImage(comfyBase(), imageBuffer, imageFile.name);
    const workflow = loadWorkflow(comfyFilename);
    const promptId = await queuePrompt(comfyBase(), workflow);
    await setJobPromptId(jobId, promptId);
  } catch (err) {
    await updateJobStatus(jobId, 'error', {
      error_msg: err instanceof Error ? err.message : String(err),
    });
    return new Response(JSON.stringify({ error: 'Failed to queue ComfyUI job', job_id: jobId }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ job_id: jobId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  });
};
```

- [ ] **Step 8.2: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/pages/api/admin/generate-3d.ts
git commit -m "feat(website): add POST /api/admin/generate-3d endpoint"
```

---

## Task 9: API Route — GET /api/admin/generate-3d/status

**Files:**
- Create: `website/src/pages/api/admin/generate-3d/status.ts`

- [ ] **Step 9.1: Create directory**

```bash
mkdir -p /tmp/wt-3d-asset-pipeline/website/src/pages/api/admin/generate-3d
```

- [ ] **Step 9.2: Create `website/src/pages/api/admin/generate-3d/status.ts`**

```typescript
import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../lib/auth';
import { getHistory, downloadOutput, findGlbOutput } from '../../../../lib/comfy-client';
import { getJob, updateJobStatus, listRecentJobs } from '../../../../lib/generation-jobs';
import { pool } from '../../../../lib/website-db';

const COMFY_HOST_IP = import.meta.env.COMFY_HOST_IP ?? '';
const COMFY_PORT = import.meta.env.COMFY_PORT ?? '';
const BRETT_INTERNAL_URL = import.meta.env.BRETT_INTERNAL_URL ?? 'http://brett.workspace.svc.cluster.local:3000';
const BRETT_OIDC_SECRET = import.meta.env.BRETT_OIDC_SECRET ?? '';

function comfyBase(): string {
  return `http://${COMFY_HOST_IP}:${COMFY_PORT}`;
}

async function finaliseJob(jobId: string, promptId: string, name: string): Promise<void> {
  const history = await getHistory(comfyBase(), promptId);
  const entry = history[promptId];
  if (!entry) return; // still queued

  if (!entry.status.completed) {
    if (entry.status.status_str === 'error') {
      await updateJobStatus(jobId, 'error', { error_msg: 'ComfyUI reported generation error' });
    }
    return;
  }

  const glbFilename = findGlbOutput(entry.outputs);
  if (!glbFilename) {
    await updateJobStatus(jobId, 'error', { error_msg: 'No .glb output found in ComfyUI history' });
    return;
  }

  const glbBuffer = await downloadOutput(comfyBase(), glbFilename);

  // Forward to Brett
  const form = new FormData();
  form.append('glb', new Blob([glbBuffer], { type: 'model/gltf-binary' }), `${name}.glb`);
  form.append('name', name);
  const brettRes = await fetch(`${BRETT_INTERNAL_URL}/api/skins/upload`, {
    method: 'POST',
    headers: { 'x-e2e-secret': BRETT_OIDC_SECRET },
    body: form,
  });

  if (!brettRes.ok) {
    const msg = await brettRes.text();
    await updateJobStatus(jobId, 'error', { error_msg: `Brett upload failed: ${msg}` });
    return;
  }

  const brettData = await brettRes.json();
  const skinId: string = brettData.id;

  // Register in assets.registry
  await pool.query(
    `INSERT INTO assets.registry (name, type, file_path, metadata)
     VALUES ($1, 'model_3d', $2, $3)
     ON CONFLICT (file_path) DO UPDATE SET updated_at = now()`,
    [name, `skins/${skinId}/skin.glb`, JSON.stringify({ skin_id: skinId, source: 'hunyuan3d-2', animations: brettData.animations ?? [] })],
  );

  await updateJobStatus(jobId, 'done', { skin_id: skinId });
}

// Timeout jobs older than 10 minutes that are still pending/running.
async function timeoutOldJob(job: { id: string; created_at: string; status: string }): Promise<boolean> {
  const age = Date.now() - new Date(job.created_at).getTime();
  if (age > 10 * 60 * 1000 && (job.status === 'pending' || job.status === 'running')) {
    await updateJobStatus(job.id, 'error', { error_msg: 'Generation timeout (>10 min)' });
    return true;
  }
  return false;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response('Unauthorized', { status: 401 });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // No id = list recent jobs
  if (!id) {
    const jobs = await listRecentJobs(20);
    return new Response(JSON.stringify(jobs), { headers: { 'Content-Type': 'application/json' } });
  }

  const job = await getJob(id);
  if (!job) {
    return new Response(JSON.stringify({ error: 'job not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Already terminal
  if (job.status === 'done' || job.status === 'error') {
    return new Response(JSON.stringify(job), { headers: { 'Content-Type': 'application/json' } });
  }

  if (await timeoutOldJob(job)) {
    return new Response(JSON.stringify({ ...job, status: 'error', error_msg: 'Generation timeout (>10 min)' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Finalise if ComfyUI is done and skin_id not yet set (idempotent guard)
  if (job.prompt_id && !job.skin_id) {
    try {
      await finaliseJob(job.id, job.prompt_id, job.name);
    } catch (err) {
      await updateJobStatus(job.id, 'error', {
        error_msg: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const updated = await getJob(id);
  return new Response(JSON.stringify(updated), { headers: { 'Content-Type': 'application/json' } });
};
```

- [ ] **Step 9.3: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/pages/api/admin/generate-3d/status.ts
git commit -m "feat(website): add GET /api/admin/generate-3d/status endpoint"
```

---

## Task 10: Admin UI

**Files:**
- Create: `website/src/pages/admin/asset-generation.astro`
- Create: `website/src/components/admin/AssetGenerationStudio.svelte`

- [ ] **Step 10.1: Create `website/src/pages/admin/asset-generation.astro`**

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import AssetGenerationStudio from '../../components/admin/AssetGenerationStudio.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="3D Generation">
  <AssetGenerationStudio client:load />
</AdminLayout>
```

- [ ] **Step 10.2: Create `website/src/components/admin/AssetGenerationStudio.svelte`**

```svelte
<script lang="ts">
  import { onDestroy } from 'svelte';

  let imageFile: File | null = null;
  let imagePreview: string | null = null;
  let skinName = '';
  let jobId: string | null = null;
  let status: 'idle' | 'pending' | 'running' | 'done' | 'error' = 'idle';
  let errorMsg = '';
  let skinId: string | null = null;
  let recentJobs: Array<{id:string;name:string;status:string;skin_id:string|null;error_msg:string|null;created_at:string}> = [];
  let pollTimer: ReturnType<typeof setInterval> | null = null;

  async function loadRecent() {
    const res = await fetch('/api/admin/generate-3d/status');
    if (res.ok) recentJobs = await res.json();
  }

  loadRecent();

  function onFileChange(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    imageFile = input.files?.[0] ?? null;
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => { imagePreview = reader.result as string; };
      reader.readAsDataURL(imageFile);
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    imageFile = e.dataTransfer?.files[0] ?? null;
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = () => { imagePreview = reader.result as string; };
      reader.readAsDataURL(imageFile);
    }
  }

  async function startGeneration() {
    if (!imageFile || !skinName.trim()) return;
    status = 'pending';
    errorMsg = '';
    skinId = null;
    jobId = null;

    const form = new FormData();
    form.append('image', imageFile);
    form.append('name', skinName.trim());

    const res = await fetch('/api/admin/generate-3d', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok) {
      status = 'error';
      errorMsg = data.error ?? 'Unknown error';
      return;
    }
    jobId = data.job_id;
    pollTimer = setInterval(poll, 3000);
  }

  async function poll() {
    if (!jobId) return;
    const res = await fetch(`/api/admin/generate-3d/status?id=${jobId}`);
    if (!res.ok) return;
    const job = await res.json();
    status = job.status;
    if (job.status === 'done') {
      skinId = job.skin_id;
      clearInterval(pollTimer!);
      pollTimer = null;
      loadRecent();
    } else if (job.status === 'error') {
      errorMsg = job.error_msg ?? 'Generation failed';
      clearInterval(pollTimer!);
      pollTimer = null;
      loadRecent();
    }
  }

  onDestroy(() => { if (pollTimer) clearInterval(pollTimer); });

  function statusLabel(s: string) {
    return { pending: '⏳ Queued', running: '🔄 Generating...', done: '✅ Done', error: '❌ Error' }[s] ?? s;
  }
</script>

<div class="studio">
  <div class="studio-form">
    <!-- Drop Zone -->
    <div
      class="drop-zone"
      class:has-image={!!imagePreview}
      on:dragover|preventDefault
      on:drop={onDrop}
      role="button"
      tabindex="0"
      on:click={() => (document.getElementById('file-input') as HTMLInputElement).click()}
      on:keydown={(e) => e.key === 'Enter' && (document.getElementById('file-input') as HTMLInputElement).click()}
    >
      {#if imagePreview}
        <img src={imagePreview} alt="preview" class="preview-img" />
      {:else}
        <span class="drop-hint">📎 Bild hier ablegen<br><small>oder klicken zum Auswählen</small></span>
      {/if}
    </div>
    <input id="file-input" type="file" accept="image/*" class="hidden-input" on:change={onFileChange} />

    <!-- Name Input -->
    <input
      class="name-input"
      type="text"
      placeholder="Skin-Name (z. B. Patrick Hero)"
      bind:value={skinName}
      maxlength="64"
    />

    <!-- Generate Button -->
    <button
      class="generate-btn"
      disabled={!imageFile || !skinName.trim() || status === 'pending' || status === 'running'}
      on:click={startGeneration}
    >
      {status === 'pending' || status === 'running' ? '⏳ Generating...' : '▶ Generate 3D Model'}
    </button>
  </div>

  <!-- Status Panel -->
  <div class="status-panel">
    {#if status === 'idle'}
      <p class="hint">Upload ein Bild und klick Generate.</p>
      <p class="hint-small">Generierung dauert ~2–5 Minuten.</p>
    {:else if status === 'pending'}
      <div class="status-badge pending">⏳ Job angenommen — warte auf ComfyUI...</div>
    {:else if status === 'running'}
      <div class="status-badge running">🔄 Hunyuan3D-2 generiert...</div>
      <div class="progress-bar"><div class="progress-inner"></div></div>
    {:else if status === 'done'}
      <div class="status-badge done">✅ Skin erstellt!</div>
      {#if skinId}
        <p class="skin-id">Skin-ID: <code>{skinId}</code></p>
        <p class="hint-small">Im Mayhem Hero-Select wählbar.</p>
      {/if}
    {:else if status === 'error'}
      <div class="status-badge error">❌ Fehler</div>
      <p class="error-msg">{errorMsg}</p>
    {/if}
  </div>
</div>

<!-- Recent Jobs -->
{#if recentJobs.length > 0}
  <section class="recent">
    <h3>Letzte Jobs</h3>
    <div class="job-list">
      {#each recentJobs as job}
        <div class="job-chip" class:done={job.status==='done'} class:error={job.status==='error'}>
          <span class="job-status">{statusLabel(job.status)}</span>
          <span class="job-name">{job.name}</span>
          {#if job.skin_id}<span class="job-meta">{job.skin_id}</span>{/if}
        </div>
      {/each}
    </div>
  </section>
{/if}

<style>
  .studio {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-bottom: 2rem;
  }
  @media (max-width: 768px) { .studio { grid-template-columns: 1fr; } }

  .drop-zone {
    border: 2px dashed rgba(255,255,255,0.3);
    border-radius: 8px;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    min-height: 140px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: border-color 0.2s;
  }
  .drop-zone:hover, .drop-zone.has-image { border-color: rgba(255,255,255,0.6); }
  .preview-img { max-width: 100%; max-height: 120px; border-radius: 4px; object-fit: contain; }
  .drop-hint { opacity: 0.6; line-height: 1.6; }
  .hidden-input { display: none; }

  .name-input {
    width: 100%;
    padding: 0.6rem 0.75rem;
    margin-top: 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(255,255,255,0.2);
    background: rgba(255,255,255,0.05);
    color: inherit;
    font-size: 1rem;
    min-height: 44px;
    box-sizing: border-box;
  }

  .generate-btn {
    margin-top: 0.75rem;
    width: 100%;
    min-height: 44px;
    padding: 0.6rem 1rem;
    border-radius: 6px;
    border: none;
    background: #b8860b;
    color: #000;
    font-weight: 600;
    font-size: 1rem;
    cursor: pointer;
  }
  .generate-btn:disabled { opacity: 0.5; cursor: not-allowed; }

  .status-panel { display: flex; flex-direction: column; gap: 0.5rem; }
  .status-badge { padding: 0.5rem 0.75rem; border-radius: 6px; font-weight: 500; }
  .pending { background: rgba(255,200,0,0.15); border: 1px solid rgba(255,200,0,0.4); }
  .running { background: rgba(0,150,255,0.15); border: 1px solid rgba(0,150,255,0.4); }
  .done    { background: rgba(0,200,80,0.15);  border: 1px solid rgba(0,200,80,0.4); }
  .error   { background: rgba(220,50,50,0.15); border: 1px solid rgba(220,50,50,0.4); }

  .progress-bar { height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden; margin-top: 0.5rem; }
  .progress-inner { height: 100%; background: #0096ff; width: 60%; animation: slide 1.5s infinite ease-in-out; }
  @keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(250%); } }

  .hint { opacity: 0.5; margin: 0; }
  .hint-small { opacity: 0.4; font-size: 0.85em; margin: 0; }
  .skin-id { font-size: 0.85em; margin: 0.25rem 0 0; }
  .error-msg { color: #ff6b6b; font-size: 0.9em; margin: 0.25rem 0 0; word-break: break-word; }

  .recent h3 { margin: 0 0 0.5rem; font-size: 0.9em; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.05em; }
  .job-list { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .job-chip {
    display: flex; gap: 0.5rem; align-items: center;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    padding: 0.35rem 0.65rem;
    font-size: 0.82em;
    min-height: 44px;
  }
  .job-chip.done  { border-color: rgba(0,200,80,0.3); }
  .job-chip.error { border-color: rgba(220,50,50,0.3); }
  .job-name { font-weight: 500; }
  .job-meta { opacity: 0.5; font-size: 0.85em; }
</style>
```

- [ ] **Step 10.3: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/pages/admin/asset-generation.astro \
        website/src/components/admin/AssetGenerationStudio.svelte
git commit -m "feat(website): add AssetGenerationStudio admin page + Svelte component"
```

---

## Task 11: Admin Nav Link

**Files:**
- Modify: `website/src/layouts/AdminLayout.astro`

- [ ] **Step 11.1: Add nav entry** — in `AdminLayout.astro`, find the `assets` item (~line 131):

```typescript
{ href: '/admin/assets',   label: 'Assets',       icon: 'palette' },
```

Add after it:

```typescript
{ href: '/admin/asset-generation', label: '3D Generator', icon: 'palette' },
// Note: replace 'palette' with a valid icon name from your icon set if 'cube' or similar exists.
```

- [ ] **Step 11.2: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add website/src/layouts/AdminLayout.astro
git commit -m "feat(website): add 3D Generator link to admin nav"
```

---

## Task 12: assets-index.sh — classify model_3d

**Files:**
- Modify: `scripts/assets-index.sh`

- [ ] **Step 12.1: Extend `classify_type` function** — find the `classify_type` function and add a `glb|gltf` case before the `*)` fallback:

```bash
classify_type() {
  local ext="${1##*.}"
  ext="${ext,,}"
  case "$ext" in
    ogg|mp3|wav|flac|aac) echo "audio" ;;
    png|jpg|jpeg|webp|svg|gif|avif|ico) echo "image" ;;
    mp4|webm|mov|avi) echo "video" ;;
    glb|gltf) echo "model_3d" ;;
    *) echo "document" ;;
  esac
}
```

- [ ] **Step 12.2: Commit**

```bash
cd /tmp/wt-3d-asset-pipeline
git add scripts/assets-index.sh
git commit -m "feat(assets): classify .glb/.gltf files as model_3d in assets-index"
```

---

## Task 13: Run Tests + Validate

- [ ] **Step 13.1: Run unit tests**

```bash
cd /tmp/wt-3d-asset-pipeline/website
pnpm vitest run src/lib/comfy-client.test.ts
```

Expected: all green.

- [ ] **Step 13.2: Run offline test suite**

```bash
cd /tmp/wt-3d-asset-pipeline
task test:all
```

Expected: no failures.

- [ ] **Step 13.3: Validate kustomize manifests**

```bash
task workspace:validate
```

Expected: no errors.

- [ ] **Step 13.4: Manual smoke test checklist**

After deploying to mentolder (`task feature:website` + `task feature:deploy ENV=mentolder`):

```
□ /admin/asset-generation loads without error
□ "3D Generator" appears in admin sidebar nav
□ ComfyUI unreachable → API returns 503 with clear message
□ COMFY_HOST_IP empty → upload button shows disabled/503 response
□ Upload valid image + name → POST 202 → job_id returned
□ Poll status every 3s → status changes: pending → done
□ Done → skin appears in Brett /api/skins list
□ Brett Mayhem hero-select shows new skin
□ assets.registry has row with type='model_3d'
□ Upload GLB without mixamorigHips → job status = error "Invalid rig"
□ Mobile (≤768px) → columns stack, buttons ≥44px
```

- [ ] **Step 13.5: Final push**

```bash
cd /tmp/wt-3d-asset-pipeline
git push origin HEAD
```

---

## Task 14: PR

- [ ] **Step 14.1: Create PR**

```bash
gh pr create \
  --title "feat(3d): ComfyUI Hunyuan3D-2 → Brett skin pipeline" \
  --body "$(cat <<'EOF'
## Summary
- Admin-only pipeline: upload image → ComfyUI (Hunyuan3D-2) → Mixamo-rigged GLB → Brett Mayhem character skin
- New DB table \`assets.generation_jobs\`, new \`model_3d\` enum value in \`assets.registry\`
- K8s \`comfy-gateway\` Service+Endpoints following llm-gpu.yaml pattern
- \`AssetGenerationStudio.svelte\` with drop zone, polling status, recent jobs list
- Website API forwards finished GLB to Brett via \`x-e2e-secret\` internal auth

## Test plan
- [ ] \`pnpm vitest run src/lib/comfy-client.test.ts\` — all green
- [ ] \`task test:all\` — all offline tests pass
- [ ] \`task workspace:validate\` — kustomize manifests valid
- [ ] Manual smoke test per checklist in Task 13.4

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 14.2: Merge**

```bash
gh pr merge --squash --delete-branch
git checkout main
git pull --rebase origin main
```

- [ ] **Step 14.3: Deploy**

```bash
task feature:website
task feature:deploy ENV=mentolder
```
