# 3D Asset Generation Pipeline — Design Spec

**Date:** 2026-05-25
**Branch:** feature/3d-asset-pipeline
**Status:** approved

---

## Overview

Admin-only pipeline: upload an image → trigger a ComfyUI (Hunyuan3D-2) job → receive a Mixamo-rigged GLB → automatically available as a Brett Mayhem character skin. Assets are registered in the central `assets.registry` table.

---

## Architecture

**Approach:** Website API as orchestrator. The website API handles auth, job management, and coordination. Brett's existing `/api/skins/upload` endpoint handles GLB validation and filesystem writes. No shared PVC required.

### Data Flow

```
① Admin UI (POST /api/admin/generate-3d {image, name})
   ↓
② Website API (generate-3d.ts)
   → POST http://comfy-gateway:COMFY_PORT/upload/image        → filename
   → POST http://comfy-gateway:COMFY_PORT/prompt {workflow}   → prompt_id
   → INSERT assets.generation_jobs {name, prompt_id, status:"pending"}
   → returns {job_id} immediately
   ↓
③ Admin UI polls GET /api/admin/generate-3d/status?id={job_id}
   → Website polls ComfyUI GET /history/{prompt_id}
   → updates job status: pending → running → done
   ↓
④ On done:
   → GET http://comfy-gateway:COMFY_PORT/view?filename=output.glb → buffer
   → POST http://brett.workspace.svc/api/skins/upload {glb, name}
        (Brett: validateGlb checks mixamorigHips, writes skins/{id}/, meta.json)
   → INSERT assets.registry {type:"model_3d", file_path:"skins/{id}/skin.glb",
                              metadata:{skin_id, animations, source:"hunyuan3d-2"}}
   → UPDATE generation_jobs SET status="done", skin_id={id}
   ↓
⑤ Admin UI shows success + "Skin now selectable in Brett Mayhem"
```

---

## Components

### 1. K8s Service — `prod/comfy-gpu.yaml`

Headless Service + Endpoints pointing at `${COMFY_HOST_IP}:${COMFY_PORT}`, following the pattern of `prod/llm-gpu.yaml`.

```yaml
# Service name: comfy-gateway
# Port: COMFY_PORT (must NOT be 8188 — conflicts with Janus WebSocket)
```

Added to `prod-mentolder/kustomization.yaml` and `prod-korczewski/kustomization.yaml`.

### 2. Env Vars (environments/schema.yaml + mentolder.yaml)

| Var | Required | Dev default | Description |
|-----|----------|-------------|-------------|
| `COMFY_HOST_IP` | false | `""` | wg-mesh IP of the GPU host running ComfyUI |
| `COMFY_PORT` | false | `""` | Port ComfyUI listens on (≠ 8188) |

Also added to `Taskfile.yml` `ENVSUBST_VARS` block (~line 1145).

### 3. ComfyUI Workflow Config — `website/src/config/comfy-workflow-hunyuan3d.json`

Stored workflow JSON template for the Hunyuan3D-2 pipeline. The input image node's `filename` field is substituted at runtime with the uploaded filename. The exact node ID must be identified from the user's ComfyUI workflow export.

### 4. DB Migration

**Migration A** — new enum value:
```sql
ALTER TYPE assets.asset_type ADD VALUE 'model_3d';
```

**Migration B** — job tracking table:
```sql
CREATE TABLE assets.generation_jobs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  prompt_id  TEXT,
  status     TEXT NOT NULL DEFAULT 'pending'
             CHECK (status IN ('pending','running','done','error')),
  skin_id    TEXT,
  error_msg  TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### 5. API Routes (website/src/pages/api/admin/)

**`generate-3d.ts` (POST)**
- Auth: `requireAdmin(session)` 
- Accepts multipart: `image` (file), `name` (string)
- Uploads image to ComfyUI `/upload/image`
- Queues workflow to ComfyUI `/prompt` with image filename substituted
- Inserts row in `assets.generation_jobs`
- Returns `{job_id: UUID}`

**`generate-3d/status.ts` (GET)**
- Query param: `id` (job UUID)
- Polls ComfyUI `/history/{prompt_id}`; updates job row
- On done (idempotent — only executes if `skin_id` is null): downloads GLB, forwards to Brett `/api/skins/upload`, registers in `assets.registry`, sets `skin_id`
- Returns `{status, skin_id?, error?}`

### 6. Admin UI — `website/src/pages/admin/asset-generation.astro`

Single-page layout (Option A):

```
┌─────────────────────────────────────────────┐
│  Drop zone (image)  │  Status panel          │
│  Name input         │  pending/running/done  │
│  [Generate] button  │  ~2–5 min estimate     │
├─────────────────────────────────────────────┤
│  Recent Jobs: ✅ Patrick Hero  ⏳ Ninja v2   │
└─────────────────────────────────────────────┘
```

Implemented as `AssetGenerationStudio.svelte`. Polls `/api/admin/generate-3d/status` every 3s while a job is running. Mobile-responsive (≥44px tap targets).

---

## Error Handling

| Failure | Job status | Message returned |
|---------|-----------|-----------------|
| ComfyUI unreachable | `error` | "ComfyUI unavailable" |
| Job exceeds 10 min | `error` | "Generation timeout" |
| GLB missing `mixamorigHips` | `error` | "Invalid rig — Mixamo rig required" |
| Brett upload fails | `error` | "Brett upload failed: {reason}" |
| Client disconnects mid-poll | — | Job continues in DB; status retrievable |

---

## Out of Scope

- Public API access
- Nextcloud storage
- Text→3D, multi-image input
- Auto-rigging (Phase 2)
- Texture-only generation as separate flow

---

## Acceptance Criteria

- [ ] Admin uploads image → clicks Generate → sees status update
- [ ] Job completes → skin appears in Brett Mayhem hero-select
- [ ] `assets.registry` contains entry with `type = 'model_3d'`
- [ ] Invalid GLB (missing Mixamo rig) shows clear error, no crash
- [ ] Works on mobile (≥44px tap targets, stacked layout ≤768px)
- [ ] `COMFY_HOST_IP`/`COMFY_PORT` absent → feature disabled gracefully (503 with explanation)

---

## Open Assumptions

1. **Mixamo rig:** The configured Hunyuan3D-2 ComfyUI workflow produces GLBs with `mixamorigHips` node. Brett's `validateGlb` is the safety net.
2. **ComfyUI port:** Must be confirmed from the user's setup — stored as `COMFY_PORT` env var, never hardcoded.
3. **Brett internal URL:** Service name in K8s workspace namespace — to be confirmed (`http://brett.workspace.svc.cluster.local` assumed).
4. **Workflow node ID:** The exact node ID for the input image in the Hunyuan3D-2 workflow must be identified from the user's exported workflow JSON.
