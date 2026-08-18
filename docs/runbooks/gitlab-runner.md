# GitLab-Runner: Betrieb und Fallback-Umschaltung

_Etappe 1 der GitLab-CI-Migration (T011790). GitHub Actions bleibt SSOT und
Merge-Gate — GitLab ist ein sekundaerer, nicht blockierender Spiegel. Architektur
und Entscheidungen: `openspec/changes/gitlab-ci-migration-stage1/design.md`.
Etappe 2 (T012177) ergaenzt einen zweiten self-hosted Runner auf `fleet`
(Kubernetes-Executor) plus einen Registry-Pull-Through-Cache an beiden
Standorten — siehe Abschnitte 8-10 unten sowie
`openspec/changes/gitlab-ci-k8s-runner-cache/design.md`.
Etappe 3 (T012405) spiegelt zusaetzlich die Arbeits-Branches und stellt die
Job-Paritaet zu `.github/workflows/ci.yml` her — siehe Abschnitte 11-13. **GitLab
ist damit merge-faehig, aber weiterhin KEIN Merge-Gate:** kein Ergebnis ist als
Required Check hinterlegt, kein GitHub-Job abgeschaltet._

## 1. Mirror-Secrets einrichten

Der Push-Spiegel (`.github/workflows/mirror-to-gitlab.yml`) braucht zwei
GitHub-Repository-Secrets. Ohne beide bricht der Workflow sichtbar ab (er benennt
die fehlende Variable), statt still ohne Spiegelung zu enden.

- **`GITLAB_MIRROR_TOKEN`** — ein GitLab **Project-Access-Token** (`glpat-`-Praefix,
  **nicht** ein Deploy-Token), erzeugt unter GitLab-Projekt → Settings → Access
  Tokens, mit Scope `write_repository`. Der Workflow nutzt ihn als Basic-Auth-Passwort
  mit dem Benutzernamen `oauth2` — das ist die von GitLab dokumentierte Form fuer
  Project-Access-Tokens (fuer Deploy-Tokens waere stattdessen deren eigener
  Token-Name als Benutzername noetig; deshalb ist die Token-Art hier nicht
  austauschbar).
- **`GITLAB_MIRROR_URL`** — die volle HTTPS-Projekt-URL **mit** Schema und **ohne**
  Trailing-Slash, z. B.:
  ```
  https://gitlab.com/<namespace>/<projekt>.git
  ```
  Der Workflow entfernt selbst ein fuehrendes `https://` bzw. `http://`, um daraus
  die Basic-Auth-URL zu bauen — er entfernt **keinen** Trailing-Slash und wandelt
  **keine** SSH-Form (`git@gitlab.com:namespace/projekt.git`) um. Beide Abweichungen
  brechen den Push still: eine falsch zusammengesetzte URL ist kein `git`-Syntaxfehler,
  sondern schlaegt erst beim tatsaechlichen Netzwerkzugriff fehl.

## 2. Installation des Runner-Binaries

Auf dem Host, der den Runner betreiben soll (Ubuntu/Debian). Der offizielle
apt-Weg mit manuell hinterlegtem GPG-Key — kein `curl | sudo bash`:

```bash
curl -fsSL https://packages.gitlab.com/runner/gitlab-runner/gpgkey \
  | sudo gpg --dearmor -o /usr/share/keyrings/gitlab-runner.gpg
echo "deb [signed-by=/usr/share/keyrings/gitlab-runner.gpg] https://packages.gitlab.com/runner/gitlab-runner/ubuntu/ $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/gitlab-runner.list
sudo apt-get update && sudo apt-get install -y gitlab-runner
```

Das Paket legt den Dienst-User `gitlab-runner` an und aktiviert den
systemd-Dienst.

### 2.1 Docker-Gruppe — sonst scheitert erst der erste Job

Der Docker-Executor braucht Zugriff auf den Docker-Socket. Der Dienst-User ist
nach der Installation **nicht** in der `docker`-Gruppe:

```bash
sudo usermod -aG docker gitlab-runner
sudo systemctl restart gitlab-runner
sudo -u gitlab-runner docker version --format '{{.Server.Version}}'   # muss eine Version ausgeben
```

Ohne diesen Schritt laufen Installation, Registrierung und `gitlab-runner verify`
alle sauber durch — der Fehler taucht erst beim **ersten Job** auf, als
`permission denied while trying to connect to the Docker daemon socket`.

