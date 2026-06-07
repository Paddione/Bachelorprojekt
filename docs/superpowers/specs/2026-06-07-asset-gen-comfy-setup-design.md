# Asset Generator Completion: End-to-End 3D Pipeline via ComfyUI + Hunyuan3D-2

**Datum:** 2026-06-07  
**Branch:** feature/asset-gen-comfy-setup  
**Ziel:** Jede Asset-Generierungsfunktion im Repo liefert ein akzeptables Ergebnis (funktionale End-to-End-Pipeline + CI-Tests ohne GPU-Host)

---

## Kontext & Ausgangslage

Der Großteil des Codes existiert bereits:

| Vorhanden | Fehlend |
|-----------|---------|
| `website/src/lib/comfy-client.ts` | `assets.generation_jobs` DB-Tabelle |
| `website/src/pages/api/admin/generate-3d.ts` | `model_3d` in `assets.asset_type` Enum |
| `website/src/pages/api/admin/generate-3d/status.ts` | Brett `/api/skins/upload` Endpoint |
| `website/src/config/comfy-workflow-hunyuan3d.json` | Rigging-Stage (ComfyUI → Brett-Lücke) |
| `website/src/lib/generation-jobs.ts` | ComfyUI + Blender auf GPU-Host |
| Admin-UI (`AssetGenerationStudio.svelte`) | CI-Mock-Tests |
| K8s-Manifeste (`prod/comfy-gpu.yaml`) | |
| Env-Vars (`COMFY_HOST_IP`, `COMFY_PORT`) | |

**Kritische Lücke:** Hunyuan3D-2 generiert ungerrigte Meshes. Brett erwartet Mixamo-kompatible Knochen (`mixamorigHips` etc.). Daher ist ein Rigging-Zwischenschritt nötig.

---

## Architektur

### Pipeline-Übersicht

```
Admin UI
  │
  ▼
POST /api/admin/generate-3d
  │  stage: queued → generating
  ▼
ComfyUI @ GPU-Host :8189
  Hunyuan3D_SVI → Hunyuan3D_Gen → SaveGLB
  → ungerrigtes .glb
  │
  ▼ GET /api/admin/generate-3d/status (Polling, alle 5s)
  │  stage: rigging
  ▼
Rigger-Server @ GPU-Host :8190
  POST /rig?method=blender|mixamo
  Blender+Rigify (primär) | Mixamo Web-Automation (optional)
  → Mixamo-kompatibles .glb (14 Standard-Bones, mixamorigHips vorhanden)
  │
  ▼  stage: uploading
Brett /api/skins/upload
  Validierung (Größe ≤ 20 MB, Bone-Check) + Storage
  → public/assets/skins/<uuid>/skin.glb + meta.json
  → Response: {id, animations[]}
  │
  ▼  stage: done
assets.registry INSERT (type: model_3d)
generation_jobs UPDATE (status: done, skin_id)
```

### Stage-Maschine

```
queued → generating → rigging → uploading → done
                                           ↘ error (aus jeder Stage erreichbar)
```

---

## Datenbankschema

### Migration 1 — Enum-Erweiterung

Datei: `website/src/db/migrations/20260607_add_model_3d_type.sql`

```sql
ALTER TYPE assets.asset_type ADD VALUE IF NOT EXISTS 'model_3d';
```

### Migration 2 — generation_jobs Tabelle

Datei: `website/src/db/migrations/20260607_create_generation_jobs.sql`

```sql
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

GRANT ALL PRIVILEGES ON assets.generation_jobs TO website;
ALTER DEFAULT PRIVILEGES IN SCHEMA assets
  GRANT ALL ON TABLES TO website;
```

**Stage-Werte:** `queued | generating | rigging | uploading | done | error`  
**Status-Werte:** `pending | done | error` — wird aus `stage` abgeleitet (`done`→`done`, `error`→`error`, sonst `pending`). Nur für Rückwärtskompatibilität mit bestehendem `generate-3d.ts`-Code; neuer Code verwendet ausschließlich `stage`.

---

