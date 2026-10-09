# p3 — Studio-Aktivierung post-Smoke (gated)

`target_files`: `docs/runbooks/studio-embed-aktivierung.md`

**Smoke-Gate (bindend, nicht überspringen):** Erst beginnen, wenn der
GRPO-Smoke beendet ist:

```bash
ss -tln | grep 8326 || echo "Port 8326 frei"
tail -n 3 /tmp/bench-vllm-unsloth/grpo-server-smoke.log
# erwartet: GRPO_SERVER_SMOKE_OK (oder Prozess tot + Log-Ende)
```

Läuft der Smoke noch (Prozess `grpo_vllm_server.py` aktiv), **sofort
abbrechen und später wiederkommen** — GPU 0 ist belegt, Studio-Ladung
jetzt riskiert OOM und verfälscht den Smoke (User-Entscheidung
warten-dann-aktivieren).

## 1. Embedding-Prüfung (nur Befund, kein Umbau)

- `gpustack/bge-m3-GGUF` liegt im HF-Cache — prüfen, ob Studio es als
  Inference-Modell laden und `/v1/embeddings` bedienen kann (Studio-UI
  `127.0.0.1:8888`, kein MCP-Werkzeug für Inference-Load vorhanden).
- Reranker fehlt im Cache: **kein Ersatz für `bge_rerank`** — Befund im
  Runbook festhalten (Upstream bleibt GPU-Backend über Proxy-Kette).
- Falls Studio kein Embedding servieren kann: Befund dokumentieren,
  Upstream-Entscheidung vertagen (kein erzwungener Umbau in diesem Plan).

## 2. Qwen3.5-0.8B-Base laden

Base-Modell (`unsloth/Qwen3.5-0.8B`, im Cache) in Studio-Inference laden
(UI, GPU-Belegung beachten — Studio-GPU war idle 0,02 GB). Verifizieren:

```bash
# Studio-Status via MCP: inference.loaded enthaelt das Modell
# + eine Chat-Probe über die Studio-/llama.cpp-Schnittstelle
```

Erst danach gilt p3 als fertig — **kein** Fine-Tune-Swap in diesem Plan
(fine-getuntes Modell existiert noch nicht; Swap ist Folgearbeit).

## 3. Runbook schreiben

`docs/runbooks/studio-embed-aktivierung.md`: kurz — Smoke-Gate-Befehl,
Ladeschritte (UI-Pfade), Verify-Befehle, Befund Embedding-Fähigkeit,
Pointer für späteren Backend-Swap (Proxy-Kette als einzige Weiche).
