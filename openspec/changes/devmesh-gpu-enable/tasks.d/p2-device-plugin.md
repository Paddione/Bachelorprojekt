<!-- Partial P2 — Device-Plugin-Target und GPU-Sicht im Status. Kein Index. -->

## File Structure (Partial P2)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/devmesh/status.sh` | 51 | 749 |

Verantwortlichkeiten und die uebrigen Dateien:

- `dev-local/gpu/kustomization.yaml` (neu) — eigenstaendiges Kustomize-Target, referenziert
  genau das Plugin-Manifest.
- `dev-local/gpu/nvidia-device-plugin.yaml` (neu) — DaemonSet des NVIDIA-Device-Plugins,
  auf `gpu=true` beschraenkt.
- `scripts/devmesh/status.sh` — meldet zusaetzlich pro Knoten die GPU-Kapazitaet.
  Nicht-baselined, `.sh`-Limit 800, Ist 51 → wirksames Budget 749.
- `tests/spec/local-dev-mesh/status.bats` (86 Zeilen) — Output-Guard fuer die neue
  GPU-Sicht, Begleittest von `status.sh`.

`.yaml` und `.bats` stehen nicht in `docs/code-quality/gates.yaml` → `s1.limits`; fuer diese
vier neuen bzw. geaenderten Manifest- und Testdateien gibt es keine S1-Schwelle.

Ermittelt mit:

```bash
wc -l scripts/devmesh/status.sh tests/spec/local-dev-mesh/status.bats
jq -r '."S1:scripts/devmesh/status.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json
grep -A20 '^  limits:' docs/code-quality/gates.yaml
```

S4-Hinweis: `s4.manifest_globs` umfasst nur `k3d/*.yaml`, `dev-local/gpu/*.yaml` faellt also nicht
unter den Orphan-Check. `nvidia-device-plugin.yaml` wird trotzdem in `dev-local/gpu/kustomization.yaml`
referenziert — das Target waere sonst leer. `scripts/devmesh/status.sh` ist bereits ueber
`taskfiles/Taskfile.devmesh.yml:63` erreichbar.

Vorbild fuer Stil und Kommentarsprache: `dev-local/core/kustomization.yaml`,
`dev-local/core/gpu-endpoint.yaml`. Vorbild fuer den Digest-Pin: `k3d/llm-gpu.yaml`.

---

### Task P2-1: Eigenstaendiges Kustomize-Target `dev-local/gpu/`

Deckt: Requirement "A devmesh host with a GPU offers it as a schedulable resource",
Szenarien "The GPU target stands alone" und "The plugin is confined to GPU hosts".

**Files:**
- Create: `dev-local/gpu/nvidia-device-plugin.yaml`
- Create: `dev-local/gpu/kustomization.yaml`

**Interfaces:**
- Consumes: nichts aus anderen Tasks. Bewusst kein `dev-local/core`, kein `devmesh/inventory.yaml`,
  kein `envsubst`, kein `--load-restrictor` (Design D1).
- Produces: das DaemonSet `nvidia-device-plugin-daemonset` in `kube-system`, Node-Selector
  `gpu: "true"`, `runtimeClassName: nvidia`. Task P2-2 rollt es aus, Task P2-3 misst sein Ergebnis.

- [ ] **Schritt 1: Plugin-Manifest anlegen**

`dev-local/gpu/nvidia-device-plugin.yaml`:

