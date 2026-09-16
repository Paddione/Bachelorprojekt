---
title: Design: devmesh-gpu-enable
ticket_id: null
domains: [infra, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design: devmesh-gpu-enable

## Goals

- Der devmesh-Cluster kann die GTX 970 auf `gpu-metal` als `nvidia.com/gpu` vergeben.
- Der Weg dahin ist ein Skript im Repo, kein Handbetrieb per SSH.
- Die Maxwell-Tauglichkeit ist an der echten Karte belegt, bevor darauf aufgebaut wird.

## Non-Goals

- Kein BGE-Deployment und keine Aenderung an den llm-proxy-Ketten (TS3).
- Kein Ausrollen von `dev-local/core` (TS2 — dort liegen eigene Blocker).
- Kein GPU-Operator, keine Node-Feature-Discovery, kein MIG/Time-Slicing, kein Monitoring.
- Keine Aenderung an `gpu-endpoint.yaml` oder `gpu_endpoint` im Inventar (TS2).

## Decisions

### D1: `dev-local/gpu/` als eigenstaendiges Target, nicht als Teil von `dev-local/core`

`dev-local/core` waere der naheliegende Ort — es enthaelt bereits `k3d/llm-gpu.yaml`. Es ist
aber nicht anwendbar: `scripts/devmesh/render-stack.sh core` bricht mit rc=2 ab, weil
`gpu_endpoint.address` im Inventar fehlt und der Guard eine Adresse aus `100.64.0.0/10`
verlangt. Ausserdem zoege `core` den gesamten Dev-Stack mit (website, pocket-id, shared-db,
sdlc-console), der eigene ungeloeste Vorbedingungen hat (kein `storage=true`-Label, kein
Sealed-Secrets-Controller).

Ein eigenes Target haelt diesen Change unabhaengig und in einer Sitzung abschliessbar.
Trade-off: GPU-Bezogenes liegt an zwei Orten, bis TS2/TS3 es zusammenfuehren.

### D2: Node-Label `gpu=true` statt Node-Feature-Discovery

NFD wuerde die Karte automatisch erkennen (`feature.node.kubernetes.io/pci-10de.present`),
kostet aber einen weiteren Cluster-Dienst fuer genau einen Host mit genau einer Karte. Ein
explizites Label ist nachvollziehbar, und TS3 braucht dieselbe Markierung ohnehin, um
`bge-embed` auf `gpu-metal` zu binden.

### D3: k3s-Neustart statt Handarbeit an der containerd-Konfiguration

k3s erzeugt `/var/lib/rancher/k3s/agent/etc/containerd/config.toml` aus einem Template neu
und erkennt dabei eine installierte `nvidia-container-runtime` selbst. Ein direkt editiertes
config.toml wuerde beim naechsten Start ueberschrieben. Deshalb: Toolkit installieren,
`nvidia-ctk runtime configure --runtime=containerd`, dann k3s neu starten und k3s die Datei
schreiben lassen.

Die RuntimeClass `nvidia` existiert im Cluster bereits, ist aber kein Beleg fuer eine
funktionierende Runtime — k3s legt sie generisch an, zusammen mit `crun`, `wasmtime` und
weiteren. Der Nachweis ist die Node-Kapazitaet, nicht die RuntimeClass.

### D4: Die Akzeptanz endet nicht bei `nvidia-smi`

Die Karte ist compute capability 5.2 (Maxwell). llama.cpp kompiliert `50-virtual` nur im
Zweig `CUDAToolkit_VERSION VERSION_LESS "13"` (`ggml/src/ggml-cuda/CMakeLists.txt`); das
offizielle Image ist CUDA 12.8.1, der sm_50-PTX wird also zur Laufzeit auf sm_52
JIT-kompiliert. Ob das traegt, zeigt weder die Node-Kapazitaet noch `nvidia-smi` — beide
koennen gruen sein, waehrend der erste echte CUDA-Kernel scheitert.

Deshalb gehoert ein llama.cpp-Lauf mit `-ngl 99` gegen `bge-m3-Q8_0` in die Verifikation.
Faellt er aus, ist TS3 in der geplanten Form nicht machbar, und das soll hier auffallen und
nicht erst nach dem Ausrollen des halben Dev-Stacks.

**Verfallsdatum:** Wechselt das llama.cpp-Image auf CUDA 13, faellt Maxwell ersatzlos weg.
Das gehoert als Kommentar an das Manifest, das die GPU spaeter nutzt (TS3), und an die
Image-Pin-Stelle.

### D5: Verifikation gegen echte Hardware getrennt von den CI-Guards

Der BATS-Guard prueft das Verhalten von `gpu-enable.sh` gegen Stubs: Idempotenz, Exit 2 bei
fehlendem Werkzeug, Exit 2 bei unerreichbarem Host. Er bewertet Kommando-Output, nicht
Quelltext (Repo-Konvention, `tests/CLAUDE.md`). Die drei Akzeptanzstufen brauchen die echte
Karte und laufen deshalb manuell; in CI gibt es keinen NVIDIA-Host.

## Risks

- **R1** Der PTX-JIT auf sm_52 traegt nicht. Mitigation: D4 macht genau das zur
  Abbruchbedingung, bevor TS2/TS3 beginnen.
- **R2** Der k3s-Neustart auf `gpu-metal` stoert den Cluster. Der Host ist control-plane und
  etcd-Mitglied in einem 3er-Verbund; ein einzelner Neustart ist verkraftbar, sollte aber
  nicht gleichzeitig mit Arbeiten an den anderen beiden Knoten laufen.
- **R3** Treiber 580.173.02 ist der letzte Zweig mit Maxwell-Unterstuetzung. Ein
  Treiber-Upgrade auf dem Host kann die Karte unbrauchbar machen.
