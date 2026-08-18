# Proposal: gitlab-ci-k8s-runner-cache

## Why

Etappe 1 (T011790) hat die GitLab-CI-Mechanik in Betrieb gebracht und in beide Richtungen
belegt: Spiegel, Tag-Routing, Cloud-Fallback. Zwei Befunde aus dem realen Betrieb machen sie
noch nicht belastbar genug, um irgendein Gate umzuziehen.

**Ein einziger Runner.** Der Docker-Executor auf PK-Desktop trägt die gesamte Last. Fällt er
aus, bleibt jeder Job `pending` — und zwar stumm, weil GitLab nicht scheitert, sondern wartet.
Der Cloud-Fallback fängt das auf, aber nur manuell und nur, wenn jemand hinschaut.

**Zwei- bis dreifache Laufzeit gegenüber SaaS.** Gemessen am 2026-08-18, dieselben drei Jobs
auf demselben Commit:

| Job | self-hosted | gitlab.com SaaS |
|---|---|---|
| `gitleaks` | 50 s | 24 s |
| `manifests` | 84 s | 29 s |
| `bats-unit` | 284 s | 118 s |

Die Ursache ist nicht schwache Hardware, sondern der Image-Pull: Der lokale Runner zieht
`node:22` und `ubuntu:24.04` bei jedem Job neu, die SaaS-Runner haben sie vorgewärmt.

## What

### Entscheidung 1: fleet, aber streng eingehegt

Der zweite Runner läuft als Kubernetes-Executor auf `fleet` — dem Produktionscluster beider
Brands. Das ist nur vertretbar mit harten Grenzen: eigener Namespace mit **ResourceQuota** und
**LimitRange**, minimale RBAC-Rechte (Role, nicht ClusterRole), `nodeSelector` auf die
Worker-Knoten, und eine **niedrige PriorityClass**, damit produktive Workloads bei Knappheit
gewinnen statt zu verdrängen.

Der Cluster-Befund vom 2026-08-18 stützt die Einhegung und schneidet zugleich den Spielraum:

| Knoten | Rolle | Kapazität | CPU-Requests |
|---|---|---|---|
| pk-hetzner-8 | CP | 8 CPU / 15,2 GiB | **96 %** |
| pk-hetzner-4 | CP | 8 CPU / 15,2 GiB | 77 % |
| pk-hetzner-6 | CP | 8 CPU / 15,2 GiB | 60 % |
| gekko-hetzner-3 | Worker | 4 CPU / 7,6 GiB | 41 % |
| gekko-hetzner-4 | Worker | 4 CPU / 7,6 GiB | 47 % |

Auf den Control-Plane-Knoten ist kein Platz mehr — `pk-hetzner-8` ist request-seitig voll. Die
beiden Worker haben Luft, aber nur 4 CPU und 7,6 GiB; das reicht für zwei parallele Jobs, nicht
für beliebig viele. Die Quota bildet genau diese Grenze ab, statt sie dem Zufall zu überlassen.

Bemerkenswert: Außer `flux-system` trägt **kein** Namespace im Cluster eine ResourceQuota. Diese
Etappe führt die Konvention also ein, statt einer bestehenden zu folgen.

### Entscheidung 2: Registry-Pull-Through-Cache — zweimal

Ein `registry:2` im Proxy-Modus vor Docker Hub zieht jedes Image genau einmal und liefert es
danach aus dem lokalen Netz. Verworfen wurden ein Volume-Cache im Runner (wirkt nur dort und
veraltet still, wenn ein Tag neu gebaut wird) und ein vorgebautes CI-Image (spart zusätzlich die
apt-Schritte, kostet aber eine eigene Build-Pipeline und bindet die Toolchain an ein Artefakt).

**Der Cache muss zweimal existieren.** Das war vor der Cluster-Erhebung nicht offensichtlich:
Ein Cache auf fleet nützt dem Desktop-Runner nichts, weil dessen Pulls dann über dieselbe
Internetstrecke liefen, die er einsparen soll. Zwei Runner an zwei Orten brauchen zwei
Instanzen desselben Bausteins — eine im fleet-Namespace, eine als Container auf PK-Desktop.

### Sicherheit: Die Jobs brauchen keinen Cluster-Zugriff

Ein CI-Runner auf dem Produktionscluster wirft die Frage auf, was ein Job dort anrichten kann.
Die Antwort für diese drei Jobs: nichts. Der `manifests`-Job ruft `kubectl` ausschließlich für
`kubectl kustomize` — eine reine Offline-Umformung ohne API-Server-Kontakt. Die Job-Pods
bekommen deshalb `automountServiceAccountToken: false`; Rechte hat nur der Runner-Manager, und
zwar allein zum Erzeugen von Pods im eigenen Namespace.

### Umfang dieser Etappe

1. Stack-Verzeichnis für den Runner nach der Konvention aus `k3d/monitoring/`
   (`namespace.yaml`, `kustomization.yaml`, `values/`, `*-rendered.yaml`)
2. ResourceQuota, LimitRange, PriorityClass, nodeSelector auf die Worker
3. GitLab-Runner mit Kubernetes-Executor, ServiceAccount mit minimalen Rechten
4. Registry-Pull-Through-Cache auf fleet
5. Registry-Pull-Through-Cache lokal auf PK-Desktop samt `config.toml`-Anbindung
6. Delta auf `openspec/specs/ci-cd.md` und BATS-Guards
7. Runbook-Ergänzung: Betrieb zweier Runner, Cache-Diagnose

### Nicht in dieser Etappe (Non-Goals)

- Umzug des Merge-Gates — dafür muss die Pipeline erst grün sein, und das hängt an den
  Alt-Bugs T011899–T011906
- Migration weiterer GitHub-Workflows
- self-hosted GitLab CE
- Behebung der Alt-Bugs selbst
- Autoscaling der Runner

_Ticket: T012177_
