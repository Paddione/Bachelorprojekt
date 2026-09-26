---
title: "p1 — Decommission systemd units and Kubernetes dev-stack runner manifests"
ticket_id: T900399
domains: [infra-ops]
status: active
---

# p1 — Decommission systemd units and Kubernetes dev-stack runner manifests

Files: `k3d/dev-stack/kustomization.yaml`, `k3d/dev-pod/deployment.yaml` (target_files dieses Partials; disjunkt zu p2–p5).

## Task 1.1: Systemd Units stoppen, deaktivieren und löschen

1. Laufende systemd User-Services und Timer stoppen und disablen:
   ```bash
   systemctl --user stop factory.timer factory.service factory-mcp.service 2>/dev/null || true
   systemctl --user disable factory.timer factory.service factory-mcp.service 2>/dev/null || true
   ```
2. Symlinks bzw. Unit-Dateien in `~/.config/systemd/user/` entfernen:
   ```bash
   rm -f ~/.config/systemd/user/factory.timer ~/.config/systemd/user/factory.service ~/.config/systemd/user/factory-mcp.service
   systemctl --user daemon-reload
   ```
3. Löschen der Unit-Quellen im Repository:
   - `scripts/factory/factory.service`
   - `scripts/factory/factory.timer`
   - `scripts/factory/mcp-go/factory-mcp.service`

## Task 1.2: Kubernetes Dev-Stack & Cluster-Ressourcen bereinigen

1. Entfernen der Dev-Stack-Manifeste:
   - `k3d/dev-stack/factory-runner.yaml`
   - `k3d/dev-stack/factory-runner-netpol.yaml`
   - `k3d/dev-stack/factory-runner-bootstrap.yaml`
   - `k3d/dev-stack/factory-runner-secrets-patch.yaml`
   - `k3d/monitoring/grafana-dashboards/factory-otel.json`
2. Bereinigen von `k3d/dev-stack/kustomization.yaml`:
   - Entfernen von `factory-runner.yaml` und `factory-runner-netpol.yaml` aus `resources:`
   - Entfernen des Patches `factory-runner-secrets-patch.yaml` aus `patches:`
   - Entfernen des Kommentars / Image-Ausnahmeblocks für `ghcr.io/paddione/factory-runner`
3. Bereinigen von `k3d/dev-pod/deployment.yaml`:
   - Entfernen der Secret-Referenz `factory-runner-secrets`
4. Validierung der Bereinigung:
   ```bash
   task workspace:validate
   ```
