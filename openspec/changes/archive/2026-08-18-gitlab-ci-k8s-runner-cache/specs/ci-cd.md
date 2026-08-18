## ADDED Requirements

### Requirement: CI-Runner auf fleet läuft in einer harten Ressourcen-Umzäunung

The system SHALL run the Kubernetes-executor GitLab Runner on the `fleet` production cluster
only inside a dedicated namespace that carries **both** a ResourceQuota and a LimitRange. The
quota SHALL bound CPU and memory for the namespace as a whole; the LimitRange SHALL give every
job pod a default request and limit, so that a job without explicit resources cannot claim an
unbounded share.

Runner and job pods SHALL be scheduled onto the worker nodes only, never onto the control-plane
nodes: at the time of writing one control-plane node sits at 96 % CPU requests, and CI load
there would compete with the API server and etcd.

Runner and job pods SHALL carry a PriorityClass whose value is **below** the default, so that
under contention the scheduler evicts or defers CI work rather than production workloads.

#### Scenario: Job über der Namespace-Quota wird abgelehnt statt Produktion zu verdrängen

- **GIVEN** die ResourceQuota des Runner-Namespace ist ausgeschöpft
- **WHEN** ein weiterer Job-Pod erzeugt werden soll
- **THEN** lehnt der API-Server die Pod-Erzeugung selbst ab (kein Scheduling-`pending`
  — die Ablehnung geschieht schon bei der Objekt-Erzeugung, bevor ein Pod existiert,
  den der Scheduler platzieren könnte) und der GitLab-Job schlägt fehl (S5, Review
  T012177: „bleibt pending" trifft nicht zu — das gilt für einen erzeugten, aber
  nicht schedulebaren Pod, nicht für einen von der Quota abgelehnten)
- **THEN** bleiben alle produktiven Pods in `workspace` und `workspace-korczewski` davon
  unberührt (N5, Nachreview T012177: die vorherige Formulierung „bleibt kein produktiver
  Pod … davon unberührt" war eine doppelte Verneinung und sagte wörtlich das Gegenteil)

#### Scenario: Kein CI-Pod auf einem Control-Plane-Knoten

- **GIVEN** die Runner-Manifeste sind angewandt
- **WHEN** die Node-Zuordnung der Runner- und Job-Pods geprüft wird
- **THEN** schränkt eine `nodeAffinity` mit `operator: In` sie auf die Worker-Knoten ein
- **THEN** genügt eine einfache `nodeSelector`-Label-Map dafür nicht, weil sie kein ODER über mehrere Hostnamen ausdrücken kann

---

### Requirement: CI-Jobs erhalten keinen Cluster-Zugriff

The system SHALL NOT mount a ServiceAccount token into GitLab CI job pods
(`automountServiceAccountToken: false`). The three core jobs do not need API-server access: the
manifest job invokes `kubectl` solely for `kubectl kustomize`, which is an offline
transformation.

RBAC for the runner manager SHALL be a namespaced Role, never a ClusterRole, and SHALL be
limited to managing pods and reading pod logs within its own namespace.

#### Scenario: Job-Pod kann den API-Server nicht erreichen

- **GIVEN** ein laufender CI-Job-Pod
- **WHEN** sein Dateisystem auf ein ServiceAccount-Token geprüft wird
- **THEN** ist keines eingehängt

#### Scenario: Runner-Rechte enden am eigenen Namespace

- **GIVEN** die RBAC-Manifeste des Runners
- **WHEN** ihre Art geprüft wird
- **THEN** handelt es sich um Role und RoleBinding, nicht um ClusterRole oder ClusterRoleBinding

---

### Requirement: Image-Pulls laufen über einen Pull-Through-Cache

The system SHALL provide a registry pull-through cache for each self-hosted runner location, so
that a base image is fetched from the upstream registry once and served locally thereafter. A
cache instance placed only on the cluster would not help the desktop runner, whose pulls would
still cross the same internet path the cache is meant to remove.

The cache SHALL be a proxy, not a manually populated mirror: images appear in it as a side
effect of being requested, without a separate publish step that could go stale.

#### Scenario: Zweiter Lauf zieht das Basis-Image nicht erneut aus dem Internet

- **GIVEN** ein Job hat `node:22` bereits einmal über den Cache gezogen
- **WHEN** ein weiterer Job dasselbe Image anfordert
- **THEN** liefert der Cache es aus, ohne die Upstream-Registry erneut zu kontaktieren

#### Scenario: Beide Runner-Standorte haben eine Cache-Instanz

- **GIVEN** die Konfiguration beider Runner
- **WHEN** ihre Registry-Einstellung geprüft wird
- **THEN** verweist jede auf eine für sie lokal erreichbare Cache-Instanz

#### Scenario: Die Anbindung sitzt bei dem Programm, das tatsächlich zieht

- **GIVEN** der Docker-Executor zieht über den Host-Docker-Daemon, der Kubernetes-Executor über containerd
- **WHEN** die Cache-Anbindung eingerichtet wird
- **THEN** steht sie beim Docker-Executor in der Daemon-Konfiguration und beim Kubernetes-Executor in der Registry-Konfiguration der Knoten
- **THEN** genügt eine Einstellung in der Runner-Konfiguration allein nicht — sie bliebe wirkungslos, ohne dass ein Fehler sichtbar würde

---

### Requirement: Ausfall eines Runners legt die Pipeline nicht still

The system SHALL keep the pipeline able to run when one of the two self-hosted runners is
unavailable. Both runners SHALL answer to the same runner tag, so that job routing does not have
to change when one of them drops out.

This does not replace the documented cloud fallback: it removes the single point of failure that
made the fallback the only remedy.

#### Scenario: Ein Runner offline, Pipeline läuft weiter

- **GIVEN** einer der beiden self-hosted Runner ist offline
- **WHEN** eine Pipeline startet
- **THEN** nimmt der verbleibende Runner die Jobs an, ohne dass eine Variable geändert wird

---

### Requirement: Gerenderte Helm-Artefakte folgen der bestehenden Repo-Konvention

The system SHALL render the GitLab Runner Helm chart to a committed `*-rendered.yaml` file
alongside its `values/` input, mirroring how `k3d/monitoring/` handles
`kube-prometheus-stack-rendered.yaml`. A Taskfile target SHALL regenerate it, so the rendered
output can be reproduced rather than hand-edited.

#### Scenario: Gerendertes Manifest ist reproduzierbar

- **GIVEN** die committete Values-Datei
- **WHEN** das Render-Target erneut ausgeführt wird
- **THEN** entsteht dasselbe gerenderte Manifest, und ein Drift wird als Diff sichtbar
