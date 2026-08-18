# p2 — GitLab-Runner (Kubernetes-Executor) via Helm

**Zieldateien:** `k3d/gitlab-runner-stack/values/gitlab-runner.yaml` (neu), `k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml` (neu)

Setzt die vier in p1 festgelegten Namen voraus (Namespace `gitlab-runner`, PriorityClass
`ci-low`, Helm-Release-Name `gitlab-runner`, Worker-Hostnamen `gekko-hetzner-3`/
`gekko-hetzner-4`) und die dort begründete Entscheidung, den Worker-Bezug über
`nodeAffinity`/`node_affinity` statt eines einfachen `nodeSelector:`-Maps
herzustellen (p1, Aufgabe 4).

## Aufgabe 1: Helm-Values (`values/gitlab-runner.yaml`)

Orientiert am offiziellen GitLab-Beispiel „Restricted Security Environment" für das
`gitlab-runner`-Chart, mit den Werten aus der Aufgabenstellung:

```yaml
# k3d/gitlab-runner-stack/values/gitlab-runner.yaml
# Eingabe fuer `task gitlab-runner:render` (Aufgabe 2) — nicht direkt gegen den
# Cluster anwenden, das gerenderte gitlab-runner-rendered.yaml ist die Wahrheit.
gitlabUrl: https://gitlab.com/

# Der Runner-Manager selbst braucht sein ServiceAccount-Token, um ueber die Role
# aus rbac.rules Job-Pods zu erzeugen — das ist ein anderer Mechanismus als die
# Job-Pod-Absicherung unten (specs/ci-cd.md, Requirement "CI-Jobs erhalten keinen
# Cluster-Zugriff"). automountServiceAccountToken templated in runners.config als
# [runners.kubernetes] automount_service_account_token = false und wirkt dort auf
# die vom Manager erzeugten Job-Pods, NICHT auf den Manager-Pod selbst.
automountServiceAccountToken: false

rbac:
  create: true
  # Namespaced Role statt ClusterRole — Requirement "RBAC fuer den Runner-Manager
  # SHALL be a namespaced Role, never a ClusterRole" (specs/ci-cd.md).
  clusterWideAccess: false
  rules:
    - resources: ["pods"]
      verbs: ["get", "list", "watch", "create", "delete"]
    - resources: ["pods/log"]
      verbs: ["get"]

# nodeAffinity statt nodeSelector (p1, Aufgabe 4): ein simples Label-Map kann kein
# ODER ueber zwei Hostnamen ausdruecken. Gleiche Form wie
# prod-fleet/mentolder/kustomization.yaml:67-71, nur mit den Worker- statt den
# CP-Hostnamen.
affinity:
  nodeAffinity:
    requiredDuringSchedulingIgnoredDuringExecution:
      nodeSelectorTerms:
        - matchExpressions:
            - key: kubernetes.io/hostname
              operator: In
              values: [gekko-hetzner-3, gekko-hetzner-4]

# PriorityClass aus p1 — der Manager-Pod selbst zaehlt genauso zur CI-Last wie die
# Job-Pods, die er erzeugt (design.md D2 nennt "Runner und Job-Pods" gemeinsam).
priorityClassName: ci-low

podSecurityContext:
  runAsNonRoot: true

securityContext:
  allowPrivilegeEscalation: false
  capabilities:
    drop: ["ALL"]

resources:
  requests:
    cpu: 200m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 256Mi

runners:
  # Kubernetes-Executor statt Docker — Design D1: eigene Hardware, eigener Ort.
  executor: kubernetes
  # Dasselbe Tag wie der Desktop-Runner (Design D5) — GitLab routet ueber die
  # verbleibenden Runner, kein Variablenwechsel bei Ausfall eines der beiden.
  tags: [bachelorprojekt-local]
  # Kein RUN_UNTAGGED — wie beim Docker-Runner (docs/runbooks/gitlab-runner.md
  # Abschnitt 3.2): sonst zieht dieser Runner auch Jobs an, die eigentlich in die
  # Cloud ausweichen sollen.
  runUntagged: false
  config: |
    [[runners]]
      [runners.kubernetes]
        namespace = "gitlab-runner"
        image = "ubuntu:24.04"
        privileged = false
        service_account = "default"
        # Siehe "Registry-Anbindung" unten — dieses Feld existiert im
        # Kubernetes-Executor NICHT als Pull-Through-Ziel; hier absichtlich nur
        # namespace/image/privileged/service_account/priority_class_name gesetzt.
        priority_class_name = "ci-low"
        pull_policy = ["if-not-present"]
        [runners.kubernetes.node_affinity]
          [[runners.kubernetes.node_affinity.required_during_scheduling_ignored_during_execution.node_selector_terms]]
            [[runners.kubernetes.node_affinity.required_during_scheduling_ignored_during_execution.node_selector_terms.match_expressions]]
              key = "kubernetes.io/hostname"
              operator = "In"
              values = ["gekko-hetzner-3", "gekko-hetzner-4"]
```