## GPU-Host Setup

### Voraussetzungen (bereits vorhanden)

- NVIDIA RTX 5070 Ti, 16 GB VRAM
- NVIDIA Driver 596.36 (CUDA 13.2 max)
- Python 3.12.3
- 872 GB freier Disk-Platz

### `scripts/setup-comfyui.sh`

Einmaliges Installations-Skript. Idempotent (prüft vor jedem Schritt ob bereits vorhanden).

```bash
#!/usr/bin/env bash
set -euo pipefail

VENV="$HOME/comfy-venv"
COMFY_DIR="$HOME/ComfyUI"

# 1. Python venv + PyTorch (CUDA 12.8, kompatibel mit Driver 596)
if [[ ! -d "$VENV" ]]; then
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --upgrade pip
  "$VENV/bin/pip" install torch torchvision \
    --index-url https://download.pytorch.org/whl/cu128
fi

# 2. ComfyUI
if [[ ! -d "$COMFY_DIR" ]]; then
  git clone https://github.com/comfyanonymous/ComfyUI "$COMFY_DIR"
fi
"$VENV/bin/pip" install -r "$COMFY_DIR/requirements.txt"

# 3. Hunyuan3D-2 Custom Nodes (kijai/ComfyUI-Hunyuan3D-2)
HUNYUAN_DIR="$COMFY_DIR/custom_nodes/ComfyUI-Hunyuan3D-2"
if [[ ! -d "$HUNYUAN_DIR" ]]; then
  git clone https://github.com/kijai/ComfyUI-Hunyuan3D-2 "$HUNYUAN_DIR"
fi
"$VENV/bin/pip" install -r "$HUNYUAN_DIR/requirements.txt"

# 4. Modellgewichte (~8 GB, Hunyuan3D-2 mini empfohlen für 16 GB VRAM)
MODEL_DIR="$COMFY_DIR/models/hunyuan3d"
mkdir -p "$MODEL_DIR"
if [[ ! -f "$MODEL_DIR/model.safetensors" ]]; then
  "$VENV/bin/pip" install huggingface_hub
  "$VENV/bin/huggingface-cli" download tencent/Hunyuan3D-2 \
    --local-dir "$MODEL_DIR" --include "*.safetensors" "*.json"
fi

# 5. Blender (für headless Rigging)
if ! command -v blender &>/dev/null; then
  sudo apt install -y blender
fi

# 6. FastAPI für Rigger-Server
"$VENV/bin/pip" install fastapi uvicorn python-multipart

echo "Setup abgeschlossen. Starte mit: bash scripts/start-comfyui.sh"
```

### `scripts/start-comfyui.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

VENV="$HOME/comfy-venv"
COMFY_DIR="$HOME/ComfyUI"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

screen -dmS comfyui bash -c \
  "'$VENV/bin/python' '$COMFY_DIR/main.py' \
   --listen 0.0.0.0 --port 8189 2>&1 | tee '$HOME/comfyui.log'"

screen -dmS rigger bash -c \
  "cd '$REPO_DIR' && '$VENV/bin/uvicorn' \
   scripts.rigger_server:app --host 0.0.0.0 --port 8190 \
   2>&1 | tee '$HOME/rigger.log'"

echo "ComfyUI: screen -r comfyui"
echo "Rigger:  screen -r rigger"
```

### `scripts/rigger_server.py`

FastAPI-Server auf Port 8190.

```python
from fastapi import FastAPI, UploadFile, File, Query, HTTPException
from fastapi.responses import Response
import subprocess, tempfile, os, shutil

app = FastAPI()

@app.post("/rig")
async def rig(
    glb: UploadFile = File(...),
    method: str = Query("blender", regex="^(blender|mixamo)$"),
):
    with tempfile.TemporaryDirectory() as tmp:
        input_path = os.path.join(tmp, "input.glb")
        output_path = os.path.join(tmp, "output.glb")
        with open(input_path, "wb") as f:
            f.write(await glb.read())

        if method == "blender":
            _rig_blender(input_path, output_path)
        else:
            _rig_mixamo(input_path, output_path)

        with open(output_path, "rb") as f:
            return Response(content=f.read(), media_type="model/gltf-binary")

