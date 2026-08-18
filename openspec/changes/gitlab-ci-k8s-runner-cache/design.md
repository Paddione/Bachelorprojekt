# Design: GitLab-CI Etappe 2 — K8s-Runner auf fleet + Pull-Through-Cache

## Goals

- Den Single Point of Failure beseitigen: zwei self-hosted Runner statt einem.
- Die gemessene Laufzeitlücke zu den SaaS-Runnern schließen (Faktor 2–3).
- CI-Last auf dem Produktionscluster so einhegen, dass sie produktive Workloads nicht
  verdrängen **kann** — nicht nur „soll".
- Jede Zusicherung an einen Guard hängen, der ohne laufenden Cluster prüfbar ist.

## Non-Goals

- Umzug des Merge-Gates (setzt grüne Jobs voraus → Alt-Bugs T011899–T011906).
- Migration weiterer GitHub-Workflows.
- self-hosted GitLab CE.
- Autoscaling der Runner.

## Decisions

### D1 — fleet statt eines zweiten lokalen Runners

**Entscheidung:** Der zweite Runner läuft als Kubernetes-Executor auf `fleet`.

**Begründung:** Ein zweiter Runner auf demselben Host wäre kein Ausfallschutz — er teilt
Stromversorgung, Kernel, Docker-Daemon und Netzanbindung mit dem ersten. Der Zweck des zweiten
Runners ist Unabhängigkeit, und die entsteht erst durch andere Hardware an einem anderen Ort.

**Trade-off:** CI-Last auf dem Produktionscluster ist ein reales Risiko. Es wird nicht durch
Zusicherungen aufgefangen, sondern durch Mechanik: Quota, LimitRange, PriorityClass,
nodeSelector — siehe D2.

### D2 — Vier Grenzen, nicht eine

**Entscheidung:** Die Einhegung besteht aus vier voneinander unabhängigen Mechanismen.

| Mechanismus | Verhindert |
|---|---|
| **ResourceQuota** (Namespace) | dass CI in Summe mehr zieht als zugestanden |
| **LimitRange** (Pod-Default) | dass ein Job **ohne** Ressourcenangabe unbegrenzt zieht |
| **PriorityClass** (< default) | dass CI bei Knappheit produktive Pods verdrängt |
| **nodeSelector** (nur Worker) | dass CI auf einem Control-Plane-Knoten neben etcd landet |

**Begründung für die Redundanz:** Jeder Mechanismus deckt eine Lücke der anderen. Eine Quota
allein greift nicht, wenn ein Pod gar keine Requests deklariert — dann zählt er als 0 und läuft
trotzdem. Eine PriorityClass allein verhindert keine Überbelegung, sie entscheidet nur, wer bei
Knappheit weicht. Der nodeSelector allein sagt nichts über die Menge.

**Der nodeSelector ist nicht optional, sondern durch die Messung erzwungen:** `pk-hetzner-8`
liegt bei 96 % CPU-Requests. Dort ist kein Platz, und was dort noch hineinpasst, konkurriert mit
API-Server und etcd.

**Trade-off:** Die beiden Worker haben zusammen 8 CPU und 15,2 GiB, davon rund die Hälfte belegt.
Die Quota wird entsprechend eng — realistisch zwei parallele Jobs. Das ist eine bewusste Grenze,
keine Verlegenheit: Der lokale Runner trägt weiterhin Last, und der Cloud-Fallback bleibt.

### D3 — Pull-Through-Cache statt Volume-Cache oder Custom-Image

**Entscheidung:** `registry:2` im Proxy-Modus vor Docker Hub.

| Alternative | Warum verworfen |
|---|---|
| Volume-Cache im Runner (`pull_policy: if-not-present` + persistentes Volume) | Wirkt nur auf diesem einen Runner. Schlimmer: Wird ein Tag upstream neu gebaut, liefert der Cache still das alte Image weiter — ein Fehler, der erst auffällt, wenn zwei Runner unterschiedliche Ergebnisse liefern. |
| Vorgebautes CI-Image mit node/task/python3/jq | Spart zusätzlich die apt-Schritte, koppelt die Toolchain aber an ein Artefakt mit eigener Build-Pipeline und eigenem Alterungsproblem. Als spätere Optimierung offen, nicht als Grundlage. |

