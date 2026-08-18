# p1 — Namespace-Umzäunung + Flux-Anschluss

**Zieldateien:** `k3d/gitlab-runner-stack/namespace.yaml` (neu), `k3d/gitlab-runner-stack/kustomization.yaml` (neu), `flux/clusters/fleet/ks-gitlab-runner.yaml` (neu)

Dieses Partial legt den Namespace `gitlab-runner` mit den vier in Design D2 verlangten
Grenzen an und hängt ihn in die Flux-Pipeline ein. Es erzeugt **keine** Workloads — die
kommen aus p2 (Runner) und p3 (Cache) und werden hier nur schon in `kustomization.yaml`
vorverdrahtet, weil diese Datei laut Partial-Tabelle ausschließlich in p1 entsteht.

## Namen (verbindlich für p2/p3, hier zuerst festgelegt)

- Namespace: `gitlab-runner`
- ResourceQuota: `gitlab-runner-quota`
- LimitRange: `gitlab-runner-limits`
- PriorityClass: `ci-low`
- Helm-Release-Name (p2): `gitlab-runner` → Deployment heißt `gitlab-runner`
- Worker-Knoten (einzige gültigen Scheduling-Ziele): `gekko-hetzner-3`, `gekko-hetzner-4`

## Aufgabe 1: Namespace mit den vier Grenzen

`k3d/gitlab-runner-stack/namespace.yaml` enthält vier Objekte in einer Datei
(`---`-getrennt), analog zum bestehenden Muster in `k3d/monitoring/namespace.yaml`
(dort nur der Namespace; hier zusätzlich die drei Guardrail-Objekte, weil dieser
Namespace — anders als `monitoring` — Fremdlast von CI-Jobs aufnimmt).

### 1.1 Namespace

```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: gitlab-runner
  labels:
    app.kubernetes.io/part-of: workspace-mvp
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/warn: restricted
```

`restricted` statt des in `k3d/monitoring/namespace.yaml` verwendeten `privileged`:
Die Job-Pods brauchen laut Proposal keinen Cluster-Zugriff und laut p2 einen
`securityContext` mit `allowPrivilegeEscalation: false`, `runAsNonRoot: true`,
`capabilities: {drop: [ALL]}` — das ist exakt das `restricted`-Profil. Ein laxeres
Enforce-Level würde diese Zusicherung nur auf dem Papier lassen; die PSA-Admission
erzwingt sie zusätzlich beim `kubectl apply`.

### 1.2 ResourceQuota — die Rechnung

Ausgangslage (Kontext-Block in `tasks.md`, `kubectl --context fleet` vom 2026-08-18):

| Knoten | Kapazität | CPU-Requests belegt |
|---|---|---|
| gekko-hetzner-3 | 4 CPU / 7,6 GiB | 41 % → 1,64 CPU |
| gekko-hetzner-4 | 4 CPU / 7,6 GiB | 47 % → 1,88 CPU |

```
Summe Kapazität (Worker):        8,00 CPU
Summe bereits reserviert:        1,64 + 1,88 = 3,52 CPU
Freie CPU (requests-basiert):    8,00 − 3,52 = 4,48 CPU
```

