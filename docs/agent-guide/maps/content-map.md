# Content-Registry

<!-- GENERIERT aus docs/agent-guide/registry — nicht von Hand editieren.
     Neu erzeugen: task content:map · Prüfen: task content:check -->

Jede Komponente und jedes Goal mit Verdrahtungsstatus: live (referenziert)
oder tot (unreferenziert — Kandidat zum Aufräumen, kein Fehler).
Ref-Guard: `scripts/agent-guide/validate.mjs` + `scripts/content-check.mjs`.

## Goals

| Goal | Gefahr | Referenzen (related) | Genutzt von Komponenten | Status |
|---|---|---|---|---|
| `website-text-aendern` | safe | `feature-bauen` | `website` | live |
| `dienst-status-pruefen` | safe | `bug-beheben` | — | live |
| `bug-beheben` | caution | `feature-bauen` | — | live |
| `feature-bauen` | caution | `bug-beheben`, `aenderung-ausrollen` | — | live |
| `aenderung-ausrollen` | assisted | `feature-bauen` | — | live |
| `datenbank-aendern` | assisted | `feature-bauen` | `postgresql` | live |
| `secret-aendern` | forbidden | — | `keycloak`, `sealed-secrets` | live |
| `cluster-neu-aufsetzen` | forbidden | `aenderung-ausrollen` | `k3s` | live |
| `idee-starten` | safe | `feature-bauen`, `bug-beheben` | — | live |
| `pr-oeffnen` | assisted | `feature-bauen`, `aenderung-ausrollen` | — | live |
| `deploy-pruefen` | safe | `aenderung-ausrollen`, `dienst-status-pruefen` | — | live |

## Komponenten

| Komponente | Art | Ziel (relates_to) | Status |
|---|---|---|---|
| `website` | software | `website-text-aendern` | live |
| `keycloak` | software | `secret-aendern` | live |
| `nextcloud` | software | — | live |
| `collabora` | software | — | live |
| `vaultwarden` | software | — | live |
| `nextcloud-talk-hpb` | software | — | live |
| `brett` | software | — | live |
| `mailpit` | software | — | live |
| `docuseal` | software | — | live |
| `whiteboard` | software | — | live |
| `arena` | software | — | live |
| `arena-server` | software | — | live |
| `docs` | software | — | live |
| `postgresql` | software | `datenbank-aendern` | live |
| `traefik` | software | — | live |
| `sealed-secrets` | software | `secret-aendern` | live |
| `cert-manager` | software | — | live |
| `k3s` | software | `cluster-neu-aufsetzen` | live |
| `wireguard` | software | — | live |
| `tei` | software | — | live |
| `openclaw` | software | — | live |
| `whisper` | software | — | live |
| `talk-transcriber` | software | — | live |
| `mcp` | software | — | live |
| `brainstorm` | software | — | live |
| `gekko-hetzner-2` | hardware | — | live |
| `gekko-hetzner-3` | hardware | — | live |
| `gekko-hetzner-4` | hardware | — | live |
| `k3s-1` | hardware | — | live |
| `k3s-2` | hardware | — | live |
| `k3s-3` | hardware | — | live |
| `pk-hetzner-4` | hardware | — | live |
| `pk-hetzner-6` | hardware | — | live |
| `pk-hetzner-8` | hardware | — | live |
