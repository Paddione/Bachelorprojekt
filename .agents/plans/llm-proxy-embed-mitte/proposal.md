# Proposal: llm-proxy als Mitte für Embed/Rerank, bge-mcp als Fassade

Ticket: T901560 · Stand: 2026-10-09 · Basis: `origin/main@38da1960a`

## Ausgangslage (Fakten, verifiziert 2026-10-09)

- `bge-mcp` ist **nicht entfernt**: SSOT `agent-resources/mcp-servers.json`
  (dotfiles) führt es für `codex/claude/gemini/qwen`; `opencode` schließt es per
  Design aus (zentrales Manifest, 9 Server). Laufzeit aktuell **down**:
  `devmesh-forward.service` (Forward `devmesh svc/llm-services :3007 → :13005`)
  im Restart-Loop (exit 1), `:13005` antwortet nicht.
- Zwei Pfade zu denselben GPU-Backends existieren parallel:
  1. **MCP-Pfad**: `:13005/mcp` (`bge_embed`/`bge_rerank`,
     `scripts/bge-mcp/server.mjs:74-103`) → löst Upstream über
     `LLM_EMBED_URL`/`LLM_RERANKER_URL`
     (`components/website/src/lib/bge-router.ts:40-50`).
  2. **Direkt-Pfad**: `POST $LLM_EMBED_URL/v1/embeddings` in
     `scripts/knowledge/lib-knowledge-pg.mjs:97-123`,
     `scripts/knowledge/lib-context-retrieve.mjs:127-130`,
     `scripts/mcp/cbm-embed-sync.py:502-506` (mit `LLM_EMBED_URLS`-Fan-out),
     `scripts/mcp/cbm-hybrid.py:306`, `scripts/index-repo.ts:80-87`,
     `scripts/p0min-embed-run.py:26`,
     `scripts/knowledge/kalibrierung-retrieval.mjs:38-39`.
- In-Cluster zeigen `environments/*.yaml` direkt auf
  `llm-gateway-embed`/`llm-gateway-rerank …:8081` — am Proxy vorbei.
- Der Proxy **kann die Mitte bereits**: Rollen-Failover pro Pfad
  (`/v1/embeddings`→embed, `/v1/rerank`→rerank), anfragegetrieben statt
  Health-getrieben (`scripts/llm-proxy/bge-routes.mjs:199-226`).
- Unsloth Studio: idle (`inference.loaded=[]`, `training.phase=idle`, 0 Runs);
  im HF-Cache liegt `gpustack/bge-m3-GGUF`, **kein Reranker**; Studio-MCP kennt
  kein Inference-Load (nur `studio_load_checkpoint` für Export). Studio ist
  komplementär (Training/generative Inference), kein Ersatz für den Shim.
- GRPO-Smoke (`unsloth/Qwen3.5-0.8B`, `:8326`) läuft seit 04:58 — GPU-Arbeit
  erst nach dessen Ende (User-Entscheidung: warten-dann-aktivieren).

## Entscheidungen (Brainstorming 2026-10-09, User bestätigt)

1. **Konsolidierungsziel = llm-proxy `:18235`** (nicht bge-mcp `:13005`).
   Alle `LLM_EMBED_URL`/`LLM_RERANKER_URL` zeigen auf den Proxy; dessen
   Rollen-Ketten (Registry/`loadouts.json`) werden die einzige
   Backend-Weiche. Ein späterer Backend-Wechsel (z. B. Unsloth-Embedding)
   greift damit für beide Pfade gleichzeitig.
2. **bge-mcp bleibt dünne MCP-Fassade** über demselben Proxy (Upstream des
   Shims ebenfalls auf den Proxy). Keine Caller-Migration auf MCP-Tools:
   Bulk-Fan-out (`LLM_EMBED_URLS`) und Durchsatz bleiben erhalten;
   Python-Caller brauchen keinen MCP-Client; 8-MB-MCP-Payload-Cap greift
   nicht für Bulk-Indexing.
3. **Reihenfolge**: erst Gateway gesund (`:13005` + `:18235`), dann
   URL-Umstellung, dann Studio-Aktivierung post-Smoke.

## Verworfene Optionen

- **Alles über bge-mcp (`:13005`)**: Extra-Hop (MCP-JSON-RPC um plain HTTP),
  serieller Durchsatz, MCP-Client-Pflicht in Python, kein eigenes Failover
  im Shim (`server.mjs:25-32`). Verworfen.
- **bge-mcp entfernen, nur Unsloth-Embedding**: kein Reranker im Cache, kein
  MCP-Werkzeug, kein `/v1/*`-Vertrag, keine Auth/fail-closed-Grenze; alle
  Aufrufer müssten umgeschrieben werden. Verworfen.
- **Nichts tun**: Split-Brain-Verkabelung bleibt; jeder Backend-Wechsel müsste
  N Stellen anfassen. Verworfen.

## Prior-Art

- `docs/adr/ADR-008-local-k3s-dev-mesh.md:144-159` (Nachtrag T900191):
  llm-proxy, bge-mcp, mcp-postgres ziehen nach devmesh (`llm-services`,
  einziger Ort mit Tailnet-Pfad zu den Windows-GPU-Backends).
- `docs/adr/ADR-007-wsl-exit-fleet-native.md:56-85` (Nachtrag T900107):
  Routing-Schicht als Container gegen Remote-Backends; lokale Loadouts
  entfallen (`bge-routes.mjs:62-72` wirft bei `loadout:`-Einträgen).
- `docs/agent-guide/registry/mcp.yaml:146-199,420-431`: bge-mcp-Eintrag +
  `llm-services`-Bundle (`bge-mcp :3007 → :13005`).
- Guards: `scripts/llm-proxy/bge-routes.test.mjs` (Failover-Semantik),
  `tests/spec/devflow-mcp/fixtures/fake-bge.mjs` (devflow-Tests ohne Cluster).
