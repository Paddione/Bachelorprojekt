# K2 Survey Results: bge Embedding/Reranker Infrastructure

## Callers

## Endpoint Configs
52:  # abgeschaltet (T002102, unified llm-proxy).
366:    description: "Mesh IP of the GPU host (Windows) running llama.cpp (chat) and Ollama. Required when LLM_ENABLED=true. bge-Embedding/Reranking laufen seit T002551 in-Cluster (k3d/llm-gpu.yaml) und verwenden diese Variable nicht mehr. The dev env sets this explicitly in environments/dev.yaml."
371:    description: "If true, bge-m3 embeddings go to llm-gateway-embed (llama.cpp, port 8081) and rerank goes to llm-gateway-rerank (llama.cpp, port 8081). If false, embeddings.ts calls Voyage directly."
374:  - name: LLM_RERANK_ENABLED
377:    description: "If true, knowledge query path reranks results via LLM_RERANKER_URL (llama.cpp bge-reranker-v2-m3 on port 8081)."
380:  - name: LLM_RERANKER_URL
383:    description: "Base URL of the llama.cpp reranker service (used when LLM_RERANK_ENABLED=true)."
385:  # LLM_LMSTUDIO_URL removed — LM Studio abgeschaltet.
386:  # LLM_CHAT_MODEL removed — kein Consumer; LM Studio abgeschaltet.
387:  # LLM_CODING_MODEL removed — kein Consumer; LM Studio abgeschaltet.
389:  - name: LLM_EMBED_MODEL
391:    default_dev: "bge-m3"
392:    description: "Model ID for llama.cpp embedding server (bge-m3). llama-server ignoriert das Feld im Single-Model-Betrieb; Dokumentationswert."
394:  # LLM_EMBED_MODEL_NOMIC removed — kein Consumer; nomic-embed-text-v1.5 hat kein GGUF im Bestand.
418:  - name: LLM_EMBED_URL
421:    description: "Cluster-internal URL for embeddings — llama.cpp bge-m3 server port 8081 (via /v1/embeddings)."
423:  # T002551 — Batch-Paar (LLM_EMBED_BATCH_URL, LLM_RERANKER_BATCH_URL,
424:  # LLM_BGE_LATENCY_BUDGET_MS, LLM_BGE_QUEUE_LIMIT) entfernt: die bge-Server
1171:    description: "HuggingFace API token for authenticated model downloads (ComfyUI, bge-m3 via TEI, Hunyuan3D). Get from https://huggingface.co/settings/tokens."

## Silent Failure Paths
9:const degrade = (docs: string[]): RerankResult[] => docs.map(doc => ({ doc, score: 0 }));
13: * liefern konnte — der Aufrufer degradiert dann auf `score: 0`.
33:  } catch (err) {
41: * T002426: bei Ausfall des Rerankers degradiert diese Funktion auf `score: 0`.
44: * auf `score: 0` zurueck — ein toter Reranker blieb dadurch wochenlang
62:    logger.warn({ docs: docs.length }, '[rerank] disabled via LLM_RERANK_ENABLED — returning score:0');
69:  } catch (err) {
71:      '[rerank] no endpoint configured — returning score:0');
78:  logger.warn({ docs: docs.length }, '[rerank] endpoint failed — returning score:0');

## Host SPOF
- Both GPU servers (8095/8096) on same Windows host (k3d-dev)
- CPU batch pair (8085/8086) planned but not yet built (T002426)
