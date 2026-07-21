# collabora-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

## Purpose

Collabora Online (coolwsd) ist die LibreOffice-basierte Online-Office-Komponente der Workspace-Plattform. Sie wird über das WOPI-Protokoll an Nextcloud angebunden und läuft in einem dedizierten privilegierten Namespace (`workspace-office`), der von den übrigen Workloads isoliert ist.

---

## Requirements

### Requirement: Dedicated Privileged Namespace

The system SHALL run Collabora Online in a dedicated `workspace-office` namespace with Pod Security Admission level `privileged`, isolated from the `workspace` namespace that hosts all other workloads.

#### Scenario: Collabora Pod startet mit benötigten Capabilities

- **GIVEN** das `workspace-office` Namespace ist mit PSA `privileged` annotiert
- **WHEN** das Collabora Deployment angewendet wird
- **THEN** startet der `collabora` Pod mit den Capabilities `SYS_ADMIN`, `MKNOD`, `SETUID`, `SETGID` und AppArmor/seccomp auf `Unconfined`
- **AND** der Pod läuft als non-root User (uid 1001, `cool`)

#### Scenario: Baseline PSA verhindert SYS_ADMIN im workspace Namespace

- **GIVEN** ein Workload im `workspace` Namespace beantragt `SYS_ADMIN`
- **WHEN** Kubernetes die Pod-Erstellung validiert
- **THEN** lehnt die PSA-Kontrolle die Erstellung ab und Collabora wird nicht in `workspace` deployed

---

### Requirement: Custom Setcap Image

The system SHALL use a custom-built Collabora image (`ghcr.io/paddione/collabora-code`) that applies file capabilities (`setcap`) to `coolwsd`, `coolforkit-caps`, and `coolforkit-ns`, enabling bind-mount jail creation by the non-root `cool` user.

#### Scenario: Bind-Mount-Jail ohne Root

- **GIVEN** das Custom-Image ist deployed
- **WHEN** coolwsd eine neue Dokument-Session startet
- **THEN** nutzt coolwsd den `coolforkit-caps`-Pfad (nicht den langsameren `coolforkit-ns`-Pfad)
- **AND** die Collabora Admin-Console zeigt keinen roten "Langsame Einrichtung des Kit-Jails" Fehler

#### Scenario: Multi-Arch Image Build

- **GIVEN** ein Commit ändert `docker/collabora/Dockerfile`
- **WHEN** der CI-Workflow `build-collabora.yml` läuft
- **THEN** wird ein multi-arch Image (`linux/amd64`, `linux/arm64`) gebaut und nach `ghcr.io/paddione/collabora-code:<tag>-setcap` gepusht

---

### Requirement: WOPI Integration Contract with Nextcloud

The system SHALL wire Nextcloud to Collabora exclusively via the internal cluster-DNS address `http://collabora.workspace-office.svc.cluster.local:9980` as the `wopi_url`, while exposing the public editor URL via `public_wopi_url` at `https://office.<PROD_DOMAIN>`.

#### Scenario: Nextcloud öffnet Dokument in Collabora

- **GIVEN** `wopi_url` ist auf `http://collabora.workspace-office.svc.cluster.local:9980` gesetzt
- **AND** `public_wopi_url` ist auf `https://office.<PROD_DOMAIN>` gesetzt
- **WHEN** ein Nextcloud-User ein Dokument öffnet (via `richdocuments` App)
- **THEN** lädt Nextcloud den Collabora-Editor-iframe von `office.<PROD_DOMAIN>`
- **AND** kommuniziert intern über WOPI auf Port 9980 direkt im Cluster-Netz

#### Scenario: WOPI Allowlist schränkt Callback-Quellen ein

- **GIVEN** `wopi_allowlist` ist auf `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` konfiguriert
- **WHEN** Collabora einen WOPI-Callback zu Nextcloud macht
- **THEN** akzeptiert Nextcloud nur Anfragen aus den privaten RFC-1918-Bereichen