Policy: die Quota darf höchstens die **Hälfte** der gemessenen freien Kapazität als
`requests.cpu` binden — die andere Hälfte bleibt Reserve für Wachstum der
produktiven Workloads und Scheduler-Spielraum (Design D1: „Es wird nicht durch
Zusicherungen aufgefangen, sondern durch Mechanik").

```
4,48 CPU / 2 ≈ 2,24 CPU  → abgerundet auf 2 CPU (requests.cpu-Quota)
```

Belegungsprobe gegen die gewählte Quota (mit den LimitRange-Defaults aus 1.3):
Runner-Manager-Pod (0,2 CPU Request) + 2 parallele Job-Pods (je 0,9 CPU Request laut
LimitRange-Default) = 0,2 + 0,9 + 0,9 = **2,0 CPU** — passt exakt in die 2-CPU-Quota
und deckt sich mit „realistisch zwei parallele Jobs" aus Design D2.

`limits.cpu` wird großzügiger gesetzt (4 CPU, die volle gemessene freie Kapazität),
weil der Scheduler Pods nach **Requests** bindet, nicht nach Limits — ein Burst bis
zur Limit-Obergrenze verdrängt dank PriorityClass `ci-low` (Aufgabe 1.4) im
Zweifel nur andere CI-Pods, nie produktive Pods. Für Memory ist keine
Auslastungs-Prozentzahl gemessen (nur CPU-Requests-% liegt im Cluster-Befund vor);
die Werte sind deshalb konservativ an den CPU-Verhältnissen gespiegelt, nicht an
einer eigenen Messung.

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: gitlab-runner-quota
  namespace: gitlab-runner
spec:
  hard:
    requests.cpu: "2"
    requests.memory: 2Gi
    limits.cpu: "4"
    limits.memory: 4Gi
    pods: "10"
```

`pods: "10"` ist kein Rechenwert wie die CPU/Memory-Zeilen, sondern eine
Plausibilitätsgrenze: Manager-Pod (1) + 2 parallele Job-Pods (2) + Überlappung
während Pod-Terminierung/-Neustart (Rest) — bewusst großzügig, damit sie nicht die
eigentliche Bremse ist; das ist `requests.cpu`.

### 1.3 LimitRange — die Lücke, die die Quota allein offen lässt

Aus Design D2: „Eine Quota allein greift nicht, wenn ein Pod gar keine Requests
deklariert — dann zählt er als 0 und läuft trotzdem." Die LimitRange geschieht pro
**Container**, weil GitLab-CI-Job-Pods aus mehreren Containern bestehen (build +
helper), von denen jeder einzeln ohne Requests ankommen kann:

```yaml
apiVersion: v1
kind: LimitRange
metadata:
  name: gitlab-runner-limits
  namespace: gitlab-runner
spec:
  limits:
    - type: Container
      defaultRequest:
        cpu: 900m
        memory: 512Mi
      default:
        cpu: 1500m
        memory: 1Gi
      max:
        cpu: "2"
        memory: 2Gi
      min:
        cpu: 50m
        memory: 64Mi
```

`defaultRequest`/`default` greifen genau dann, wenn ein Container (Job-Pod ohne
explizite `runners.config`-Werte, siehe p2) keine eigenen Angaben mitbringt — das ist
der Fall, den eine reine Quota nicht verhindert. `max` deckelt zusätzlich jeden
Container einzeln, auch wenn er eigene (zu hohe) Requests/Limits deklariert —
das ist die zweite Lücke: die Quota begrenzt nur die **Summe** im Namespace, nicht
den Ausschlag eines einzelnen Containers.

### 1.4 PriorityClass — unter dem Cluster-Default

```yaml
apiVersion: scheduling.k8s.io/v1
kind: PriorityClass
metadata:
  name: ci-low
value: -1000
globalDefault: false
description: >-
  CI-Job- und Runner-Manager-Pods im Namespace gitlab-runner. Absichtlich unter
  dem impliziten Cluster-Default, damit der Scheduler bei Knappheit CI-Arbeit
  verdrängt statt produktiver Pods (Design D2).
```

**Annahme, die im Plan offen bleibt:** Kein Namespace im Cluster trägt eine eigene
PriorityClass (Cluster-Befund in `tasks.md`), und ein Leseversuch gegen die live
API (`priorityclasses.scheduling.k8s.io`) ist mit der hier verfügbaren
ServiceAccount-RBAC verboten (`forbidden … cannot list resource "priorityclasses"
at the cluster scope`) — die Annahme ist also nicht aus dem laufenden Cluster
verifiziert, sondern aus der k3s-Grundannahme abgeleitet: ohne eine
`globalDefault: true`-PriorityClass läuft jeder Pod ohne `priorityClassName` auf
Priorität **0**. `-1000` liegt sicher darunter, weit über dem Werte-Boden
(`-2147483648`) und lässt Raum für spätere, noch niedrigere Klassen. Der
manuelle Abnahmeschritt in `tasks.md` sollte `kubectl --context fleet get
priorityclass` ergänzen, um diese Annahme vor dem ersten echten Rollout zu
bestätigen.

## Aufgabe 2: Stack-Kustomization

`k3d/gitlab-runner-stack/kustomization.yaml` listet bereits alle drei Dateien des
fertigen Stacks — die beiden aus p2/p3 existieren zum Zeitpunkt dieses Partials
noch nicht, werden aber laut `tasks.md`-Partial-Tabelle mit genau diesen Namen von
p2 (`gitlab-runner-rendered.yaml`) und p3 (`registry-cache.yaml`) angelegt. Die
Reihenfolge in der Resource-Liste ist absichtlich `namespace.yaml` zuerst — Kustomize
sortiert Namespaces zwar ohnehin vor, aber die Lesbarkeit soll die Anwendungsreihenfolge
spiegeln.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - namespace.yaml
  - gitlab-runner-rendered.yaml
  - registry-cache.yaml
```

**Bewusst nicht** in `k3d/kustomization.yaml` (workspace-only, siehe `tasks.md`
Kontext-Block) eingehängt — der Stack ist ein eigenständiger Baum wie
`k3d/monitoring/`.

Prüfbefehl (erst grün, sobald p2/p3 ihre Dateien geliefert haben — hier zunächst
nur als Struktur-Vorschau brauchbar):

```bash
kubectl kustomize k3d/gitlab-runner-stack/ --load-restrictor=LoadRestrictionsNone >/dev/null
echo "exit: $?"
```

## Aufgabe 3: Flux-Kustomization + Render-Pipeline-Anschluss

### 3.1 `flux/clusters/fleet/ks-gitlab-runner.yaml`

Strukturell nach dem Muster von `flux/clusters/fleet/ks-jobs-mentolder.yaml`
(`apiVersion`/`kind`/`metadata`/`spec`-Aufbau, `sourceRef` auf dieselbe
`fleet-manifests`-OCIRepository), aber mit anderer Semantik: der Runner-Stack ist
ein dauerhaftes Deployment, kein einmaliger Job — deshalb `wait: true` (Health-Gate)
statt `wait: false`, und **kein** `force: true` (das war in `ks-jobs-mentolder.yaml`
die Umgehung für unveränderliche Job-Felder; hier gibt es keine Jobs).

```yaml
apiVersion: kustomize.toolkit.fluxcd.io/v1
kind: Kustomization
metadata:
  name: flux-gitlab-runner
  namespace: flux-system
spec:
  interval: 10m
  retryInterval: 2m
  timeout: 10m
  dependsOn:
    - name: flux-infra-controllers
  sourceRef:
    kind: OCIRepository
    name: fleet-manifests
  path: ./gitlab-runner
  prune: true
  wait: true
  healthChecks:
    - apiVersion: apps/v1
      kind: Deployment
      name: gitlab-runner
      namespace: gitlab-runner
```

`dependsOn: flux-infra-controllers` statt eines Brand-Ziels: der Runner-Stack
gehört zu keinem der beiden Brands, aber der SealedSecret mit dem Runner-Token
(manueller Abnahmeschritt, siehe p2) braucht den sealed-secrets-Controller, den
`flux-infra-controllers` bereits voraussetzt (`ks-infra-controllers.yaml` hängt
seinerseits an `flux-sealed-secrets-mentolder`/`-korczewski`).

### 3.2 Render-Pipeline-Anschluss (notwendig, aber nicht in der ursprünglichen
Zieldateien-Liste dieses Partials genannt — siehe Abgrenzung)

