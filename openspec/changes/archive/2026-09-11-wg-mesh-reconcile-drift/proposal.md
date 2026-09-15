# Proposal: wg-mesh-reconcile-drift

## Why

Der Node-Join ins WireGuard-Mesh ist strukturell einseitig. `scripts/hetzner/generate-wg-conf.sh`
erzeugt die Config **des neuen Nodes** mit allen anderen als Peers, trägt den Neuen aber bei den
**bestehenden** Nodes nicht ein. `wireguard/wg-mesh-nodes.yaml` wird genau einmal gelesen — beim
Provisioning über `WG_CONF_B64` — und ist danach eine Behauptung ohne Rückkanal.

Der Live-Zustand belegt das (Stand 2026-09-04):

```bash
for ip in 204.168.244.104 37.27.251.38 62.238.23.79 \
          178.104.169.206 46.225.125.59 178.104.159.79; do
  ssh patrick@$ip "for i in \$(wg show interfaces); do \
    echo -n \"\$i \"; sudo wg show \$i peers | wc -l; done"
done
```

Der `fleet:`-Block deklariert acht Teilnehmer, jeder Node müsste also sieben Peers führen.
Tatsächlich hat `pk-hetzner-4` sieben, die anderen fünf Nodes je fünf — `wsl2-gpu-fleet` und
`terminal-sidekick` kennt ausschließlich `pk-hetzner-4`. Dasselbe Muster traf die Laptop-Peers aus
T006143: auf `wg-gpu` stand je ein Peer statt drei, bis T900082 sie von Hand nachtrug.

Die vorhandenen Absicherungen greifen daneben. `tests/unit/wg-mesh-fullmesh.bats` sichert
Vollvermaschung zu und ist grün, weil er die **generierte Datei** prüft, nie den Cluster.
`task fleet:membership` vergleicht nur Node-**Namen** gegen `kubectl get nodes`, nicht die
Peer-Mengen, und ist in keinem CI-Workflow verdrahtet.

## What

Zwei Tasks auf einem gemeinsamen Renderer:

- **`task wg:reconcile`** — wendet die Registry auf **alle** Nodes einer Umgebung an, statt eine
  Config für **einen** Node zu bauen. Pro Node die Soll-Peer-Menge rendern, per `wg syncconf`
  live anwenden und in die `.conf` schreiben. Idempotent, mit `--dry-run`. Damit sind Node-Join
  und Peer-Änderung derselbe Vorgang: ein Registry-Eintrag, ein Befehl.
- **`task wg:drift`** — vergleicht pro Node den Peer-Set-Hash des Ist-Zustands gegen den aus der
  Registry gerenderten Soll-Zustand und schlägt bei Abweichung fehl. Ohne Cluster-Zugang: Skip
  mit Exit 0, wie `fleet-membership-check.sh` es bereits handhabt.

Beide teilen denselben Renderer — getrennt gebaut driften sie auseinander, und der Drift-Check
würde eine andere Soll-Menge berechnen als der Reconcile herstellt.

Der Interface-Name wird **aus der Registry** bezogen, nicht hartkodiert. Er ist heute dreifach
widersprüchlich: `wg0` in `scripts/hetzner/cloud-init.yaml.tmpl`, `wg-mesh` in
`prod/cloud-init-worker.yaml`, live laufen `wg-fleet` und `wg-gpu`.

## Non-Goals

- `pod_cidr` für die Laptop-Einträge (eigenes Ticket — betrifft AllowedIPs, nicht die Peer-Menge).
- Vereinheitlichung der Interface-Namen in den cloud-init-Templates.
- Ersatz von `generate-wg-conf.sh`; es bleibt der Renderer für das Provisioning.

_Ticket: T900083_
