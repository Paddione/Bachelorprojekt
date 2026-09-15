# Design: devmesh-tailnet

## Goals

- Jeder Dev-Client erreicht jeden devmesh-Server zu Hause auf direktem LAN-Pfad.
- Außerhalb des Heimnetzes funktioniert derselbe Name weiter, ohne eingehenden Port.
- Der Soll-Zustand (Peers, Tags, ACL) liegt im Repo und ist maschinell prüfbar.

## Non-Goals

- Ersatz des `wg-gpu`-Meshes oder des `wg-fleet`-Meshes.
- Transport für k3s-Control-Plane oder Flannel.
- Selbst gehostete Koordination (Headscale).

## Kontext (gemessen 2026-09-11)

```bash
# WSL auf PK-Desktop haengt direkt im LAN (mirrored)
ip -br a                                   # eth0 10.10.0.3/8, wg0 192.168.100.10/32
grep -i networkingMode /mnt/c/Users/*/.wslconfig   # networkingMode = mirrored
# alle vier Ubuntu-Hosts antworten
for h in 10.0.33.1 10.1.0.101 10.10.10.2 10.10.10.3; do ping -c1 -W2 $h; done
# Tailscale-Dienst auf PK-Desktop
"/mnt/c/Program Files/Tailscale/tailscale.exe" status   # unexpected state: NoState
```

## Decisions

### D1 — Tailnet statt WireGuard-Full-Mesh

| Option | Bewertung |
|---|---|
| Tailnet (gewählt) | Automatische Pfadwahl LAN/DERP, Clients für Windows/Linux, schon im Einsatz (`pk-desktop`, `pk-hetzner-8`). Koordination über Tailscale-SaaS. |
| WireGuard + Failover-Agent | Ein Endpoint pro Peer, kein eingebauter Wechsel; NAT↔NAT braucht einen Hub; Failover auf Windows nicht verlässlich. |
| Headscale | Gleiches Verhalten ohne SaaS, aber ein weiterer Dienst plus eigenes DERP. Bleibt Ausbaupfad. |

Trade-off: Tailscale sieht Metadaten (Geräte, Schlüssel, Verbindungszeiten), nicht den
Inhalt. Das wird in der DSGVO-Doku als Auftragsverarbeitung vermerkt.

### D2 — Tailscale im Windows-Host, nicht in der WSL-Distro

Mirrored Networking spiegelt alle Windows-Interfaces in die Distro. Ein zweiter
Tailscale-Knoten in WSL würde dasselbe Gerät doppelt ins Tailnet bringen und Routen
konkurrieren lassen. `tailnet-check.sh` läuft trotzdem aus WSL und nutzt die Windows-CLI,
wenn keine Linux-CLI vorhanden ist.

### D3 — Tags statt Benutzer-ACLs

Server bekommen `tag:devmesh` über einen einmaligen, getaggten Auth-Key. Getaggte Knoten
verlieren ihre Key-Expiry-Bindung an einen Benutzer, damit ein Server nicht nach 180 Tagen
aus dem Tailnet fällt. Auth-Keys werden nie committet und nach dem Beitritt widerrufen.

### D4 — Remote-Zugriff ohne eingehenden Port

ADR-006 schloss Remote-Zugang aus, weil ein eingehender Weg ins Heimnetz entstünde. Tailscale
baut nur ausgehende Verbindungen auf; die FritzBox bekommt keinen Port-Forward. Die
Schutzabsicht bleibt erhalten und wird im umbenannten Requirement explizit geprüft.

### D5 — Prüfskript unterscheidet Befund und Vorbedingung

Wie `kubelet-cert-check.sh`: Exit `1` ist ein Befund (Peer unerreichbar), Exit `2` eine
fehlende Vorbedingung. Ein nicht laufender Tailscale-Dienst darf nicht als „alle Peers weg"
gemeldet werden.

## Risks

- **R1** DERP-Latenz unterwegs: für Web-UI und `kubectl` ausreichend, für große Image-Pulls
  nicht. Images zieht der Cluster selbst aus der Registry, nicht über den Client.
- **R2** Tailscale-Ausfall (SaaS): zu Hause bleibt der LAN-Zugriff über `lan_ip` möglich,
  unterwegs gibt es dann keinen Zugang.
- **R3** Tailnet-Namen ändern sich bei Neuregistrierung eines Geräts. Das Inventar hält den
  Namen, `tailnet-check.sh` meldet Abweichungen.

## Testing

- BATS `tests/spec/local-dev-mesh/tailnet-check.bats` mit gestubbter `tailscale`-CLI:
  direkt, relay, unerreichbar (Exit 1), CLI fehlt (Exit 2), Dienst `NoState` (Exit 2).
- BATS-Guard: `devmesh/tailnet-policy.hujson` enthält keine Regel mit Ziel `tag:devclient`.
- Live-Abnahme (manuell, Befehl im Runbook): `bash scripts/devmesh/tailnet-check.sh` von
  PK-Desktop zu Hause meldet für alle Server `direct`.
