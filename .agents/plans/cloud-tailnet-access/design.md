---
title: "cloud-tailnet-access — Design"
ticket_id: T-PENDING
status: draft
---

# cloud-tailnet-access — Design

Claude-Code-on-the-web-Sessions (Cloud-Container) erreichen den devmesh-Cluster nicht:
`mcp-kubernetes` (localhost:18080) meldet ECONNREFUSED, `ticket-mcp-node` findet keinen
`shared-db`-Pod. Beide Dienste setzen einen Cluster-Pfad voraus, den bisher nur der
pk-desktop-Gateway (WSL) bereitstellt. Diese Änderung gibt der Cloud-Session einen eigenen,
eng begrenzten Tailnet-Zugang.

## Beleg (Ist-Zustand)

Messung vom 2026-10-28, Cloud-Session, Befehl:

```bash
for h in controlplane.tailscale.com login.tailscale.com pkgs.tailscale.com derp1.tailscale.com; do
  curl -sS -o /dev/null -m 10 -w "$h %{http_code}\n" "https://$h/"; done
ls -l /dev/net/tun; id -u; which kubectl
```

Ergebnis: Tailscale-Endpunkte antworten (302/200), `/dev/net/tun` vorhanden, Benutzer root,
`kubectl` fehlt. Der Proxy führt `100.64.0.0/10` in `noProxy`.

## Entscheidungen

| # | Entscheidung | Begründung |
|---|---|---|
| D1 | Nur Cluster devmesh, kein fleet | Operator-Entscheid; fleet ist Prod, ADR-008 trennt Dev und Prod |
| D2 | Direkter Weg zum k3s-API (tcp 6443), kein Zugriff über den pk-desktop-Gateway | Gateway hängt an pk-desktop und bindet auf Loopback; die Dienste laufen im Pod `llm-services`, `kubectl port-forward` erreicht sie über das API |
| D3 | Eigenes Tag `tag:cloud`, ein ACL-Eintrag `tag:cloud` → `tag:devmesh:6443` | kleinster Pfad; kein SSH (22), kein Ingress (443), kein Pfad in tag:devclient |
| D4 | ServiceAccount mit Namespace-Role statt Admin-Kubeconfig | die Cloud-Session braucht Lesen und Port-Forward, kein Schreiben |
| D5 | Spike vor dem Rest: Anmeldung mit echtem Auth-Key und Erreichbarkeit von :6443 | offen bleibt, ob DERP/UDP aus dem Container funktioniert |
| D6 | Kein privater SSH-Key (`patrick_ed25519`) in der Cloud | Schlüssel bleibt auf pk-desktop |
| D7 | Secrets nur als Environment-Secret der Cloud-Umgebung: `TS_AUTHKEY`, `DEVMESH_KUBECONFIG_B64` | nie im Repo; der Guard `tailnet-policy.bats` prüft das Auth-Key-Muster |

## Nicht-Ziele

- Zugriff auf fleet oder Schreibrechte im Cluster
- Änderung am pk-desktop-Gateway oder an `devmesh-forward.service`
- Eintrag der Cloud-Session in `devmesh/inventory.yaml` (der Peer ist flüchtig)

## Offene Punkte für den Operator

- Das Ticket fehlt: diese Session erreicht `ticket.sh` nicht. Ticket vom Desktop anlegen,
  `ticket_id` im Frontmatter von `tasks.md` und `design.md` ersetzen, danach
  `bash scripts/ticket.sh stage-plan` ausführen.
- Tailscale-Auth-Key: getaggt `tag:cloud`, ephemeral, reusable, Ablauf 90 Tage.
