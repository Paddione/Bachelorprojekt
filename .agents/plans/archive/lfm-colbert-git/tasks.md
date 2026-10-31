---
title: lfm-colbert iGPU-Manifest ins Git holen
domains: [infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# lfm-colbert-git — Implementation Plan

## File Structure

| Datei | Aenderung |
|---|---|
| `k3d/llm-retrieval-gpu.yaml` | lfm-colbert PVC, Deployment Vulkan iGPU und Service llm-gateway-lfm-colbert nach Muster lfm-embed ergaenzen |
| `tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py` | Rendering-Vertrag auf lfm-colbert iGPU erweitern |

## Entscheidungen

Live-Beleg 2026-10-31: lfm-colbert laeuft auf gpu-cluster iGPU Vulkan, colbert-maxsim Rerank antwortet korrekt. Git kennt nur lfm-embed. Manifest uebernimmt Live-Stand mit Vulkan-Digest, i915-Limits und nodeSelector, eigener RWO-PVC und eigenem Service auf 8081.

## Task 1: Rendering-Vertrag rot bestaetigen

- [ ] Test um lfm-colbert Assertions erweitern.
- [ ] `python3 -m pytest tests/py/spec/native_ported/spec/llm-pipeline/test_lfm_retrieval_gpu.py -q` gegen die unveraenderten Manifeste ausfuehren: expected: FAIL fuer neue lfm-colbert-Assertions.

## Task 2: Manifest ergaenzen

- [ ] `k3d/llm-retrieval-gpu.yaml` um lfm-colbert PVC, Deployment und Service erweitern.
- [ ] `kubectl kustomize k3d` rendern.

## Task 3: Finale Verifikation

- [ ] Gezielten pytest-Test erneut ausfuehren: expected: PASS.
- [ ] `task workspace:validate` ausfuehren.
- [ ] `task test:changed; task freshness:regenerate; task freshness:check` ausfuehren, generierte Artefakte gezielt committen.
