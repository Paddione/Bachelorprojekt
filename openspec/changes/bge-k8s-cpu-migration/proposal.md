# Proposal: bge-K8s-CPU-Migration

## Motivation

Seit T002538 (2026-08-02) laufen alle vier bge-Server CPU-only in WSL auf dem GPU-Host
(`CUDA_VISIBLE_DEVICES=''`, `-ngl 0`). Die GPU ist frei für Gemma-4-12B — aber der Host-SPOF
bleibt: stirbt die Windows-Box, sind ALLE vier bge-Server tot.

## Ziel

bge-m3 (Embedding) und bge-reranker-v2-m3 (Reranking) als Kubernetes-Deployments auf den
Hetzner-CPU-Nodes betreiben:

- **Embedding** — bge-m3-Q8_0.gguf (635 MB, ~0.6 GB RAM runtime)
- **Reranking** — bge-reranker-v2-m3-Q8_0.gguf (636 MB, ~0.6 GB RAM runtime)

Die bestehenden Service-Namen (`llm-gateway-embed`, `llm-gateway-rerank`) bleiben erhalten,
wechseln aber von ExternalName auf ClusterIP. Das Batch-Paar (8085/8086) entfällt ersatzlos —
der bge-router wird auf Single-Pool vereinfacht.

## Design-Entscheidungen

1. **Getrennte Deployments** (embed + rerank), je 1 Replica, mit PVC für Modelle
2. **ClusterIP-Services** behalten die bestehenden DNS-Namen
3. **Batch-Paar entfällt** — `bge-router.ts` vereinfachen (nur noch ein Pool)
4. **K8s-Readiness** statt eigenem Health-Polling im bge-router
5. **Ressourcen-Check** mit Metrics-API vor dem Deployment

## Impact

| Bereich | Änderung |
|---------|----------|
| `k3d/llm-gpu.yaml` | bge-ExternalName-Endpoints entfernen, Deployments+Services ergänzen |
| `website/src/lib/bge-router.ts` | Dual-Pair-Logik → Single-Pool (nur interactive) |
| `environments/*.yaml` | Batch-URLs entfernen, Gateway-URLs prüfen |
| `environments/schema.yaml` | Batch-URL-Schema-Einträge entfernen |
| `scripts/llm/loadouts.json` | bge-Loadouts entfernen (jetzt K8s-verwaltet) |
| `scripts/bge-mcp/` | Environment-Konfiguration prüfen |
