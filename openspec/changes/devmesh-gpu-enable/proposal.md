# Proposal: devmesh-gpu-enable

## Why

Der devmesh-Cluster kann die einzige lokale GPU nicht benutzen. `gpu-metal` traegt eine
GTX 970 mit 4 GB und einen funktionierenden Treiber (580.173.02), aber der Node bietet
keine `nvidia.com/gpu`-Ressource an: das nvidia-container-toolkit ist nicht installiert
und es laeuft kein Device Plugin. Jeder GPU-Workload waere damit nicht schedulebar.

Die bisherige Architektur umgeht das: `dev-local/core/gpu-endpoint.yaml` fuehrt GPU-Inferenz
ueber einen selector-losen Service auf `gpu_endpoint` aus `devmesh/inventory.yaml`, also auf
`pk-desktop:1234` ausserhalb des Clusters (ADR-008, Nachtrag 1). Dieser Pfad ist
unbenutzbar, solange der Dienst auf dem Arbeitsplatz nicht laeuft, und er macht den
Cluster von einem Windows-Host abhaengig.

ADR-008 haelt fest, die GTX 970 sei "fuer LLM zu klein". Das trifft auf generative Modelle
zu, nicht auf Embeddings: `bge-m3-Q8_0.gguf` ist 634 MB und passt mit Reserve in 4096 MiB.
Damit wird die Karte zur tragfaehigen Quelle fuer den Embedding-Pfad — vorausgesetzt, der
Cluster kann sie ueberhaupt anbieten. Genau das stellt dieser Change her.

## What

- `scripts/devmesh/gpu-enable.sh` installiert das nvidia-container-toolkit auf einem
  devmesh-Host, konfiguriert die containerd-Runtime und startet k3s neu. Idempotent.
- `dev-local/gpu/` stellt das NVIDIA-Device-Plugin als eigenstaendiges Kustomize-Target
  bereit, per `kubectl apply -k` anwendbar.
- Das Node-Label `gpu=true` markiert Hosts mit GPU; das DaemonSet selektiert darauf.
- `scripts/devmesh/status.sh` weist die GPU-Kapazitaet aus.
- Ein BATS-Guard sichert das Skriptverhalten (Idempotenz, Abbruchpfade) offline ab.

Nicht enthalten: GPU-Operator, Node-Feature-Discovery, MIG/Time-Slicing, Monitoring,
das Ausrollen von `dev-local/core` und jedes BGE-Deployment.

_Ticket: T900179_
