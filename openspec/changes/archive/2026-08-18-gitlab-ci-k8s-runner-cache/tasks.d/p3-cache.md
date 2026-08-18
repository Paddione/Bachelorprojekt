# p3 — Registry-Pull-Through-Cache: fleet + PK-Desktop + Runbook

Zieldateien: `k3d/gitlab-runner-stack/registry-cache.yaml`, `scripts/gitlab-runner-cache.sh`,
`docs/runbooks/gitlab-runner.md`

## Kontext

Design D3/D4 (siehe `openspec/changes/gitlab-ci-k8s-runner-cache/design.md`): `registry:2` im
Proxy-Modus (`REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io`), **zweimal** — einmal auf
`fleet`, einmal als Docker-Container auf PK-Desktop. Ein Cache nur an einem Ort hilft dem
anderen Runner nicht, weil dessen Pulls dann weiterhin die volle Internetstrecke liefen.

Die Namen sind bereits im Haupt-Plan (`tasks.md` → „Namen (in allen Partials identisch)")
festgelegt und hier bindend: Namespace `gitlab-runner`, Cache-Service auf fleet `registry-cache`,
Port `5000`.

**nodeSelector-Wert, gemessen statt geraten:** `kubectl --context fleet get nodes --show-labels`
(2026-08-18) zeigt, dass `gekko-hetzner-3` und `gekko-hetzner-4` — und ausschließlich diese
beiden — bereits das Label `node-type=worker` tragen; die drei Control-Plane-Knoten tragen es
nicht. p1 legt den nodeSelector für Runner- und Job-Pods darauf fest (Design D2); dieses Partial
verwendet **denselben** Selector `node-type: worker` für den Cache-Pod, ohne ein neues Label zu
erfinden oder zu duplizieren.

**Koordinations-Hinweis (kein Fremdzugriff):** `registry-cache.yaml` muss als `resource` in
`k3d/gitlab-runner-stack/kustomization.yaml` eingetragen sein, sonst greift der S4-Orphan-Guard
(`task workspace:validate` / `tests/unit/manifests.bats`). Diese Datei gehört zu p1. Der
Implementierer dieses Partials trägt den Eintrag nach, sobald p1 gemerged bzw. im selben
Arbeitsgang verfügbar ist — hier nur als Hinweis vermerkt, `kustomization.yaml` selbst wird
NICHT von diesem Partial angefasst (D1: disjoint split).

Ebenso: Die Ressourcenwerte des Cache-Deployments zählen gegen die ResourceQuota des
Namespace `gitlab-runner`, die p1 definiert. Die unten genannten Werte (100m/128Mi Request,
500m/512Mi Limit) sind ein konservativer Vorschlag für einen Single-Replica-Proxy ohne
nennenswerte CPU-Last — bei Bedarf gegen p1s tatsächliche Quota-Obergrenze abgleichen, nicht
stillschweigend überschreiben.

## Aufgabe 1 — Cache auf fleet: `k3d/gitlab-runner-stack/registry-cache.yaml`

Drei Objekte, ein File, Namespace-Feld überall `gitlab-runner` (von p1 angelegt, hier nur
referenziert, nicht erneut definiert):

1. **PersistentVolumeClaim** `registry-cache-data`, `accessModes: [ReadWriteOnce]`,
   `storageClassName: longhorn`, `resources.requests.storage: 20Gi`.

   **StorageClass-Entscheidung: `longhorn`, nicht `local-path`.** Gemessene Fakten
   (`kubectl --context fleet get storageclass -o wide`, 2026-08-18):

   | StorageClass | Binding | Expansion |
   |---|---|---|
   | `local-path` (default) | WaitForFirstConsumer | **false** |
   | `longhorn` | Immediate | **true** |

   Zwei unabhängige Gründe, beide aus der bestehenden Cluster-Realität, nicht aus Vorliebe:

   - **Node-Ausfall darf den Cache nicht mitreißen.** `local-path` ist node-lokaler
     `hostPath`-Speicher: Das PV bindet beim ersten Scheduling an genau den Worker-Knoten, auf
     dem der Pod zuerst startet. Fällt dieser Knoten aus oder wird der Pod auf den zweiten
     Worker umplatziert (beide sind laut nodeSelector erlaubt), kann der neue Pod das alte PV
     nicht mounten und bleibt hängen — ein Cache-Ausfall, der zum Pod-Ausfall eskaliert, obwohl
     der zweite Worker verfügbar wäre. Dasselbe Argument trägt bereits
     `prod-fleet/components/llm-models-longhorn/storageclass-patch.yaml` im Repo („repliziert
     statt node-lokal, kein erneuter Download nach Node-Ausfall") — hier dieselbe Logik, nur für
     Docker-Layer statt HF-Modelle.
   - **Der Cache wächst, per Auftrag.** `registry:2` im Proxy-Modus löscht nichts von selbst;
     jedes neu gezogene Image bleibt liegen. Eine StorageClass ohne `allowVolumeExpansion` zwingt
     bei Platzmangel zu PVC-Löschen-und-Neuanlegen — das leert den Cache genau in dem Moment, in
     dem er am nötigsten wäre. `longhorn` erlaubt `kubectl patch pvc registry-cache-data -n
     gitlab-runner -p '{"spec":{"resources":{"requests":{"storage":"40Gi"}}}}'` im laufenden
     Betrieb.

   **Trade-off, explizit:** Longhorn repliziert Blockdaten (Default-Replikatzahl der
   StorageClass, hier nicht überschrieben — eine eigene Single-Replica-StorageClass ist kein
   Zieldatei dieses Partials und bleibt als spätere Optimierung offen). Für einen Cache, dessen
   gesamter Inhalt jederzeit verlustfrei aus Docker Hub nachgezogen werden kann, ist die
   Replikation reiner Verfügbarkeitsgewinn ohne Korrektheitsrisiko — der Preis ist zusätzlicher
   Speicherverbrauch (Faktor der Default-Replikatzahl) auf zwei Knoten mit je 7,6 GiB RAM
   (Storage ist separat, aber Longhorn-Engine-Pods verbrauchen zusätzlich etwas CPU/RAM aus der
   Namespace-fremden `longhorn-system`-Quota, nicht aus der Quota von p1).

2. **Deployment** `registry-cache`, `replicas: 1` (keine Replikation auf Anwendungsebene nötig —
   die Redundanz kommt aus dem PVC, nicht aus mehreren Cache-Pods, die sich sonst denselben
   RWO-PVC streitig machen würden), `nodeSelector: { node-type: worker }`, Container `registry`
   Image `registry:2` (kein Tag-Pin nötig — dieser Namespace ist keine der in `CLAUDE.md`
   gelisteten „Image Exclusions", aber `registry:2` ist ein offizielles, stabil getaggtes
   Major-Tag, kein `:latest`).

   Env:
   ```
   REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io
   REGISTRY_STORAGE_DELETE_ENABLED=true
   ```
   (`DELETE_ENABLED` ist kein Muss für den Proxy-Betrieb selbst, ermöglicht aber später eine
   manuelle Garbage-Collection ohne Redeploy — kostenlose Option, kein zusätzliches Objekt.)

   `volumeMounts`: `/var/lib/registry` ← `registry-cache-data`.

   Resources (Vorschlag, siehe Koordinations-Hinweis oben):
   ```
   requests: { cpu: 100m, memory: 128Mi }
   limits:   { cpu: 500m, memory: 512Mi }
   ```

   `automountServiceAccountToken: false` — dieselbe Begründung wie bei den Job-Pods
   (`specs/ci-cd.md` Requirement „CI-Jobs erhalten keinen Cluster-Zugriff"): Der Cache braucht
   keinen API-Server-Zugriff, also bekommt er auch keinen.

3. **Service** `registry-cache`, `ClusterIP`, Port `5000` → `targetPort 5000`, Selector auf das
   Deployment.

## Aufgabe 2 — Cache lokal auf PK-Desktop: `scripts/gitlab-runner-cache.sh`

Stilvorbild ist wörtlich `scripts/gitlab-runner-setup.sh`: `set -euo pipefail`, ein
Argument-Array als einzige Fundstelle, `--dry-run` mit Exit 0 **ohne** Docker-Kontakt und **ohne**
Dateischreibzugriff — genau die Eigenschaft, die den Guard in p4 sein *Verhalten* statt seinen
Quelltext prüfen lässt (T002448-M4).

**Zwei Verantwortlichkeiten, beide idempotent:**

1. **Cache-Container starten** (falls nicht bereits vorhanden):
   ```bash
   docker run -d --name gitlab-registry-cache --restart unless-stopped \
     -p "${CACHE_PORT:-5000}:5000" \
     -e REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io \
     -e REGISTRY_STORAGE_DELETE_ENABLED=true \
     -v gitlab-registry-cache-data:/var/lib/registry \
     registry:2
   ```
   Vor dem `docker run` mit `docker inspect gitlab-registry-cache >/dev/null 2>&1` prüfen, ob der
   Container schon existiert — dann überspringen statt einen Namenskonflikt zu werfen.

2. **Anbindung im Docker-Daemon** (`/etc/docker/daemon.json`, `registry-mirrors`) — **nicht** im
   `config.toml`, weil der Docker-Executor Images über `docker pull` auf dem Host zieht, und
   genau dort greift Docker's eigener Pull-Through-Mechanismus (`registry-mirrors` fällt bei
   Nichterreichbarkeit automatisch auf die Upstream-Registry zurück — das ist Docker-Verhalten,
   keine Eigenleistung dieses Skripts, und erfüllt damit direkt die Anforderung „Cache-Ausfall
   darf die Pipeline nicht anhalten"). Merge statt Überschreiben — wie beim `config.toml`-Anhängen
   in Abschnitt 3.1 des Runbooks, per `jq` wenn vorhanden, sonst mit klarer Fehlermeldung statt
   stillem Überschreiben bestehender Einträge:
   ```json
   { "registry-mirrors": ["http://localhost:5000"] }
   ```
   Nach dem Schreiben: `sudo systemctl restart docker`.

3. **`pull_policy` in `/etc/gitlab-runner/config.toml`** (Aufgabe aus der Ticket-Vorgabe, additiv
   zum Docker-Mirror): Im `[runners.docker]`-Block des bestehenden self-hosted Runners
   `pull_policy = ["if-not-present"]` setzen. Der Default `always` löst bei **jedem** Job einen
   Registry-Roundtrip aus, selbst wenn das Image lokal längst liegt — `if-not-present` spart genau
   diesen Roundtrip, komplementär zum Cache (der Cache beschleunigt Pulls, `if-not-present`
   vermeidet sie ganz, wo möglich). Dieselbe awk-Anhänge-Technik wie im Runbook (Abschnitt 3.1)
   verwenden, kein rohes Überschreiben der Datei.

**`--dry-run`-Vertrag (analog `gitlab-runner-setup.sh`):**
- gibt den vollständigen `docker run …`-Befehl aus `printf '%q'`-quotiert aus (inkl.
  `REGISTRY_PROXY_REMOTEURL=https://registry-1.docker.io`),
- gibt den geplanten `daemon.json`-Merge (Ziel-JSON) und den geplanten `config.toml`-Anhang als
  Text aus, **ohne** eine Datei zu berühren, **ohne** `docker`/`sudo` aufzurufen,
  **ohne** dass `docker` installiert sein muss,
- Exit-Code 0 — auch ohne laufenden Docker-Daemon.

**Echtlauf-Vorbedingungen** (fail-closed, wie im Vorbild): `docker` muss installiert sein, sonst
Abbruch mit benannter fehlender Voraussetzung. `sudo`-Bedarf für `daemon.json` und `config.toml`
ist erwartungsgemäß (dieselbe Klasse Rechte wie die `docker`-Gruppenmitgliedschaft, die das
Runbook in Abschnitt 2.1 bereits als „faktisch Root" einordnet).

**Flags:** `--dry-run`, `--port <n>` (Default `5000`, Override auch über `CACHE_PORT`).

## Aufgabe 3 — Runbook erweitern: `docs/runbooks/gitlab-runner.md`

Erweiterung, keine Neufassung — Abschnitt 7 „Abgrenzung" des bestehenden Runbooks nennt bereits
„Ein Kubernetes-Executor auf `fleet` als zweiter self-hosted Runner ist für Etappe 2
vorgesehen"; diese Etappe löst genau das ein. Drei neue Abschnitte, an passender Stelle
eingefügt (vor dem bisherigen Abschnitt 7, der dadurch zum letzten Abschnitt wird und seinen
Verweis auf „Etappe 2" auf „umgesetzt, siehe Abschnitt X" aktualisiert):

**a) Zwei-Runner-Betrieb.** Wie beide Runner denselben Tag `bachelorprojekt-local` tragen
(Design D5) und warum das Tag jetzt „self-hosted" statt „lokal" bedeutet — siehe unten. Wie man
den fleet-Runner-Pod-Status prüft: `kubectl --context fleet get pods -n gitlab-runner -o wide`
muss den Runner-Pod auf `gekko-hetzner-3` oder `gekko-hetzner-4` zeigen, **nie** auf einem
`pk-hetzner-*`-Knoten. Verweis auf die bestehende Diagnose-Tabelle in Abschnitt 5.1 — sie gilt
unverändert für beide Runner, nur dass „Runner-Status in GitLab" jetzt zwei Zeilen hat.

**b) Cache-Diagnose — woran erkennt man, dass der Cache NICHT greift?** Zwei unabhängige
Prüfungen, weil ein grüner Job nichts über Cache-Treffer aussagt:

- **fleet:** `kubectl --context fleet logs -n gitlab-runner deploy/registry-cache | grep -c
  "proxy: pull"` steigt bei jedem tatsächlichen Upstream-Pull. Bleibt die Zahl über mehrere
  Pipelines hinweg gleich, obwohl neue Jobs liefen, zieht **irgendetwas** direkt an
  `registry-cache` vorbei — üblichster Grund: der Runner-Pod hat keinen Image-Pull-Mirror
  konfiguriert (siehe unten, containerd-Hinweis).
- **PK-Desktop:** `docker inspect gitlab-registry-cache --format '{{.State.Status}}'` muss
  `running` sein. Ein einfacher Treffer-Test: ein noch nie gezogenes Tag zweimal pullen
  (`docker rmi` dazwischen) und die Docker-Daemon-Logzeit vergleichen — der zweite Pull muss
  spürbar schneller sein, weil er aus `localhost:5000` statt aus dem Internet kommt.
- **Verbindung fehlt, keine Fehlermeldung:** Ein Cache, der nicht erreichbar ist, erzeugt laut
  Design (`design.md`, Error-Handling-Tabelle) **keinen** Fehler — der Pull fällt still auf
  Upstream zurück und wird nur langsamer (zurück auf die Etappe-1-Werte 50/84/284 s). Das ist
  Absicht, macht die Diagnose aber genau deshalb auf einen Laufzeitvergleich angewiesen, nicht
  auf eine Fehlermeldung.
- **fleet-spezifische Falle:** Der Kubernetes-Executor zieht Job-Images über das **containerd
  des Knotens**, nicht über einen Docker-Daemon — anders als bei PK-Desktop reicht hier kein
  `daemon.json`. Damit `node-type=worker`-Knoten `registry-cache:5000` tatsächlich als Mirror für
  `docker.io` nutzen, braucht `gekko-hetzner-3` und `gekko-hetzner-4` je einen Eintrag in
  `/etc/rancher/k3s/registries.yaml` (k3s-native Mirror-Konfiguration) mit anschließendem
  `systemctl restart k3s-agent`. Das ist eine host-level Änderung außerhalb von Git — dieses
  Runbook ist ihr einziger Aufbewahrungsort, analog zu den WireGuard-/UFW-Schritten in
  `infra-ops`. Beispiel-Eintrag:
  ```yaml
  mirrors:
    docker.io:
      endpoint:
        - "http://registry-cache.gitlab-runner.svc.cluster.local:5000"
  ```
  Ohne diesen Schritt läuft der fleet-Runner korrekt, der Cache bleibt aber leer — ein Zustand,
  der nur an der obigen Log-Zeile auffällt, nicht an einem Fehler.

**c) `bachelorprojekt-local` heißt jetzt „self-hosted", nicht „lokal".** Wörtlicher Hinweis aus
Design D5: Ein Rename hätte `.gitlab-ci.yml`, dieses Runbook, die Guards und beide
GitLab-Runner-Konfigurationen gleichzeitig treffen müssen — das Risiko überstieg den Gewinn. Wer
den Tag-Namen künftig liest, liest ihn als „läuft nicht auf gitlab.com Shared Runnern", nicht als
Ortsangabe.

## Abgrenzung

- Keine automatische Umschaltung, kein Autoscaling der Runner — unverändert Non-Goal aus
  `proposal.md`.
- Kein Cache-Eviction-Mechanismus (Cron-GC, TTL) — `REGISTRY_STORAGE_DELETE_ENABLED=true` schafft
  nur die Voraussetzung für eine spätere manuelle oder automatisierte Bereinigung, implementiert
  hier keine.
- Keine eigene Longhorn-StorageClass mit reduzierter Replikatzahl — bleibt spätere Optimierung.
- Die containerd-Mirror-Konfiguration auf den fleet-Worker-Knoten ist eine host-level,
  Git-externe Änderung; sie wird hier nur dokumentiert (Runbook), nicht automatisiert — es gibt
  in diesem Repo keine Ansible-/Cloud-Init-Vorlage für nachträgliche k3s-Node-Config-Änderungen,
  nur für die Erstprovisionierung (`scripts/hetzner/render-cloud-init.sh`).
- `kustomization.yaml`-Eintrag für `registry-cache.yaml` ist Koordinationsaufgabe mit p1, siehe
  Kontext-Abschnitt — kein eigener Zieldatei-Zugriff dieses Partials.