> **Sicherheitshinweis:** Mitgliedschaft in der `docker`-Gruppe entspricht
> faktisch Root-Rechten auf dem Host. CI-Jobs laufen damit mit erheblichen
> Rechten. Für einen lokalen Entwicklungs-Runner ist das der vorgesehene Weg;
> auf einem geteilten oder produktiven Host wäre es das nicht.

## 3. Ersteinrichtung des Runners

1. Im GitLab-Projekt einen neuen Runner anlegen (Project Settings → CI/CD →
   Runners → "New project runner"), Tag `bachelorprojekt-local` vergeben und den
   `glrt-`-Authentication-Token kopieren. Der aeltere Registration-Token-Fluss
   funktioniert seit GitLab 16 nicht mehr — nur der Authentication-Token zaehlt.
   (Das ist ein **anderer** Token als `GITLAB_MIRROR_TOKEN` aus Schritt 1 — dieser
   hier registriert den Runner, jener authentifiziert den Push.)
2. Erst der Dry-Run zum Gegenlesen, ohne echten Token und ohne installiertes
   `gitlab-runner`-Binary moeglich:
   ```bash
   bash scripts/gitlab-runner-setup.sh --dry-run
   ```
   Der ausgegebene `gitlab-runner register`-Befehl zeigt genau die Parameter, mit
   denen der Echtlauf registriert.
3. Dann der Echtlauf auf dem Host, der den Runner betreiben soll:
   ```bash
   export GITLAB_RUNNER_TOKEN="glrt-..."
   bash scripts/gitlab-runner-setup.sh
   ```
   Fehlt `GITLAB_RUNNER_TOKEN` oder ist `gitlab-runner` nicht installiert, bricht
   das Skript mit Exit-Code ≠ 0 ab und benennt die fehlende Voraussetzung — es
   endet nie wirkungslos-gruen.

### 3.1 Registrierung braucht `sudo` — sonst läuft der Runner nie als Dienst

`gitlab-runner register` **ohne** `sudo` schreibt nach
`~/.gitlab-runner/config.toml`. Der systemd-Dienst liest aber
`/etc/gitlab-runner/config.toml`. Das Ergebnis ist tückisch: Die Registrierung
meldet Erfolg, der Runner erscheint in der GitLab-Oberfläche — und läuft
trotzdem nicht, weil der Dienst eine leere Konfiguration vorfindet. Nach dem
nächsten Neustart wäre er ganz verschwunden.

Prüfen, in welcher Konfiguration der Runner gelandet ist:

```bash
sudo grep -c '\[\[runners\]\]' /etc/gitlab-runner/config.toml   # muss >= 1 sein
sudo gitlab-runner verify                                        # muss "is valid" melden
```

Meldet `verify` keinen Runner, liegt die Registrierung im User-Modus. Die
`[[runners]]`-Sektion nachträglich übernehmen (Token gerät dabei nicht ins Log):

```bash
sudo cp /etc/gitlab-runner/config.toml /etc/gitlab-runner/config.toml.bak
awk '/^\[\[runners\]\]/{f=1} f' ~/.gitlab-runner/config.toml \
  | sudo tee -a /etc/gitlab-runner/config.toml > /dev/null
sudo systemctl restart gitlab-runner && sudo gitlab-runner verify
```

### 3.2 Tags werden beim `glrt-`-Fluss serverseitig verwaltet

Beim Authentication-Token-Fluss gehören Tags und die Untagged-Einstellung zum
Runner-Objekt **in GitLab**, nicht zur lokalen Konfiguration. Das
`--tag-list`-Argument des Registrierungsbefehls bleibt dort **wirkungslos** —
es steht im Skript, weil es beim älteren Fluss und bei self-managed Instanzen
weiterhin greift, aber es setzt hier nichts.

Nach der Registrierung deshalb in GitLab prüfen (Settings → CI/CD → Runners →
Edit):

- Tag `bachelorprojekt-local` ist gesetzt
- "Run untagged jobs" ist **ausgeschaltet**

Das zweite ist nicht kosmetisch: Nimmt der Runner auch ungetaggte Jobs an, zieht
er Arbeit an, die eigentlich in die Cloud ausweichen soll — der Fallback aus
Abschnitt 4 wäre damit ausgehebelt.

### 3.3 Nebenläufigkeit an die Zahl der Jobs anpassen

Der Default `concurrent = 1` lässt die drei Kern-Jobs seriell laufen. In
`/etc/gitlab-runner/config.toml`:

```toml
concurrent = 3

[[runners]]
  request_concurrency = 2
```

`request_concurrency` mahnt der Runner sonst selbst als Long-Polling-Bottleneck
im Journal an. Nach der Änderung `sudo systemctl restart gitlab-runner`.

