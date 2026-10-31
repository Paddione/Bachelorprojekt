---
title: k1-embed CronJob auf embeddinggemma-300m ziehen
domains: [infra]
status: staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---
# k1-embed-model — Implementation Plan

## File Structure

| Datei | Aenderung |
|---|---|
| `dev-local/components/k1-embed/k1-embed-cronjob.yaml` | LLM_EMBED_MODEL von bge-m3 auf embeddinggemma-300m nach SSOT dense-embedding.mjs setzen |
| `tests/py/spec/devmesh/test_devmesh_dev_tools.py` | RED-Test: CronJob-Modell muss DENSE_MODEL entsprechen, belegt [#7006] |

## Entscheidungen

Beleg: Job `k1-embed-29890877` FATAL weil CronJob `bge-m3` setzt, SSOT `DENSE_MODEL` aber `embeddinggemma-300m` ist. URL bleibt Proxy `llm-services:18235`, der `embed` auf Gemma routet. Ursache vor Loesung verifiziert per Log und `resolveEmbedConfig`.

## Task 1: Rendering-Vertrag rot bestaetigen

- [ ] Test um Modell-Assertion erweitern.
- [ ] `python3 -m pytest tests/py/spec/devmesh/test_devmesh_dev_tools.py::test_k1_embed_cronjob -q` gegen das unveraenderte Manifest ausfuehren: expected: FAIL mit bge-m3 gegen embeddinggemma-300m.

## Task 2: Manifest korrigieren

- [ ] `LLM_EMBED_MODEL` auf `embeddinggemma-300m` setzen.
- [ ] `bash scripts/devmesh/render-stack.sh core` rendern und CronJob-Env pruefen.

## Task 3: Finale Verifikation

- [ ] Gezielten pytest-Test erneut ausfuehren: expected: PASS.
- [ ] `task workspace:validate` ausfuehren.
- [ ] `task test:changed; task freshness:regenerate; task freshness:check` ausfuehren, generierte Artefakte gezielt committen.
