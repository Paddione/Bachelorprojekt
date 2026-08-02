---
ticket_id: T002083
plan_ref: openspec/changes/fluxcd-gitops/tasks.md
status: active
date: 2026-07-22
---

# Design: fluxcd-gitops — Pull-based GitOps via Flux Operator + OCI-Artefakt

## Kontext & Entscheidung

Brainstorming 2026-07-22 (Board: `.lavish/fluxcd-gitops-brainstorm.html`, Ticket T002083):

| Entscheidung | Wahl | Begründung |
|---|---|---|
| Sync-Modell | **OCI-Artefakt (Gitless GitOps)** | Die committeten Overlays sind template-behaftet (~40+ `${VAR}` via `ENVSUBST_VARS`, `Taskfile.yml:2757-2786`) und erst nach `kustomize build \| sed \| envsubst \| sed` anwendbar (inkl. `$$`-Escape T001673). CI rendert weiter mit exakt dieser Pipeline und pusht das fertige Ergebnis als OCI-Artefakt — null Manifest-Umbau, Flux appliziert nur noch. |
| Secrets | **SealedSecrets beibehalten** | Controller läuft auf fleet (`sealed-secrets`-ns); `environments/sealed-secrets/fleet-*.yaml` sind committet und placeholder-frei → wandern 1:1 ins Artefakt. SOPS-Migration verworfen. |
| Scope | **fleet komplett** | platform + sealed-secrets + beide Brands + website-Overlays. k3d-dev bleibt push-based (schnelle Iteration). |
| Features Stufe 1 | **Drift Detection + Self-Healing, Receiver-Webhook** | prune/wait/force; CI pingt Receiver nach Artefakt-Push → Sofort-Reconcile. Notifications (Provider/Alert) nicht in Stufe 1. |
| Image Automation | **Follow-up** | Benötigt `:latest`-Pinning (offener Change `unpinned-latest-images`). Zwischenlösung in diesem Change: Build-Workflows triggern Artefakt-Re-Render mit SHA-Tag statt `kubectl set image`/`rollout restart`. |

## Zielarchitektur

```
PR merge → main
  │
  ├─ CI: render-fleet-artifact (neuer Workflow / post-merge-Job)
  │    für jede Komponente:
  │      kustomize build … | sed | envsubst "$ENVSUBST_VARS" | sed  → out/<komponente>/
  │    + environments/sealed-secrets/fleet-*.yaml → out/sealed-secrets/
  │    + clusters/fleet/*.yaml (Flux-Kustomization-CRs, statisch committet) → out/clusters/fleet/
  │    flux push artifact oci://ghcr.io/paddione/fleet-manifests:latest \
  │      --path=out --source=<git-url> --revision=<branch>@sha1:<sha>
  │    curl -X POST https://flux-webhook.<domain>/hook/<receiver-token>   # Sofort-Reconcile
  │
  └─ fleet-Cluster (pull):
       flux-operator (Helm) → FluxInstance "flux" (flux-system)
         spec.sync: kind=OCIRepository url=oci://ghcr.io/paddione/fleet-manifests
                    ref=latest path=clusters/fleet pullSecret=ghcr-auth
       Kustomization-Kette (dependsOn):
         flux-sealed-secrets  (path=sealed-secrets, prune=false!)
           └─ flux-platform   (path=platform)
                ├─ flux-mentolder          (path=mentolder,  ns workspace,  prune+wait)
                ├─ flux-korczewski         (path=korczewski, ns workspace-korczewski, prune+wait)
                ├─ flux-website-mentolder  (path=website-mentolder)
                └─ flux-website-korczewski (path=website-korczewski)
       Receiver (notification-controller) ← CI-Ping
```

### Render-Vertrag (CI-Seite)

- Der Render-Schritt wird als wiederverwendbares Skript `scripts/flux-render-artifact.sh` implementiert und aus einem neuen Task `flux:render` (Taskfile) + CI aufgerufen — **eine** Substitutionslogik, kein Copy-Paste der `sed|envsubst|sed`-Pipeline (die verbleibt als Funktion, die auch `workspace:deploy` für den Übergangsbetrieb nutzt).
- Quellen pro Artefakt-Pfad: `prod-fleet/platform` (placeholder-frei), `prod-fleet/mentolder`, `prod-fleet/korczewski`, `prod-fleet/website-mentolder`, `prod-fleet/website-korczewski`, `environments/sealed-secrets/fleet-{mentolder,korczewski}.yaml` (+ yq-Brand-Filterung wie in `workspace:deploy` heute).
- Env-Quellen: `scripts/env-resolve.sh fleet-mentolder` / `fleet-korczewski` — in CI brauchen die **nicht-geheimen** env_vars keine Secrets; geheime Werte stecken bereits in SealedSecrets, nicht in Manifest-Platzhaltern. Falls doch ein Platzhalter ein Secret braucht (Audit im Plan!), kommt er aus GitHub-Secrets.
- Image-Tags: `WEBSITE_IMAGE` etc. bleiben envsubst-Variablen; Build-Workflows übergeben ihr SHA-Tag als Workflow-Input an den Render-Job (`workflow_call`), statt `kubectl set image` auszuführen.

### Cluster-Seite

