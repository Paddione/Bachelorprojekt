# GitLab-Runner: Betrieb und Fallback-Umschaltung

_Etappe 1 der GitLab-CI-Migration (T011790). GitHub Actions bleibt SSOT und
Merge-Gate — GitLab ist ein sekundaerer, nicht blockierender Spiegel. Architektur
und Entscheidungen: `openspec/changes/gitlab-ci-migration-stage1/design.md`._

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

## 7. Abgrenzung

Diese Etappe betreibt ausschliesslich den lokalen Docker-Executor auf einem
einzelnen self-hosted Host. Ein Kubernetes-Executor auf `fleet` als zweiter
self-hosted Runner ist fuer Etappe 2 vorgesehen (siehe design.md, "Offene Punkte
fuer Etappe 2"). Diese Etappe migriert weder das Merge-Gate noch weitere
GitHub-Workflows (Build, E2E, Release, Factory) — siehe design.md, "Non-Goals".