def _rig_blender(input_path: str, output_path: str):
    script = os.path.join(os.path.dirname(__file__), "rig_for_mixamo.py")
    result = subprocess.run(
        ["blender", "--background", "--python", script,
         "--", input_path, output_path],
        capture_output=True, text=True, timeout=120,
    )
    if result.returncode != 0 or not os.path.exists(output_path):
        raise HTTPException(500, f"Blender rigging failed: {result.stderr[-500:]}")

def _rig_mixamo(input_path: str, output_path: str):
    # Playwright-Automation gegen mixamo.com
    # Erfordert MIXAMO_EMAIL + MIXAMO_PASSWORD in Env
    raise HTTPException(501, "Mixamo automation not yet implemented")
```

### `scripts/rig_for_mixamo.py`

Blender-Headless-Skript (wird von Blender als Python-Script ausgeführt):

```python
import bpy, sys, mathutils

argv = sys.argv[sys.argv.index("--") + 1:]
input_glb, output_glb = argv[0], argv[1]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=input_glb)

mesh_obj = next(o for o in bpy.context.scene.objects if o.type == 'MESH')

# Bounding-Box-basierte Armatur-Positionierung (keine manuelle Anpassung nötig)
bbox = [mesh_obj.matrix_world @ mathutils.Vector(c) for c in mesh_obj.bound_box]
min_z = min(v.z for v in bbox)
max_z = max(v.z for v in bbox)
height = max_z - min_z
cx = sum(v.x for v in bbox) / 8
cy = sum(v.y for v in bbox) / 8

bpy.ops.object.armature_add(enter_editmode=True, location=(cx, cy, min_z))
arm_obj = bpy.context.active_object
arm = arm_obj.data

# Vereinfachte Hierarchie: Hips → Spine → Neck → Head + 4 Gliedmaßen
# Positionen relativ zur Bounding-Box skaliert
# Implementierung: Knochen manuell in Edit-Mode platzieren (bpy.ops.armature.bone_primitive_add)
# und BONE_MAP-Umbenennung zu Mixamo-Namen anwenden.
# HINWEIS: Die genaue Bone-Positionierung ist mesh-abhängig und muss ggf. pro
# Modell-Typ kalibriert werden. Startpunkt: Hips bei 45% der Höhe,
# Head bei 90%, Hände/Füße an Extrempunkten der Bounding-Box.

# Mesh an Armatur binden
bpy.ops.object.mode_set(mode='OBJECT')
bpy.context.view_layer.objects.active = arm_obj
mesh_obj.select_set(True)
bpy.ops.object.parent_set(type='ARMATURE_AUTO')

bpy.ops.export_scene.gltf(filepath=output_glb, export_format='GLB')
```

> **Implementierungshinweis:** Das vollständige Bone-Placement-Skript wird in der Implementierungsphase iterativ entwickelt und gegen 3-5 Hunyuan3D-2-Testmeshes kalibriert. Die Spec gibt die Architektur vor; die exakten Bone-Koordinaten sind emergent.

---

## Brett: `/api/skins/upload` Endpoint

In `brett/src/server/index.ts`, nach den bestehenden Routes:

### Abhängigkeiten

`multer` (Multipart-Parsing) falls nicht vorhanden:
```bash
pnpm add multer @types/multer
```

### Route-Definition

```typescript
// POST /api/skins/upload
// Auth: x-e2e-secret Header (BRETT_OIDC_SECRET)
// Body: multipart/form-data { glb: File, name: string }
// Response: { id: string, animations: string[] }
```

**Validierungslogik:**
1. Auth-Header prüfen (`x-e2e-secret === process.env.BRETT_OIDC_SECRET`)
2. Dateigröße ≤ 20 MB
3. GLB-Bone-Check: JSON-Chunk des GLB parsen, prüfen ob `mixamorigHips` in Node-Namen vorkommt
4. UUID generieren, in `brett/public/assets/skins/<uuid>/` speichern
5. `meta.json` schreiben: `{id, name, source: 'hunyuan3d-2', animations: [], created_at}`
6. Response: `{id, animations: []}`

**Storage-Layout:**
```
brett/public/assets/skins/
  <uuid>/
    skin.glb
    meta.json
