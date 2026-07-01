---
ticket_id: null
plan_ref: null
status: active
date: 2026-07-01
---

# RustDesk Web-Client — Design

## Ziel

Browser-basierten Remote-Desktop-Zugriff für Patrick und gekko auf den bestehenden
RustDesk-Relay (`k3d/rustdesk-stack/`) freischalten, ohne den nativen Client
vorauszusetzen. Dies kehrt die ursprüngliche Entscheidung in
`openspec/specs/rustdesk-server.md` (`REQ-RUSTDESK-RELAY-004`, "Web-Client bewusst
nicht aktiviert") explizit um. Der Kreis der Nutzer bleibt unverändert (weiterhin nur
Patrick und gekko) — es ändert sich nur der Zugriffsweg.

## Kontext & bestehende Konventionen

Der Web-Client ist **kein separates Artefakt**: `rustdesk/rustdesk-server:1.1.15`
(dasselbe Image wie hbbs/hbbr) enthält die Web-Client-Funktionalität bereits — es
fehlen nur die geöffneten Ports 21118 (hbbs) und 21119 (hbbr).

hbbs/hbbr laufen als `hostNetwork: true`-Deployments, gepinnt via `nodeSelector` auf
`${TURN_NODE}` (aktuell `pk-hetzner-4`). Traefik kann kein rohes TCP/UDP routen (kein
`IngressRouteTCP/UDP` im Repo) — die nativen Relay-Ports (21115/21116/21117) umgehen
Traefik komplett und sind über eine statische DNS-A-Record (`rustdesk.mentolder.de`)
direkt mit der öffentlichen Node-IP erreichbar.

Der Web-Client spricht dagegen HTTP + WebSocket — dafür existiert im Repo bereits ein
etabliertes SSO-Gating-Pattern: `oauth2-proxy` (v7.9.0) + Pocket-ID-OIDC + Traefik
`IngressRoute`, siehe `k3d/oauth2-proxy-downloads.yaml` (Branch
`feature/rustdesk-msi-installer`, T001378), wiederverwendet für brett, videovault,
mediaviewer, docs, studio, comfy, mailpit, downloads.

Alle Fleet-Nodes sind über `wg-fleet` (10.20.0.0/16) für Pod-zu-Pod-Traffic vermascht
(`--flannel-iface=wg-fleet`, siehe `wireguard/wg-mesh-nodes.yaml`). Das bedeutet:
Traefik/oauth2-proxy erreichen `${TURN_NODE}` über das interne Overlay, unabhängig
davon, auf welchem Node sie selbst laufen — ohne den öffentlichen Pfad zu nutzen.

## Architektur

**Overlay-Bridge statt öffentlichem Port.** hbbs/hbbr öffnen zusätzlich die Ports
21118 bzw. 21119 als `hostPort` auf `${TURN_NODE}`. `ufw` erlaubt diese Ports
**ausschließlich aus dem `wg-fleet`-Overlay (`10.20.0.0/16`)** — nicht aus dem
öffentlichen Internet. Damit ist der Web-Client-Port selbst nie direkt von außen
erreichbar; der einzige öffentliche Einstiegspunkt bleibt Traefik auf 80/443.

Zwei Kubernetes-`Service`-Objekte **ohne Selector** mit manuell gepflegten
`Endpoints` zeigen auf `<${TURN_OVERLAY_IP}>:21118` bzw. `:21119` (neue Env-Var,
Wert aus `wireguard/wg-mesh-nodes.yaml` für `pk-hetzner-4`). Ein gemeinsamer
`oauth2-proxy-rustdesk-web`-Deployment (1:1 nach dem `oauth2-proxy-downloads`-Muster,
neuer Pocket-ID-Client `rustdesk-web`) sitzt davor und leitet je nach Pfad an die
passende Bridge weiter. Traefik `IngressRoute` terminiert einen gemeinsamen Hostnamen
`remote.mentolder.de` (ein Hostname für beide Brands, analog zum bestehenden
`rustdesk.mentolder.de`) und routet zu `oauth2-proxy-rustdesk-web:4180`.

```
Browser → Traefik (remote.mentolder.de, 443)
        → oauth2-proxy-rustdesk-web (Pocket-ID-Session-Check)
        → Service (kein Selector) → Endpoints(${TURN_OVERLAY_IP}:21118 / :21119)
        → hbbs/hbbr hostPort (nur aus wg-fleet-Overlay erreichbar)
```

Scope: **beide** Ports (hbbs 21118 für Verbindungsaufbau, hbbr 21119 für
Relay-Fallback bei symmetrischem NAT) — voller Funktionsumfang wie native Clients.

## Komponenten & Dateien

Neu in `k3d/rustdesk-stack/`:
- `hbbs.yaml` / `hbbr.yaml`: je ein zusätzlicher `containerPort`/`hostPort`
  (21118 bzw. 21119).
- `web-bridge-services.yaml`: zwei `Service`-Objekte ohne Selector + zwei
  `Endpoints`-Objekte, Ziel-IP `${TURN_OVERLAY_IP}`.
- `oauth2-proxy-rustdesk-web.yaml`: Deployment + Service, analog
  `oauth2-proxy-downloads.yaml`. Neuer Pocket-ID-OIDC-Client `rustdesk-web`, neues
  Secret `POCKET_ID_RUSTDESK_WEB_SECRET` in `workspace-secrets`.

