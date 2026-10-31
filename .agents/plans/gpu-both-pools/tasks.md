---
title: NVIDIA MPS plus Intel iGPU fuer beide Pools nutzen
domains: [infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# gpu-both-pools — Implementation Plan

## File Structure

| Datei | Aenderung |
|---|---|
| `dev-local/gpu/nvidia-plugin-configs.yaml` | Sharing von timeSlicing replicas 4 auf MPS replicas 2 fuer 3060 Ti mit qwen und sandbox |
| `k3d/llm-retrieval-gpu.yaml` | lfm-embed von server-cuda mit nvidia.com/gpu auf server-vulkan mit gpu.intel.com/i915 und nodeSelector intel-igpu |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py` | Rendering-Vertrag fuer MPS und Vulkan-iGPU erweitern |

## Entscheidungen

Bestaetigt: 3060 Ti 8 GiB mit Treiber 580.178.04 und CUDA 13.0, eine Karte wird per timeSlicing als 4 gemeldet. Vier Verbraucher teilen sich 3847 MiB ohne VRAM-Isolation. Ziel: zwei NVIDIA-Verbraucher mit MPS, zwei 350M-Embeds auf Intel iGPU per Vulkan nach dem Muster von gemma-embed-igpu. qwen35-4b und sandbox-gpu bleiben unveraendert auf gpu-metal. vllm-serve bleibt skaliert auf 0.

## Task 1: Rendering-Vertrag rot bestaetigen

- [ ] Test um MPS replicas 2, Vulkan-Image mit Digest, Intel-Ressource und nodeSelector erweitern.
- [ ] `python3 -m pytest tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py -q` gegen die unveraenderten Manifeste ausfuehren: expected: FAIL fuer neue MPS- und Vulkan-Assertions.

## Task 2: Manifeste umstellen

- [ ] `dev-local/gpu/nvidia-plugin-configs.yaml` auf MPS mit replicas 2 setzen.
- [ ] `k3d/llm-retrieval-gpu.yaml` lfm-embed auf server-vulkan Digest, Intel-Limits und nodeSelector intel-igpu setzen, CUDA-Flags und NVIDIA-Anforderung entfernen.
- [ ] `kubectl kustomize k3d` und `kubectl kustomize dev-local/gpu` rendern.

## Task 3: Finale Verifikation

- [ ] Gezielten pytest-Test erneut ausfuehren: expected: PASS.
- [ ] `task workspace:validate` ausfuehren.
- [ ] `task test:changed; task freshness:regenerate; task freshness:check` ausfuehren, generierte Artefakte gezielt committen.
