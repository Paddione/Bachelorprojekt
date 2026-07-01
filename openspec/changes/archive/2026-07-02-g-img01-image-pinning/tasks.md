---
title: "G-IMG01: Ungepinnte Fremd-Images @sha256 pinnen (39→0)"
ticket_id: T001294
domains: ["infra","security","quality"]
status: plan_staged
---

# g-img01-image-pinning — Implementation Plan

## File Structure

| Status | Datei | Änderung |
|--------|-------|----------|
| Geändert | `k3d/monitoring/kube-prometheus-stack-rendered.yaml` | 9 Images mit @sha256-Digest pinnen |
| Geändert | `k3d/monitoring/loki-rendered.yaml` | 1 Image mit @sha256-Digest pinnen |
| Geändert | `k3d/monitoring/promtail-rendered.yaml` | 1 Image mit @sha256-Digest pinnen |
| Geändert | `k3d/monitoring/otel-collector.yaml` | 1 Image mit @sha256-Digest pinnen |
| Geändert | `k3d/shared-db.yaml` | postgres, pgvector pinnen |
| Geändert | `k3d/nextcloud-redis.yaml` | redis pinnen |
| Geändert | `k3d/nextcloud.yaml` | nextcloud:33-apache pinnen |
| Geändert | `k3d/livekit.yaml` | livekit/livekit-server, egress, ingress, nats pinnen |
| Geändert | `k3d/vaultwarden.yaml` | vaultwarden/server pinnen |
| Geändert | `k3d/mailpit.yaml` | axllent/mailpit pinnen |
| Geändert | `k3d/ntfy.yaml` | binwiederhier/ntfy pinnen |
| Geändert | `k3d/talk-hpb.yaml` | strukturag/nextcloud-spreed-signaling pinnen |
| Geändert | `k3d/talk-recording.yaml` | nextcloud/aio-talk-recording pinnen |
| Geändert | `k3d/whiteboard/whiteboard.yaml` | ghcr.io/nextcloud-releases/whiteboard pinnen |
| Geändert | `k3d/pocket-id.yaml` | ghcr.io/pocket-id/pocket-id pinnen |
| Geändert | `k3d/pocket-id-client-seed.yaml` | node:22-alpine pinnen |
| Geändert | `k3d/sealed-secrets-controller.yaml` | docker.io/bitnami/sealed-secrets-controller pinnen |
| Geändert | `k3d/coturn-stack/coturn.yaml` | coturn/coturn pinnen |
| Geändert | `k3d/coturn-stack/janus.yaml` | canyan/janus-gateway pinnen |
| Geändert | `k3d/sessions-server.yaml` | nginx:1.27-alpine pinnen |
| Geändert | `k3d/office-stack/collabora.yaml` | ghcr.io/paddione/collabora-code pinnen |
| Geändert | `k3d/einvoice-sidecar.yaml` | nginx pinnen |
| Geändert | `k3d/recovery-browser.yaml` | busybox und nginx pinnen |
| Geändert | `k3d/studio.yaml` | filebrowser/filebrowser pinnen |
| Geändert | `k3d/dev-cluster/kube-vip-ds.yaml` | ghcr.io/kube-vip/kube-vip pinnen |
| Geändert | `k3d/dev-stack/sish.yaml` | antoniomika/sish pinnen |
| Geändert | `k3d/dev-stack/shared-db-dev.yaml` | postgres, pgvector pinnen |
| Geändert | `k3d/dev-stack/oauth2-proxy-brainstorm.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/dev-stack/oauth2-proxy-dev.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/dev-stack/oauth2-proxy-sessions.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/staging-stack/shared-db-staging.yaml` | postgres, pgvector pinnen |
| Geändert | `k3d/oauth2-proxy-brett.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-comfy.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-docs.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-mailpit.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-mediaviewer.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-studio.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-traefik.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/oauth2-proxy-videovault.yaml` | oauth2-proxy pinnen |
| Geändert | `k3d/admin-actions-cronjobs.yaml` | busybox, curlimages/curl, alpine/k8s pinnen |
| Geändert | `k3d/backup-cronjob.yaml` | postgres pinnen |
| Geändert | `k3d/knowledge-ingest-cronjob.yaml` | curlimages/curl oder alpine/k8s pinnen |
| Geändert | `k3d/notify-unread-cronjob.yaml` | curlimages/curl pinnen |
| Geändert | `k3d/pvc-backup-cronjob.yaml` | busybox pinnen |
| Geändert | `k3d/tests-retention-cronjob.yaml` | curlimages/curl pinnen |
| Geändert | `k3d/cronjob-dunning-detection.yaml` | curlimages/curl oder alpine/k8s pinnen |
| Geändert | `k3d/cronjob-monthly-billing.yaml` | curlimages/curl oder alpine/k8s pinnen |
| Geändert | `k3d/cronjob-scheduled-publish.yaml` | curlimages/curl oder alpine/k8s pinnen |
| Geändert | `k3d/cronjob-systemtest-cleanup.yaml` | curlimages/curl oder alpine/k8s pinnen |
| Geändert | `k3d/vaultwarden-seed-job.yaml` | curlimages/curl pinnen |
| Geändert | `prod-mentolder/talk-transcriber.yaml` | whisper/transcriber image pinnen |
| Geändert | `prod-mentolder/dev-db-refresh-cron.yaml` | postgres pinnen |
| Geändert | `prod-korczewski/talk-transcriber.yaml` | whisper/transcriber image pinnen |
| Geändert | `prod-korczewski/whisper.yaml` | faster-whisper-server pinnen |
| Geändert | `prod-korczewski/ddns-updater.yaml` | qmcgaw/ddns-updater pinnen |
| Geändert | `prod-korczewski/oauth2-proxy-dev.yaml` | oauth2-proxy pinnen |
| Geändert | `prod-korczewski/dev-db-refresh-cron.yaml` | postgres pinnen |
| Geändert | `prod-fleet/mentolder/studio-patch.yaml` | filebrowser pinnen (falls Patch vorhanden) |
| Geändert | `renovate.json5` | `pinDigests: true` für kubernetes-Manager ergänzen |