---

### Requirement: Dynamic WOPI Discovery per Request Host

The system SHALL deploy Collabora with an empty `COLLABORA_SERVER_NAME`, so that coolwsd derives the `urlsrc` hostname in WOPI discovery responses dynamically from the incoming HTTP `Host` header.

#### Scenario: Jede Brand liefert korrekte Discovery-URL

- **GIVEN** `COLLABORA_SERVER_NAME` ist leer deployed
- **WHEN** `GET https://office.mentolder.de/hosting/discovery` aufgerufen wird
- **THEN** enthalten alle `urlsrc`-Attribute `office.mentolder.de` (nicht `office.korczewski.de`)
- **AND** `GET https://office.korczewski.de/hosting/discovery` liefert `urlsrc`-Attribute mit `office.korczewski.de`

#### Scenario: Kein hardcodierter server_name in Deploy-Pfaden

- **GIVEN** ein Deploy-Task setzt `COLLABORA_SERVER_NAME`
- **WHEN** der Taskfile-Deploy ausgeführt wird
- **THEN** ist `COLLABORA_SERVER_NAME` immer leer (`""`) — nie auf einen Brand-Hostnamen gesetzt

---

### Requirement: Dual-Brand Ingress on Single Deployment

The system SHALL serve both brands (`office.mentolder.de` and `office.korczewski.de`) from the single `collabora` Deployment in `workspace-office` via two separate Ingress resources, each with their own TLS secret and Traefik middleware chain.

#### Scenario: Fleet-Deploy setzt beide Ingress-Hostnamen

- **GIVEN** `fleet:deploy:shared-services` wird ausgeführt
- **WHEN** der Deploy abgeschlossen ist
- **THEN** existieren `office-ingress` (mentolder) und `office-ingress-korczewski` im `workspace-office` Namespace
- **AND** beide Ingresses haben einen korrekten TLS-Secret-Verweis auf ihren jeweiligen Brand

#### Scenario: Single-Brand-Deploy ist für Prod blockiert

- **GIVEN** ein Operator ruft `workspace:office:deploy` mit einem Prod-Kontext auf
- **WHEN** der Task ausgeführt wird
- **THEN** warnt oder blockiert der Task mit einem Hinweis auf `fleet:deploy:shared-services`

---

### Requirement: Secret Sync from Main Namespace

The system SHALL provision the `collabora-secrets` Secret in `workspace-office` by syncing `COLLABORA_ADMIN_PASSWORD` from the `workspace-secrets` Secret in the brand's `workspace` namespace via `task workspace:office:sync-secret`.

#### Scenario: Secret-Sync nach Deploy

- **GIVEN** das `workspace-office` Namespace existiert und `workspace-secrets` ist in `workspace` verfügbar
- **WHEN** `task workspace:office:sync-secret ENV=<env>` ausgeführt wird
- **THEN** wird `collabora-secrets` in `workspace-office` mit dem aktuellen Passwort überschrieben
- **AND** das Collabora Deployment wird neu gestartet und läuft danach healthy

#### Scenario: Dev-Default verhindert keine Inbetriebnahme

- **GIVEN** das Deployment startet erstmalig mit dem Placeholder-Passwort `devcollaboraadmin`
- **WHEN** noch kein Sync-Task ausgeführt wurde
- **THEN** startet Collabora trotzdem und die Admin-Console ist mit dem Placeholder-Passwort erreichbar

---

### Requirement: Network Policy Restricts WOPI Egress

The system SHALL enforce a Kubernetes NetworkPolicy that allows Nextcloud pods to reach the `workspace-office` namespace on port 9980 (WOPI), while not granting unrestricted cross-namespace egress.

#### Scenario: Nextcloud kann WOPI-Requests senden

