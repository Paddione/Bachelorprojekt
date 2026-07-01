# rustdesk-server

## Purpose

SSOT spec.

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

### Requirement: REQ-RUSTDESK-RELAY-004 — Minimale Portfläche ohne Web-Client
Das System SHALL ausschließlich die Ports für native Desktop-/Mobile-Clients
(21115/tcp, 21116/tcp+udp, 21117/tcp) öffnen und SHALL NOT den optionalen
Browser-Web-Client (Port 21118/21119) aktivieren oder über Traefik routen.

#### Scenario: Web-Client-Ports sind nicht erreichbar
- **GIVEN** der RustDesk-Relay ist deployed und über die Firewall erreichbar
- **WHEN** ein Verbindungsversuch auf Port 21118 oder 21119 unternommen wird
- **THEN** schlägt die Verbindung fehl, da diese Ports weder im Deployment noch in der
  Firewall-Konfiguration freigegeben sind

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