`ks-gitlab-runner.yaml` zeigt auf `path: ./gitlab-runner` **innerhalb des
OCI-Artefakts**, das `.github/workflows/render-fleet-artifact.yml` über
`scripts/flux-render-artifact.sh` baut. Ohne einen Renderaufruf für genau dieses
Verzeichnis bleibt der Pfad im Artefakt leer, und die Flux-Kustomization scheitert
mit „path not found" — ein stummer Deploy-Blocker, keine Fehlfunktion des
gerenderten Manifests selbst. `k3d/gitlab-runner-stack` hat keine `${VAR}`-Platzhalter
(anders als `prod-fleet/mentolder` etc.), braucht also **kein** vorheriges
`source scripts/env-resolve.sh …` — ein einfacher `render_component`-Aufruf reicht,
analog zum bestehenden „Platform"-Block:

```bash
# in scripts/flux-render-artifact.sh, als neuer Block neben "# 1. Platform":
mkdir -p "${OUT_DIR}/gitlab-runner"
render_component k3d/gitlab-runner-stack "${OUT_DIR}/gitlab-runner/gitlab-runner.yaml"
```

Zusätzlich `"${OUT_DIR}/gitlab-runner"` in die Validierungsschleife (die
`for tree_dir in … ; do` -Zeile, aktuell ohne `platform`... äh mit `platform`
bereits enthalten) aufnehmen, damit ein leeres oder envsubst-kaputtes Render
denselben Validierungsgate durchläuft wie die Brand-Bäume.

