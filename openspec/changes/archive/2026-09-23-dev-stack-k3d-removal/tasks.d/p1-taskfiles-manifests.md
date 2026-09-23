## p1 — Taskfiles & Manifests

Target files: `Taskfile.yml`, `taskfiles/Taskfile.dev-stack.yml`, `taskfiles/Taskfile.staging.yml`, `scripts/staging-id.sh`, `k3d/staging-stack/ingress-staging.yaml`, `k3d/staging-stack/kustomization.yaml`, `k3d/staging-stack/namespace.yaml`, `k3d/staging-stack/shared-db-staging.yaml`, `k3d/staging-stack/website-staging.yaml`, `k3d/dev-stack/cert-manager.yaml`, `k3d/dev-stack/traefik-tls.yaml`, `k3d/dev-stack/website-dev.yaml`, `k3d/dev-stack/brett-dev.yaml`, `k3d/dev-stack/kustomization.yaml`, `k3d/dev-stack/sish.yaml`, `dev-local/cluster/tls.yaml`

- [ ] **Taskfile.yml — Staging-Include entfernen.**
  Das Include `staging: taskfiles/Taskfile.staging.yml` aus `Taskfile.yml` entfernen.

- [ ] **taskfiles/Taskfile.staging.yml und k3d/staging-stack/ löschen.**
  Die abgelösten Staging-Dateien entfernen:
  - `taskfiles/Taskfile.staging.yml`
  - `scripts/staging-id.sh`
  - `k3d/staging-stack/ingress-staging.yaml`
  - `k3d/staging-stack/kustomization.yaml`
  - `k3d/staging-stack/namespace.yaml`
  - `k3d/staging-stack/shared-db-staging.yaml`
  - `k3d/staging-stack/website-staging.yaml`

- [ ] **taskfiles/Taskfile.dev-stack.yml — k3d-Tasks und SSH-Imports abbauen.**
  - `build:website`, `build:brett`, `apply`, `deploy` und `_materialise-secrets` entfernen.
  - `redeploy:website` und `redeploy:brett` umstellen auf `kubectl rollout restart` und `kubectl rollout status` auf `CTX_DEV` im Namespace `NS_DEV`.
  - Neuer Task `dev:secrets` (ersetzt `_materialise-secrets`), der nur noch `ghcr-pull-secret`, `shared-db-dev-secrets`, `workspace-secrets` und `mcp-tokens` in `NS_DEV` anlegt (`ipv64-api-key` und `sish-authorized-keys` entfallen).
  - Bestehende Tasks `logs`, `psql`, `tunnel`, `firewall:open`, `db:refresh` unverändert beibehalten.

- [ ] **k3d/dev-stack/ Manifeste anpassen.**
  - `k3d/dev-stack/cert-manager.yaml` und `k3d/dev-stack/traefik-tls.yaml` löschen.
  - In `k3d/dev-stack/website-dev.yaml` und `k3d/dev-stack/brett-dev.yaml`: `imagePullPolicy: Always` setzen.
  - In `k3d/dev-stack/kustomization.yaml`: Referenzen auf gelöschte Manifeste bereinigen.
  - In `k3d/dev-stack/sish.yaml` und `dev-local/cluster/tls.yaml`: Kommentare aktualisieren.