## Task 0: Baseline messen (RED)

Vor jeder Änderung den aktuellen Ist-Zustand erfassen, um den Ausgangspunkt zu dokumentieren und den rot→grün-Nachweis zu ermöglichen.

- [ ] Measure-Command ausführen:
  ```bash
  grep -rhE '^[[:space:]]*-?[[:space:]]*image:' k3d/ prod*/ 2>/dev/null \
    | grep -v '@sha256' \
    | grep -vE '^[[:space:]]*#' \
    | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
    | sed -E 's/.*image:[[:space:]]*//' \
    | sort -u \
    | wc -l
  ```
  expected: FAIL (aktueller Wert: 41 eindeutige Fremd-Images ohne @sha256-Digest in k3d/ und prod*/ — over target: 0 ungepinnte Images; Abweichung vom Baseline-Wert 39 erklärt sich durch seit der Baseline hinzugefügte Images)

- [ ] Vollständige Image-Liste zur späteren Verifikation in eine temporäre Datei sichern:
  ```bash
  grep -rhE '^[[:space:]]*-?[[:space:]]*image:' k3d/ prod*/ 2>/dev/null \
    | grep -v '@sha256' \
    | grep -vE '^[[:space:]]*#' \
    | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
    | sed -E 's/.*image:[[:space:]]*//' \
    | sort -u > /tmp/unpinned-images.txt
  cat /tmp/unpinned-images.txt
  ```

## Task 1: crane installieren

`crane` ist das kanonische Go-Tool von Google/Sigstore zum Abfragen von OCI-Registry-Metadaten ohne vollständiges Image-Pull. Es gibt den SHA-256-Digest für jedes Tag zurück.

- [ ] crane installieren:
  ```bash
  CRANE_VERSION="v0.20.2"
  curl -fsSL "https://github.com/google/go-containerregistry/releases/download/${CRANE_VERSION}/go-containerregistry_Linux_x86_64.tar.gz" \
    | tar -xz -C /usr/local/bin crane
  crane version
  ```

- [ ] Funktion testen mit einem bekannten Image:
  ```bash
  crane digest busybox:1.38.0
  # Erwartet: sha256:<64-Zeichen-Hex>
  ```

