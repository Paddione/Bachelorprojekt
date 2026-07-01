# Proposal: g-img01-image-pinning

_Ticket: T001294_

## Why

Kubernetes manifests in `k3d/` und `prod*/` referenzieren 41 Fremd-Images ausschließlich über mutable Tags (z. B. `nextcloud:33-apache`, `postgres:16-alpine`, `livekit/livekit-server:v1.11.0`). Ein Tag ist kein unveränderlicher Bezeichner: ein Registry-Maintainer kann dasselbe Tag auf ein neues Layer-Set umzeigen, ohne dass sich der Dateiinhalt im Repo ändert. Beim nächsten Pod-Restart oder Node-Drain holt `kubelet` das neu getaggte Image — ohne Warnung, ohne Diff im Git-Log, ohne CI-Gate.

Dieses Muster öffnet einen Silent-Supply-Chain-Angriffsvektor: ein kompromittierter Registry-Account oder ein böswilliger Mirror kann Code in die laufende Plattform einschleusen, ohne dass ein Commit oder PR existiert. Zusätzlich bricht der Build nichtdeterministisch, wenn ein Tag zwischen zwei Deploys bewegt wird — reproduzierbare Cluster-Snapshots sind dann nicht möglich.

Eigene Images (`website`, `brett`, `docs`, `videovault`, `mediaviewer-widget`, `mentolder-web`) sind bewusst auf `:latest` gehalten und werden per CI nach jedem Merge neugebaut; sie sind von diesem Ziel ausgenommen.

## What

Für jedes der 41 betroffenen Fremd-Images wird der aktuelle SHA-256-Digest per `crane digest` (oder `docker manifest inspect`) abgerufen und als `image:tag@sha256:<digest>`-Referenz in die betroffenen Manifest-Dateien eingetragen. Damit wird das Image unveränderlich an einen konkreten Layer-Baum gebunden.

Nach dem einmaligen Pinnen wird in `renovate.json5` die Option `pinDigests: true` für den `kubernetes`-Manager aktiviert. Renovate aktualisiert dann wöchentlich die Digests automatisch — bei jedem Update-PR ist der neue Digest nachvollziehbar im Diff sichtbar und durchläuft die normalen CI-Gates.

Das Vorgehen teilt sich in drei Phasen auf:
1. `crane` lokal installieren und alle 41 Digests ermitteln.
2. Manifest-Dateien in `k3d/`, `prod-fleet/`, `prod-mentolder/`, `prod-korczewski/` aktualisieren — gruppiert nach Monitoring-Stack (rendered YAMLs), Core-Infrastructure, Application-Images und Prod-Overlays.
3. `renovate.json5` ergänzen, sodass künftige Digest-Updates automatisch per PR eintreffen.

## Impact

**Geänderte Dateien:**
- `k3d/monitoring/kube-prometheus-stack-rendered.yaml` — 9 Images pinnen
- `k3d/monitoring/loki-rendered.yaml` — 1 Image pinnen
- `k3d/monitoring/promtail-rendered.yaml` — 1 Image pinnen
- `k3d/monitoring/otel-collector.yaml` — 1 Image pinnen
- `k3d/shared-db.yaml`, `k3d/nextcloud-redis.yaml`, `k3d/nextcloud.yaml`, `k3d/livekit.yaml`, `k3d/vaultwarden.yaml`, `k3d/mailpit.yaml`, `k3d/ntfy.yaml`, `k3d/talk-hpb.yaml`, `k3d/talk-recording.yaml`, `k3d/whiteboard/whiteboard.yaml`, `k3d/pocket-id.yaml`, `k3d/sealed-secrets-controller.yaml`, `k3d/coturn-stack/coturn.yaml`, `k3d/coturn-stack/janus.yaml`, `k3d/sessions-server.yaml`, `k3d/office-stack/collabora.yaml`, `k3d/dev-stack/sish.yaml`, `k3d/dev-stack/oauth2-proxy-*.yaml`, `k3d/dev-stack/shared-db-dev.yaml`, `k3d/dev-cluster/kube-vip-ds.yaml`, `k3d/einvoice-sidecar.yaml`, `k3d/recovery-browser.yaml`, `k3d/admin-actions-cronjobs.yaml`, `k3d/backup-cronjob.yaml`, `k3d/knowledge-ingest-cronjob.yaml`, `k3d/notify-unread-cronjob.yaml`, `k3d/pvc-backup-cronjob.yaml`, `k3d/tests-retention-cronjob.yaml`, `k3d/cronjob-*.yaml`, `k3d/vaultwarden-seed-job.yaml`, `k3d/pocket-id-client-seed.yaml`, `k3d/studio.yaml`, `k3d/oauth2-proxy-*.yaml` — Core- und Application-Images pinnen
- `prod-mentolder/talk-transcriber.yaml`, `prod-mentolder/whisper.yaml`, `prod-mentolder/dev-db-refresh-cron.yaml` — Prod-Overlay-Images pinnen
- `prod-korczewski/talk-transcriber.yaml`, `prod-korczewski/whisper.yaml`, `prod-korczewski/dev-db-refresh-cron.yaml`, `prod-korczewski/ddns-updater.yaml`, `prod-korczewski/oauth2-proxy-dev.yaml`, `prod-korczewski/whisper.yaml` — Prod-Overlay-Images pinnen
- `renovate.json5` — `pinDigests: true` für den `kubernetes`-Manager ergänzen

**Risiken:**
- Rendered Monitoring-YAMLs sind groß und werden normalerweise nicht manuell bearbeitet. Ein Fehler im Sed/Replace-Schritt kann die Datei beschädigen — deshalb wird nach dem Pinnen `task workspace:validate` ausgeführt.
- `ghcr.io/paddione/collabora-code` ist ein eigenes CI-Image und bei Renovate disabled. Der Digest wird einmalig gepinnt; zukünftige Renovate-PRs für dieses Image erscheinen nicht automatisch. Beim Collabora-Release-Update muss der Digest manuell aktualisiert werden.
- `canyan/janus-gateway` verwendet bereits eine Commit-SHA im Tag, bietet aber keinen @sha256-Digest. Das Image wird dennoch gepinnt.

**Out-of-Scope:**
- Eigene Images: `website`, `brett`, `docs`, `videovault`, `mediaviewer-widget`, `mentolder-web` — bewusst `:latest`, werden per CI verwaltet.
- `ghcr.io/paddione/`-Images außer `collabora-code` sind durch die Renovate-Disabled-Regel abgedeckt und werden separat per CI-Release-Tag gehandhabt.
- Staging-Stack-Images in `k3d/staging-stack/` werden von derselben Mess-Formel miterfasst und ebenfalls gepinnt.
