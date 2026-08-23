# rustdesk-server

## Purpose

Definiert den Betrieb eines gemeinsamen RustDesk-Relay-Servers für beide Brands mit persistenten Client-IDs.

## Requirements

### Requirement: REQ-RUSTDESK-RELAY-001 — Gemeinsamer Relay-Server für beide Brands
Das System SHALL einen einzigen, gemeinsam betriebenen RustDesk-Relay (hbbs/hbbr)
bereitstellen, der von Clients unabhängig vom Brand (mentolder oder korczewski) unter
demselben Hostnamen erreichbar ist.

#### Scenario: Client verbindet sich unabhängig vom Brand
- **GIVEN** ein Client-Gerät mit installiertem RustDesk-Client
- **WHEN** sich der Client mit `rustdesk.mentolder.de` als ID-Server verbindet
- **THEN** akzeptiert derselbe Relay-Server sowohl mentolder- als auch
  korczewski-zugehörige Clients ohne getrennte Serverinstanzen

### Requirement: REQ-RUSTDESK-RELAY-002 — Stabile Client-IDs über Neustarts hinweg
Das System SHALL das ed25519-Keypair des ID-Servers (hbbs) persistent über
Pod-Neustarts und Rescheduling hinweg vorhalten, sodass bereits gepairte Client-IDs
nicht ungültig werden.

#### Scenario: Pod-Neustart invalidiert keine Client-IDs
- **GIVEN** ein Client ist bereits erfolgreich mit dem Relay gepairt
- **WHEN** der hbbs-Pod neu gestartet oder neu geplant wird
- **THEN** bleibt die Client-ID gültig, weil das Keypair aus der SealedSecret
  `rustdesk-secrets` und nicht aus einem ephemeren/neu generierten Zustand geladen wird

### Requirement: REQ-RUSTDESK-RELAY-003 — Relay-Fallback bei blockiertem P2P
Das System SHALL eine Verbindung über den Relay-Server (hbbr) herstellen können, wenn
eine direkte Peer-to-Peer-Verbindung zwischen zwei Clients (z. B. durch symmetrisches
NAT) nicht möglich ist.

#### Scenario: P2P schlägt fehl, Relay übernimmt
- **GIVEN** zwei Clients, von denen mindestens einer hinter symmetrischem NAT sitzt
- **WHEN** der direkte P2P-Verbindungsaufbau fehlschlägt
- **THEN** wird die Session automatisch über hbbr relayed, ohne dass der Nutzer manuell
  eingreifen muss

### Requirement: REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff

Das System SHALL die RustDesk-Web-Client-Ports (21118/tcp für hbbs, 21119/tcp für
hbbr) auf `${TURN_NODE}` öffnen, SHALL NOT diese Ports öffentlich ohne SSO-Gate
erreichbar machen, und SHALL Zugriff ausschließlich über den Hostnamen
`remote.mentolder.de` mit gültiger Pocket-ID-Session gewähren. `ufw` SHALL diese
Ports ausschließlich aus dem `wg-fleet`-Overlay (`10.20.0.0/16`) freigeben, nicht aus
dem öffentlichen Internet.

#### Scenario: Direkter Portzugriff von außerhalb des Overlays schlägt fehl

- **GIVEN** hbbs/hbbr sind mit geöffneten Web-Client-Ports 21118/21119 deployed
- **WHEN** ein Verbindungsversuch auf `<öffentliche Node-IP>:21118` (oder `:21119`)
  von außerhalb des `10.20.0.0/16`-Overlays unternommen wird
- **THEN** verwirft `ufw` die Verbindung, da die Ports nur für das `wg-fleet`-Overlay
  freigegeben sind

#### Scenario: Zugriff über den öffentlichen Hostnamen erfordert eine gültige SSO-Session

- **GIVEN** `oauth2-proxy-rustdesk-web` steht vor der Bridge zu hbbs/hbbr
- **WHEN** ein Aufruf von `https://remote.mentolder.de` ohne gültige
  Pocket-ID-Session eintrifft
- **THEN** leitet `oauth2-proxy-rustdesk-web` zum Pocket-ID-Login um, statt die
  Anfrage an hbbs/hbbr durchzureichen

