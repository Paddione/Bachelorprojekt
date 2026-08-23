## ADDED Requirements

### Requirement: LLM-GPU-Deployments laufen als Non-Root

Die Deployments in `k3d/llm-gpu.yaml` (bge-embed, bge-rerank) MÜSSEN auf Pod-Ebene
`runAsNonRoot: true` setzen. Das bestehende `fsGroup: 101` (PVC-Gruppenzugriff für die
Modelldateien) bleibt unverändert — Kubernetes fügt es jedem Container als Supplemental
Group hinzu, sodass der llama.cpp-Server als non-root-UID weiterhin lesend auf `/models`
zugreifen kann. Die Init-Container laufen bereits als uid 100 (curl_user) und bleiben
unverändert.

#### Scenario: llm-gpu-Manifest deklariert Non-Root

- **GIVEN** das Deployment-Manifest `k3d/llm-gpu.yaml`
- **WHEN** der Pod-Spec eines Deployments (bge-embed oder bge-rerank) geprüft wird
- **THEN** enthält er `securityContext.runAsNonRoot: true`
- **AND** das bestehende `securityContext.fsGroup: 101` ist erhalten
