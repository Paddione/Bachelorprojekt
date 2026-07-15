# Asset-Generierung: GPU-Host einrichten & starten

Betriebsanleitung für die 3D-Asset-Pipeline (ComfyUI/Hunyuan3D-2 + Blender-Rigger)
auf dem GPU-Host. Architektur & Verhaltensvertrag: SSOT-Spec
`openspec/specs/asset-generation.md`.

## Einmalige Einrichtung

```bash
bash scripts/setup-comfyui.sh
```

Idempotent — installiert Python-venv (`~/comfy-venv`, PyTorch CUDA-12.8-Wheel),
ComfyUI (`~/ComfyUI`), die kijai Hunyuan3D-2-Custom-Nodes, die Modellgewichte
(~8 GB; **Hunyuan3D-2-mini** wegen 16-GB-VRAM-Limit der RTX 5070 Ti), Blender
(headless Rigging) und FastAPI/uvicorn für den Rigger-Server.

## Dienste starten

```bash
bash scripts/start-comfyui.sh
```

Startet zwei `screen`-Sessions:

| Dienst | Port | Session | Log |
|---|---|---|---|
| ComfyUI (Hunyuan3D-2) | 8189 | `screen -r comfyui` | `~/comfyui.log` |
| Rigger (`scripts/rigger_server.py`) | 8190 | `screen -r rigger` | `~/rigger.log` |

## Verifikation

```bash
curl -sf "http://${COMFY_HOST_IP}:8189/system_stats" | head -c 200   # ComfyUI lebt
curl -s -o /dev/null -w '%{http_code}' -X POST \
  "http://${RIGGER_HOST_IP:-$COMFY_HOST_IP}:8190/rig?method=mixamo"   # erwartet 501
```

`method=mixamo` ist bewusst nicht implementiert (501) — Blender+Rigify ist der
einzige Rigging-Pfad. Die Website erreicht die Dienste ausschließlich über
`COMFY_HOST_IP`/`COMFY_PORT` und `RIGGER_HOST_IP`/`RIGGER_PORT`
(`environments/<env>.yaml`, Schema in `environments/schema.yaml`).
