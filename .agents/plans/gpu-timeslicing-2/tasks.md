---
title: MPS zurueck auf timeSlicing fuer 3060 Ti
domains: [infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# gpu-timeslicing-2 — Implementation Plan

## File Structure

| Datei | Aenderung |
|---|---|
| `dev-local/gpu/nvidia-plugin-configs.yaml` | Sharing von MPS replicas 2 zurueck auf timeSlicing replicas 2, live belegt |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py` | Rendering-Vertrag auf timeSlicing 2 statt MPS korrigieren |

## Entscheidungen

Live-Beleg: MPS startet nicht, Plugin verlangt --mps-root und scheitert danach am MPS-Daemon-Healthcheck. timeSlicing replicas 2 laeuft, Node meldet 2/2, qwen und sandbox belegt, beide Embeds auf iGPU Vulkan belegt funktionierend. Kein DaemonSet-Flag noetig.

## Task 1: Rendering-Vertrag rot bestaetigen

- [ ] Test auf timeSlicing statt MPS umstellen.
- [ ] `python3 -m pytest tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py -q` gegen die unveraenderten Manifeste ausfuehren: expected: FAIL fuer neue timeSlicing-Assertions.

## Task 2: Manifeste korrigieren

- [ ] `dev-local/gpu/nvidia-plugin-configs.yaml` auf timeSlicing replicas 2 setzen.
- [ ] `kubectl kustomize dev-local/gpu` rendern.

## Task 3: Finale Verifikation

- [ ] Gezielten pytest-Test erneut ausfuehren: expected: PASS.
- [ ] `task workspace:validate` ausfuehren.
- [ ] `task test:changed; task freshness:regenerate; task freshness:check` ausfuehren, generierte Artefakte gezielt committen.