## 4. Fallback-Umschaltung — der eigentliche Zweck dieses Runbooks

Der Compute-Fallback laeuft ausschliesslich ueber die Projekt-Variable
`CI_RUNNER_TAG` (design.md D2). Kein Job in `.gitlab-ci.yml` traegt einen
hartkodierten Tag; jeder Job deklariert `tags: [$CI_RUNNER_TAG]`.

1. **Umschalten:** GitLab-Projekt → Settings → CI/CD → Variables →
   `CI_RUNNER_TAG` von `bachelorprojekt-local` auf `saas-linux-small-amd64`
   setzen. Projekt-Variablen haben Vorrang vor der Datei-Variable in
   `.gitlab-ci.yml` — kein Commit noetig.
2. **Pipeline erneut starten:** die naechste Pipeline (oder ein manueller Retry)
   laeuft auf gitlab.com Shared Runnern.
3. **Zurueckstellen, sobald der self-hosted Runner wieder laeuft.** Das ist der
   Teil, der leicht vergessen wird: ohne diesen Schritt bleibt die Last dauerhaft
   in der Cloud, ohne dass es jemandem auffaellt. `CI_RUNNER_TAG` wieder auf
   `bachelorprojekt-local` setzen, sobald der Runner-Status in GitLab wieder
   "online" zeigt.

Beide Richtungen (Umschalten und Zuruecksetzen) gehoeren zum selben Vorgang und
sind im Ticket zu vermerken, wenn dieser Fallback real ausgeloest wurde.

## 5. Diagnose — woran erkennt man einen Runner-Ausfall

Ein ausgefallener self-hosted Runner sieht **nicht** wie ein Fehlschlag aus:
Jobs bleiben `pending` statt zu scheitern, weil GitLab wartet, bis ein Runner mit
passendem Tag verfuegbar wird. Anzeichen:

- Ein oder mehrere Jobs stehen laenger als ein paar Minuten auf `pending`,
  waehrend andere Jobs (falls vorhanden) normal starten.
- GitLab-Projekt → Settings → CI/CD → Runners zeigt den Runner mit Tag
  `bachelorprojekt-local` als "offline" oder "stale" (kein Heartbeat).
- Auf dem Runner-Host selbst: `sudo gitlab-runner status` bzw. `systemctl status
  gitlab-runner` meldet den Dienst als nicht laufend.

Ein haengender Job ist deshalb der Trigger fuer die Fallback-Umschaltung, nicht
ein rotes X.

### 5.1 Jobs hängen, obwohl der Runner online ist

`pending` hat zwei Ursachen, die von außen gleich aussehen. Die erste ist der
Ausfall oben. Die zweite: Der Runner läuft einwandfrei, ihm fehlt nur der Tag,
den die Jobs verlangen (Abschnitt 3.2). GitLab bietet ihm die Jobs dann gar
nicht erst an — deshalb steht in seinem Journal **keine** Ablehnung, sondern
überhaupt nichts. Genau dieses Schweigen führt in die Irre: Es liest sich wie
ein Netzwerk- oder Authentifizierungsproblem, ist aber eine Konfigurationslücke.

Die beiden Fälle unterscheidet man an einer Stelle:

| Beobachtung | Ausfall (5) | Tag fehlt (3.2) |
|---|---|---|
| Runner-Status in GitLab | offline / stale | **online** |
| `sudo gitlab-runner verify` | schlägt fehl oder findet nichts | `is valid` |
| `systemctl is-active gitlab-runner` | inaktiv | `active` |
| Journal des Runners | Verbindungsfehler | ruhig, nur Polling |

Meldet `verify` einen gültigen Runner und ist der Dienst aktiv, liegt es nicht
am Host — dann in GitLab die Tags des Runners prüfen. Denselben Weg nimmt man,
wenn ein Job nach dem Fallback-Umschalten hängt: dann fehlt dem SaaS-Tag
gegenüber der Variablenwert, nicht dem Runner der Tag.

## 6. Warum die Umschaltung manuell ist

Ein automatisches Ausweichen auf Shared Runner wuerde den Ausfall des
self-hosted Runners verbergen — die Pipeline liefe unauffaellig weiter, nur auf
anderer Hardware. Ein Ausfall, den niemand bemerkt, wird nicht behoben. Der
Rueckfall gehoert deshalb bewusst ins Runbook und nicht in eine Selbstheilung
(design.md D2).

## 7. Abgrenzung Etappe 1

