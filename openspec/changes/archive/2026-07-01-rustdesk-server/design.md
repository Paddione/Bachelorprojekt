## Context

Traefik (der k3s-Ingress dieses Stacks) kann kein rohes TCP/UDP routen — es gibt kein
`IngressRouteTCP`/`IngressRouteUDP` im Repo. Jeder bisherige Nicht-HTTP-Dienst (coturn,
Janus, LiveKit-Media) umgeht Traefik komplett über `hostNetwork: true` + `hostPort`,
gepinnt via `nodeSelector` auf genau einen Node. RustDesk (hbbs/hbbr, Open-Source-Edition)
folgt demselben Muster — architektonisch am nächsten mit coturn verwandt: eigener
privilegierter Namespace, Shared-Secret statt OIDC, ein gemeinsames Deployment für
beide Brands über `task fleet:shared-services`.

Vollständige Design-Diskussion inkl. Alternativen-Abwägung siehe
`docs/superpowers/specs/2026-07-01-rustdesk-server-design.md`.

## Goals / Non-Goals

**Goals:**
- Self-hosted Remote-Desktop-Relay für zwei Nutzer (Patrick, gekko) auf diversen
  eigenen Rechnern, öffentlich erreichbar.
- Ein gemeinsamer Server für beide Brands (mentolder + korczewski).
- Stabile Client-IDs über Pod-Neustarts hinweg (Keypair-Persistenz ohne PVC).

**Non-Goals:**
- RustDesk Server Pro (Web-Konsole, Adressbuch, OIDC/SSO) — kein Bedarf bei zwei
  Nutzern ohne zentrale Verwaltung.
- Web-Client (Port 21118/21119) — nur native Desktop-/Mobile-Clients.
- Automatisierte Key-Rotation.
- Per-Brand-getrennte Instanzen.

## Decisions

- **Eigener Ordner `k3d/rustdesk-stack/`** statt Erweiterung von `k3d/coturn-stack/`:
  saubere fachliche Trennung (WebRTC-Relay für Talk vs. Remote-Desktop), kostet nur
  eine zusätzliche `PodSecurityAdmission: enforce=privileged`-Namespace-Deklaration.
- **Zwei getrennte Deployments (`hbbs`, `hbbr`)** statt ein Zwei-Container-Pod — folgt
  dem bestehenden Muster (coturn/Janus sind ebenfalls getrennte Deployments im selben
  Namespace/Node), hält jede Datei fokussiert.
- **Gemeinsamer Node `${TURN_NODE}`** (aktuell `pk-hetzner-4`) statt neuer
  Node-Zuweisung — keine Port-Kollision mit coturns `3478/5349/49152-49252` oder
  Janus' `20000-20200`; ein künftiger Node-Wechsel muss nur an einer Stelle
  (`environments/mentolder.yaml`) nachgezogen werden, da keine eigene
  `RUSTDESK_NODE`-Variable eingeführt wird.
- **Vorab generiertes ed25519-Keypair + eigene SealedSecret `rustdesk-secrets`** statt
  PVC + Selbstgenerierung durch den Container — folgt dem `coturn-secrets`-Muster
  (namespace-scoped statt globalem `workspace-secrets`), macht Client-IDs stabil über
  Neustarts hinweg und vermeidet den `local-path`-Node-Pinning-Vorbehalt vollständig.
- **Web-Client bewusst nicht aktiviert** — minimale Portfläche für zwei Nutzer.
- **Ein kanonischer Hostname `rustdesk.mentolder.de`** statt zweier Brand-Domains —
  Clients verbinden sich brand-unabhängig mit demselben Host/derselben IP.
- **Kein Traefik-`IngressRoute`, kein `configmap-domains.yaml`-Eintrag** — es läuft
  kein HTTP-Traffic durch Traefik; DNS ist reine Client-Konfiguration.
- **Keine feste Key-Rotation** (wie bei coturns `TURN_SECRET` auch nicht) — Rotation
  nur bei konkretem Verdacht auf Kompromittierung, manuell.

## Risks / Trade-offs

- **[Risk]** Firewall (`ufw`) wird nicht live auf laufende Fleet-Nodes nachgezogen,
  nur bei Node-Bootstrap/-Beitritt via Cloud-Init.
  **→ Mitigation:** Manueller `ufw allow`-Schritt per SSH auf `pk-hetzner-4` als
  expliziter Runbook-Task; zusätzlich `prod/cloud-init.yaml` UND beide
  Node-Join-Templates (`scripts/hetzner/cloud-init.yaml.tmpl`,
  `cloud-init-server.yaml.tmpl`) aktualisieren, damit die Regel bei künftigen
  Node-Neubauten nicht verloren geht.
- **[Risk]** Relay-Key-Leak ermöglicht Spoofing/DoS der ID-Vermittlung.
  **→ Mitigation:** Kein Zugriff auf Session-Inhalte möglich, da die eigentliche
  Remote-Desktop-Verbindung unabhängig vom Relay-Key Ende-zu-Ende-verschlüsselt ist
  (ECDH zwischen den Peers). Manuelle Rotation bei Verdacht ausreichend.
- **[Risk]** DNS ist ein manueller A-Record (kein DDNS) — bei einem künftigen
  Node-Wechsel (`TURN_NODE`/`TURN_PUBLIC_IP` ändert sich) muss der A-Record manuell
  nachgezogen werden, sonst zeigt `rustdesk.mentolder.de` ins Leere.
  **→ Mitigation:** Bestehendes Verhalten für diesen Stack (alle Fleet-IPs sind
  bereits statisch/manuell gepflegt) — kein neues Risiko, nur dieselbe
  Betriebsrealität wie bei coturn/Janus/LiveKit.

## Migration Plan

Reines Netto-neues Deployment, keine bestehenden Ressourcen werden migriert:

1. SealedSecret `rustdesk-secrets` mit vorab generiertem Keypair erzeugen und
   committen.
2. `k3d/rustdesk-stack/` (Namespace, hbbs, hbbr, Kustomization) anlegen.
3. `task fleet:shared-services` um den neuen Stack erweitern, deployen.
4. Firewall-Templates (`prod/cloud-init.yaml` + beide Node-Join-Templates)
   aktualisieren; manuellen `ufw allow` auf `pk-hetzner-4` ausführen.
5. DNS-A-Record `rustdesk.mentolder.de` manuell anlegen.
6. Verbindungstest von beiden Client-Geräten (P2P + erzwungener Relay-Fallback).

**Rollback:** `kubectl delete namespace rustdesk` + Entfernen aus
`fleet:shared-services` — keine Fremdabhängigkeiten, da isolierter Namespace ohne
geteilte Ressourcen außer dem Node selbst.

## Open Questions

Keine — alle architekturrelevanten Entscheidungen wurden im Brainstorming mit dem
User geklärt (siehe `docs/superpowers/specs/2026-07-01-rustdesk-server-design.md`).
Verbleibende Detailfragen (exakte hbbs/hbbr-CLI-Flags, aktuelle Image-Digest) sind
Implementierungsdetails, die im Implementierungsplan (`tasks.md`) aufgelöst werden.
