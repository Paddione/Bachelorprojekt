---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-01
---

# RustDesk-Server im Workspace-Stack — Design

## Ziel

Self-hosted RustDesk-Relay (hbbs/hbbr, Open-Source-Edition) für Patrick und gekko, um
diverse eigene Rechner per Remote-Desktop zu erreichen. Ein gemeinsamer Server für beide
Brands (mentolder + korczewski), öffentlich übers Internet erreichbar, ohne SSO/OIDC
(die Open-Source-Edition kennt kein Login-Konzept — Zugriffskontrolle läuft über
ID + Passwort pro Client und einen Relay-Key auf Serverseite).

## Kontext & bestehende Konventionen

Traefik (der k3s-Ingress dieses Stacks) kann kein rohes TCP/UDP — es gibt kein
`IngressRouteTCP`/`IngressRouteUDP` im Repo. Jeder bisherige Nicht-HTTP-Dienst
(coturn, Janus, LiveKit-Media) umgeht Traefik komplett über `hostNetwork: true` +
`hostPort`, gepinnt via `nodeSelector` auf genau einen Node. RustDesk folgt demselben
Muster — es ist architektonisch am nächsten mit coturn verwandt (eigener privilegierter
Namespace, Shared-Secret statt OIDC, gemeinsames Deployment für beide Brands über
`task fleet:shared-services`).

## Architektur

Neuer Ordner `k3d/rustdesk-stack/` (analog `k3d/coturn-stack/`), eigener Namespace
`rustdesk` mit `pod-security.kubernetes.io/enforce: privileged` (nötig für
`hostNetwork`/`hostPort`, wie bei `coturn`/`janus`).

Zwei getrennte Deployments statt einem Mehr-Container-Pod — folgt dem bestehenden Muster
(coturn und Janus sind ebenfalls getrennte Deployments im selben Namespace/Node):

- **`hbbs`** (ID-/Rendezvous-Server): `hostNetwork: true`,
  `nodeSelector: kubernetes.io/hostname: ${TURN_NODE}`, Ports `21115/tcp` (NAT-Test),
  `21116/tcp+udp` (ID-Registrierung & Rendezvous).
- **`hbbr`** (Relay-Server): dieselbe `hostNetwork`/`nodeSelector`-Konfiguration, Port
  `21117/tcp` (Relay-Registrierung).

Beide werden **derselbe Node wie coturn/Janus** (`${TURN_NODE}`, aktuell `pk-hetzner-4`)
zugewiesen — kein neuer Node-Slot nötig, keine Port-Kollision mit coturns
`3478/5349/49152-49252` oder Janus' `20000-20200`. `${TURN_NODE}`/`${TURN_PUBLIC_IP}`
aus `environments/mentolder.yaml` werden direkt wiederverwendet statt eigener
`RUSTDESK_NODE`/`RUSTDESK_PUBLIC_IP`-Variablen — ein künftiger Node-Wechsel muss so nur
an einer Stelle nachgezogen werden.

Der Web-Client (Ports `21118`/`21119`) wird bewusst **nicht** aktiviert — nur native
Desktop-/Mobile-Clients, minimale Portfläche für zwei Nutzer.

Image: offizielles `rustdesk/rustdesk-server` von Docker Hub, per Digest gepinnt
(Konvention wie `ntfy.yaml`) — kein Custom-Build nötig.

## Secrets & Key-Persistenz

Das ed25519-Keypair (`id_ed25519` / `id_ed25519.pub`), das hbbs zur Signierung von
ID-Lookup-Antworten nutzt, wird **einmalig vorab generiert** statt dem Container beim
ersten Start überlassen zu werden. Beide Hälften werden in einer eigenen,
namespace-scoped SealedSecret `rustdesk-secrets` (`environments/sealed-secrets/mentolder.yaml`)
abgelegt — exakt das Muster von `coturn-secrets` (eigene SealedSecret pro privilegiertem
Namespace statt Eintrag im globalen `workspace-secrets`). Kein PVC nötig.