- **GIVEN** die `allow-collabora-egress` NetworkPolicy ist aktiv
- **WHEN** Nextcloud einen WOPI-Request an `collabora.workspace-office.svc.cluster.local:9980` sendet
- **THEN** lässt die NetworkPolicy den TCP-Traffic durch

#### Scenario: Andere Pods können Collabora nicht direkt erreichen

- **GIVEN** ein anderer Pod im `workspace` Namespace ohne `app: nextcloud` Label
- **WHEN** er versucht Port 9980 im `workspace-office` Namespace zu erreichen
- **THEN** blockiert die NetworkPolicy den Traffic (kein explizit erlaubter Egress)

---

### Requirement: Health Probes and Resource Limits

The system SHALL configure readiness and liveness probes on port 9980 and enforce memory limits (max 1 Gi) to prevent uncontrolled resource consumption on the shared fleet cluster.

#### Scenario: Collabora ist erst nach erfolgreichem Readiness-Check im Service

- **GIVEN** Collabora startet neu (z.B. nach Secret-Sync-Rollout)
- **WHEN** die ersten 30 Sekunden (`initialDelaySeconds`) vergangen sind
- **THEN** prüft Kubernetes alle 10 Sekunden `GET /` auf Port 9980
- **AND** Traffic wird nur geroutet, wenn der Probe `200 OK` zurückgibt

#### Scenario: Memory-Limit greift bei Speicherüberschreitung

- **GIVEN** Collabora überschreitet das Memory-Limit von 1 Gi
- **WHEN** der OOM-Killer des Kernels anspringt
- **THEN** wird der Pod von Kubernetes neu gestartet ohne dass andere Namespace-Workloads betroffen sind

---

### Requirement: All COLLABORA_SERVER_NAME Taskfile Assignments Are Empty

The system SHALL ensure that every occurrence of `COLLABORA_SERVER_NAME=` in `Taskfile.yml` uses the empty form (`COLLABORA_SERVER_NAME=""`), so that no deploy call site accidentally hardcodes a brand hostname and breaks the dynamic Host-header resolution for the other brand.

#### Scenario: Beide Deploy-Pfade verwenden die leere Form

- **GIVEN** `Taskfile.yml` enthält mehrere Stellen, an denen `COLLABORA_SERVER_NAME` gesetzt wird (z.B. `workspace:office:deploy` und `fleet:deploy:shared-services`)
- **WHEN** alle Vorkommen von `export COLLABORA_SERVER_NAME=` im Taskfile gezählt werden
- **THEN** ist die Anzahl der Vorkommen mit leerem Wert (`COLLABORA_SERVER_NAME=""`) identisch zur Gesamtanzahl aller Zuweisungen

#### Scenario: Neuer Deploy-Task erbt die Leerwert-Konvention

- **GIVEN** ein Entwickler fügt einen neuen Deploy-Task hinzu, der `COLLABORA_SERVER_NAME` setzt
- **WHEN** der Test `every COLLABORA_SERVER_NAME assignment in Taskfile is the empty form` ausgeführt wird
- **THEN** schlägt der Test fehl, wenn der neue Task einen nicht-leeren Wert verwendet
- **AND** der Entwickler muss `COLLABORA_SERVER_NAME=""` verwenden, damit der Test wieder grün wird

---

### Requirement: Manifest Env-Var Plumbing for server_name

The system SHALL wire the Collabora manifest's `server_name` configuration value directly from the `${COLLABORA_SERVER_NAME}` environment variable, so that renaming the env var in the Taskfile does not silently render the empty-value fix ineffective.

#### Scenario: Manifest referenziert die korrekte Umgebungsvariable

- **GIVEN** die Datei `k3d/office-stack/collabora.yaml` ist auf dem Filesystem vorhanden
- **WHEN** der Manifest-Inhalt auf das Muster `value: "${COLLABORA_SERVER_NAME}"` geprüft wird
- **THEN** existiert genau diese Zuweisung im Manifest
- **AND** der `server_name`-Wert von coolwsd wird zur Deploy-Zeit durch `envsubst` auf den leeren String gesetzt

