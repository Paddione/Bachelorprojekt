# Laptop-bge-Betrieb (PK-L-1 + PK-Tablet)

Runbook zum Design-Doc `openspec/changes/2026-08-15-laptop-bge-topologie/design.md` (T006143).

## Rollen

| Gerät | bge-Rolle | Weg | Unterstützermodell |
|---|---|---|---|
| PK-L-1 | Embedding (bge-m3 Q8_0) | LM Studio (Vulkan) via LM Link → WSL :1234 | Qwen3.5-4B Q6_K |
| PK-Tablet | Rerank (bge-reranker-v2-m3 Q8_0) | llama-server.exe (Vulkan) via WG :8080 | Gemma-4-12B UD-IQ3_XXS |

## Einrichtung PK-Tablet

1. WireGuard: `winget install WireGuard.WireGuard`; Config `pk-tablet.conf` aus dem
   Mesh-Generator importieren (in WSL erzeugen:
   `bash scripts/hetzner/generate-wg-conf.sh --env mentolder --node-name pk-tablet --private-key <PRIV>`),
   Tunnel aktivieren.
2. LM Studio installieren, per LM Link anbinden (Einstellungen → LM Link, Code vom Desktop-WSL übernehmen).
3. Hardware-Settings: Vulkan/iGPU **explizit aktivieren** (seit 0.4.17 default-aus).
4. Modelle laden: bge-reranker-v2-m3 (GGUF Q8_0), Gemma-4-12B (UD-IQ3_XXS).
5. llama-server: `winget install llama.cpp`, dann
   `powershell -ExecutionPolicy Bypass -File scripts/llm/start-tablet-rerank.ps1` (Pfad aufs Gerät kopiert).
6. Scheduled Task registrieren (Befehl im Kopf von `start-tablet-rerank.ps1`).
7. Firewall-Regel fürs WG-Interface (Befehl ebenda).

## Einrichtung PK-L-1

1. WireGuard wie oben, Config `pk-l-1.conf` (`.11`).
2. Hardware-Settings: Vulkan/iGPU explizit aktivieren.
3. Modelle laden: bge-m3 (GGUF Q8_0), Qwen3.5-4B (Q6_K). bge-m3 hier **geladen halten**
   (Autoload-Timer auf dem Desktop-WSL sorgt dafür, dass der Load nach TTL-Ablauf wiederholt wird).

## Verifikation (von WSL)

```bash
# WG-Erreichbarkeit des Tablet-Rerankers
curl -s -m 10 http://192.168.100.12:8080/health
# Rerank-Smoke (Vertrag: {model, query, documents} -> {results:[{index, relevance_score}]})
curl -s -m 15 http://192.168.100.12:8080/v1/rerank \
  -H 'content-type: application/json' \
  -d '{"model":"bge-reranker-v2-m3","query":"test","documents":["alpha","beta"]}'
# Embed-Smoke ueber LM Studio (PK-L-1)
curl -s -m 15 http://127.0.0.1:1234/v1/embeddings \
  -H 'content-type: application/json' \
  -d '{"model":"text-embedding-bge-m3","input":"test"}'
```

## Störungsbilder

- Tablet offline/schlafend → Kette fällt still auf Cluster (:8093); sichtbar über den
  Header `x-llm-proxy-bge-upstream` der Proxy-Antwort.
- LM Studio/PK-L-1 weg → embed fällt auf Cluster (:8081).
- Beide weg + Cluster weg → rerank startet `bge-rerank-cpu` on-demand auf dem Desktop.