Etappe 1 betrieb ausschliesslich den lokalen Docker-Executor auf einem
einzelnen self-hosted Host. Ein Kubernetes-Executor auf `fleet` als zweiter
self-hosted Runner war fuer Etappe 2 vorgesehen — **umgesetzt, siehe Abschnitt
8**. Diese Etappe migriert weder das Merge-Gate noch weitere GitHub-Workflows
(Build, E2E, Release, Factory) — siehe design.md, "Non-Goals".

## 8. Zwei-Runner-Betrieb (Etappe 2, T012177)

Ab Etappe 2 laufen zwei self-hosted Runner parallel: der Docker-Executor aus
Abschnitt 1-7 auf PK-Desktop und ein Kubernetes-Executor im Namespace
`gitlab-runner` auf `fleet`. Beide tragen **denselben** Tag
`bachelorprojekt-local` (Design D5) — das Tag-Routing aus Abschnitt 4 bleibt
damit unveraendert gueltig, und der Ausfall eines Runners erfordert **keine**
Variablenaenderung: GitLab verteilt die Jobs auf den verbleibenden.

**Der Name ist seit Etappe 2 irrefuehrend:** `bachelorprojekt-local` bezeichnet
keinen Ort mehr, sondern „self-hosted" — im Unterschied zu den gitlab.com
Shared Runnern aus dem Fallback (Abschnitt 4). Ein Rename haette
`.gitlab-ci.yml`, dieses Runbook, die Guards und beide
GitLab-Runner-Konfigurationen gleichzeitig getroffen — das Risiko ueberstieg
den Gewinn (design.md D5).

### 8.1 Registrierung — Token erzeugen, sealen, anwenden (B3, Review T012177)

Ohne diesen Schritt bleibt die Flux-Kustomization `flux-gitlab-runner`
(`flux/clusters/fleet/ks-gitlab-runner.yaml`) dauerhaft `NotReady` — sie hat
`wait: true` und einen `healthCheck` auf `deployment/gitlab-runner`, und der
Manager-Pod crasht ohne Token nach 30 Registrierungsversuchen dauerhaft
(`CI_SERVER_TOKEN` bleibt leer, siehe `values/gitlab-runner.yaml`,
`runners.secret`-Kommentar).

1. Im GitLab-Projekt einen neuen **Project Runner** anlegen (Settings → CI/CD
   → Runners → "New project runner"), Tag `bachelorprojekt-local` vergeben,
   Executor-Typ ist fuer die Registrierung selbst egal (der Kubernetes-Executor
   steht bereits im Chart-Wert `runners.executor`) — den `glrt-`-
   Authentication-Token kopieren. Derselbe Token-Typ wie in Abschnitt 3.1, ein
   **anderer** Token als der des Docker-Runners — jeder Runner braucht seinen
   eigenen.
2. In `environments/schema.yaml` steht der Eintrag bereits (`GITLAB_RUNNER_TOKEN`,
   `extra_namespaces: [{namespace: gitlab-runner, secret: gitlab-runner-secret,
   dest_key: runner-token}]`) — nichts weiter zu tun, nur den Klartextwert
   eintragen:
   ```bash
   # environments/.secrets/fleet-mentolder.yaml (git-crypt-verschluesselt, getrackt)
   GITLAB_RUNNER_TOKEN: "glrt-..."
   ```
   `GITLAB_RUNNER_REGISTRATION_TOKEN` (der zweite, benachbarte Schema-Eintrag)
   **nicht** befuellen — er bleibt absichtlich leer (siehe Kommentar in
   `environments/schema.yaml`: der Chart verlangt den Key
   `runner-registration-token` im Secret unabhaengig vom verwendeten Token-Fluss,
   dieses Repo nutzt aber ausschliesslich den `glrt-`-Fluss).
3. Sealen und committen:
   ```bash
   task env:seal ENV=fleet-mentolder
   git add environments/sealed-secrets/fleet-mentolder.yaml
   git commit -m "chore(security): seal GitLab-Runner-Token fuer fleet [T012177]"
   ```
   > **`ENV=fleet-mentolder`, nicht `ENV=mentolder`** — das ist keine Kosmetik:
   > `scripts/flux-render-artifact.sh` kopiert **ausschliesslich**
   > `environments/sealed-secrets/fleet-mentolder.yaml` ins OCI-Artefakt. Ein nach
   > `sealed-secrets/mentolder.yaml` gesealter Token erreicht fleet also **nie**,
   > der Runner-Pod bleibt in CrashLoop, und `flux-gitlab-runner` steht wegen
   > `wait: true` dauerhaft auf NotReady — ohne dass irgendwo ein Fehler zum
   > Token erschiene. `environments/fleet-mentolder.yaml` traegt `BRAND_ID:
   > mentolder`, der `owner_brand`-Filter des Sealers greift also unveraendert.
   Das Sealing-Zertifikat ist pro **Cluster** (`fleet`) gueltig, nicht pro
   Brand — `ENV=mentolder` ist hier nur der Anker-Lauf, der Ziel-Namespace
   `gitlab-runner` gehoert zu keinem Brand.
