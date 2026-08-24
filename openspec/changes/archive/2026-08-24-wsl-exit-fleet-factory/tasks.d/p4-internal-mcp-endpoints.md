# P4 — Interne MCP-Endpoints für das bge-Paar

```yaml
title: "P4 internal-mcp-endpoints"
ticket_id: T016422
domains: [infra]
status: active
target_files:
  - k3d/dev-stack/internal-mcp-ingress.yaml
  - k3d/configmap-domains.yaml
```

Ziel: bge-embed/-rerank sind ohne `kubectl port-forward` konsumierbar (Design D5).
Die bisherigen localhost-Tunnel (:8081/:8093) sterben mit WSL.

## Tasks

- [ ] **T4.1** In `k3d/configmap-domains.yaml` zwei interne Hostnamen ergänzen —
  Muster wie `DEV_BRETT_HOST`, bewusst OHNE Brand-Domains (S3):

      ```yaml
      DEV_BGE_EMBED_HOST: "bge-embed.internal"
      DEV_BGE_RERANK_HOST: "bge-rerank.internal"
      ```

- [ ] **T4.2** Neue Datei `k3d/dev-stack/internal-mcp-ingress.yaml`: zwei Traefik
  IngressRoutes in workspace-dev, die per Cross-Namespace-Service-Ref auf
  `namespace: workspace`, Services `llm-gateway-embed` / `llm-gateway-rerank`
  (Port 8081) zeigen. Host-Felder aus den ConfigMap-Vars von T4.1 referenzieren,
  nicht literal. TLS über den bestehenden Wildcard-Mechanismus des dev-stacks;
  wenn kein Cert für .internal existiert, Route ohne TLS + Kommentar (nur wg-mesh
  erreichbar, Operator-DNS trägt die Hosts).

- [ ] **T4.3** Kommentar am Dateikopf: Verbraucher sind die lokalen MCP-Server
  (bge-mcp) auf dem Windows-Arbeitsplatz; Erreichbarkeit nur aus dem wg-mesh.

## Verify

```bash
grep -c 'internal' k3d/configmap-domains.yaml          # expect >= 2
grep -c 'namespace: workspace' k3d/dev-stack/internal-mcp-ingress.yaml  # expect 2
task workspace:validate
```