#### Scenario: Umbenennung der Env-Var wird durch Test erkannt

- **GIVEN** jemand benennt `COLLABORA_SERVER_NAME` in der Manifest-Template-Datei um (z.B. zu `COLLABORA_HOST_NAME`)
- **WHEN** der Regressionstest `collabora manifest still wires server_name from COLLABORA_SERVER_NAME` läuft
- **THEN** schlägt der Test fehl und signalisiert, dass die Env-Var-Verdrahtung gebrochen ist

---

### Requirement: Fleet Shared-Services Sets Dual-Brand Ingress Hosts

The system SHALL configure the `fleet:deploy:shared-services` Taskfile task with a non-empty `COLLABORA_HOST_2` variable, ensuring both brand hostnames are written into the shared Collabora Ingress resource and neither brand's host is silently dropped.

#### Scenario: fleet:deploy:shared-services trägt beide Hosts ein

- **GIVEN** `fleet:deploy:shared-services` wird ausgeführt
- **WHEN** die Task-Definition in `Taskfile.yml` ausgewertet wird
- **THEN** ist `COLLABORA_HOST_2` auf einen nicht-leeren Wert gesetzt (z.B. `office.korczewski.de`)
- **AND** das resultierende Ingress-Manifest enthält beide Brand-Hostnamen

#### Scenario: Fehlender COLLABORA_HOST_2 wird durch Test erkannt

- **GIVEN** `COLLABORA_HOST_2` wird versehentlich aus `fleet:deploy:shared-services` entfernt oder auf leer gesetzt
- **WHEN** der Test `T000478: fleet:shared-services sets COLLABORA_HOST_2 to a non-empty value` ausgeführt wird
- **THEN** schlägt der Test fehl und verhindert, dass der Deploy die zweite Brand-Domain aus dem Ingress löscht

---

### Requirement: Spec-BATS smoke coverage
The system SHALL provide an initial BATS test file covering the collabora-integration specification so that CI tracks its test presence.

#### Scenario: Initial smoke test passes
- **GIVEN** the `tests/spec/collabora-integration.bats` file exists
- **WHEN** `bats tests/spec/collabora-integration.bats` runs
- **THEN** the smoke test exits successfully

## Testszenarien

<!-- merged from BATS unit tests and Playwright e2e tests -->

### Requirement: Deploy-Time Contract: Empty COLLABORA_SERVER_NAME
<!-- bats: collabora-wopi-discovery.bats | bats: collabora-wopi-single-brand-guard.bats -->

The system SHALL ensure that every Taskfile deploy path sets `COLLABORA_SERVER_NAME` to the empty string, so that coolwsd derives the WOPI discovery `urlsrc` hostname dynamically from the incoming HTTP `Host` header.

#### Scenario: Kein hardcodierter Brand-Host in COLLABORA_SERVER_NAME *(BATS)*
- **GIVEN** `Taskfile.yml` ist auf dem Filesystem vorhanden
- **WHEN** nach dem Muster `export COLLABORA_SERVER_NAME="office.${PROD_DOMAIN}"` gesucht wird
- **THEN** liefert grep keinen Treffer — kein Deploy-Pfad setzt einen hardcodierten Brand-Hostnamen

#### Scenario: Mindestens eine leere COLLABORA_SERVER_NAME Zuweisung existiert *(BATS)*
- **GIVEN** `Taskfile.yml` enthält einen oder mehrere Deploy-Tasks
- **WHEN** nach `export COLLABORA_SERVER_NAME=""` gesucht wird
- **THEN** gibt es mindestens einen Treffer (Anzahl ≥ 1)

