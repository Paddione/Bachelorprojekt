# p2 — Manifeste haerten und Plattform-Zielbild

Rolle: impl. Abhaengigkeit: p5 (RED-Guard steht).

## Task 3 — Feste Node-Namen, Alt-IPs, Longhorn entfernen (R3)

- Step: In `prod/cloud-init.yaml`, `prod/cloud-init-join-cp.yaml` und `prod/cloud-init-worker.yaml` die WG-Abschnitte entfernen und den Bootstrap auf die gekko-Rollen aus p1 abstimmen.
- Step: In `prod-fleet/mentolder/kustomization.yaml` feste Node-Namen (pk-hetzner-8 fuer local-path/smb), alte WG-IPs und Longhorn-StorageClass-Referenzen fuer den Prod-Umfang entfernen oder auf local-path umstellen (D3). Flux-Ziel auf nur Prod-Kustomizations begrenzen (Q16); staging-, dev- und korczewski-Namespaces aus dem fleet-Pfad nehmen (Ziel devmesh).
- Acceptance: `grep -rn "pk-hetzner" prod/ prod-fleet/` liefert fuer den Prod-Umfang keine Treffer mehr; `kubectl kustomize` der Prod-Kustomization baut fehlerfrei.

## Task 6a — Schlankes Monitoring

- Step: `prod/monitoring/kustomization.yaml` auf kube-prometheus ohne Loki mit kurzer Retention umstellen; Ressourcenlimits auf das gekko-RAM-Budget zuschneiden (R1: nur Prod plus schlankes Monitoring, ca. 7-8 GiB Pods).
- Acceptance: Kustomization baut fehlerfrei; keine Loki-Komponente und keine Longhorn-StorageClass mehr im Monitoring-Pfad.