**Begründung:** Der Proxy-Modus füllt sich als Nebenwirkung des Abrufs. Es gibt keinen
Publish-Schritt, der vergessen werden kann, und keine Liste zu pflegender Images.

### D4 — Der Cache existiert zweimal

**Entscheidung:** Je eine Instanz auf fleet und auf PK-Desktop.

**Begründung:** Diese Einsicht kam erst aus der Cluster-Erhebung. Ein Cache auf fleet nützt dem
Desktop-Runner nichts: Seine Pulls liefen dann über dieselbe Internetstrecke, die der Cache
einsparen soll — nur mit einem zusätzlichen Umweg. Latenz ist der Grund für den Cache, also muss
er dort stehen, wo gezogen wird.

**Trade-off:** Zwei Instanzen sind zwei Betriebsobjekte. Sie teilen sich dieselbe Konfiguration
und dasselbe Image; der Mehraufwand liegt im Deployment, nicht in der Pflege.

### D4a — Die beiden Standorte binden den Cache unterschiedlich an

**Nachgetragen während der Planung.** Die Formulierung „Cache anbinden" verdeckt, dass an beiden
Standorten ein **anderes Programm** die Images zieht:

| Standort | Wer zieht | Anbindung |
|---|---|---|
| PK-Desktop, Docker-Executor | der Host-Docker-Daemon | `registry-mirrors` in `/etc/docker/daemon.json` |
| fleet, Kubernetes-Executor | **containerd** auf dem Knoten | `/etc/rancher/k3s/registries.yaml` auf den Workern |

**Warum das zählt:** Auf Kubernetes zieht nicht der Runner die Images, sondern das Kubelet über
containerd. Eine Einstellung in der Runner-Konfiguration bliebe dort wirkungslos — der Cache
stünde, würde aber nie benutzt, und die Laufzeit bliebe unverändert. Der Fehler wäre still: Alles
läuft, nur eben nicht schneller.

**Konsequenz für den Betrieb:** Die fleet-Seite verlangt eine **Host-Konfiguration auf
`gekko-hetzner-3` und `gekko-hetzner-4`**, die nicht in Git versioniert ist und bei einem
Knoten-Neuaufbau erneut gesetzt werden muss. Sie gehört deshalb ins Runbook, nicht in ein
Manifest — und ein Guard kann sie nicht prüfen. Das ist die einzige Stelle dieser Etappe, an der
eine Zusicherung ausschließlich durch Dokumentation getragen wird.

**In `config.toml` gehört trotzdem etwas:** `pull_policy = ["if-not-present"]` spart zusätzliche
Roundtrips. Es ersetzt die Mirror-Einstellung aber nicht — es ist eine Ergänzung, keine
Alternative.

### D5 — Beide Runner tragen denselben Tag

**Entscheidung:** Auch der fleet-Runner bekommt `bachelorprojekt-local`.

**Begründung:** Das Tag-Routing aus Etappe 1 (`tags: [$CI_RUNNER_TAG]`) bleibt damit unverändert
gültig, und der Ausfall eines Runners erfordert **keine** Variablenänderung — GitLab verteilt die
Jobs auf den verbleibenden. Ein eigener Tag pro Runner würde die Ausfallsicherheit wieder an eine
manuelle Umschaltung binden, also genau das zurücknehmen, was diese Etappe erreichen will.

**Der Name ist dann irreführend** — `bachelorprojekt-local` bezeichnet keinen Ort mehr, sondern
„self-hosted". Ein Rename wäre eine Änderung an `.gitlab-ci.yml`, am Runbook, an den Guards und
an der GitLab-Konfiguration beider Runner gleichzeitig; das ist mehr Risiko als der Gewinn.
Stattdessen wird die Bedeutung im Runbook festgehalten.

### D6 — Helm rendern und committen

**Entscheidung:** `helm template` → `k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml`,
Values daneben, Regeneration über ein Taskfile-Target.