**Registry-Anbindung — Korrektur gegenüber der Aufgabenstellung:** Die Aufgabe
verlangt „`runners.config` mit … der Registry-Anbindung an den Cache aus p3
(`registry-cache:5000`)". Das ist beim **Kubernetes-Executor technisch nicht
möglich** — anders als beim Docker-Executor (der einen eigenen Docker-Daemon mit
`registry-mirrors` in `daemon.json` hat) zieht beim Kubernetes-Executor der
**Node-Container-Runtime** (containerd auf `gekko-hetzner-3`/`-4`) die Images,
nicht der Runner-Prozess. `runners.config` → `[runners.kubernetes]` hat kein Feld
für einen Pull-Through-Mirror. Die Anbindung an `registry-cache:5000` muss deshalb
über die containerd-Mirror-Konfiguration der beiden Worker-Knoten laufen (k3s:
`/etc/rancher/k3s/registries.yaml`, siehe Abgrenzung) — das ist ein
Node-Host-Eingriff, kein Helm-Wert, und gehört in p3 (Registry-Cache) oder als
eigener, hier fehlender Task. **Dieses Partial setzt deshalb `pull_policy =
["if-not-present"]` als einzige lokal wirksame Maßnahme** und verweist im
`config`-Kommentar auf die Lücke, statt einen nicht existierenden Konfig-Schlüssel
zu erfinden.

Prüfbefehl:

```bash
test -f k3d/gitlab-runner-stack/values/gitlab-runner.yaml
python3 -c "import yaml,sys; yaml.safe_load_all(open('k3d/gitlab-runner-stack/values/gitlab-runner.yaml'))" && echo "valid YAML"
```

## Aufgabe 2: Rendern + Taskfile-Target

`k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml` entsteht durch
`helm template`, committet, analog zu `Taskfile.yml:2705-2719`
(`monitoring:render`). Kein `--version`-Pin — `monitoring:render` pinnt ebenfalls
nicht (nur `loki:render` tut das, für einen Chart mit häufigeren Breaking Changes);
Drift wird durch den committeten Diff sichtbar, nicht durch eine eingefrorene
Version verhindert.

Neues Taskfile-Target, textlich unmittelbar neben `monitoring:render` einzufügen
(nicht als eigene Zieldatei geführt — `Taskfile.yml` ist laut `tasks.md`
File-Structure-Abschnitt zu groß für ein Zeilenbudget und wird nur punktuell
erweitert):

```yaml
  gitlab-runner:render:
    desc: "Pre-render das gitlab-runner-Chart zu committed YAML (Re-Run bei Chart-Upgrade)."
    preconditions:
      - sh: command -v helm > /dev/null
        msg: "helm not found. Install: https://helm.sh/docs/intro/install/"
    cmds:
      - |
        helm repo add gitlab https://charts.gitlab.io 2>/dev/null || true
        helm repo update gitlab
        helm template gitlab-runner gitlab/gitlab-runner \
          --namespace gitlab-runner \
          -f k3d/gitlab-runner-stack/values/gitlab-runner.yaml \
          > k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
        echo "✓ Rendered to k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml — review the diff and commit."
```

