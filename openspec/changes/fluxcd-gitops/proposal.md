# Proposal: fluxcd-gitops

## Why

Der fleet-Cluster wird heute push-based deployt: `task workspace:deploy ENV=<brand>` lokal bzw. CI-Workflows mit einem langlebigen `FLEET_KUBECONFIG`-Secret (`cicd-deploy`-SA-Token, 10 Jahre gültig). Das hat drei strukturelle Schwächen:

1. **Kein Drift-Schutz:** Manuelle `kubectl`-Änderungen am Cluster bleiben unbemerkt und unkorrigiert, bis der nächste Deploy sie zufällig überschreibt — oder auch nicht (server-side apply mit `--force-conflicts` überdeckt nur die gemanagten Felder).
2. **Cluster-Credentials in CI:** Jeder `build-*.yml`-Workflow hält ein voll deploy-fähiges Kubeconfig als GitHub-Secret. Kompromittierung des Repos/der Actions = Cluster-Zugriff.
3. **Deploy-Zustand ist nicht beobachtbar:** Ob der Cluster dem Git-Stand entspricht, ist nirgends abfragbar; `post-merge.yml` deployt fire-and-forget.

Pull-based Reconciliation via Flux dreht die Richtung um: der Cluster zieht sich seinen Soll-Zustand selbst, korrigiert Drift kontinuierlich und macht den Sync-Status als CRD-Status abfragbar. Die Umstellung ist eine **bewusste Architektur-Umkehr**: Flux wurde 2026 im Zuge der Fleet-Konsolidierung entfernt (`Taskfile.yml:2431-2437`), und `openspec/specs/ci-cd.md` + `workspace-deploy.md` schreiben push-based aktuell fest — beide Specs bekommen in diesem Change ihre Deltas.

## What

**Gitless GitOps (OCI-Artefakt-Sync)** — die bestehende Render-Pipeline bleibt, nur das Apply wandert in den Cluster:

- **Render & Push statt Apply:** Ein neuer CI-Job rendert pro Brand mit der bestehenden `kustomize build | sed | envsubst | sed`-Pipeline (löst das `${VAR}`-Templating-Problem ohne Manifest-Umbau) und pusht das Ergebnis als OCI-Artefakt nach `oci://ghcr.io/paddione/fleet-manifests` (`flux push artifact`). Struktur im Artefakt: `sealed-secrets/`, `platform/`, `mentolder/`, `korczewski/`, `website-mentolder/`, `website-korczewski/` + `clusters/fleet/` mit den Flux-`Kustomization`-CRs (dependsOn-Kette: sealed-secrets → platform → brands).
- **Flux Operator + FluxInstance:** Flux Operator per Helm auf fleet; eine `FluxInstance` namens `flux` (Komponenten: source-controller, kustomize-controller, notification-controller) mit `spec.sync` auf das OCI-Artefakt (`pullSecret` für privates GHCR).
- **Drift Detection + Self-Healing:** `prune: true`, `wait`, force-Reconcile — manuelle Cluster-Änderungen werden zurückgedreht.
- **Receiver-Webhook:** CI pingt nach dem Artefakt-Push den Flux-Receiver → Sofort-Reconcile statt Intervall-Polling.
- **SealedSecrets bleiben:** `environments/sealed-secrets/fleet-*.yaml` wandern mit ins Artefakt; der `deploy-sealed-secrets.yml`-Workflow entfällt; der bisher imperativ erzeugte `ghcr-pull-secret` (aus `GHCR_PAT`) wird ein committetes SealedSecret.
- **CI-Rückbau:** `post-merge.yml`-`deploy-manifests` und die `kubectl set image`/`rollout restart`-Steps der `build-*.yml`-Workflows werden durch „Artefakt-Re-Render mit SHA-Tag + Receiver-Ping" ersetzt. `FLEET_KUBECONFIG` bleibt übergangsweise nur für imperative Post-Steps (`website:migrate`, `talk-setup`, `sync-db-passwords`) — vollständiger Rückbau und Flux Image Automation sind Follow-ups (Letzteres nach `unpinned-latest-images`).
- **Out of Scope:** k3d-dev bleibt push-based; Notifications/Alerts (Provider) nicht in Stufe 1; SOPS-Migration verworfen (SealedSecrets etabliert).

_Ticket: T002083_
