# Runbook: k3s-Node rejoinen (Fall: gekko-hetzner-2)

**Kontext:** Node fehlt seit Join vor 85 d, ping-bar (10.20.0.4), Longhorn
READY=False, Prometheus-PVC (~38 GB) robustness=degraded.
**Entscheidung Operator 2026-08-24:** REJOIN, keine Dekommissionierung.
**Ticket:** T016442 · Epic T016422

> ⚠ **Ausführungsgrenze:** Schritte mit **MANUELL — Operator** dürfen nicht
> vom autonomen Factory-Tick ausgeführt werden. Alles andere ist lesend.

## Ursache prüfen

Bevor die Node neu beigetreten wird, die Ursache des Ausfalls klären — nur
so verhindert man einen erneuten Join-Flop:

```bash
# Ist der k3s-Agent-Service noch aktiv?
ssh root@10.20.0.4 'systemctl status k3s-agent --no-pager'
ssh root@10.20.0.4 'journalctl -u k3s-agent --no-pager -n 50'
```

- Läuft der Service nicht bzw. ist fehlerhaft, wird er
  **MANUELL — Operator** neu gestartet:
  ```bash
  ssh root@10.20.0.4 'systemctl restart k3s-agent'
  ```
- Historische Falle: Der Node wurde ursprünglich als **k3s-Server** installiert
  (siehe `cluster-dev-node-umbau.md`) — ein überlagerndes Server-Systemd-Unit
  überschreibt den Agent und verhindert den Join. Beim Rejoin zwingend als
  **Agent**, nie als Server, aufsetzen.

## Agent rejoinen

Die Node tritt dem Control-Plane **MANUELL — Operator** als Agent wieder bei:

```bash
# Node-Token vom Control-Plane holen (k3s-Server primärer Node):
TOKEN=$(ssh control-plane 'sudo cat /var/lib/rancher/k3s/server/node-token')

# Auf dem Node als k3s-Agent installieren/joinen:
ssh root@10.20.0.4 'curl -sfL https://get.k3s.io | \
  K3S_URL=https://control-plane:6443 \
  K3S_TOKEN='"'"'"'"'"'"'"'"' sh -'
```

Danach erscheint der Node wieder in `kubectl get nodes` und meldet
`Ready` (einige Minuten zum Beobachten einplanen).

## Longhorn-Node

Sobald der Node `Ready` ist, den Longhorn-Node-Status verifizieren (lesend):

```bash
kubectl --context fleet -n longhorn-system get nodes.longhorn.io
```

Erwartung: `gekko-hetzner-2` → `READY=True` **und** `SCHEDULABLE=True`.
Meldet Longhorn weiterhin `READY=False`, den Longhorn-Node bereinigen
(**MANUELL — Operator**), Datum/Zeit des Rejoins in den Inventar-Unterlagen
nachführen.

## Prometheus-PVC

Nach dem Longhorn-Ready den betroffenen PVC prüfen (lesend):

```bash
kubectl --context fleet -n monitoring get pvc
kubectl --context fleet -n longhorn-system get volumes.longhorn.io | grep monitoring
```

Erwartung: Prometheus-PVC wieder `robustness=healthy`, kein `degraded` mehr.

## Abschluss

Abschließende, rein lesende Gesamtprüfung:

```bash
bash scripts/factory/verify-rejoin.sh gekko-hetzner-2   # Exit 0 = sauber regejoint
```

Erwartung: Exit 0 — Node anwesend + `Ready`, Longhorn `READY=True` +
`SCHEDULABLE=True`, kein Longhorn-Volume mehr `degraded`.

> Nach erfolgreichem Rejoin gelten die Schritte unter **Agent rejoinen**,
> **Longhorn-Node** und ggf. **Prometheus-PVC** als erledigt; die restlichen
> Abschnitte dieses Runbooks sind lesend und ohne Operator-Eingriff ausführbar.
