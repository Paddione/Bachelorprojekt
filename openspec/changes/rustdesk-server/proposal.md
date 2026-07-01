## Why

Patrick und gekko brauchen verlässlichen Remote-Desktop-Zugriff auf diverse eigene
Rechner. Kommerzielle Tools (TeamViewer/AnyDesk) sind für diesen Zweck nicht nötig,
wenn ein self-hosted Relay im ohnehin vorhandenen Workspace-Stack läuft — DSGVO-konform
(alle Daten bleiben auf eigener Infrastruktur), ohne laufende Lizenzkosten.

## What Changes

- Neuer, eigenständiger RustDesk-Relay-Stack (Open-Source hbbs/hbbr) im Namespace
  `rustdesk`, gemeinsam für beide Brands (mentolder + korczewski) betrieben.
- `hostNetwork`/`nodeSelector`-Deployment auf demselben Fleet-Node wie coturn/Janus
  (`${TURN_NODE}`), da Traefik kein rohes TCP/UDP routen kann.
- Vorab generiertes ed25519-Keypair als eigene, namespace-scoped SealedSecret
  (`rustdesk-secrets`), statt PVC-basierter Selbstgenerierung durch den Container.
- Firewall-Regeln (`ufw`) für die neuen Ports in `prod/cloud-init.yaml` und den
  Node-Join-Templates ergänzt, plus einmaliger manueller Rollout auf dem laufenden Node.
- Manueller DNS-A-Record `rustdesk.mentolder.de` → `${TURN_PUBLIC_IP}`.
- Aufnahme in `task fleet:shared-services`, damit beide Brands mit einem Deploy-Lauf
  bedient werden — kein Eintrag in den per-Brand-Overlays (`prod-fleet/*`).

## Capabilities

### New Capabilities
- `rustdesk-server`: Self-hosted RustDesk-Relay (hbbs/hbbr) als gemeinsamer,
  öffentlich erreichbarer Remote-Desktop-Vermittlungsdienst für beide Brands, ohne
  SSO/OIDC (Zugriffskontrolle über Client-ID + Passwort und einen serverseitigen
  Relay-Key).

### Modified Capabilities
(keine — reines Net-new-Capability, keine bestehende Spec ändert ihr Anforderungsverhalten)

## Impact

- **Neu:** `k3d/rustdesk-stack/` (namespace.yaml, hbbs.yaml, hbbr.yaml, secret.yaml,
  kustomization.yaml).
- **Geändert:** `environments/sealed-secrets/mentolder.yaml` (neue `rustdesk-secrets`
  SealedSecret), `Taskfile.yml` (`fleet:shared-services` erweitert), `prod/cloud-init.yaml`,
  `scripts/hetzner/cloud-init.yaml.tmpl`, `scripts/hetzner/cloud-init-server.yaml.tmpl`
  (neue `ufw allow`-Regeln).
- **Manuelle Schritte (außerhalb von Kustomize/kubectl):** einmaliges `ufw allow` per
  SSH auf `pk-hetzner-4`, DNS-A-Record für `rustdesk.mentolder.de`.
- **Keine Auswirkung** auf bestehende Services — neuer, isolierter Namespace, kein
  Traefik-Routing, keine geteilten Ressourcen außer dem Node selbst.
