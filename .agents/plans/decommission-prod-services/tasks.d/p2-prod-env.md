# p2 — prod/prod-fleet/Environments/Flux bereinigen

Ziel: Dekommissionierung in allen Prod-Overlays + Env-Konfig nachziehen. Abhängig von p1
(k3d-Referenzfreiheit zuerst, damit prod-Edits gegen sauberes k3d geprüft werden).

## Löschen

- `prod/patch-nextcloud.yaml`, `prod/nextcloud-oidc-prod.php` (nur wenn unreferenziert nach Edit).
- `prod-fleet/coturn/` (ganzes Verzeichnis, 6 Dateien).
- `prod-mentolder/talk-transcriber.yaml` (Talk-Bot gehört zu Nextcloud Talk).

## Editieren

- `prod/kustomization.yaml`, `prod/ingress.yaml`, `prod/configmap-domains.yaml`:
  Nextcloud-/Whiteboard-Einträge streichen.
- `prod-mentolder/patch-data-pvc-storage.yaml`: Nextcloud-Volume-Anteile streichen.
- `environments/dev.yaml`, `environments/staging.yaml`, `environments/korczewski.yaml`,
  `environments/prodmesh-korczewski.yaml`: `NEXTCLOUD_*`-, `WHITEBOARD_*`-, Talk-HPB-/Coturn-Variablen
  und zugehörige Kommentare entfernen.
- `environments/schema.yaml`: nur entfernen, was ausschließlich diese Dienste beschreibt.
- `flux/clusters/fleet-gekko/ks-prod.yaml`: Whiteboard-Ref streichen.

## Leitplanken

- Brand korczewski ist frozen (T002479): nur Datei-Edits, keine Cluster-Writes. Da kein Dienst
  mehr läuft, ist ein Flux-Prune No-op — trotzdem nach p6 pro Namespace Abwesenheit verifizieren
  (`kubectl get deployments -A | grep -iE 'nextcloud|whiteboard|coturn|janus|nats|redis'` → leer).
- `prod/reflector.yaml`, `prod/patch-signaling-backend.yaml`, `prod/coredns-signaling-override.yaml`,
  `prod/wildcard-certificate.yaml`, `prod/cloud-init*.yaml`: nur anfassen, wenn ein Eintrag
  ausschließlich den retirierten Diensten dient — sonst stehen lassen.

## Verify dieses Partials

`kustomize build prod/` und `kustomize build prod-fleet/` grün; Env-YAMLs parsen
(`python3 -c yaml.safe_load`); Abwesenheits-Check auf devmesh.