#### Scenario: Bestehende Session erreicht den Web-Client über die Overlay-Bridge

- **GIVEN** ein Nutzer hat eine gültige Pocket-ID-Session für `rustdesk-web`
- **WHEN** er `https://remote.mentolder.de` aufruft
- **THEN** routet Traefik über `oauth2-proxy-rustdesk-web` und die
  Service-ohne-Selector-Bridge zur Overlay-Adresse von `${TURN_NODE}` und der
  RustDesk-Web-Client wird im Browser angezeigt

### Requirement: REQ-RUSTDESK-RELAY-005 — Firewall-Regeln auf dem gepinnten Node
Das System SHALL sicherstellen, dass die für hbbs/hbbr benötigten Ports
(21115/tcp, 21116/tcp+udp, 21117/tcp) sowohl auf dem aktuell laufenden Fleet-Node als
auch bei künftigen Node-Neubauten/-Beitritten per `ufw` freigegeben sind.

#### Scenario: Node-Neubau übernimmt die Firewall-Regeln
- **GIVEN** `prod/cloud-init.yaml` und die Node-Join-Templates enthalten die
  RustDesk-`ufw allow`-Regeln
- **WHEN** ein neuer Fleet-Node aus diesen Templates gebootstrapt wird
- **THEN** sind die RustDesk-Ports auf dem neuen Node ohne manuellen Zusatzschritt
  bereits freigegeben

### Requirement: REQ-RUSTDESK-RELAY-006 — Secret-Rotation-Runbook für hbbs subPath-Mount
Das System SHALL dokumentieren, dass eine Rotation des `rustdesk-secrets`-Keypairs
(`id_ed25519`/`id_ed25519.pub`) einen manuellen `kubectl rollout restart` des
`hbbs`-Deployments erfordert, weil das Keypair per `subPath` gemountet ist und `subPath`-
Mounts von kubelet NICHT live in einem bereits laufenden Pod aktualisiert werden, wenn sich
das zugrunde liegende Secret ändert.

#### Scenario: Secret-Rotation erfordert manuellen Rollout-Restart
- **GIVEN** das `rustdesk-secrets`-Secret wurde rotiert (z. B. via `task env:seal` und
  erneutem Apply)
- **WHEN** der `hbbs`-Pod bereits läuft und NICHT neu gestartet wird
- **THEN** verwendet `hbbs` weiterhin das alte Keypair, weil die `subPath`-gemounteten
  Dateien `/root/id_ed25519` und `/root/id_ed25519.pub` nicht live aktualisiert werden

#### Scenario: Manueller Rollout-Restart lädt das neue Keypair korrekt
- **GIVEN** das `rustdesk-secrets`-Secret wurde rotiert
- **WHEN** `kubectl --context fleet -n rustdesk rollout restart deployment/hbbs` ausgeführt
  wird
- **THEN** wird der `hbbs`-Pod neu erstellt (Deployment-Strategie `Recreate`) und die
  `subPath`-Mounts werden beim neuen Pod-Start aus dem aktuellen Secret-Inhalt aufgebaut,
  sodass `hbbs` das neu rotierte Keypair verwendet

<!-- merged from change delta rustdesk-server.md on 2026-07-01 -->
<!-- merged from change delta rustdesk-subpath-rotation-runbook/rustdesk-server.md on 2026-07-01 -->

<!-- merged from change delta rustdesk-server.md (f17a86a24568) -->

### Requirement: RustDesk-Server-Pods laufen als Non-Root

Die Deployments `hbbs` und `hbbr` in `k3d/rustdesk-stack/` MÜSSEN auf Pod-Ebene einen
`securityContext` mit `runAsNonRoot: true` und `seccompProfile.type: RuntimeDefault`
setzen und auf Container-Ebene `allowPrivilegeEscalation: false`. Das `workingDir` der
Container DARF NICHT `/root` sein (Mode 700 verhindert den chdir für non-root-UIDs);
die Key-Mounts aus dem Secret `rustdesk-secrets` bleiben read-only und werden auf den
neuen workingDir-Pfad umgezogen. Die hostPorts (21115–21119) bleiben unverändert — sie
liegen oberhalb des privilegierten Bereichs.

#### Scenario: hbbs-Manifest deklariert Non-Root-Härtung