#### Scenario: Alle COLLABORA_SERVER_NAME Zuweisungen sind die leere Form *(BATS)*
- **GIVEN** `Taskfile.yml` enthält N Zuweisungen von `COLLABORA_SERVER_NAME=`
- **WHEN** die Gesamtanzahl mit der Anzahl leerer Formen verglichen wird
- **THEN** sind beide Zahlen identisch — kein Deploy-Pfad weicht ab

#### Scenario: COLLABORA_SERVER_NAME bleibt in ALLEN Deploy-Pfaden leer (T000478) *(BATS)*
- **GIVEN** `Taskfile.yml` enthält sowohl `workspace:office:deploy` als auch `fleet:deploy:shared-services`
- **WHEN** alle Vorkommen von `export COLLABORA_SERVER_NAME=` gezählt werden
- **THEN** ist jede Zuweisung die leere Form `COLLABORA_SERVER_NAME=""`

---

### Requirement: Manifest Env-Var Wiring (Regression Guard)
<!-- bats: collabora-wopi-discovery.bats -->

The system SHALL wire the `server_name` configuration in `k3d/office-stack/collabora.yaml` directly from `${COLLABORA_SERVER_NAME}`, so that renaming the env var in the Taskfile cannot silently make the empty-value fix ineffective.

#### Scenario: Manifest referenziert COLLABORA_SERVER_NAME korrekt *(BATS)*
- **GIVEN** `k3d/office-stack/collabora.yaml` ist auf dem Filesystem vorhanden
- **WHEN** nach dem Muster `value: "${COLLABORA_SERVER_NAME}"` gesucht wird
- **THEN** existiert genau diese Zeichenkette im Manifest — die Env-Var-Verdrahtung ist intakt

---

### Requirement: Single-Brand Deploy Guard on Prod
<!-- bats: collabora-wopi-single-brand-guard.bats -->

The system SHALL ensure that the `workspace:office:deploy` Taskfile task contains a prod-safety guard that warns or blocks when run against a prod context, directing operators to use `fleet:deploy:shared-services` instead.

#### Scenario: workspace:office:deploy enthält Prod-Schutz *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `workspace:office:deploy`
- **WHEN** dessen Definition nach Fleet/Prod/Shared/Dev-only-Hinweisen durchsucht wird
- **THEN** gibt es mindestens einen Treffer — der Task trägt einen Hinweis oder Block für Prod-Kontexte

#### Scenario: fleet:deploy:shared-services setzt COLLABORA_HOST_2 auf einen nicht-leeren Wert (T000478) *(BATS)*
- **GIVEN** `Taskfile.yml` enthält den Task `fleet:shared-services`
- **WHEN** dessen Definition nach `COLLABORA_HOST_2=` durchsucht wird
- **THEN** ist der Wert nicht leer — beide Brand-Hostnamen werden in das Ingress-Manifest geschrieben

---

### Requirement: Headless Browser Bypass via ?who= URL Parameter
<!-- bats: helper-collab-headless.bats -->

The system SHALL allow headless/automated browsers (e.g. Playwright MCP) to bypass the blocking `window.prompt()` on the brainstorm board by passing a `?who=<name>` URL parameter, so that screenshots and automation can proceed without timing out on an unhandled dialog (T000542).

#### Scenario: ?who=AutoBot überspringt prompt() und setzt den Namen *(BATS)*
- **GIVEN** der Mock-Runner wird mit dem URL-Parameter `?who=AutoBot` aufgerufen
- **WHEN** die Initialisierungslogik ausgeführt wird
- **THEN** wird `who` auf `AutoBot` gesetzt und `promptCalled` ist `false`

#### Scenario: Kein URL-Parameter und kein gecachter Name — prompt() wird aufgerufen *(BATS)*
- **GIVEN** der Mock-Runner wird ohne URL-Parameter und ohne localStorage-Eintrag aufgerufen
- **WHEN** die Initialisierungslogik ausgeführt wird
- **THEN** ist `promptCalled` `true` — das normale Verhalten bleibt erhalten

