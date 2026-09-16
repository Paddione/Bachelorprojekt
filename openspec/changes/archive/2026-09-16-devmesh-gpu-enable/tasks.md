---
title: "devmesh-gpu-enable — Implementation Plan"
ticket_id: T900179
domains: [infra, ops, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-gpu-enable — Implementation Plan

## File Structure

```
scripts/devmesh/gpu-enable.sh                   (neu)  P1  — Toolkit + containerd-Runtime + k3s-Neustart
dev-local/gpu/kustomization.yaml                (neu)  P2  — eigenstaendiges Kustomize-Target
dev-local/gpu/nvidia-device-plugin.yaml         (neu)  P2  — DaemonSet, auf gpu=true beschraenkt
scripts/devmesh/status.sh                       (aend) P2  — GPU-Kapazitaet je Knoten
tests/spec/local-dev-mesh/status.bats           (neu)  P2  — Output-Guard der GPU-Sicht
tests/spec/local-dev-mesh/gpu-enable.bats       (neu)  P3  — Verhaltens-Guard gegen Stubs
```

_Ticket: T900179_

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1-gpu-enable-script | tasks.d/p1-gpu-enable-script.md | impl | scripts/devmesh/gpu-enable.sh |  |
| p2-device-plugin | tasks.d/p2-device-plugin.md | impl | dev-local/gpu/kustomization.yaml, dev-local/gpu/nvidia-device-plugin.yaml, scripts/devmesh/status.sh, tests/spec/local-dev-mesh/status.bats |  |
| p3-tests | tasks.d/p3-tests.md | tests | tests/spec/local-dev-mesh/gpu-enable.bats | p1-gpu-enable-script |

Die target_files-Mengen sind disjunkt. p3 traegt den Failing-Test-Step und den
abschliessenden Verifikations-Task.

## Kontext

Der devmesh-Cluster kann die GTX 970 auf `gpu-metal` nicht vergeben: das
nvidia-container-toolkit fehlt und es laeuft kein Device Plugin, der Node bietet keine
`nvidia.com/gpu`-Ressource an. Dieser Change stellt genau das her — kein BGE-Deployment,
kein Ausrollen von `dev-local/core`, keine Aenderung an den llm-proxy-Ketten.

Begruendung der Entscheidungen: `design.md` (D1 eigenstaendiges Target, D2 Node-Label statt
NFD, D3 k3s-Neustart statt Handarbeit an containerd, D4 Akzeptanz endet nicht bei
`nvidia-smi`, D5 CI-Guards getrennt von der Hardware-Verifikation).

## Abschluss

Der Change ist fertig, wenn die drei Akzeptanzstufen aus `proposal.md` erfuellt sind. Stufe 3
(llama.cpp mit `-ngl 99` gegen `bge-m3-Q8_0`) ist die entscheidende: die Karte ist compute
capability 5.2, der sm_50-PTX wird zur Laufzeit JIT-kompiliert. Faellt Stufe 3 aus, endet der
Change auf Stufe 1–2 und das Folgevorhaben (BGE auf der GPU) ist in der geplanten Form nicht
machbar — das ist ein Ergebnis, kein Fehlschlag.

Der finale Verifikations-Task (`task test:changed`, `task freshness:regenerate`,
`task freshness:check`) steht am Ende von `tasks.d/p3-tests.md`.
