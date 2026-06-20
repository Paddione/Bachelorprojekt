# collabora-integration

<!-- baseline SSOT — generiert aus Codebase-Analyse am 2026-06-20 -->

Collabora Online (coolwsd) ist die LibreOffice-basierte Online-Office-Komponente der Workspace-Plattform. Sie wird über das WOPI-Protokoll an Nextcloud angebunden und läuft in einem dedizierten privilegierten Namespace (`workspace-office`), der von den übrigen Workloads isoliert ist.

---

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
