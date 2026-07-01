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

<!-- merged from change delta rustdesk-server.md on 2026-07-01 -->