```

---

## Website: Erweiterte Pipeline-Logik

### `website/src/lib/generation-jobs.ts`

Erweitert um `stage`-Feld in allen Queries und einer neuen `updateJobStage()`-Funktion.

### `website/src/pages/api/admin/generate-3d/status.ts`

Erweiterter Polling-Handler mit Stage-Orchestrierung:

```
Stage generating: ComfyUI /history polling (bestehend)
  → wenn done: GLB downloaden → Stage rigging
Stage rigging: POST http://<RIGGER_HOST_IP>:<RIGGER_PORT>/rig?method=blender
  → wenn done: rigged GLB → Stage uploading  
Stage uploading: POST brett/api/skins/upload (bestehend)
  → wenn done: Stage done
```

**Neue Env-Vars:**
```yaml
RIGGER_HOST_IP: "192.168.100.10"  # Standard: gleich COMFY_HOST_IP
RIGGER_PORT: "8190"
```

Diese kommen in `environments/schema.yaml` und `environments/mentolder.yaml` / `environments/korczewski.yaml`.

---

## CI-Test-Strategie

### Mock-Ansatz: Dependency Injection

Alle externen HTTP-Calls akzeptieren `fetchFn: typeof fetch` (ComfyUI-Client bereits so gebaut). Der Rigger-Client bekommt dasselbe Muster.

### `website/src/lib/generate-3d-pipeline.test.ts`

| Test | Mock | Erwartung |
|------|------|-----------|
| Stage generating: ComfyUI queued | `uploadImage` + `queuePrompt` mocked | job.stage = 'generating' |
| Stage generating: ComfyUI done | `getHistory` → completed: true | GLB downloaded, stage = 'rigging' |
| Stage rigging: Rigger antwortet | POST /rig → rigged GLB | stage = 'uploading' |
| Stage uploading: Brett antwortet | POST /api/skins/upload → {id} | stage = 'done', skin_id gesetzt |
| Integration: volle Pipeline | alle drei Mocks | queued → done in einem Polling-Zyklus |
| Fehler: ComfyUI Timeout | alte jobs (> 10 min) | stage = 'error', error_msg gesetzt |
| Fehler: Rigger 500 | Rigger-Mock → 500 | stage = 'error' |
| Fehler: Brett-Validierung 422 | Brett-Mock → 422 | stage = 'error', error_msg gesetzt |

### `brett/test/skins-upload.test.ts`

| Test | Input | Erwartung |
|------|-------|-----------|
| Valides GLB mit mixamorigHips | minimal GLB mit korrektem Bone | 200, {id, animations: []} |
| GLB zu groß | 21 MB Datei | 413 |
| Fehlende Mixamo-Bones | GLB ohne mixamorigHips | 422 |
| Kein Auth-Header | fehlender x-e2e-secret | 401 |
| Falscher Auth-Header | falscher Wert | 401 |

---

## Nicht im Scope

- Mixamo Web-Automation (Playwright): Endpoint gibt 501 zurück, dokumentiert als künftige Erweiterung
- Animations-Clips von Mixamo herunterladen
- Skin-Browser im Brett-Client
- Thumbnail-Generierung für Skins
- Skin-Verwaltung (Löschen, Umbenennen) im Admin-UI

---

## Erfolgs-Kriterien

1. `task test:all` bleibt grün (kein GPU-Host nötig)
2. `pnpm test` im `website/`-Verzeichnis: alle Pipeline-Tests grün
3. Brett-Tests: alle Skins-Upload-Tests grün
4. Auf dem GPU-Host: `bash scripts/setup-comfyui.sh` läuft durch
5. End-to-End: Bild hochladen im Admin → nach ~5 Min erscheint neuer Skin in Brett