```yaml
# NVIDIA-Device-Plugin fuer devmesh — macht die Karte auf einem als gpu=true markierten
# Host als nvidia.com/gpu verfuegbar (T900179, design.md D1/D2/D3).
#
# Eigenstaendiges Target: dieses Manifest haengt weder an dev-local/core noch an
# devmesh/inventory.yaml. Es enthaelt keine ${VAR}-Platzhalter und ist direkt
# per `kubectl apply -k dev-local/gpu` anwendbar.
#
# runtimeClassName nvidia: k3s legt die RuntimeClass generisch an (neben crun, wasmtime
# und weiteren). Ihre Existenz belegt KEINE funktionierende Runtime — der Beleg ist die
# Node-Kapazitaet, die dieses DaemonSet erzeugt (design.md D3).
#
# nodeSelector gpu=true statt Node-Feature-Discovery: ein Host, eine Karte, ein
# nachvollziehbares Label (design.md D2). Ohne das Label hat das DaemonSet kein Ziel
# und erzeugt null Pods — das ist der Normalfall auf GPU-losen Knoten, kein Fehler.
#
# Image gepinnt auf Digest wie in k3d/llm-gpu.yaml. v0.20.0 ist der zum Planungsstand
# aktuelle Release (NVIDIA/k8s-device-plugin). Digest aufgeloest mit:
#   TOKEN=$(curl -s 'https://nvcr.io/proxy_auth?scope=repository:nvidia/k8s-device-plugin:pull' \
#     | sed -E 's/.*"token":"([^"]+)".*/\1/')
#   curl -sI -H "Authorization: Bearer $TOKEN" \
#     -H 'Accept: application/vnd.oci.image.index.v1+json' \
#     https://nvcr.io/v2/nvidia/k8s-device-plugin/manifests/v0.20.0 | grep -i docker-content-digest
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: nvidia-device-plugin-daemonset
  labels:
    app: nvidia-device-plugin
spec:
  selector:
    matchLabels:
      app: nvidia-device-plugin
  updateStrategy:
    type: RollingUpdate
  template:
    metadata:
      labels:
        app: nvidia-device-plugin
    spec:
      priorityClassName: system-node-critical
      nodeSelector:
        gpu: "true"
      # gpu-metal ist control-plane und etcd-Mitglied. Ist der Knoten getaintet,
      # braeuchte das DaemonSet diese Duldungen; sind keine Taints gesetzt, sind sie
      # wirkungslos. Der nvidia.com/gpu-Taint ist die uebliche Konvention fuer
      # GPU-Knoten und wird hier vorsorglich geduldet.
      tolerations:
        - key: nvidia.com/gpu
          operator: Exists
          effect: NoSchedule
        - key: node-role.kubernetes.io/control-plane
          operator: Exists
          effect: NoSchedule
        - key: node-role.kubernetes.io/master
          operator: Exists
          effect: NoSchedule
      runtimeClassName: nvidia
      containers:
        - name: nvidia-device-plugin-ctr
          image: nvcr.io/nvidia/k8s-device-plugin:v0.20.0@sha256:a61ba9fd8efb82f3a79f877f7580e02c1e8e7593f62473644bc9c79e315c3312
          env:
            # true, nicht false: scheitert die Initialisierung (Runtime nicht
            # registriert, Treiber unlesbar), soll der Pod sichtbar crashen. Mit false
            # laeuft er weiter und bietet still nichts an — ein gruener Pod ohne
            # Kapazitaet waere genau die Fehldiagnose, die Task P2-3 unterscheidbar macht.
            - name: FAIL_ON_INIT_ERROR
              value: "true"
            - name: NVIDIA_VISIBLE_DEVICES
              value: all
            - name: NVIDIA_DRIVER_CAPABILITIES
              value: all
          securityContext:
            allowPrivilegeEscalation: false
            capabilities:
              drop: ["ALL"]
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 128Mi
          volumeMounts:
            - name: device-plugin
              mountPath: /var/lib/kubelet/device-plugins
      volumes:
        - name: device-plugin
          hostPath:
            path: /var/lib/kubelet/device-plugins
```

- [ ] **Schritt 2: Kustomization anlegen**

`dev-local/gpu/kustomization.yaml`:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
# devmesh-Profil gpu (T900179, design.md D1). Bewusst getrennt von dev-local/core:
# core braucht envsubst aus devmesh/inventory.yaml und zieht den halben Dev-Stack mit,
# der eigene ungeloeste Vorbedingungen hat. Dieses Target baut ohne Renderer:
#   kubectl kustomize dev-local/gpu
namespace: kube-system

