# p1 — k3d-Manifeste bereinigen

Ziel: Alle Deployments der 6 Dienste aus dem k3d-Stack entfernen; gemischte Dateien nur editieren.

## Löschen (ganze Dateien/Verzeichnisse)

- `k3d/nextcloud.yaml`, `k3d/nextcloud-redis.yaml`, `k3d/nextcloud-notification-config-job.yaml`
- `k3d/talk-hpb.yaml`, `k3d/talk-recording.yaml`
- `k3d/whiteboard/` (ganz: `whiteboard.yaml` + `kustomization.yaml`)
- `k3d/coturn-stack/` (ganz: 6 Dateien)
- `k3d/talk-transcriber/` — VORHER prüfen: nur löschen, wenn Verzeichnis ausschließlich
  Talk-Bot-Code enthält; sonst nur Whiteboard-/Nextcloud-Refs entfernen.
- Nextcloud-OIDC-Config-Quellen (`nextcloud-oidc-dev.php`, `zz-extra.config.php` o.ä.) — nur wenn
  sie ausschließlich von den gelöschten ConfigMaps referenziert werden.

## Editieren (Einträge entfernen, Rest erhalten)

- `k3d/kustomization.yaml`: `nextcloud.yaml`, `nextcloud-redis.yaml`,
  `nextcloud-notification-config-job.yaml`, `talk-hpb.yaml`, `whiteboard`, `talk-recording.yaml`
  aus `resources` streichen; `nextcloud-oidc-config`/`nextcloud-extra-config`-Generatoren nur
  entfernen, wenn Quelldateien mitgelöscht wurden. Kommentar zu coturn/janus/Collabora aktualisieren.
- `k3d/ingress.yaml`: files-/board-Hosts (Nextcloud, Whiteboard) streichen.
- `k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml`: nur Nextcloud-/Whiteboard-Keys streichen.
- `k3d/website.yaml`, `k3d/website-schema.yaml`, `k3d/pvc-backup-cronjob.yaml`,
  `k3d/vaultwarden-seed-job.yaml`: nur Service-Refs streichen — VORHER prüfen, ob referenzierte
  Blöcke (z.B. Seed-Daten, Backup-Pfade) eigenständig weiterleben müssen.

## Verify dieses Partials

`kustomize build k3d/` läuft ohne Fehler; `grep -rin "whiteboard\|coturn\|janus\|talk-hpb\|nextcloud-redis" k3d/`
trifft nur noch begründete Reste (dann in p6-Allowlist aufnehmen oder hier nachziehen).