4. Push nach `main` → `.github/workflows/render-fleet-artifact.yml` rendert das
   OCI-Artefakt neu (inkl. `gitlab-runner/gitlab-runner.yaml`, siehe
   `scripts/flux-render-artifact.sh`) → Flux appliziert den SealedSecret (der
   `sealed-secrets`-Controller entschluesselt ihn zum echten Secret
   `gitlab-runner-secret`) und reconciled danach `flux-gitlab-runner`.
5. Erfolg pruefen:
   ```bash
   kubectl --context fleet get secret gitlab-runner-secret -n gitlab-runner
   kubectl --context fleet get kustomization flux-gitlab-runner -n flux-system
   kubectl --context fleet get pods -n gitlab-runner -o wide
   ```
   Der Pod-Status muss `Running` zeigen (nicht `CrashLoopBackOff`), die
   Kustomization `READY=True`.

**Pod-Status pruefen:**

```bash
kubectl --context fleet get pods -n gitlab-runner -o wide
```

Der Runner-Pod muss auf `gekko-hetzner-3` oder `gekko-hetzner-4` laufen —
**nie** auf einem `pk-hetzner-*`-Knoten (das waeren Control-Plane-Knoten, siehe
Design D2 zur Ressourcen-Umzaeunung). Fuer den Runner-Status in GitLab gilt ab
jetzt dieselbe Diagnose-Tabelle wie in Abschnitt 5.1, nur mit zwei Zeilen statt
einer — je eine pro Runner.

**Ressourcen-Umzaeunung.** Der Namespace `gitlab-runner` traegt vier
voneinander unabhaengige Grenzen (`k3d/gitlab-runner-stack/namespace.yaml`):
ResourceQuota, LimitRange, PriorityClass `ci-low` (Wert unter dem
Cluster-Default) und eine `nodeAffinity` (kein einfacher `nodeSelector` — der
kann kein ODER ueber die zwei Worker-Hostnamen ausdruecken). Details und
Begruendung: `openspec/changes/gitlab-ci-k8s-runner-cache/design.md`, D2.

## 9. Cache-Diagnose (Etappe 2, T012177)

Ein gruener Job sagt nichts ueber Cache-Treffer aus — zwei unabhaengige
Pruefungen:

- **fleet:**
  ```bash
  kubectl --context fleet logs -n gitlab-runner deploy/registry-cache | grep -c "proxy: pull"
  ```
  Die Zahl steigt bei jedem tatsaechlichen Upstream-Pull. Bleibt sie ueber
  mehrere Pipelines hinweg gleich, obwohl neue Jobs liefen, zieht irgendetwas
  direkt an `registry-cache` vorbei — ueblichster Grund: fehlende
  containerd-Mirror-Konfiguration (siehe unten).
- **PK-Desktop:**
  ```bash
  docker inspect gitlab-registry-cache --format '{{.State.Status}}'
  ```
  muss `running` sein. Treffer-Test: ein noch nie gezogenes Tag zweimal pullen
  (`docker rmi` dazwischen) — der zweite Pull muss spuerbar schneller sein,
  weil er aus `localhost:5000` statt aus dem Internet kommt.
- **Verbindung fehlt, keine Fehlermeldung:** Ein nicht erreichbarer Cache
  erzeugt laut Design (Error-Handling-Tabelle in
  `openspec/changes/gitlab-ci-k8s-runner-cache/design.md`) **keinen** Fehler —
  der Pull faellt still auf Upstream zurueck und wird nur langsamer (zurueck
  auf die Etappe-1-Werte 50/84/284 s). Das ist Absicht, macht die Diagnose aber
  genau deshalb auf einen Laufzeitvergleich angewiesen, nicht auf eine
  Fehlermeldung.