resources:
  - nvidia-device-plugin.yaml
```

- [ ] **Schritt 3: Standalone-Build belegen**

```bash
kubectl kustomize dev-local/gpu > /tmp/gpu-target.yaml
echo "Anker: Zeilen=$(wc -l < /tmp/gpu-target.yaml)"   # muss > 0 sein
yq ea -r 'select(.kind=="DaemonSet") | .spec.template.spec.nodeSelector.gpu' /tmp/gpu-target.yaml
yq ea -r 'select(.kind=="DaemonSet") | .spec.template.spec.runtimeClassName' /tmp/gpu-target.yaml
yq ea -r 'select(.kind=="DaemonSet") | .metadata.namespace' /tmp/gpu-target.yaml
grep -c '\${' /tmp/gpu-target.yaml || true
```

Erwartet: `true`, `nvidia`, `kube-system`, und `0` fuer die Platzhalter-Zaehlung. Der
Build laeuft ohne `--load-restrictor` und ohne gesetzte Umgebungsvariablen durch.
Der dauerhafte Guard fuer dieses Szenario gehoert in das BATS-Partial unter
`tests/spec/local-dev-mesh/`; hier wird das Verhalten mit den Befehlen oben belegt.

- [ ] **Schritt 4: Manifest-Validierung**

```bash
task workspace:validate
```

- [ ] **Schritt 5: Commit**

```bash
git add dev-local/gpu/kustomization.yaml dev-local/gpu/nvidia-device-plugin.yaml
git commit -m "feat(devmesh): eigenstaendiges Kustomize-Target fuer das NVIDIA-Device-Plugin [T900179]"
```

---

### Task P2-2: Node-Label setzen und Plugin auf `gpu-metal` ausrollen

Deckt: Szenario "The node advertises the extended resource". Braucht die echte Karte und
laeuft deshalb manuell — in CI existiert kein NVIDIA-Host (design.md D5). Vorbedingung ist
ein Host, auf dem das nvidia-container-toolkit bereits installiert ist.

**Files:**
- Kein Dateiartefakt. Das Label ist Cluster-Zustand, ohne den das DaemonSet aus Task P2-1
  kein Ziel hat und still null Pods erzeugt.

**Interfaces:**
- Consumes: `dev-local/gpu/` aus Task P2-1.
- Produces: `nvidia.com/gpu` in `.status.allocatable` von `gpu-metal` — die Eingabe, die
  Task P2-3 sichtbar macht.

- [ ] **Schritt 1: Label setzen**

```bash
kubectl --context devmesh label node gpu-metal gpu=true --overwrite
kubectl --context devmesh get nodes -l gpu=true -o name
```

Erwartet: genau `node/gpu-metal`. `--overwrite` macht den Befehl wiederholbar.

- [ ] **Schritt 2: Target anwenden**

```bash
kubectl --context devmesh apply -k dev-local/gpu
kubectl --context devmesh -n kube-system rollout status ds/nvidia-device-plugin-daemonset --timeout=180s
```

- [ ] **Schritt 3: Kapazitaet pruefen**

```bash
kubectl --context devmesh get node gpu-metal \
  -o jsonpath='{.status.allocatable.nvidia\.com/gpu}{"\n"}'
