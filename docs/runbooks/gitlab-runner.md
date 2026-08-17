# GitLab-Runner: Betrieb und Fallback-Umschaltung

_Etappe 1 der GitLab-CI-Migration (T011790). GitHub Actions bleibt SSOT und
Merge-Gate — GitLab ist ein sekundaerer, nicht blockierender Spiegel. Architektur
und Entscheidungen: `openspec/changes/gitlab-ci-migration-stage1/design.md`._

## 1. Ersteinrichtung

1. Im GitLab-Projekt einen neuen Runner anlegen (Project Settings → CI/CD →
   Runners → "New project runner"), Tag `bachelorprojekt-local` vergeben und den
   `glrt-`-Authentication-Token kopieren. Der aeltere Registration-Token-Fluss
   funktioniert seit GitLab 16 nicht mehr — nur der Authentication-Token zaehlt.
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

## 2. Fallback-Umschaltung — der eigentliche Zweck dieses Runbooks

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

## 3. Diagnose — woran erkennt man einen Runner-Ausfall

Ein ausgefallener self-hosted Runner sieht **nicht** wie ein Fehlschlag aus:
Jobs bleiben `pending` statt zu scheitern, weil GitLab wartet, bis ein Runner mit
passendem Tag verfuegbar wird. Anzeichen:

- Ein oder mehrere Jobs stehen laenger als ein paar Minuten auf `pending`,
  waehrend andere Jobs (falls vorhanden) normal starten.
- GitLab-Projekt → Settings → CI/CD → Runners zeigt den Runner mit Tag
  `bachelorprojekt-local` als "offline" oder "stale" (kein Heartbeat).
- Auf dem Runner-Host selbst: `sudo gitlab-runner status` bzw. `systemctl status
  gitlab-runner` meldet den Dienst als nicht laufend.

Ein haengender Job ist deshalb der Trigger fuer Schritt 2, nicht ein rotes X.

## 4. Warum die Umschaltung manuell ist

Ein automatisches Ausweichen auf Shared Runner wuerde den Ausfall des
self-hosted Runners verbergen — die Pipeline liefe unauffaellig weiter, nur auf
anderer Hardware. Ein Ausfall, den niemand bemerkt, wird nicht behoben. Der
Rueckfall gehoert deshalb bewusst ins Runbook und nicht in eine Selbstheilung
(design.md D2).

## 5. Abgrenzung

Diese Etappe betreibt ausschliesslich den lokalen Docker-Executor auf einem
einzelnen self-hosted Host. Ein Kubernetes-Executor auf `fleet` als zweiter
self-hosted Runner ist fuer Etappe 2 vorgesehen (siehe design.md, "Offene Punkte
fuer Etappe 2"). Diese Etappe migriert weder das Merge-Gate noch weitere
GitHub-Workflows (Build, E2E, Release, Factory) — siehe design.md, "Non-Goals".
