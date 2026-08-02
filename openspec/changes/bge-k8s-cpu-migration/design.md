# Design: bge-K8s-CPU-Migration

## Architektur-Übersicht

```
Vorher (T002538):
  Hetzner K8s ═══ WireGuard ═══ Windows/WSL Host
  llm-gateway-embed ──────────► :8095 (llama.cpp, CPU)
  llm-gateway-rerank ─────────► :8096 (llama.cpp, CPU)
  llm-gateway-embed-batch ────► :8085 (llama.cpp, CPU)
  llm-gateway-rerank-batch ───► :8086 (llama.cpp, CPU)

Nachher:
  Hetzner K8s
  ├── bge-embed Deployment ──► llm-gateway-embed (ClusterIP)
  └── bge-rerank Deployment ─► llm-gateway-rerank (ClusterIP)
  
  llm-gateway-embed-batch ──── ENTFÄLLT
  llm-gateway-rerank-batch ─── ENTFÄLLT
```

## Deployment-Spezifikation

### bge-embed

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bge-embed
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: llama-cpp
        image: ghcr.io/ggml-org/llama.cpp:server-cuda13  # oder cpu-only image
        args:
          - "-m", "/models/bge-m3-Q8_0.gguf"
          - "--host", "0.0.0.0"
          - "--port", "8080"
          - "-ngl", "0"
          - "-b", "8192"
          - "-ub", "8192"
          - "-np", "4"
          - "--embeddings"
        env:
          - name: CUDA_VISIBLE_DEVICES
            value: ""
        ports:
          - containerPort: 8080
        resources:
          requests:
            memory: "1Gi"
            cpu: "1000m"
          limits:
            memory: "2Gi"
            cpu: "2000m"
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
          initialDelaySeconds: 30
        volumeMounts:
          - name: models
            mountPath: /models
      volumes:
        - name: models
          persistentVolumeClaim:
            claimName: bge-models
```

### bge-rerank

Analog zu bge-embed, mit `bge-reranker-v2-m3-Q8_0.gguf` und `--reranking` statt `--embeddings`.

### PVC

```yaml
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: bge-models
spec:
  accessModes: [ReadOnlyMany]
  resources:
    requests:
      storage: 2Gi
```

Model-Dateien werden einmalig per initContainer oder manuell in das Volume kopiert.

### Services

```yaml
# llm-gateway-embed: ExternalName → ClusterIP
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-embed
spec:
  selector:
    app: bge-embed
  ports:
    - port: 8081
      targetPort: 8080

# llm-gateway-rerank: ExternalName → ClusterIP
apiVersion: v1
kind: Service
metadata:
  name: llm-gateway-rerank
spec:
  selector:
    app: bge-rerank
  ports:
    - port: 8081
      targetPort: 8080
```

Die Service-Ports bleiben auf 8081 (bestehender Vertrag), targetPort ist der Container-Port.

## bge-router.ts — Vereinfachung

Aktuell: Dual-Pair-Routing (interactive + batch) mit bidirektionalem Failover.
Neu: Single-Pool — nur noch `resolveEndpoint('embed')` / `resolveEndpoint('rerank')`.

```typescript
// Vorher: resolvePair(pair, kind) → { embedUrl, rerankUrl }
// Nachher: resolveEndpoint(kind) → string
export function resolveEndpoint(kind: 'embed' | 'rerank'): string {
  const url = kind === 'embed'
    ? process.env.LLM_EMBED_URL
    : process.env.LLM_RERANKER_URL;
  if (!url) throw new Error(`LLM_${kind.toUpperCase()}_URL not set`);
  return url;
}
```

Health-Check und Overload-Detection entfallen — K8s-Readiness übernimmt das.

## Environment-Variablen

Zu **entfernen:**
- `LLM_EMBED_BATCH_URL`
- `LLM_RERANKER_BATCH_URL`
- `LLM_BGE_LATENCY_BUDGET_MS`
- `LLM_BGE_QUEUE_LIMIT`

Zu **behalten:**
- `LLM_EMBED_URL` → `http://llm-gateway-embed.workspace.svc.cluster.local:8081`
- `LLM_RERANKER_URL` → `http://llm-gateway-rerank.workspace.svc.cluster.local:8081`

## Risiken

1. **CPU-Performance:** 21 chunks/s vs 167 auf GPU — für interaktive Nutzung akzeptabel, Batch-Reindex wird langsamer
2. **Node-Ressourcen:** ~2 GB RAM + 2 CPU cores zusätzlich auf bereits belegten Nodes
3. **PVC-Provisioning:** ReadOnlyMany erfordert passenden StorageClass (NFS, Longhorn o.Ä.)
4. **llama.cpp Container-Image:** Server-Image ohne GPU-Abhängigkeit wählen