- **fleet-spezifische Falle — die eigentliche Betriebsluecke dieser Etappe:**
  Der Kubernetes-Executor zieht Job-Images ueber das **containerd des
  Knotens**, nicht ueber einen Docker-Daemon — anders als bei PK-Desktop reicht
  hier kein `daemon.json`. Damit `gekko-hetzner-3` und `gekko-hetzner-4`
  `registry-cache:5000` tatsaechlich als Mirror fuer `docker.io` nutzen,
  braucht jeder der beiden Knoten einen Eintrag in
  `/etc/rancher/k3s/registries.yaml` (k3s-native Mirror-Konfiguration) mit
  anschliessendem `systemctl restart k3s-agent`. **Das ist eine
  Host-Konfiguration ausserhalb von Git** — sie wird bei einem Knoten-Neuaufbau
  erneut faellig und ist durch keinen Guard automatisiert pruefbar. Dieses
  Runbook ist ihr einziger Aufbewahrungsort, analog zu den WireGuard-/UFW-
  Schritten in `infra-ops`. Beispiel-Eintrag:
  ```yaml
  mirrors:
    docker.io:
      endpoint:
        - "http://registry-cache.gitlab-runner.svc.cluster.local:5000"
  ```
  Ohne diesen Schritt laeuft der fleet-Runner korrekt, der Cache bleibt aber
  leer — ein Zustand, der nur an der obigen Log-Zeile auffaellt, nicht an einem
  Fehler.

**Lokaler Cache auf PK-Desktop einrichten:**

```bash
bash scripts/gitlab-runner-cache.sh --dry-run   # erst gegenlesen
bash scripts/gitlab-runner-cache.sh             # Echtlauf, braucht sudo
```

Startet (idempotent) den `registry:2`-Proxy-Container, mergt
`registry-mirrors` in `/etc/docker/daemon.json` und haengt
`pull_policy = ["if-not-present"]` an den `[runners.docker]`-Block in
`/etc/gitlab-runner/config.toml` an.

## 10. Abgrenzung Etappe 2

- Keine automatische Umschaltung, kein Autoscaling der Runner — unveraendert
  Non-Goal.
- Kein Cache-Eviction-Mechanismus (Cron-GC, TTL) —
  `REGISTRY_STORAGE_DELETE_ENABLED=true` schafft nur die Voraussetzung fuer
  eine spaetere manuelle oder automatisierte Bereinigung.
- Die containerd-Mirror-Konfiguration auf den fleet-Worker-Knoten (Abschnitt 9)
  ist eine Host-Konfiguration ausserhalb von Git und wird ausschliesslich hier
  dokumentiert, nicht automatisiert.

## 11. Branch-Pipelines (Etappe 3, T012405)

Bis Etappe 2 spiegelte `mirror-to-gitlab.yml` ausschliesslich `main`. Seit Etappe 3
spiegelt er zusaetzlich die drei Arbeits-Praefixe `feature/`, `fix/` und `chore/`.
Der Grund ist strukturell, nicht kosmetisch: Eine Pipeline, die nur `main` sieht,
laeuft **nach** der Merge-Entscheidung und kann sie deshalb nicht informieren.

**Drei Annahmen aus den Abschnitten 1-10 gelten damit nicht mehr:**

| Bisher | Ab Etappe 3 |
|---|---|
| Ein Pipeline-Lauf pro Merge | Ein Lauf pro Push auf jeden Arbeits-Branch |
| Vorhersagbare Last | Last skaliert mit der Zahl aktiver Branches |
| Ein abgebrochener Lauf ist ein Befund | Abbrueche sind **Normalzustand** (`interruptible: true`) |

Der dritte Punkt ist der, an dem im Stoerfall Zeit verloren geht: Alle Etappe-3-Jobs
tragen `interruptible: true`. Folgt ein zweiter Push schnell auf den ersten, bricht
GitLab die ueberholte Pipeline ab. Im UI sieht das aus wie ein Fehlschlag, ist aber
das gewollte Verhalten — auf einem Runner, der laut Etappe-2-Messung 2-3x langsamer
ist als SaaS, ist belegte Kapazitaet fuer einen veralteten Stand der teuerste Zustand.

Geloeschte Branches werden mitgeloescht (Push mit leerem Quell-Ref auf dem
`delete`-Event). Bleibt auf GitLab ein Branch stehen, den GitHub nicht mehr hat, ist
das ein Hinweis auf einen fehlgeschlagenen Mirror-Lauf — nicht auf Aufraeumbedarf.

Bot-Branches (`renovate/`, `release-please--`) und Factory-Batch-Branches werden
bewusst **nicht** gespiegelt.

## 12. Diagnose: Diff-Basis (Etappe 3, T012405)