Prüfbefehl:

```bash
bash scripts/flux-render-artifact.sh --out /tmp/flux-render-check
test -f /tmp/flux-render-check/gitlab-runner/gitlab-runner.yaml
kubectl apply --dry-run=client -f /tmp/flux-render-check/gitlab-runner/gitlab-runner.yaml
```

## Aufgabe 4: nodeSelector — Festlegung, nicht Umsetzung

Dieses Partial legt die **Werte** fest (Aufgabe „Namen" oben:
`gekko-hetzner-3`/`gekko-hetzner-4`), setzt sie aber nicht selbst — es gibt in
`namespace.yaml`/`kustomization.yaml`/`ks-gitlab-runner.yaml` kein Pod-Template, an
dem ein `nodeSelector`-Feld hängen könnte. Die tatsächliche Anwendung geschieht in
p2, und zwar **nicht** als einfaches `nodeSelector:`-Label-Map, sondern als
`nodeAffinity` mit `operator: In` über beide Hostnamen — aus demselben Grund, aus
dem `prod-fleet/mentolder/kustomization.yaml:67-71` und
`prod-fleet/mentolder/studio-patch.yaml:15-24` das für die drei CP-Knoten schon so
handhaben: ein simples `nodeSelector:`-Map kann nur ein UND über feste
Label-Werte ausdrücken, kein ODER über zwei Hostnamen — dafür bräuchte es entweder
ein gemeinsames, manuell zu vergebendes Custom-Label auf beiden Workern
(ein Cluster-Seitenkanal außerhalb dieses Plans) oder eben `nodeAffinity` mit
`matchExpressions: [{key: kubernetes.io/hostname, operator: In, values:
[gekko-hetzner-3, gekko-hetzner-4]}]`. p2 MUSS diese Form für sowohl den
Runner-Manager-Pod (Helm-Wert `affinity:`) als auch für die Job-Pods
(`runners.config` → `[runners.kubernetes.affinity]`) verwenden — beides mit
identischer Werteliste.

Prüfbefehl (gegen das fertige, gerenderte Manifest aus p2 — hier als
Platzhalter-Zusicherung dieses Partials dokumentiert):

```bash
grep -c 'gekko-hetzner-3' k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
grep -c 'gekko-hetzner-4' k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
# beide erwartet: >= 1, sobald p2 geliefert hat
```

## Abgrenzung

Dieses Partial legt **keine** Runner- oder Cache-Workloads an (p2/p3), setzt
**keinen** SealedSecret (manueller Abnahmeschritt in `tasks.md`), und wendet
**keine** Manifeste gegen den laufenden Cluster an — `ks-gitlab-runner.yaml` wird
erst durch Flux-Reconciliation wirksam, nachdem der OCI-Renderer (Aufgabe 3.2)
tatsächlich etwas unter `./gitlab-runner` liefert. Der `nodeSelector`-Wert ist hier
nur **festgelegt**, nicht **gesetzt** (Aufgabe 4) — das Setzen ist Teil von p2. Die
PriorityClass-Annahme (Aufgabe 1.4) ist nicht live gegen den Cluster verifiziert;
das gehört in den manuellen Abnahmeschritt.