- [ ] Hilfsfunktion für Batch-Digest-Abfrage definieren (für die nachfolgenden Tasks verwendbar):
  ```bash
  get_digest() {
    local image="$1"
    # Quotes aus der YAML-Referenz entfernen, falls vorhanden
    image="${image//\"/}"
    crane digest "${image}" 2>/dev/null || echo "FEHLER: ${image}"
  }
  ```

## Task 2: Digests für alle 41 Images ermitteln

Für jedes Image den aktuellen Digest abrufen und als Referenz-Tabelle festhalten, bevor Manifest-Änderungen beginnen.

- [ ] Alle Digests in einem Durchlauf abfragen:
  ```bash
  while IFS= read -r image; do
    # Quotes entfernen
    clean="${image//\"/}"
    digest=$(crane digest "${clean}" 2>/dev/null)
    if [[ -n "$digest" ]]; then
      echo "${clean}@${digest}"
    else
      echo "FEHLER: ${clean}"
    fi
  done < /tmp/unpinned-images.txt | tee /tmp/pinned-images.txt
  ```

- [ ] Sicherstellen, dass keine Zeile mit "FEHLER:" in der Ausgabe steht. Bei Fehlern: Netzwerkverbindung zur Registry prüfen. Für Docker-Hub-Images ggf. `docker.io/` voranstellen (z. B. `busybox:1.38.0` → `docker.io/library/busybox:1.38.0`).

- [ ] Digest-Tabelle prüfen — alle 41 Images müssen einen gültigen `sha256:`-Wert haben.

## Task 3: Monitoring-Stack pinnen (rendered YAMLs)

Die kube-prometheus-stack-Dateien sind gerenderte Helm-Outputs mit mehrfach vorkommenden Image-Referenzen. Jedes Vorkommen desselben Images muss durch die gepinnte Variante ersetzt werden.

- [ ] `k3d/monitoring/kube-prometheus-stack-rendered.yaml` — 9 Unique Images:
  Für jedes der folgenden Images das gepinnte Format `"image:tag@sha256:<digest>"` (inkl. Quotes, da das Helm-Rendering quoted Werte erzeugt) per `sed` oder gezieltem Find-and-Replace eintragen:
  - `"docker.io/grafana/grafana:13.0.1-security-01"`
  - `"quay.io/kiwigrid/k8s-sidecar:2.7.3"`
  - `"quay.io/prometheus-operator/prometheus-operator:v0.91.0"`
  - `"quay.io/prometheus/alertmanager:v0.32.2"`
  - `"quay.io/prometheus/prometheus:v3.12.0-distroless"`
  - `busybox:1.38.0`
  - `ghcr.io/jkroepke/kube-webhook-certgen:1.8.3`
  - `quay.io/prometheus/node-exporter:v1.11.1-distroless`
  - `registry.k8s.io/kube-state-metrics/kube-state-metrics:v2.19.0`

  Nach dem Ersetzen prüfen:
  ```bash
  grep -cE '@sha256' k3d/monitoring/kube-prometheus-stack-rendered.yaml
  grep -E 'image:' k3d/monitoring/kube-prometheus-stack-rendered.yaml | grep -v '@sha256'
  # Zweite Ausgabe muss leer sein
  ```

- [ ] `k3d/monitoring/loki-rendered.yaml`:
  - `"docker.io/grafana/loki:3.6.7"` pinnen

- [ ] `k3d/monitoring/promtail-rendered.yaml`:
  - `"docker.io/grafana/promtail:3.5.1"` pinnen

- [ ] `k3d/monitoring/otel-collector.yaml`:
  - `otel/opentelemetry-collector-contrib:0.145.0` pinnen

- [ ] Kustomize-Validierung nach Monitoring-Block:
  ```bash
  kubectl kustomize k3d/ --dry-run 2>&1 | head -20 || true
  ```

## Task 4: Core-Infrastructure-Images pinnen

Diese Images werden in vielen Dateien mehrfach verwendet. Alle Vorkommen müssen gepinnt werden.

- [ ] **postgres:16-alpine** — erscheint in: `k3d/shared-db.yaml`, `k3d/dev-stack/shared-db-dev.yaml`, `k3d/staging-stack/shared-db-staging.yaml`, `k3d/backup-cronjob.yaml`, `prod-mentolder/dev-db-refresh-cron.yaml`, `prod-korczewski/dev-db-refresh-cron.yaml`.
  Alle Vorkommen von `postgres:16-alpine` durch `postgres:16-alpine@sha256:<digest>` ersetzen.