**Begründung:** Das ist die im Repo etablierte Konvention (`k3d/monitoring/` mit
`kube-prometheus-stack-rendered.yaml`, Taskfile.yml:2712 ff.). Sie hält das tatsächlich
angewandte Manifest im Git-Diff sichtbar, statt es zur Laufzeit aus einem Chart zu erzeugen —
bei einem Workload mit RBAC und Ressourcengrenzen ist gerade das der Punkt.

## Architecture

```
                  GitLab (gitlab.com)
                          │
              tags: [$CI_RUNNER_TAG] = bachelorprojekt-local
                          │
            ┌─────────────┴─────────────┐
            ▼                           ▼
   PK-Desktop (WSL)            fleet (K8s, Namespace gitlab-runner)
   Docker-Executor             Kubernetes-Executor
   concurrent=3                ResourceQuota + LimitRange
        │                      PriorityClass < default
        │                      nodeSelector: Worker
        ▼                              │
   registry-cache                      ▼
   (Container, lokal)          registry-cache (Deployment)
        │                              │
        └──────────► Docker Hub ◄──────┘
```

Beide Runner antworten auf denselben Tag; GitLab verteilt. Beide ziehen Images über ihren
jeweils lokalen Cache. Der Cloud-Fallback aus Etappe 1 bleibt unverändert als dritte Ebene.

## Error Handling

| Fehlerfall | Verhalten | Sichtbarkeit |
|---|---|---|
| fleet-Runner offline | Desktop-Runner nimmt alle Jobs | Pipeline läuft weiter, Runner-Liste in GitLab zeigt „offline" |
| Desktop-Runner offline | fleet-Runner nimmt alle Jobs | dito |
| Beide offline | Jobs `pending` | Runbook: `CI_RUNNER_TAG` auf SaaS |
| Quota ausgeschöpft | Job-Pod wird nicht erzeugt, Job bleibt `pending` | Events im Namespace; **produktive Pods unberührt** |
| Cache nicht erreichbar | Pull geht direkt upstream — langsamer, nicht kaputt | Laufzeit steigt auf den Etappe-1-Wert |

Der letzte Fall ist Absicht: Ein Cache-Ausfall darf die Pipeline nicht anhalten. Der
Pull-Through-Modus fällt auf Upstream zurück, statt zu scheitern.

## Testing

Die Guards laufen **auf GitHub**, ohne Cluster und ohne GitLab-Zugang — wie in Etappe 1, aus
demselben Grund: Sie sichern die Migration ab und dürfen nicht von dem System abhängen, dessen
Aufbau sie prüfen.

1. **Vier Grenzen vorhanden** — Quota, LimitRange, PriorityClass (Wert < default), nodeSelector
   im gerenderten Manifest. Positiv-Anker: Das Manifest enthält überhaupt einen Runner-Workload.
2. **Kein Cluster-Zugriff für Jobs** — `automountServiceAccountToken: false`; RBAC ist Role und
   RoleBinding, **nicht** ClusterRole. Positiv-Anker: Es gibt überhaupt RBAC-Objekte.
3. **Kein CI-Pod auf Control-Plane** — nodeSelector schließt die CP-Knoten aus.
4. **Cache an beiden Standorten** — die fleet-Konfiguration und die lokale
   Runner-Konfiguration verweisen je auf eine erreichbare Instanz.
5. **Render-Reproduzierbarkeit** — das Taskfile-Target erzeugt aus den committeten Values
   dasselbe Manifest; Drift wird als Diff sichtbar.

Die Guards prüfen **Semantik statt Darstellung** (T002716): YAML-Struktur statt Zeilenanker,
Zahlenvergleich beim PriorityClass-Wert statt fixer Zeichenkette.

**Was diese Guards nicht können:** Ob die Quota im laufenden Cluster wirklich greift und ob die
Laufzeit tatsächlich sinkt, ist statisch nicht prüfbar. Beides gehört in die manuelle Abnahme,
gemessen gegen die Etappe-1-Werte (50 / 84 / 284 s).