Geändert außerhalb des Stacks:
- `k3d/ingress.yaml`: neue `IngressRoute` für `remote.mentolder.de` (prod) /
  `remote.localhost` (dev) → `oauth2-proxy-rustdesk-web:4180`.
- `k3d/configmap-domains.yaml`: neuer Domain-Key `remote` (dev: `remote.localhost`).
- `environments/mentolder.yaml`: neue Env-Var `TURN_OVERLAY_IP` (wg-fleet-Adresse von
  `pk-hetzner-4`, Quelle: `wireguard/wg-mesh-nodes.yaml`).
- `environments/schema.yaml`: `TURN_OVERLAY_IP` registrieren.
- `Taskfile.yml`: betroffene `envsubst`-Variablenlisten um `TURN_OVERLAY_IP`
  erweitern.
- `prod/cloud-init.yaml`, `scripts/hetzner/cloud-init.yaml.tmpl`,
  `cloud-init-server.yaml.tmpl`: neue `ufw allow from 10.20.0.0/16 to any port
  21118,21119 proto tcp` — dieselben drei Stellen wie beim ursprünglichen Relay
  (T-Design für hbbs/hbbr), diesmal mit Quell-CIDR-Einschränkung statt öffentlichem
  `allow`.
- Manueller Schritt (kein Kustomize-Artefakt, wie beim ursprünglichen Relay-Rollout):
  einmaliges `ufw allow from 10.20.0.0/16 to any port 21118,21119 proto tcp` per SSH
  auf dem laufenden `pk-hetzner-4`.

## Spec-Änderung (OpenSpec-Delta)

`REQ-RUSTDESK-RELAY-004` (SHALL NOT den Web-Client aktivieren) wird ersetzt durch:

**REQ-RUSTDESK-WEB-001 — SSO-gegateter Web-Client-Zugriff.** Das System SHALL die
RustDesk-Web-Client-Ports (21118 hbbs, 21119 hbbr) auf `${TURN_NODE}` öffnen, SHALL
NOT diese Ports öffentlich ohne SSO-Gate erreichbar machen, und SHALL ausschließlich
über `remote.mentolder.de` mit gültiger Pocket-ID-Session Zugriff gewähren.

- Szenario "Direkter Portzugriff von außerhalb des Overlays schlägt fehl": Ein
  Verbindungsversuch auf `<öffentliche Node-IP>:21118` von außerhalb des
  `10.20.0.0/16`-Netzes wird von `ufw` verworfen.
- Szenario "Zugriff über den öffentlichen Hostnamen erfordert SSO": Ein Aufruf von
  `https://remote.mentolder.de` ohne gültige Pocket-ID-Session wird von
  `oauth2-proxy-rustdesk-web` zum Login umgeleitet, nicht durchgereicht.

## Tests

BATS-Erweiterung in `tests/spec/rustdesk-server.bats`:
- Kustomize-Struktur: `web-bridge-services.yaml` enthält Service ohne Selector +
  passende Endpoints; `oauth2-proxy-rustdesk-web.yaml` folgt demselben Muster wie
  `oauth2-proxy-downloads.yaml`.
- IngressRoute für `remote.mentolder.de`/`remote.localhost` existiert.
- Negativ-Check: Keine `ufw allow ... 21118` / `21119`-Regel ohne
  `10.20.0.0/16`-Quell-Einschränkung in `prod/cloud-init.yaml` oder den
  Hetzner-Cloud-Init-Templates (verhindert versehentliche öffentliche Freigabe).

Manuelle Verifikation (wie beim ursprünglichen Relay):
- Verbindungsaufbau über `https://remote.mentolder.de` von Patricks und gekkos
  Geräten, mit und ohne aktive Pocket-ID-Session.
- Erzwungener Relay-Fallback-Test (symmetrisches NAT, z. B. Mobile Hotspot) über den
  Web-Client.
- `kubectl get pods -n rustdesk` — hbbs/hbbr weiterhin `Running` auf `pk-hetzner-4`
  mit den zusätzlichen Ports.
- `ufw status` auf dem Node zeigt 21118/21119 nur mit `10.20.0.0/16`-Quell-Filter.

## Rollback-Plan

Falls sich beim manuellen Test zeigt, dass `oauth2-proxy` die WebSocket-Verbindung
zum Web-Client nicht sauber durchreicht (z. B. Upgrade-Header- oder Timeout-Probleme),
wird das Feature vollständig zurückgebaut: zusätzliche hostPorts, Bridge-Services,
`oauth2-proxy-rustdesk-web`, IngressRoute und Firewall-Regeln entfernt,
`REQ-RUSTDESK-RELAY-004` in der ursprünglichen Fassung wiederhergestellt. Kein
Teil-Kompromiss (z. B. öffentlicher Port ohne SSO) wird als Fallback akzeptiert.

## Out of Scope

- RustDesk Server Pro (Web-Konsole, Adressbuch, zentrale OIDC-Verwaltung).
- Automatisierte Key-Rotation.
- Web-Client-Zugriff für weitere Nutzer über Patrick und gekko hinaus.
- Getrennte Hostnamen pro Brand (ein gemeinsamer Hostname `remote.mentolder.de` für
  beide Brands, analog zum bestehenden Relay-Hostnamen).