- [ ] **pgvector/pgvector:0.8.0-pg16** — erscheint in: `k3d/shared-db.yaml`, `k3d/dev-stack/shared-db-dev.yaml`, `k3d/staging-stack/shared-db-staging.yaml`, `prod-mentolder/dev-db-refresh-cron.yaml`, `prod-korczewski/dev-db-refresh-cron.yaml`.

- [ ] **redis:7.4-alpine** — erscheint in: `k3d/nextcloud-redis.yaml`.

- [ ] **nginx:1.27-alpine** — erscheint in: `k3d/sessions-server.yaml` und ggf. weiteren Proxy-Dateien.

- [ ] **node:22-alpine** — erscheint in: `k3d/pocket-id-client-seed.yaml`.

- [ ] **busybox:1.38.0** — erscheint in: `k3d/recovery-browser.yaml`, `k3d/pvc-backup-cronjob.yaml`, und in `kube-prometheus-stack-rendered.yaml` (bereits in Task 3 behandelt).

- [ ] **alpine/k8s:1.34.0** — erscheint in CronJob-Dateien für kubectl-basierte Admin-Aktionen.

- [ ] **curlimages/curl:8.7.1** — erscheint in: `k3d/admin-actions-cronjobs.yaml`, `k3d/notify-unread-cronjob.yaml`, `k3d/tests-retention-cronjob.yaml`, `k3d/vaultwarden-seed-job.yaml`, und weiteren CronJob-Dateien.

- [ ] **nats:2.10-alpine** — erscheint in: `k3d/livekit.yaml`.

- [ ] Zwischenprüfung nach jedem Image:
  ```bash
  grep -rh "image:.*<image-name>" k3d/ prod*/ | grep -v '@sha256'
  # Muss leer sein
  ```

## Task 5: Application-Images pinnen

- [ ] **nextcloud:33-apache** → `k3d/nextcloud.yaml`

- [ ] **nextcloud/aio-talk-recording:20260409_094910** → `k3d/talk-recording.yaml`

- [ ] **ghcr.io/nextcloud-releases/whiteboard:v1.5.7** → `k3d/whiteboard/whiteboard.yaml`

- [ ] **strukturag/nextcloud-spreed-signaling:2.1.1** → `k3d/talk-hpb.yaml`

- [ ] **livekit/livekit-server:v1.11.0** → `k3d/livekit.yaml`

- [ ] **livekit/egress:v1.9.0** → `k3d/livekit.yaml`

- [ ] **livekit/ingress:v1.5.0** → `k3d/livekit.yaml`

- [ ] **vaultwarden/server:1.35.3-alpine** → `k3d/vaultwarden.yaml`

- [ ] **axllent/mailpit:v1.29** → `k3d/mailpit.yaml`

- [ ] **binwiederhier/ntfy:v2.24.0** → `k3d/ntfy.yaml`

- [ ] **ghcr.io/pocket-id/pocket-id:v2.9.0** → `k3d/pocket-id.yaml`

- [ ] **filebrowser/filebrowser:v2.63.5** → `k3d/studio.yaml` und `prod-fleet/mentolder/studio-patch.yaml` (falls Patch-Datei das Image direkt referenziert).
  Hinweis: Die bestehende Inline-Annotation `# pinned (was floating :v2)` bleibt erhalten; sie wird um den @sha256-Digest ergänzt.

- [ ] **docker.io/bitnami/sealed-secrets-controller:0.27.3** → `k3d/sealed-secrets-controller.yaml`

- [ ] **coturn/coturn:4.9-alpine** → `k3d/coturn-stack/coturn.yaml`

- [ ] **canyan/janus-gateway:master_cefca79700bdadd32d759ce65ba3805552a4d312** → `k3d/coturn-stack/janus.yaml`

- [ ] **antoniomika/sish:v2.22.1** → `k3d/dev-stack/sish.yaml`

- [ ] **ghcr.io/paddione/collabora-code:25.04.9.4.1-setcap** → `k3d/office-stack/collabora.yaml`.
  Dieses Image ist bei Renovate deaktiviert (`ghcr.io/paddione/` Disabled-Regel). Der Digest wird einmalig gepinnt. Kommentar hinzufügen: `# digest gepinnt; Renovate deaktiviert — bei Collabora-Release manuell aktualisieren`.

