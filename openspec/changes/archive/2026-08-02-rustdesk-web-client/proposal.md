# Proposal: rustdesk-web-client

## Why

Der RustDesk-Relay (`k3d/rustdesk-stack/`) unterstützt bisher ausschließlich native
Desktop-/Mobile-Clients — `REQ-RUSTDESK-RELAY-004` schließt den optionalen
Browser-Web-Client (Port 21118/21119) bewusst aus ("minimale Portfläche für zwei
Nutzer"). Diese Entscheidung wird jetzt bewusst umgekehrt: Patrick und gekko sollen
auch ohne installierten nativen Client (z. B. von einem fremden Rechner) auf ihre
Geräte zugreifen können. Der Nutzerkreis bleibt unverändert — nur der Zugriffsweg
wird erweitert.

## What

Web-Client-Ports (21118 hbbs, 21119 hbbr) werden auf `${TURN_NODE}` geöffnet, aber
**nicht öffentlich ohne SSO-Gate** erreichbar gemacht: `ufw` erlaubt sie nur aus dem
`wg-fleet`-Overlay (10.20.0.0/16), ein Service-ohne-Selector-Bridge-Paar plus
`oauth2-proxy` (Pocket-ID-OIDC, gleiches Muster wie `oauth2-proxy-downloads`) fronten
sie über eine Traefik-`IngressRoute` unter dem gemeinsamen Hostnamen
`remote.mentolder.de`. Kein neuer öffentlicher Port entsteht — der einzige
öffentliche Einstiegspunkt bleibt Traefik (443).

`REQ-RUSTDESK-RELAY-004` wird durch `REQ-RUSTDESK-WEB-001` ersetzt (siehe Delta in
`specs/rustdesk-server.md`). Volle Design-Details, Architekturdiagramm und
Rollback-Plan: `docs/superpowers/specs/2026-07-01-rustdesk-web-client-design.md`.

_Ticket: T001381_
