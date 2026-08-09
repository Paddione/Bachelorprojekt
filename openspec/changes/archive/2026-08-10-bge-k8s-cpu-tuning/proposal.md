# Proposal: bge-k8s-cpu-tuning

## Why

Seit T002551 laufen `bge-embed` (bge-m3-Q8_0) und `bge-rerank` (bge-reranker-v2-m3-Q8_0)
als CPU-only llama.cpp-Deployments in `k3d/llm-gpu.yaml`. Zwei Stellschrauben sind
ungenutzt:

1. **Kein `-t`-Flag.** llama.cpp waehlt per Default die Host-Core-Zahl (8 auf den
   pk-Nodes). Das cgroup-Quota von `limits.cpu: 2000m` laesst davon aber nur zwei
   Kerne zu, also teilen sich 8 Threads 2 Kerne. Der Thread-Count ist nicht das
   Limit, das Quota ist es, und die Ueberzeichnung kostet zusaetzlich
   Context-Switches.
2. **`limits.cpu: 2000m`** wurde bei der Migration bewusst konservativ gesetzt und
   nie gegen echte Messwerte geprueft.

Gemessene Ausgangslage (2026-08-02, `fleet`/`workspace`, 100 Dokumente a ~62 Tokens,
Batch 64, drei Laeufe ueber `svc/llm-gateway-embed`):

| Lauf | Dauer | Durchsatz |
|---|---|---|
| 1 | 148.4 s | 0.67 chunks/s |
| 2 | 151.5 s | 0.66 chunks/s |
| 3 | 146.1 s | 0.68 chunks/s |

Das sind ~42 Prompt-Tokens/s. Der Design-Doc der Migration nannte 21 chunks/s, was
sich auf deutlich kleinere Chunks bezogen haben muss. Genau deshalb braucht dieses
Vorhaben ein *reproduzierbares* Messskript mit fixierter Dokumentgroesse statt einer
frei zitierten Kennzahl: `chunks/s` ist ohne Angabe der Chunk-Groesse bedeutungslos.

## What

- `scripts/llm/bench-bge-embed.sh` (neu): reproduzierbarer Durchsatz-Benchmark gegen
  `svc/llm-gateway-embed`, fixierte Dokumentanzahl/-groesse, N Laeufe, Median-Ausgabe.
- `Taskfile.llm.yml`: Task `llm:bench-embed` als Einstiegspunkt (S4-Erreichbarkeit).
- `k3d/llm-gpu.yaml`: `-t <threads>` in den Args beider Deployments, `limits.cpu`
  von `2000m` auf `4000m`; `requests.cpu` bleibt bei `1000m`.
- `tests/spec/llm-pipeline/bge-cpu-tuning.bats` (neu): Guard, dass beide Deployments
  ein `-t`-Flag und das angehobene CPU-Limit tragen und `requests.cpu` unveraendert
  bleibt.
- Vorher/Nachher-Messung im PR dokumentiert.

## Node-Kapazitaet ist ein hartes Gate

Erhobener Ist-Stand des `fleet`-Clusters (2026-08-02):

| Node | Allocatable CPU | Ist-Last | CPU-Requests |
|---|---|---|---|
| pk-hetzner-4 | 8 | 1000m (12%) | 5120m (64%) |
| pk-hetzner-6 | 8 | 590m (7%) | 4780m (59%) |
| pk-hetzner-8 | 8 | 1048m (13%) | 4810m (60%) |
| gekko-hetzner-3 | 4 | 302m (7%) | 1260m (31%) |
| gekko-hetzner-4 | 4 | 225m (5%) | 1620m (40%) |

Zwei Dinge weichen von der Annahme im Ticket ab und muessen den Plan steuern:

1. **Die Worker-Nodes haben 4 Kerne, nicht 8.** Nur die drei CP-Nodes haben 8.
   `gekko-hetzner-2` taucht in `kubectl get nodes` gar nicht mehr auf, der Cluster
   laeuft mit fuenf Nodes. Ein pauschales `-t 8` waere auf einem 4-Kern-Node eine
   2-fache Ueberzeichnung. Die Deployments tragen keinen `nodeSelector` und keine
   `affinity`, koennen also bei jedem Restart auf einem 4-Kern-Node landen.
2. **`limits.cpu` beeinflusst das Scheduling nicht.** `requests.cpu` bleibt `1000m`,
   der Scheduler sieht die Aenderung nicht. Das Kapazitaets-Gate ist deshalb kein
   Schedulability-Check, sondern ein Burst-Headroom-Check: kann der Node die
   zusaetzlichen 2000m Burst liefern, ohne Nachbar-Pods zu verdraengen.

Daraus folgen die Abbruch- und Reduktionspfade, die als Tasks im Plan stehen und
nicht als blosses "vorher pruefen" formuliert sind.

## Abgrenzung

Nicht Teil dieses Vorhabens: FastEmbed-Local-Fallback, Qdrant-Einfuehrung,
Aenderungen an Services/PVCs/InitContainern, Aenderungen am Request/Response-Vertrag
der Gateways, `nodeSelector`/`affinity` fuer die bge-Deployments.

## Bekanntes Risiko: T002580

Waehrend der Baseline-Messung zeigte `bge-embed` neun Restarts mit
`reason: OOMKilled` (`limits.memory: 2Gi`). Das ist als eigener Bug T002580 erfasst
und wird hier **nicht** gefixt. Fuer dieses Vorhaben ist es eine Messbedingung: ein
Benchmark-Lauf, waehrend dessen der Restart-Zaehler steigt, ist ungueltig und muss
verworfen werden.

_Ticket: T002572_
