# EmbeddingGemma: CPU und Intel-Vulkan auf devmesh

`dev-local/core` aktiviert einen CPU- und einen HD-530-Worker hinter
`llm-gateway-gemma-embed:8081`. Die gemeinsame `k3d`-Basis parkt den Intel-Pool
bei null Replikaten und behaelt das bisherige CPU-Profil. Fleet wird nicht
auf lokale Hostnamen festgelegt. Gewichte, Alias und 768 Dimensionen bleiben
unveraendert; dieser Rollout erfordert keinen neuen Vektorindex.

## Voraussetzungen und Speicher

Das Intel-Device-Plugin muss auf `gpu-cluster2` mindestens einen freien
`gpu.intel.com/i915`-Slot anbieten. Beide Worker sind dort fest platziert,
weil `gemma-embed-models` ReadWriteOnce ist. Der CPU-Initcontainer verwaltet
weiter den Download; der Intel-Worker liest dieselbe Datei nur lesend.
Bei einer Neuinstallation kann er bis zum abgeschlossenen Download neu starten.

Vulkan verwendet UID/GID 10001, Device-Plugin statt HostPath und einen
beschreibbaren Shader-Cache unter `/tmp`. Im geprueften Runtime-Setup werden
Geraeterechte der UID/GID zugewiesen; zusaetzliche Host-Render-Gruppen waren
nicht erforderlich. Bei einer Runtime-Aenderung erneut pruefen.

Je Worker: 1 GiB RAM-Request, 2 GiB Limit, zwei CPU-Threads, ein Slot und
2048 Token Kontext inklusive Prompt. Der Intel-Worker fordert einen GPU-Slot
und 250m CPU an; der CPU-Worker behaelt seinen 1000m-Request. Ein GPU-Slot
reserviert keinen separaten VRAM-Bereich: CPU und HD 530 teilen Host-RAM.
Gemessene GPU-Residency und Pod-Speicher ueberlappen und sind nicht zu addieren.

## Verifikation nach dem GitOps-Rollout

```bash
kubectl --context devmesh -n workspace rollout status deploy/gemma-embed
kubectl --context devmesh -n workspace rollout status deploy/gemma-embed-igpu
kubectl --context devmesh -n workspace get pods -l app=gemma-embed -o wide
kubectl --context devmesh -n workspace get endpointslice -l kubernetes.io/service-name=llm-gateway-gemma-embed
kubectl --context devmesh -n workspace logs deploy/gemma-embed-igpu --tail=60
kubectl --context devmesh top nodes
```

Beide Serving-Pods muessen Ready sein und auf `gpu-cluster2` laufen. Die
CUDA-Bulk-Replika bleibt geparkt. Eine Anfrage an `/v1/embeddings` mit Modell
`embeddinggemma-300m` muss einen endlichen, normalisierten 768-Vektor liefern.
Vor Freigabe auf Dauerbetrieb 30 Minuten ohne Neustart, `GPU hang`,
`VK_ERROR_DEVICE_LOST` oder OOM pruefen und CPU-/GPU-Vektoren vergleichen.

Kalibrierung vom 2026-10-27: ein explizit pro Worker begrenzter Lastgenerator
lieferte bei etwa 508 Tokens 1,258 Dokumente/s zusammen, p95 CPU 1,73 s und
GPU 1,55 s. Das waren 60 Sekunden, keine Langzeitmessung. Kubernetes verteilt
Verbindungen und erzwingt keine einzelne laufende Anfrage je Backend;
Keep-Alive, Ankunftsrate und Eingabelaenge koennen diese Werte veraendern.
Mehr Slots oder hoehere Speicherlimits steigerten den gemessenen Durchsatz
nicht wesentlich. Der Service-Durchsatz muss deshalb separat gemessen werden.

## Rollback

Im GitOps-Quellstand `dev-local/core/gemma-hybrid.yaml` den Intel-Pool auf
`replicas: 0` setzen und den CPU-Patch zuruecknehmen; rendern, testen, mergen
und den signierten devmesh-Artefakt-Reconcile abwarten. Der CPU-Service und
seine Modelldatei bleiben verfuegbar. Eine manuelle Skalierung wird vom
naechsten Flux-Reconcile ueberschrieben und ersetzt diesen Rollback nicht.
