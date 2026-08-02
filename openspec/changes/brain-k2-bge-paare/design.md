# Design: K2 bge-Paare Visualisierung

## Erhebungsplan

### 1. Aufrufer-Survey

```bash
# Alle Referenzen auf die bge-Endpunkte finden
rg -r '$1' '8095|8096|bge-m3|bge-rerank|embeddings\.ts|rerank\.ts' --type-add 'code:*.{ts,js,svelte,astro,yaml,yml,sh}' -t code -l
```

Erwartete Fundstellen:
- `website/src/lib/embeddings.ts` → `callRouter()` → :8095 (embed)
- `website/src/lib/rerank.ts` → :8096 (rerank)
- `k3d/llm-gpu.yaml` → Gateway-Service-Definitionen
- `environments/*.yaml` → Endpunkt-Adressen
- Weitere: scripts/, tests/, MCP-Konfigurationen

### 2. Vektorraum-Zuordnung

| Endpunkt | Vektorraum | Dimension | Pooling |
|----------|-----------|-----------|---------|
| bge-m3 (:8095) | BGE-M3 | 1024 | CLS |
| bge-reranker (:8096) | BGE-Reranker-v2-m3 | — (Cross-Encoder) | — |

### 3. Silent-Failure-Analyse

Pro Aufrufer prüfen:
- Wird ein Fehler geloggt? (`console.error`, `logger.error`)
- Gibt es einen Fallback-Wert? (score:0, leerer Vektor)
- Löst der Fallback einen Alarm aus? (Health-Check, Metrik)

### 4. Diagramm-Format

Mermaid oder ASCII-Diagramm, eingebettet in `docs/brain/k2-bge-paare.md`:

```
┌──────────────────────────────────────────────────────┐
│                   IST (GPU)                           │
│  ┌──────────┐  llama.cpp  ┌───────────────────────┐  │
│  │ :8095    │◄───────────►│ llm-gateway-embed      │  │
│  │ bge-m3   │             └───────────┬───────────┘  │
│  └──────────┘                         │              │
│                                       │ HTTP/SSE     │
│  ┌──────────┐  llama.cpp  ┌───────────┴───────────┐  │
│  │ :8096    │◄───────────►│ llm-gateway-rerank     │  │
│  │ reranker │             └───────────┬───────────┘  │
│  └──────────┘                         │              │
│                                       │              │
│                   SOLL (CPU, T002426)  │              │
│  ┌──────────┐  ·········  ┌───────────┴───────────┐  │
│  │ :8085    │············►│ mcp-shim (batch)       │  │
│  │ bge-cpu  │             └───────────────────────┘  │
│  └──────────┘                                        │
│  ┌──────────┐  ·········                             │
│  │ :8086    │············  (gestrichelt = Soll)      │
│  │ rerank-cpu│                                        │
│  └──────────┘                                        │
│                                                      │
│  ⚠ SPOF: Beide GPU-Server auf einem Windows-Host     │
└──────────────────────────────────────────────────────┘
```

## Abgrenzung

- Kein Code — reine Dokumentation
- Visualisierung in `docs/brain/k2-bge-paare.md`
- Silent-Failure-Liste als separates Dokument oder Abschnitt