```

Erwartet: eine Zahl `>= 1`. Eine leere Ausgabe ist kein Beleg fuer irgendetwas — sie
bedeutet, dass die Ressource fehlt, und der naechste Schritt nennt den Grund.

- [ ] **Schritt 4: Bei leerer Kapazitaet die Ursache lesen**

```bash
kubectl --context devmesh -n kube-system logs ds/nvidia-device-plugin-daemonset --tail=50
kubectl --context devmesh -n kube-system get pods -l app=nvidia-device-plugin -o wide
```

Ein `CrashLoopBackOff` mit Init-Fehler im Log bedeutet: die nvidia-Runtime ist auf dem Host
nicht registriert. Der Fix liegt dann auf der Host-Seite (Toolkit-Installation und
k3s-Neustart), nicht in diesem Manifest.

- [ ] **Schritt 5: Zaehlt keine Aenderung im Repo — kein Commit**

Dieser Task veraendert nur Cluster-Zustand. Das Ergebnis (Zahl aus Schritt 3, Datum,
verwendeter Befehl) wird als Kommentar am Ticket T900179 festgehalten.

---

### Task P2-3: `status.sh` weist die GPU-Kapazitaet pro Knoten aus

Deckt: Requirement "The status view reports GPU capacity" mit beiden Zusicherungen —
jeder Knoten erscheint mit einer Zahl, und eine markierte Karte ohne angebotene Ressource
ist von "keine GPU" unterscheidbar.

**Files:**
- Modify: `scripts/devmesh/status.sh` (neuer Block nach der etcd-Zeile, aktuell Zeile 34)
- Modify: `tests/spec/local-dev-mesh/status.bats` (kubectl-Stub um einen GPU-Zweig erweitern)

**Interfaces:**
- Consumes: die Kapazitaet aus Task P2-2.
- Produces: drei Ausgabeformen, auf die BATS und spaetere Runbooks greifen:
  `OK   GPU <name>: <n>`, `OK   GPU <name>: 0 (keine GPU)`,
  `FAIL GPU <name>: 0 (Label gpu=true, aber keine nvidia.com/gpu-Ressource)`.

- [ ] **Schritt 1: Stub um einen GPU-Zweig erweitern**

In `tests/spec/local-dev-mesh/status.bats`, in `setup()`: eine zweite Stub-Datei anlegen
und im `case` VOR dem `*"get nodes"*`-Zweig auswerten. Beide Abfragen sind
`kubectl get nodes`; unterschieden wird an `go-template`.

```bash
  export STUB_GPUS="${BATS_TEST_TMPDIR}/gpus"
  printf 'gpu-metal true 1\ngpu-cluster - -\ngpu-cluster2 - -\n' > "$STUB_GPUS"
```

Im Heredoc des kubectl-Stubs die erste `case`-Zeile einfuegen:

```bash
  *go-template*) cat "$STUB_GPUS" ;;
```

- [ ] **Schritt 2: Drei Testfaelle anhaengen**

An das Ende von `tests/spec/local-dev-mesh/status.bats`:

```bash
@test "GPU: jeder Knoten erscheint mit einer Zahl, gpu-metal mit 1" {
  _run
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -qF 'GPU gpu-metal: 1'
  printf '%s\n' "$output" | grep -qF 'GPU gpu-cluster: 0'
  printf '%s\n' "$output" | grep -qF 'GPU gpu-cluster2: 0'
}

@test "GPU: Knoten ohne Karte wird als 'keine GPU' gemeldet, nicht als Befund" {
  _run
  [ "$status" -eq 0 ]
  printf '%s\n' "$output" | grep -F 'GPU gpu-cluster:' | grep -qF 'keine GPU'
}

@test "GPU: Label gpu=true ohne nvidia.com/gpu ist ein Befund und heisst anders" {
  printf 'gpu-metal true -\ngpu-cluster - -\ngpu-cluster2 - -\n' > "$STUB_GPUS"
  _run
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF 'GPU gpu-metal'
  printf '%s\n' "$output" | grep '^FAIL' | grep -qF 'nvidia.com/gpu'
  printf '%s\n' "$output" | grep -F 'GPU gpu-metal' | grep -vqF 'keine GPU'
}
```

- [ ] **Schritt 3: Tests laufen lassen — rot**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/status.bats
```

