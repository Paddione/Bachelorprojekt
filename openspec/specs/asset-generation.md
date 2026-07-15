# asset-generation
<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-07-15 (T001869); Quelle: Design feature/asset-gen-comfy-setup (2026-06-07) -->

## Purpose

Die 3D-Asset-Pipeline erzeugt aus einem im Admin-UI hochgeladenen Bild ein geriggtes, Mixamo-kompatibles 3D-Modell (`.glb`) und registriert es als Brett-Skin. Sie verbindet drei Systeme: die Website (Job-Orchestrierung + Admin-UI `AssetGenerationStudio.svelte`), den GPU-Host (ComfyUI mit Hunyuan3D-2 für die Mesh-Generierung, Blender-Rigger-Server für das Skelett) und Brett (Upload-Endpoint + Skin-Storage). Kein Schritt benötigt Cloud-Dienste; CI-Tests laufen vollständig ohne GPU-Host über Fetch-Mocks (Dependency Injection via `fetchFn`).

---

## Requirements

### Requirement: Stage-Maschine für Generation-Jobs

The system SHALL track every generation job in `assets.generation_jobs` with a `stage` column progressing `queued → generating → rigging → uploading → done`, where `error` is reachable from every stage (with `error_msg` set). The legacy `status` column (`pending | done | error`) is derived from `stage` and exists only for backwards compatibility — new code reads `stage` exclusively.

#### Scenario: Erfolgreicher Pipeline-Durchlauf

- **GIVEN** ein Job in Stage `generating`, dessen ComfyUI-History `completed: true` meldet
- **WHEN** der Polling-Handler `GET /api/admin/generate-3d/status` läuft (Client pollt ~alle 5s)
- **THEN** lädt er das ungeriggte GLB herunter, setzt Stage `rigging`, schickt es an den Rigger-Server, danach Stage `uploading` (Brett-Upload), abschließend Stage `done` mit gesetzter `skin_id`

#### Scenario: Fehler in einer Stage

- **GIVEN** der Rigger-Server antwortet mit HTTP 500
- **WHEN** der Polling-Handler die Antwort verarbeitet
- **THEN** setzt er `stage = 'error'` und `error_msg`

### Requirement: GPU-Host-Dienste (ComfyUI + Rigger)

The GPU host SHALL run two services set up by `scripts/setup-comfyui.sh` (idempotent) and started by `scripts/start-comfyui.sh`: ComfyUI with the kijai Hunyuan3D-2 custom nodes on port `8189`, and the FastAPI rigger server (`scripts/rigger_server.py`) on port `8190`. Hardware constraint: 16 GB VRAM (RTX 5070 Ti) — the **Hunyuan3D-2-mini** weights are the intended model; PyTorch is installed from the CUDA 12.8 wheel index.

The rigger endpoint `POST /rig?method=blender|mixamo` SHALL rig via headless Blender (`scripts/rig_for_mixamo.py`, bounding-box-based armature placement, `ARMATURE_AUTO` binding, 120s timeout). The `mixamo` method (Playwright web automation) is deliberately NOT implemented and returns **501** — Blender+Rigify is the primary and only rigging path.

#### Scenario: Blender-Rigging liefert Mixamo-kompatibles GLB

- **GIVEN** ein ungeriggtes Hunyuan3D-GLB
- **WHEN** `POST /rig?method=blender` aufgerufen wird
- **THEN** liefert der Server ein GLB mit Mixamo-Bone-Namen (u.a. `mixamorigHips`) als `model/gltf-binary`

#### Scenario: Mixamo-Methode ist nicht implementiert

- **WHEN** `POST /rig?method=mixamo` aufgerufen wird
- **THEN** antwortet der Server mit 501

### Requirement: Brett-Skin-Upload mit Validierungsgrenze

Brett SHALL expose `POST /api/skins/upload` (multipart: `glb` + `name`), authenticated via the `x-e2e-secret` header (`BRETT_OIDC_SECRET`). The endpoint is the security boundary between GPU host and Brett and SHALL validate: file size ≤ 20 MB (else 413) and presence of `mixamorigHips` in the GLB JSON chunk's node names (else 422). Valid uploads are stored under `brett/public/assets/skins/<uuid>/` (`skin.glb` + `meta.json` with `{id, name, source, animations, created_at}`) and answered with `{id, animations[]}`.

#### Scenario: GLB ohne Mixamo-Bones wird abgelehnt

- **GIVEN** ein GLB ohne `mixamorigHips`-Node
- **WHEN** es hochgeladen wird
- **THEN** antwortet Brett mit 422 und speichert nichts

#### Scenario: Fehlende Authentifizierung

- **WHEN** der `x-e2e-secret`-Header fehlt oder falsch ist
- **THEN** antwortet Brett mit 401

### Requirement: Host-Konfiguration über Env-Vars

The website SHALL reach the GPU services exclusively via the env vars `COMFY_HOST_IP`/`COMFY_PORT` (ComfyUI, `8189`) and `RIGGER_HOST_IP`/`RIGGER_PORT` (Rigger, `8190`, default: same host as ComfyUI), registered in `environments/schema.yaml` and set per environment in `environments/<env>.yaml`. All external HTTP calls accept an injectable `fetchFn` so CI can run the full pipeline against mocks without a GPU host.

#### Scenario: CI läuft ohne GPU-Host

- **GIVEN** die Pipeline-Tests (`website/src/lib/generate-3d-pipeline.test.ts`, `brett/test/skins-upload.test.ts`)
- **WHEN** `task test:all` bzw. `pnpm test` läuft
- **THEN** decken Mocks alle Stages inkl. Fehlerpfade ab; kein Netzwerkzugriff auf `COMFY_HOST_IP`/`RIGGER_HOST_IP`