Die haeufigste neue Fehlerklasse ist ein Job, der scheitert, weil `origin/main` im
flachen Klon fehlt — **nicht**, weil ein Test rot ist. Die Fehlermeldung nennt dann
`ci-diff-base`, nicht den Test.

`scripts/ci-diff-base.sh` ist die einzige Fundstelle der Aufloesung. Seine Exit-Codes
sind bewusst unterschieden:

| Exit | Bedeutung | Reaktion |
|---|---|---|
| 0 | Basis auf stdout | — |
| 3 | Keine Basis anwendbar (`main`-Push) | Job nimmt die Vollmenge, kein Befund |
| 4 | Umgebung kaputt (kein `origin/main`) | Job bricht ab — hier liegt der Fehler |

Lokal reproduzieren:

```bash
CI_COMMIT_BRANCH=main bash scripts/ci-diff-base.sh; echo "rc=$?"          # erwartet 3
CI_COMMIT_BRANCH=feature/x bash scripts/ci-diff-base.sh; echo "rc=$?"     # erwartet 0
```

**Warum 3 und 4 nicht derselbe Code sind:** Der Aufrufer waehlt daraus die Testmenge.
Eine kaputte Umgebung, die als „keine Basis, also Vollmenge" gelesen wird, meldet gruen
fuer einen Commit, den nichts geprueft hat — und ein leerer Lauf ist genau der
Fehlschlag, der am wenigsten auffaellt.

## 13. Kapazitaet und Abgrenzung Etappe 3

Etappe 3 bringt sieben zusaetzliche Jobs, davon vier parallele Shards. Der
`fleet`-CP-Knoten `pk-hetzner-8` lag beim Etappe-2-Befund bei 96 % CPU-Requests.

**Erste Massnahme bei Stau ist die Umschaltung auf SaaS**, nicht das Abschalten von
Jobs: `CI_RUNNER_TAG` in der GitLab-Projekt-UI auf `saas-linux-small-amd64` setzen
(Abschnitt 4). Projekt-Variablen haben Vorrang vor der Datei-Variable, es braucht
also keinen Commit.

Nicht in Etappe 3:

- **Kein Gate-Flip.** Kein GitLab-Ergebnis ist als Required Check hinterlegt, kein
  `ci.yml`-Job abgeschaltet. Der Guard
  `tests/spec/ci-cd/gitlab-parallel-non-blocking.bats` haelt das fest.
- **Keine Verlagerung von Review oder Merge.** Branches entstehen weiter auf GitHub;
  GitLab bleibt Push-Ziel, nie zweites schreibbares Origin.
- **Kein Laufzeit-Budget als Gate.** Ob die Kapazitaet fuer einen Flip reicht, ist
  eine Messung, die erst der Parallelbetrieb dieser Etappe ermoeglicht.

## 14. Warum der lokale Runner trotz Etappe 2 langsam blieb (T012410)

Etappe 2 (T012177) lieferte `scripts/gitlab-runner-cache.sh` gegen den gemessenen Befund
„self-hosted 2–3× langsamer als SaaS, Ursache Image-Pull je Job". Das Werkzeug wurde
ausgeführt — und `pull_policy` war danach trotzdem nicht gesetzt. **Fünf Defekte in einer
Kette**, jeder für sich still:

| # | Defekt | Wirkung |
|---|---|---|
| 1 | `[ -f /etc/gitlab-runner/config.toml ]` unprivilegiert | Verzeichnis ist `0700 root` → Test **immer** falsch → Schritt übersprungen, Meldung „Runner noch nicht registriert?" |
| 2 | `sudo systemctl restart docker` ungeschützt, **vor** dem `pull_policy`-Schritt | Auf Docker-Desktop-/rootless-Hosts Abbruch unter `set -e`, bevor der wertvollste Schritt läuft |
| 3 | `daemon.json`-Merge meldet Erfolg | Unter Docker Desktop **wirkungslos** — der Daemon liest von der Windows-Seite |
| 4 | awk-Insert mit globalem `!inserted` | Trifft nur den **ersten** `[runners.docker]`-Block → Einstellung landet beim falschen Runner |
| 5 | Idempotenz-Prüfung auf erste Fundstelle | Meldet „bereits gesetzt", sobald **irgendein** Block sie hat → der fehlende bekommt sie nie |

**Die gemeinsame Eigenschaft ist die eigentliche Lehre:** Jeder dieser Defekte erzeugt eine
**Erfolgsmeldung**. Keiner erzeugt einen Fehlschlag. Das Skript berichtete durchweg „✓", während
faktisch nichts passierte — und eine Erfolgsmeldung über eine wirkungslose Änderung ist
schädlicher als ein Fehler, weil sie die Ursachensuche an der falschen Stelle beendet.