- **Bootstrap (einmalig, imperativ):** neuer Task `flux:bootstrap` — `helm upgrade --install flux-operator` + Apply der `FluxInstance` + `ghcr-auth`-Secret (dockerconfigjson; als SealedSecret committet, initial per kubeseal). Analog zu `sealed-secrets:install`.
- **FluxInstance:** `fluxcd.controlplane.io/v1`, name `flux`, ns `flux-system`; components: source-controller, kustomize-controller, notification-controller; `cluster.networkPolicy` kompatibel mit bestehender netpol-Struktur; `sync.kind=OCIRepository`, `sync.url=oci://ghcr.io/paddione/fleet-manifests`, `sync.ref=latest`, `sync.path=clusters/fleet`, `sync.pullSecret=ghcr-auth`.
- **Kustomization-CRs** (committet unter `flux/clusters/fleet/`, wandern ins Artefakt): alle mit `sourceRef` auf die von der FluxInstance erzeugte OCIRepository `flux-system`; `interval: 10m` (Failsafe-Polling), `retryInterval: 2m`, `timeout: 5m`, `prune: true` + `wait: true` für Brand-/Website-Overlays; `flux-sealed-secrets` mit `prune: false` (Secrets nie automatisch löschen). `dependsOn` wie im Diagramm.
- **Receiver:** `notification.toolkit.fluxcd.io/v1`, generischer Webhook, der die OCIRepository `flux-system` reconciled; IngressRoute `flux-webhook.<domain>` (Traefik, TLS wie übrige Services); Token als SealedSecret.
- **Suspend-Hebel für Betrieb:** `flux suspend kustomization <name>` dokumentiert als Ersatz für „mal eben kubectl editieren" (Drift-Korrektur macht manuelle Hotfixes sonst zunichte).

### Sonderfälle & deren Verbleib (bewusst imperativ in Stufe 1)

| Heute in `workspace:deploy` | Stufe 1 |
|---|---|
| shared-db zuerst + Wait | dependsOn-Kette + `wait: true`; shared-db bleibt Teil des Brand-Overlays (healthCheck via wait) |
| `website:migrate` (DB-Migration) | bleibt CI-Post-Step mit `FLEET_KUBECONFIG` (Follow-up: k8s Job im Overlay) |
| `sync-db-passwords`, `coturn:sync-secret`, `talk-setup` | bleiben imperative Tasks (unverändert, dokumentiert) |
| `ghcr-pull-secret` aus `GHCR_PAT` | deklaratives SealedSecret je Namespace |
| `deploy-sealed-secrets.yml` | entfällt — Flux reconciled `sealed-secrets/`-Pfad |
| `post-merge.yml` `deploy-manifests` | ersetzt durch render+push+Receiver-Ping |
| `build-*.yml` `set image`/`rollout restart` | ersetzt durch Re-Render-Trigger mit SHA-Tag |

### Rollback & Betrieb

- **Rollback = Git-Revert** → CI rendert altes Artefakt → Flux zieht nach. Zusätzlich: `flux:render` lokal + `flux push artifact` mit explizitem Tag als Break-Glass.
- **Break-Glass push-based:** `task workspace:deploy` bleibt funktionsfähig (erst suspendieren: `flux suspend ks …`), wird aber als deprecated markiert.
- **Beobachtbarkeit:** `flux get all`, `FluxReport`-CRD; Verifikation im Plan über `flux check` + Ready-Conditions.

## Risiken

1. **Drift-Korrektur vs. bestehende imperative Pfade:** Alles, was heute nach dem Apply imperativ patcht (talk-setup, sync-db-passwords), darf keine Felder anfassen, die Flux managed — Audit-Task im Plan (Feld-Kollisionen → `spec.ignore`-Einträge oder Annotation `kustomize.toolkit.fluxcd.io/ssa: Ignore`).
2. **Artefakt-Rendering mit Secrets:** Der Render-Job darf keine Secret-Werte in Manifeste substituieren (Audit der ENVSUBST_VARS gegen `environments/schema.yaml`: welche sind `secret: true`?). SealedSecrets decken die geheimen Werte; Platzhalter mit Secret-Charakter sind ein Blocker-Befund.
2b. **Public-Artefakt-Leak:** `fleet-manifests` MUSS als privates GHCR-Package angelegt werden (gerenderte Manifeste enthalten interne Topologie).
3. **`prune: true` Erst-Reconcile:** Ressourcen, die heute außerhalb der Overlays leben (einzeln applizierte `k3d/tests-retention-cronjob.yaml` etc., `Taskfile.yml:2837-2851`), müssen ins Artefakt aufgenommen werden, sonst löscht prune sie NICHT (sie sind nicht gelabelt) — aber sie driften weiter. Inventur-Task im Plan.
4. **Spec-Konflikt:** `discover-versions.sh` darf laut `ci-cd.md:1055-1070` keinen `flux:`-Key schreiben — Spec-Delta muss diese Requirements umkehren, sonst schlägt `task test:all` fehl.

## Follow-ups (außerhalb dieses Changes)

- Flux **Image Automation** gitless (`ResourceSetInputProvider type=OCIArtifactTag`) nach Abschluss `unpinned-latest-images`.
- `FLEET_KUBECONFIG` vollständig aus CI entfernen (Migrationen als k8s Jobs).
- Notifications (Provider → GitHub Commit-Status / Mailpit).
- Flux MCP-Server für Agent-Debugging der Reconciliation.