Prüfbefehl (Reproduzierbarkeit, Design D6 / Testing-Punkt 5 aus `design.md`):

```bash
task gitlab-runner:render
git diff --exit-code k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
echo "exit 0 = reproduzierbar, exit 1 = Drift sichtbar gemacht"
```

## Aufgabe 3: Vier Grenzen im gerenderten Manifest nachweisbar

Design-Testing-Punkt 1 verlangt, dass Quota/LimitRange/PriorityClass/nodeSelector
„im gerenderten Manifest" erscheinen — für Quota/LimitRange/PriorityClass gilt das
für `namespace.yaml` (p1), nicht für dieses gerenderte Manifest. Für dieses Partial
zählt: `priorityClassName: ci-low` und die `nodeAffinity`-Hostnamen müssen im
**Runner-Deployment** aus `gitlab-runner-rendered.yaml` stehen — sonst greift die
PriorityClass/der Worker-Zwang nur auf dem Papier der Values-Datei, nicht am
tatsächlich geplanten Pod.

Prüfbefehl:

```bash
grep -q 'priorityClassName: ci-low' k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
grep -c 'gekko-hetzner-3\|gekko-hetzner-4' k3d/gitlab-runner-stack/gitlab-runner-rendered.yaml
```

## Aufgabe 4: Runner-Token — Weg beschreiben, nicht anlegen

Der `glrt-`-Authentication-Token gehört in ein SealedSecret, nicht in
`values/gitlab-runner.yaml` (Klartext-Secrets in Helm-Values würden committet).
Dieses Partial legt **kein** SealedSecret an — das ist laut Aufgabenstellung ein
manueller Abnahmeschritt. Der reale Weg über die bestehende Tooling-Kette
(`task env:seal`, siehe `environments/schema.yaml` `extra_namespaces`-Muster,
z. B. Zeile 675-678 für den `coturn`-Namespace mit `owner_brand: [mentolder]`):

1. In `environments/schema.yaml` einen neuen Eintrag `GITLAB_RUNNER_TOKEN` mit
   `extra_namespaces: [{namespace: gitlab-runner, secret: gitlab-runner-secret,
   owner_brand: [mentolder]}]` ergänzen. `owner_brand: [mentolder]` ist ein
   willkürlicher Anker — der Namespace `gitlab-runner` gehört zu keinem Brand,
   aber das Sealing-Zertifikat ist pro **Cluster** (`fleet`), nicht pro Brand
   gültig, also ist es unerheblich, über welchen Brand-Lauf gesealt wird.
2. Klartextwert in `environments/.secrets/mentolder.yaml` eintragen.
3. `task env:seal ENV=mentolder` — das Ergebnis landet als zusätzlicher
   SealedSecret-Eintrag in `environments/sealed-secrets/mentolder.yaml`, Ziel-
   Namespace `gitlab-runner`.

Dieser Weg ist **nicht** identisch mit `k3d/gitlab-runner-stack/`selbst — der
SealedSecret lebt in `environments/`, nicht im Stack-Verzeichnis, weil das die
bestehende Konvention für alle anderen Cluster-Secrets in diesem Repo ist.

## Abgrenzung

Dieses Partial rendert **keine** Registry-Cache-Manifeste (p3) und setzt **keinen**
echten Runner-Token (manueller Schritt, Aufgabe 4). Es löst **nicht** die in
Aufgabe 1 benannte Registry-Anbindungslücke des Kubernetes-Executors — die
containerd-Mirror-Konfiguration auf `gekko-hetzner-3`/`-4` ist ein Node-Host-
Eingriff außerhalb aller vier Partials dieser Etappe und muss vor der manuellen
Abnahme (Laufzeitmessung gegen die Etappe-1-Werte) irgendwo nachgezogen werden,
sonst bleibt der Cache für den fleet-Runner wirkungslos, obwohl er läuft.