Defekt 4 und 5 zusammen ergaben einen **stabilen** Fehlzustand: Zeile im falschen Runner,
Erfolgsmeldung, unveränderte Laufzeit — und ein Wiederholen des Laufs heilte nichts.

### Nachprüfen, ob es diesmal wirklich wirkt

Nicht der Skript-Ausgabe glauben, sondern die Datei lesen — sie ist nur mit `sudo` lesbar:

```bash
sudo awk '/^\[\[runners\]\]/{blk++} /^  name = /{n=$0} /pull_policy/{print "Block " blk n}' \
  /etc/gitlab-runner/config.toml
```

Erwartet: **genau eine** Zeile je registriertem Runner. Zwei Zeilen für denselben Block sind ein
doppelter TOML-Key und damit ein Parse-Fehler.

TOML-Gültigkeit gegenprüfen:

```bash
sudo cat /etc/gitlab-runner/config.toml | python3 -c "
import sys,tomllib; d=tomllib.loads(sys.stdin.read())
[print(r.get('name'),'->',r.get('docker',{}).get('pull_policy')) for r in d['runners']]"
```

### Konfiguration übernehmen, ohne laufende Jobs zu reißen

`systemctl restart gitlab-runner` bricht laufende Jobs ab. `gitlab-runner` lädt seine
Konfiguration auf **SIGHUP** neu:

```bash
sudo kill -HUP "$(pgrep -f 'gitlab-runner run')"
```

### Docker Desktop: der Registry-Mirror gehört auf die Windows-Seite

`/etc/docker/daemon.json` in der WSL-Distro ist dort wirkungslos. Der Mirror wird eingetragen
unter **Docker Desktop → Settings → Docker Engine**:

```json
{ "registry-mirrors": ["http://localhost:5000"] }
```

Danach Docker Desktop neu starten — das reißt laufende Container mit, also nicht während eines
CI-Laufs oder eines aktiven k3d-Clusters. `pull_policy` wirkt **unabhängig davon** und ist der
größere Hebel: Es verhindert den Pull ganz, statt ihn nur zu beschleunigen.

## 15. Werkzeug-Luecken zwischen ubuntu-latest und den GitLab-Images (T012405)

Die drei teuersten Fehler beim Aufbau der Job-Paritaet waren allesamt dieselbe Klasse: **ein
Werkzeug, das GitHubs `ubuntu-latest` vorinstalliert mitbringt und das GitLab-Image nicht hat.**
Auf der GitHub-Seite ist die Abhaengigkeit unsichtbar — es gibt dort keine Installationszeile,
die man beim Uebertragen vermissen koennte.

| Werkzeug | Wer braucht es | Symptom bei Fehlen |
|---|---|---|
| GNU `parallel` | `bats -j` (jedes `task test:*:changed`) | `1..1159` gemeldet, **null** Tests gefahren |
| `kustomize` (eigenes Binary) | `scripts/flux-render-artifact.sh` | Renderer-Tests rot, ohne Bezug zum Testinhalt |
| `kubectl` | T002465-Netzwerkpolicy-Tests | dito |

**Der `parallel`-Fall ist der lehrreiche.** Er scheiterte nicht beim Aufruf, sondern **nach** der
Plan-Ankuendigung: bats meldete 1159 Tests und fuehrte keinen aus. Dass der Job trotzdem rot
wurde, verdankt sich einer Warnung in bats — nicht der Pipeline-Konstruktion. Es ist damit die
eine Fehlerform, die als Erfolg durchgehen *kann*, und genau der Fall, fuer den die
Etappe-1-Regel „leerer Lauf gilt als Fehlschlag" existiert.

**Diagnose-Faustregel:** Scheitert ein GitLab-Job an Tests, die lokal und auf GitHub gruen sind,
zuerst nach `command not found` im Trace suchen — nicht nach der Testlogik. Der Trace ist ohne
Token ueber die Web-Route lesbar:

```bash
curl -sL "https://gitlab.com/<namespace>/<projekt>/-/jobs/<job-id>/raw" | grep -i "command not found"
```

Die API-Route `/api/v4/projects/<id>/jobs/<job-id>/trace` verlangt dagegen ein Token (401).

`tests/spec/ci-cd/gitlab-job-coverage.bats` haelt die `parallel`-Abhaengigkeit inzwischen als
Guard fest: jeder Job, der bats parallel faehrt, muss sie installieren.