expected: FAIL — der kubectl-Stub meldet `kubectl-Stub: unerwartet` mit Exit 99 fuer die
neue Abfrage, weil `status.sh` sie noch nicht stellt und die drei GPU-Zeilen fehlen.

- [ ] **Schritt 4: GPU-Block in `status.sh` implementieren**

Direkt nach `echo "etcd-Mitglieder: $etcd_ready/$etcd_total Ready"` (aktuell Zeile 34)
einfuegen. `go-template` statt `jsonpath`, weil jsonpath fuer fehlende Felder einen leeren
String liefert und die Spalten dann verrutschen; `-` ist der explizite Platzhalter.

```bash
# GPU-Sicht (T900179): jeder Knoten mit Zahl. "keine GPU" (kein Label, keine Ressource)
# und "Karte markiert, aber nicht angeboten" (Label gpu=true, keine Ressource) sind zwei
# verschiedene Befunde — der zweite bedeutet fehlendes Device-Plugin oder fehlende
# nvidia-Runtime und ist deshalb ein Fehlschlag, kein Hinweis.
gpu_tmpl='{{range .items}}{{.metadata.name}} {{if index .metadata.labels "gpu"}}{{index .metadata.labels "gpu"}}{{else}}-{{end}} {{if index .status.allocatable "nvidia.com/gpu"}}{{index .status.allocatable "nvidia.com/gpu"}}{{else}}-{{end}}{{"\n"}}{{end}}'
gpus="$("${K[@]}" get nodes -o go-template="$gpu_tmpl")" \
  || { echo "Vorbedingung fehlt: Knoten-Kapazitaet im Context $CTX nicht lesbar" >&2; exit 2; }
while read -r gname glabel galloc; do
  if [[ -z "$gname" ]]; then continue; fi
  if [[ "$galloc" =~ ^[0-9]+$ ]] && (( galloc > 0 )); then
    echo "OK   GPU $gname: $galloc"
  elif [[ "$glabel" == true ]]; then
    echo "FAIL GPU $gname: 0 (Label gpu=true, aber keine nvidia.com/gpu-Ressource)"
    FAIL=1
  else
    echo "OK   GPU $gname: 0 (keine GPU)"
  fi
done <<<"$gpus"
```

- [ ] **Schritt 5: Tests laufen lassen — gruen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/status.bats
```

Erwartet: PASS, alle Tests inklusive der vier bestehenden Faelle. Der bestehende
`--context devmesh`-Anker und die etcd-Zaehlung bleiben unberuehrt, weil die alte
`jsonpath`-Abfrage unveraendert ist.

- [ ] **Schritt 6: Zeilenbudget nachrechnen**

```bash
wc -l scripts/devmesh/status.sh   # Ausgangswert 51, Grenze 800
```

Erwartet: rund 69 Zeilen, also deutlich unter 80 Prozent der wirksamen Schwelle. Kein
Split noetig.

- [ ] **Schritt 7: Test-Inventar regenerieren und committen**

```bash
task test:inventory
git add scripts/devmesh/status.sh tests/spec/local-dev-mesh/status.bats \
  components/website/src/data/test-inventory.json
git commit -m "feat(devmesh): status.sh weist GPU-Kapazitaet pro Knoten aus [T900179]"
```

---

### Task P2-4: Verifikation Partial P2

**Files:**
- Keine Aenderung. Reiner Pruef-Task.

- [ ] **Schritt 1: Gezielte Tests**

```bash
task test:changed
```

- [ ] **Schritt 2: Generierte Artefakte aktualisieren**

```bash
task freshness:regenerate
```

- [ ] **Schritt 3: CI-Aequivalent**

```bash
task freshness:check
```

- [ ] **Schritt 4: Manifest-Gate**

```bash
task workspace:validate
kubectl kustomize dev-local/gpu | head -5
```

- [ ] **Schritt 5: Commit der regenerierten Artefakte**

```bash
git add -A
git commit -m "chore(devmesh): freshness-Artefakte nach GPU-Target [T900179]"
```
