# p1 — Cluster-Bootstrap-Vorlagen (gekko als Server)

Rolle: impl. Abhaengigkeit: p5 (RED-Guard steht).

## Task 5a — cloud-init-Templates auf gekko-Server umstellen

- Step: `scripts/hetzner/cloud-init-server.yaml.tmpl` und `scripts/hetzner/cloud-init.yaml.tmpl` auf D1 umstellen: node-ip aus dem privaten Netz (192.168.200.x), Flannel ueber das private Interface, kein vpn-auth, Tailscale mit eigenem fleet-Tag, tls-san mit Tailnet-Namen und -IPs, Key-Ablauf aus, oeffentlich nur 80/443.
- Step: `scripts/hetzner/render-cloud-init.sh` so anpassen, dass das Rendering fuer gekko-hetzner-2/3/4 ohne WG-Parameter laeuft (Ist 110 bei Budget 690, Wachstumsreserve vorhanden).
- Step: `environments/fleet.yaml` auf den neuen Cluster-Kontext und das gekko-Node-Inventar (3 Server, embedded etcd) aktualisieren.
- Acceptance: Gerenderte cloud-init fuer alle drei gekko-Nodes enthaelt keine WG-Referenz und die privaten Node-IPs; `bash scripts/hetzner/render-cloud-init.sh --help` beziehungsweise der dokumentierte Render-Aufruf laeuft fehlerfrei.
