# Studio-Embed-Aktivierung (T901560-p3)

Stand: 2026-10-09. Studio-UI: `http://127.0.0.1:8888` (User `unsloth`).
Kein MCP-Werkzeug fuer Inference-Load vorhanden — Ladung per UI oder
authentifizierter Studio-REST (s. Schritt 3).

## 0. Smoke-Gate (bindend, vor jeder GPU-Arbeit)

```bash
ss -tln | grep 8326 || echo "Port 8326 frei"
tail -n 3 /tmp/bench-vllm-unsloth/grpo-server-smoke.log
# weiter erst bei GRPO_SERVER_SMOKE_OK im Log (oder belegtem Scheitern, s. Befund)
```

Befund 2026-10-09: GRPO-Smoke **gescheitert** (`RuntimeError: Engine core
initialization failed`, Port 8326 frei, GPU 1 frei / GPU 0 ca. 8 GB belegt).
Rest-Prozesse `grpo_vllm_server.py` ggf. aufraeumen, Smoke-Ursache separat
beheben — kein Studio-Modell laden, solange die GPU-Lage ungklaert ist.

## 1. Embedding-Befund (kein Umbau)

- `gpustack/bge-m3-GGUF` liegt im HF-Cache (`~/.cache/huggingface/hub/`).
- **Kein Reranker** im Cache (`bge-reranker-v2-m3` fehlt) — kein Ersatz fuer
  `bge_rerank`. Upstream bleibt das GPU-Backend ueber die Proxy-Kette.
- Studio-REST kennt Embedding-Pfade (`GET /api/models/check-embedding/{name}`,
  `GET /api/settings/embedding-model`, `POST /api/inference/embeddings`),
  aber alle `/api/*`-Routen verlangen Login (401 ohne Session). Ob Studio
  `/v1/embeddings` aus `bge-m3-GGUF` bedienen kann, ist offen — im UI unter
  Inference/Embedding-Modell pruefen und hier nachtragen.
- Faellt die Pruefung negativ aus: Befund stehen lassen, Upstream-Entscheidung
  vertagen (kein erzwungener Umbau in diesem Plan).

## 2. Qwen3.5-0.8B-Base laden (UI, nach Smoke-Gate)

1. Studio-UI `http://127.0.0.1:8888` oeffnen, einloggen.
2. Inference → Modell laden → `unsloth/Qwen3.5-0.8B` (Base, im Cache).
   GPU-Belegung beachten (waherend GRPO-Smoke oder anderer Last: warten).
3. Alternativ per REST (eingeloggt, Session-Cookie): `POST
   /api/inference/load` mit `model_path` aus `GET /models/list`
   (GGUF-Varianten laden via llama-server).
4. Verifizieren:
   ```bash
   # GET /api/inference/status → active_model enthaelt das Modell
   # Chat-Probe: POST /api/inference/chat/completions (Antwort mit Inhalt)
   ```
5. Erst danach gilt p3 als fertig. **Kein** Fine-Tune-Swap hier
   (fine-getuntes Modell existiert noch nicht; Swap ist Folgearbeit).

## 3. Spaeterer Backend-Swap (Pointer)

Backend-Wechsel greift an genau einer Weiche: den Rollen-Ketten des
llm-Proxys (`scripts/llm/loadouts.json`, Rollen `embed`/`rerank`, Pfade
`/v1/embeddings` und `/v1/rerank`). Alle Aufrufer (`LLM_EMBED_URL`,
`LLM_RERANKER_URL`, `LLM_EMBED_URLS`-Fan-out) zeigen seit T901560 auf den
Proxy (`:18235`) und folgen automatisch.