#### Scenario: Vorhandener localStorage-Name überspringt prompt() *(BATS)*
- **GIVEN** der Mock-Runner wird ohne URL-Parameter aufgerufen, aber mit `CachedUser` im localStorage
- **WHEN** die Initialisierungslogik ausgeführt wird
- **THEN** wird `who` auf `CachedUser` gesetzt und `promptCalled` ist `false` (Regression Guard)

#### Scenario: ?who= Wert wird auf 24 Zeichen begrenzt *(BATS)*
- **GIVEN** der Mock-Runner wird mit `?who=AAAAABBBBBCCCCCDDDDDEEEEE` (25 Zeichen) aufgerufen
- **WHEN** der Name gesetzt wird
- **THEN** ist die Länge des resultierenden Namens ≤ 24 Zeichen

---

### Requirement: Superpowers Collab Patch is Idempotent
<!-- bats: superpowers-collab-patch.bats -->

The system SHALL ensure that `scripts/superpowers-collab-patch.sh` applies the collaborative brainstorm extension (collab block, who-tag, server relay) to the Superpowers plugin files exactly once, and that re-running the script leaves the files unchanged.

#### Scenario: Collab-Patch appliziert alle drei Blöcke *(BATS)*
- **GIVEN** die Superpowers-Plugin-Dateien `helper.js` und `server.cjs` sind im erwarteten Pfad vorhanden
- **WHEN** `superpowers-collab-patch.sh` ausgeführt wird
- **THEN** enthält `helper.js` den `brainstorm-collab v1`-Block und `event.who`-Tag; `server.cjs` enthält `broadcast(event)`

#### Scenario: Mehrfaches Ausführen ist idempotent *(BATS)*
- **GIVEN** der Patch wurde bereits einmal angewendet
- **WHEN** `superpowers-collab-patch.sh` ein zweites Mal ausgeführt wird
- **THEN** sind `helper.js` und `server.cjs` bitweise identisch zum ersten Ergebnis — kein Drift

#### Scenario: --check meldet korrekten Status vor und nach Patch *(BATS)*
- **GIVEN** der Patch wurde noch nicht angewendet
- **WHEN** `superpowers-collab-patch.sh --check` ausgeführt wird
- **THEN** ist der Exit-Code ungleich 0; nach erfolgtem Patch ist der Exit-Code 0

---

### Requirement: Superpowers Submit Patch is Idempotent and Anchor-Safe
<!-- bats: superpowers-submit-patch.bats -->

The system SHALL ensure that `scripts/superpowers-submit-patch.sh` applies the submit listener extension (helper block + server submit listener + plan-review fields) to the Superpowers plugin files in an anchor-safe, idempotent manner, aborting with exit code 2 when required anchors are missing or duplicated.

#### Scenario: Submit-Patch appliziert alle Blöcke *(BATS)*
- **GIVEN** `helper.js` und `server.cjs` enthalten die erforderlichen Anker
- **WHEN** `superpowers-submit-patch.sh` ausgeführt wird
- **THEN** enthält `helper.js` `brainstorm-submit v1` und `__brainstormSubmit`; `server.cjs` enthält `brainstorm-submit-server v1`, `startSubmitListener`, `127.0.0.1`, `__BRAINSTORM_SUBMIT_PORT` und `submission.json`

#### Scenario: Mehrfaches Ausführen ist idempotent *(BATS)*
- **GIVEN** der Submit-Patch wurde bereits angewendet
- **WHEN** `superpowers-submit-patch.sh` erneut ausgeführt wird
- **THEN** sind `helper.js` und `server.cjs` unverändert — kein doppelter Block

#### Scenario: --check meldet korrekten Status *(BATS)*
- **GIVEN** der Submit-Patch wurde noch nicht angewendet
- **WHEN** `superpowers-submit-patch.sh --check` ausgeführt wird
- **THEN** ist der Exit-Code 1; nach erfolgtem Patch ist der Exit-Code 0