- **GIVEN** das Deployment-Manifest `k3d/rustdesk-stack/hbbs.yaml`
- **WHEN** der Pod-Spec geprüft wird
- **THEN** enthält er `securityContext.runAsNonRoot: true` und
  `securityContext.seccompProfile.type: RuntimeDefault`
- **AND** der hbbs-Container setzt `allowPrivilegeEscalation: false` und ein
  `workingDir` ungleich `/root`

#### Scenario: hbbr-Manifest deklariert Non-Root-Härtung

- **GIVEN** das Deployment-Manifest `k3d/rustdesk-stack/hbbr.yaml`
- **WHEN** der Pod-Spec geprüft wird
- **THEN** enthält er dieselben Härtungsattribute wie hbbs

### Requirement: NetworkPolicy-Bypass-Ausnahme ist dokumentiert

Die `k3d/README.md` MUSS einen Abschnitt enthalten, der die hostNetwork-Pods (coturn,
janus, hbbs, hbbr) auf `${TURN_NODE}`, ihre hostPorts und die bewusste Ausnahme von den
ClusterWide NetworkPolicies beschreibt. Der Abschnitt NENNNT das Node-Pinning via
`nodeSelector: kubernetes.io/hostname: ${TURN_NODE}` als Containment-Maßnahme und
VERWEIST auf nextcloud/collabora als separate, im Manifest begründete Ausnahmen.

#### Scenario: README erklärt die hostNetwork-Ausnahme

- **GIVEN** die `k3d/README.md`
- **WHEN** nach der Begründung gesucht wird, warum coturn/janus/hbbs/hbbr die
  NetworkPolicies umgehen
- **THEN** findet sich ein Abschnitt mit Node-Pinning (`${TURN_NODE}`), hostPort-Liste
  und dem Verweis auf die bewusste NetPol-Ausnahme

<!-- merged from change delta rustdesk-server.md (21f9f64dcf60) -->

### Requirement: REQ-RUSTDESK-RELAY-007 — On-Demand-Lifecycle für hbbs/hbbr

Das System SHALL den RustDesk-Relay-Stack (hbbs/hbbr) on-demand über
`task rustdesk:wake` hochfahren und SHALL ihn nach einer TTL (Default
30 Minuten) automatisch auf `replicas=0` zurückfahren (`rustdesk:sleep` bzw.
Sleeper-Job). Der Stack SHALL außerhalb der Flux/GitOps-Reconciliation betrieben
werden, damit imperatives Scaling nicht zurückgenudelt wird.

#### Scenario: Wake bringt gehärteten Stack hoch

- **GIVEN** hbbs und hbbr sind mit `replicas=0` skaliert oder nicht vorhanden
- **WHEN** `task rustdesk:wake` ausgeführt wird
- **THEN** werden die gehärteten Manifeste aus `k3d/rustdesk-stack/` angewendet und
  beide Deployments laufen mit `replicas=1` als non-root (uid 65534)

#### Scenario: Sleeper-Job fährt nach TTL herunter

- **GIVEN** `wake` hat den Sleeper-Job angelegt und hbbs/hbbr laufen seit mehr als
  30 Minuten
- **WHEN** der Sleeper-Job auslöst
- **THEN** sind beide Deployments auf `replicas=0` skaliert und die Pods sind
  beendet

#### Scenario: Laufende Session überlebt Wind-down

- **GIVEN** eine RustDesk-Session ist über hbbr oder direkt verbunden
- **WHEN** der Sleeper-Job skaliert hbbs/hbbr auf `replicas=0`
- **THEN** bricht die bestehende Session nicht durch den Wind-down ab, weil das
  Rendezvous nur beim Verbindungsaufbau benötigt wird

#### Scenario: Deploy ersetzt Root-Pods durch gehärtete Manifeste

- **GIVEN** im Cluster laufen noch alte hbbs/hbbr-Pods ohne securityContext
- **WHEN** `task rustdesk:deploy` ausgeführt wird
- **THEN** laufen die neuen Pods als non-root (uid 65534) mit `workingDir:
  /var/lib/rustdesk` gemäß T014553

<!-- merged from change delta rustdesk-server.md (0c4254a3665b) -->