- [ ] **ghcr.io/kube-vip/kube-vip:v0.8.7** → `k3d/dev-cluster/kube-vip-ds.yaml`

- [ ] **quay.io/oauth2-proxy/oauth2-proxy:v7.9.0** → alle `k3d/oauth2-proxy-*.yaml` und `k3d/dev-stack/oauth2-proxy-*.yaml` und `prod-korczewski/oauth2-proxy-dev.yaml`.
  Da dieses Image in vielen Dateien vorkommt, bietet sich ein globaler Replace an:
  ```bash
  DIGEST=$(crane digest quay.io/oauth2-proxy/oauth2-proxy:v7.9.0)
  find k3d/ prod-korczewski/ -name '*.yaml' -exec grep -l 'oauth2-proxy:v7.9.0' {} \; \
    | xargs sed -i "s|quay.io/oauth2-proxy/oauth2-proxy:v7.9.0|quay.io/oauth2-proxy/oauth2-proxy:v7.9.0@${DIGEST}|g"
  ```

- [ ] **Prod-Overlays** — Images in `prod-mentolder/` und `prod-korczewski/` pinnen:
  - `prod-mentolder/talk-transcriber.yaml` und `prod-korczewski/talk-transcriber.yaml`: Transcriber-Image pinnen.
  - `prod-korczewski/whisper.yaml`: faster-whisper-server-Image pinnen.
  - `prod-korczewski/ddns-updater.yaml`: DDNS-Updater-Image pinnen.

## Task 6: Renovate pinDigests aktivieren

Damit Renovate die in Tasks 3–5 gesetzten Digests automatisch aktuell hält, muss `pinDigests: true` für den `kubernetes`-Manager in der globalen Renovate-Konfiguration ergänzt werden.

- [ ] `renovate.json5` öffnen und im Block `"packageRules"` eine neue Regel für alle Kubernetes-Images ergänzen:
  ```jsonc
  // Kubernetes images: digest-Pinning aktivieren.
  // Renovate ersetzt @sha256:... bei jedem Update automatisch.
  {
    "matchManagers": ["kubernetes"],
    "pinDigests": true
  },
  ```
  Diese Regel wird unmittelbar nach dem bestehenden Kommentar `// ── Kubernetes / Docker images ─────` als erste packageRule für kubernetes eingefügt, damit sie für alle Images ohne weitere Filterung gilt.

- [ ] Alternativ: `pinDigests: true` direkt im Top-Level `"kubernetes":`-Objekt setzen, falls Renovate diesen Schlüssel auf Manager-Ebene unterstützt. In diesem Fall gilt er ohne packageRule für alle kubernetes-Images:
  ```jsonc
  "kubernetes": {
    "fileMatch": [ ... ],
    "pinDigests": true
  }
  ```

- [ ] JSON5-Syntax validieren:
  ```bash
  node -e "const fs=require('fs'); const src=fs.readFileSync('renovate.json5','utf8'); console.log('JSON5 syntax OK');" || echo "Syntaxfehler"
  ```

- [ ] Sicherstellen, dass die bestehende `ghcr.io/paddione/`-Disabled-Regel weiterhin greift und durch die neue pinDigests-Regel nicht überschrieben wird (Renovate wendet Regeln in Reihenfolge an — spezifischere Regeln gewinnen).

## Task 7: Gesamtvalidierung

- [ ] Manifest-Syntax prüfen:
  ```bash
  task workspace:validate
  ```

- [ ] Measure-Command erneut ausführen — Ziel: 0:
  ```bash
  grep -rhE '^[[:space:]]*-?[[:space:]]*image:' k3d/ prod*/ 2>/dev/null \
    | grep -v '@sha256' \
    | grep -vE '^[[:space:]]*#' \
    | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
    | sed -E 's/.*image:[[:space:]]*//' \
    | sort -u \
    | wc -l
  # Erwartet: 0
  ```

- [ ] Health-Goal-Check:
  ```bash
  bash scripts/health-goals-check.sh --only=G-IMG01
  ```

## Task 8 (Verify): Quality Gates

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] `task freshness:check`