#### Scenario: Fehlende Anker führen zu Abbruch mit Exit-Code 2 *(BATS)*
- **GIVEN** `server.cjs` enthält keine der erwarteten Anker (gedriftete Datei)
- **WHEN** `superpowers-submit-patch.sh` ausgeführt wird
- **THEN** bricht das Skript mit Exit-Code 2 ab — kein blindes Patchen einer inkompatiblen Datei

#### Scenario: Plan-Review-Felder werden appliziert *(BATS)*
- **GIVEN** `server.cjs` enthält den `handleSub`-Anker für den Plan-Review-Block
- **WHEN** `superpowers-submit-patch.sh` ausgeführt wird
- **THEN** enthält `server.cjs` `plan-review-server v1`, `annotations:`, `verdict:` und `ev.kind === 'plan-review'`

#### Scenario: --check besteht nach vollständigem Patch *(BATS)*
- **GIVEN** `server.cjs` enthält alle Haupt-Anker inklusive den Plan-Review-`handleSub`-Block
- **WHEN** `superpowers-submit-patch.sh` und danach `--check` ausgeführt wird
- **THEN** ist der Exit-Code 0 — alle Blöcke wurden korrekt erkannt

---

### Requirement: File Management API Authentication (FA-04)
<!-- e2e: fa-04-files.spec.ts -->

The system SHALL protect all portal and admin file management API endpoints with authentication, returning HTTP 401 or 403 for unauthenticated requests.

#### Scenario: Portal-Projekte-Endpunkt erfordert Authentifizierung *(E2E)*
- **GIVEN** ein unauthentifizierter HTTP-Client
- **WHEN** `GET /api/portal/projekte` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Datei-Upload-Endpunkt erfordert Admin-Auth *(E2E)*
- **GIVEN** ein unauthentifizierter HTTP-Client
- **WHEN** `POST /api/admin/projekte/attachments/upload` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Datei-Lösch-Endpunkt erfordert Admin-Auth *(E2E)*
- **GIVEN** ein unauthentifizierter HTTP-Client
- **WHEN** `POST /api/admin/projekte/attachments/delete` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Projekt-Erstell-Endpunkt erfordert Admin-Auth *(E2E)*
- **GIVEN** ein unauthentifizierter HTTP-Client
- **WHEN** `POST /api/admin/projekte/create` aufgerufen wird
- **THEN** antwortet der Server mit HTTP 401 oder 403

#### Scenario: Portal-Projekte-Seite leitet unauthentifizierte Nutzer um *(E2E)*
- **GIVEN** ein unauthentifizierter Browser-Client
- **WHEN** `/portal?section=projekte` aufgerufen wird
- **THEN** erfolgt eine Weiterleitung weg von `/portal` (z.B. zur Login-Seite)

---

### Requirement: Collaborative Whiteboard Service Health (FA-24)
<!-- e2e: fa-24-whiteboard.spec.ts -->

The system SHALL keep the collaborative whiteboard service (`board.localhost`) reachable and free of server-side errors, returning HTTP status < 500.

#### Scenario: Whiteboard-Service antwortet *(E2E)*
- **GIVEN** der Whiteboard-Service ist deployed und erreichbar unter `BOARD_URL`
- **WHEN** ein Browser `GET /` an `BOARD_URL` sendet
- **THEN** ist der HTTP-Status < 500 (Service antwortet, ggf. mit Redirect oder 200)

#### Scenario: Whiteboard gibt keinen Gateway-Error zurück *(E2E)*
- **GIVEN** der Whiteboard-Service und Traefik laufen
- **WHEN** ein Browser `GET /` an `BOARD_URL` sendet
- **THEN** ist der HTTP-Status weder 502 noch 503 — kein Upstream-Fehler

<!-- merged from change delta collabora-integration.md (cb4ecd91b90a) -->