Konsequenz: Client-IDs bleiben über Pod-Neustarts/-Reschedules hinweg stabil, und der Key
ist versioniert/wiederherstellbar statt an ein Volume gebunden (vermeidet den
`local-path`-Node-Pinning-Vorbehalt, der bei anderen Services PVC-Storage-Class-Wahl
beeinflusst — hier irrelevant, da kein PVC verwendet wird).

## Netzwerk, Firewall, DNS

Ports: `21115/tcp`, `21116/tcp+udp`, `21117/tcp`.

Firewall-Regeln müssen an **drei** Stellen ergänzt werden:

1. `prod/cloud-init.yaml` — für zukünftige Cluster-Neubauten.
2. `scripts/hetzner/cloud-init.yaml.tmpl` und `cloud-init-server.yaml.tmpl` — für
   zukünftige Node-Beitritte zur Fleet (diese Templates enthalten aktuell die
   coturn/Janus-Regeln nicht und laufen den Haupt-`cloud-init.yaml` bereits nach).
3. **Manueller Schritt, kein Kustomize-Artefakt:** einmaliges `ufw allow` per SSH auf dem
   laufenden `pk-hetzner-4`, da `cloud-init.yaml` nur beim erstmaligen Node-Bootstrap
   greift und nicht live auf bestehende Nodes nachgezogen wird.

DNS: `rustdesk.mentolder.de` → `${TURN_PUBLIC_IP}` (`204.168.244.104`), als manueller
A-Record (kein DDNS-Updater auf diesem Stack aktiv — alle Fleet-IPs sind statisch). Ein
einziger kanonischer Hostname unter der mentolder-Domain genügt für beide Brands, da
Clients sich unabhängig vom Brand mit demselben Host/derselben IP verbinden. Kein
Traefik-`IngressRoute` und kein `configmap-domains.yaml`-Eintrag nötig — es läuft kein
HTTP-Traffic durch Traefik; DNS ist reine Client-Konfiguration.

## Deployment-Weg

`k3d/rustdesk-stack` wird in `task fleet:shared-services` (Taskfile.yml) mit
aufgenommen — ein einmaliges Deployment für beide Brands, analog zu coturn/Janus. Kein
Eintrag in `prod-fleet/mentolder/` oder `prod-fleet/korczewski/` nötig.

## Sicherheit / DSGVO

Der Relay-Key (SealedSecret `rustdesk-secrets`) steuert **ausschließlich**, wer IDs
registrieren/nachschlagen darf. Er entschlüsselt nicht die eigentliche
Remote-Desktop-Session — diese läuft unabhängig davon Ende-zu-Ende-verschlüsselt via
ECDH direkt zwischen den beiden Peers. Ein Leak des Relay-Keys ermöglicht bestenfalls
Spoofing/DoS der ID-Vermittlung, keine Einsicht in laufende Sessions.

Keine feste Rotationspflicht (wie bei coturns `TURN_SECRET` auch nicht) — Rotation nur
bei konkretem Verdacht auf Kompromittierung, manuell durchgeführt.

Keine personenbezogenen Daten auf dem Relay selbst — RustDesk-IDs sind frei wählbare
Kennungen, kein Klarname oder E-Mail-Adresse erforderlich.

## Verifikation

- Manuelle Verbindungstests von Patricks und gekkos Geräten gegen `rustdesk.mentolder.de`
  — sowohl der P2P-Fall als auch ein erzwungener Relay-Fallback (z. B. über ein Netz mit
  symmetrischem NAT, etwa ein Mobile Hotspot).
- `kubectl get pods -n rustdesk` — beide Deployments `Running` auf `pk-hetzner-4`.
- `ufw status` auf dem Node zeigt die neuen Regeln (`21115/tcp`, `21116/tcp`,
  `21116/udp`, `21117/tcp`).

## Out of Scope

- RustDesk Server Pro (Web-Konsole, Adressbuch, OIDC) — bewusst nicht gewählt, da nur
  zwei Nutzer und kein Bedarf an zentraler Verwaltung.
- Web-Client (Port 21118/21119).
- Automatisierte Key-Rotation.
- Per-Brand-getrennte Instanzen (verworfen zugunsten einer gemeinsamen Instanz für beide
  Brands, analog coturn/Janus).
