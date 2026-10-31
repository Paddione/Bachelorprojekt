---
title: "devmesh-flux — Implementation Plan"
domains: [infra, flux, devmesh, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# devmesh-flux — Implementation Plan

Setzt `.agents/plans/devmesh-flux/design.md` um: eigenes Flux auf devmesh aus dem
signierten OCI-Artefakt `ghcr.io/paddione/devmesh-manifests`, `dev-pod` zieht von
fleet nach devmesh, der Dev-Stack auf fleet (`flux-dev`, `flux-dev-pod`) wird
abgebaut. Entscheidungen Q1–Q5 und D4/D5 stehen im Design und werden hier nicht
neu verhandelt.

Live-Schritte gegen Cluster (Task 8 und Task 9 Teil A) laufen nur nach
ausdrücklicher Freigabe des Nutzers in der Ausführungs-Session. Alle übrigen
Tasks ändern nur das Repo.

## File Structure

| Datei | Ist-Zeilen | Budget |
|---|---|---|
| `tests/py/spec/devmesh/test_devmesh_flux.py` | neu | Budget 800 (Limit `.py`) |
| `dev-local/components/dev-pod/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/dev-pod/dev-pod-devmesh-patch.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/components/dev-pod/ssh-tailnet-service.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/core/kustomization.yaml` | 176 | n/a (YAML ohne S1-Limit) |
| `dev-local/platform/kustomization.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/platform/helm-repositories.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/platform/cert-manager-helmrelease.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `dev-local/platform/lego-webhook-helmrelease.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `scripts/devmesh/render-stack.sh` | 81 | Budget 719 |
| `flux/clusters/devmesh/flux-instance.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `flux/clusters/devmesh/oci-source.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `flux/clusters/devmesh/ks-platform.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `flux/clusters/devmesh/ks-secrets.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `flux/clusters/devmesh/ks-workspace.yaml` | neu | n/a (YAML ohne S1-Limit) |
| `flux/clusters/devmesh/bootstrap/ghcr-auth-sealedsecret.yaml` | neu, erst in Task 8 | n/a (encryptedData, nie Platzhalter) |
| `.github/workflows/render-devmesh-artifact.yml` | neu | n/a (Workflow) |
| `taskfiles/Taskfile.devmesh.yml` | 182 | n/a (YAML ohne S1-Limit) |
| `docs/adr/ADR-015-devmesh-eigenes-flux.md` | neu | n/a (Markdown) |
| `docs/adr/ADR-008-local-k3s-dev-mesh.md` | 161 | n/a (Markdown) |
| `scripts/flux-render-artifact.sh` | 562 | Budget 238 |
| `flux/clusters/fleet/ks-dev.yaml` | löschen | n/a |
| `flux/clusters/fleet/ks-dev-pod.yaml` | löschen | n/a |
| `prod-fleet/dev/kustomization.yaml` | löschen | n/a |
| `prod-fleet/dev-pod/kustomization.yaml` | löschen | n/a |
| `components/website/src/data/test-inventory.json` | generiert | n/a (Inventar) |

`scripts/flux-render-artifact.sh` wird in Task 9 nur verkleinert (Komponenten
`dev`/`dev-pod` entfernen), Budget bleibt positiv. `scripts/devmesh/render-stack.sh`
wächst um den `--out`-Modus, deutlich unter der Schwelle.

## Task 1: Rote Verträge (pytest)

- [x] `tests/py/spec/devmesh/test_devmesh_flux.py` anlegen (Fixture `repo_root`
  wie in `tests/py/spec/test_massage_devmesh.py`). Tests rufen die Skripte auf und
  prüfen deren Ausgabe, nicht den Quelltext:
  - `test_render_out_layout`: `bash scripts/devmesh/render-stack.sh core --out <tmp>`
    erzeugt `platform/`, `secrets/` und `workspace/` mit je mindestens einem
    YAML-Dokument.
  - `test_no_mentolder_or_fleet_refs`: kein Dokument im `--out`-Baum enthält
    `mentolder.de`, `fleet-manifests` oder einen Namespace `workspace-dev`.
  - `test_dev_pod_on_devmesh`: `Deployment/dev-pod` im Render liegt in Namespace
    `workspace`, die DB-URL enthält `shared-db.workspace.svc.cluster.local`, kein
    Container referenziert `shared-db-dev`; der SSH-Service trägt
    `tailscale.com/expose: "true"` und ist nicht vom Typ `LoadBalancer` ohne
    Tailscale-Klasse.
  - `test_flux_devmesh_sources_only`: alle YAML-Dokumente unter
    `flux/clusters/devmesh/` (ohne `bootstrap/`) referenzieren als Quelle nur
    `oci://ghcr.io/paddione/devmesh-manifests` bzw.
    `https://github.com/Paddione/Bachelorprojekt` mit `path: flux/clusters/devmesh`.
  - `test_fleet_dev_components_gone`: `bash scripts/flux-render-artifact.sh --out <tmp> --only dev`
    endet mit Exit 2 und Meldung „unbekannte Komponente: dev“, und `flux/clusters/fleet/` enthält
    keine `ks-dev*.yaml`.
- [x] Rotbeleg (expected: FAIL, alle fünf Tests):
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py -q
```
- [x] Commit `test(red): devmesh-flux contracts`.

## Task 2: dev-pod als devmesh-Komponente

- [x] `dev-local/components/dev-pod/kustomization.yaml` (`kind: Component`):
  Ressource `../../../k3d/dev-pod`, Patch `dev-pod-devmesh-patch.yaml`, Ressource
  `ssh-tailnet-service.yaml`.
- [x] `dev-pod-devmesh-patch.yaml`: DB-Env von `shared-db-dev.workspace-dev...` auf
  `shared-db.workspace.svc.cluster.local` umstellen, `secretKeyRef` von
  `shared-db-dev-secrets` auf das devmesh-Secret mit `WEBSITE_DB_PASSWORD`
  (Name aus `environments/sealed-secrets/dev.yaml` lesen, nicht raten),
  vorhandenen fleet-Service vom Typ LoadBalancer/NodePort per `$patch: delete`
  entfernen, Node-Binding und `DEV_SSH_ALLOWLIST`-Bezug entfernen.
- [x] `ssh-tailnet-service.yaml`: ClusterIP-Service `dev-pod-ssh` Port 22 mit
  Annotationen `tailscale.com/expose: "true"`, `tailscale.com/hostname: dev-pod`
  (Muster `dev-local/lan-dns/adguard.yaml`).
- [x] In `dev-local/core/kustomization.yaml` unter `components:` den Eintrag
  `../components/dev-pod` ergänzen (S4: Manifest referenziert).
- [x] Grün für `test_dev_pod_on_devmesh`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py -q -k dev_pod
```

## Task 3: Plattform als Manifeste und `--out`-Modus

- [x] `dev-local/platform/`: `HelmRepository` jetstack und
  cert-manager-lego-webhook, `HelmRelease` `cert-manager` (Namespace
  `cert-manager`, Werte aus `taskfiles/Taskfile.devmesh.yml` Task `deploy`:
  `crds.enabled=true`, `podDnsPolicy=Default`, Chartversion wie live
  `v1.21.2`), `HelmRelease` `cert-manager-lego-webhook` (Chart 1.6.2, Werte
  `certManager.namespace`, `certManager.serviceAccountName`, Env aus Secret
  `ipv64-api-key` per `valuesFrom`/`extraEnvFrom` statt `kubectl set env`),
  Ressource `../../k3d/sealed-secrets-controller.yaml`, Ressource
  `../cluster/tls.yaml`. Release-Namen und Namespaces identisch mit den
  bestehenden helm-Releases, damit die HelmReleases sie übernehmen.
- [x] `scripts/devmesh/render-stack.sh`: neue Option `--out <dir>`. Ohne
  `--out` unverändert stdout (Kompatibilität mit `task devmesh:deploy` und
  `test_massage_devmesh.py`). Mit `--out`: Workspace-Render nach
  `<dir>/workspace/stack.yaml`, `kubectl kustomize dev-local/platform` plus
  `envsubst '$DEVMESH_DOMAIN'` nach `<dir>/platform/platform.yaml`,
  `environments/sealed-secrets/dev.yaml` nach `<dir>/secrets/sealed-secrets.yaml`.
  Leeres Ergebnis oder `${`-Reste brechen mit Exit 1 ab.
- [x] Grün für `test_render_out_layout` und `test_no_mentolder_or_fleet_refs`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py -q -k "out_layout or mentolder"
bash scripts/pytest-run.sh tests/py/spec/test_massage_devmesh.py -q
```

## Task 4: Flux-Einstieg `flux/clusters/devmesh/`

- [x] `flux-instance.yaml`: `FluxInstance` nach Vorbild
  `flux/clusters/fleet-gekko/flux-instance.yaml`, Sync `GitRepository`
  `https://github.com/Paddione/Bachelorprojekt`, `ref: refs/heads/main`,
  `path: flux/clusters/devmesh`, `interval: 10m`, `cluster.size: small`.
- [x] `oci-source.yaml`: `OCIRepository` `devmesh-manifests`, URL
  `oci://ghcr.io/paddione/devmesh-manifests`, `ref.tag: latest`, `interval: 5m`,
  `secretRef: ghcr-auth`, `verify.provider: cosign` mit `matchOIDCIdentity`
  Issuer `https://token.actions.githubusercontent.com`, Subject
  `^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-devmesh-artifact\.yml@refs/heads/main$`.
- [x] `ks-platform.yaml` (`path: ./platform`), `ks-secrets.yaml`
  (`path: ./secrets`, `dependsOn: devmesh-platform`), `ks-workspace.yaml`
  (`path: ./workspace`, `dependsOn: devmesh-secrets`). Alle `prune: true`,
  `wait: true`, `timeout: 10m`, `sourceRef` `OCIRepository/devmesh-manifests`.
- [x] Prüfen, dass `scripts/flux-render-artifact.sh` (Schritt „Cluster CRs“)
  `flux/clusters/devmesh/` nicht in das fleet-Artefakt übernimmt; der Schritt
  liest nur `flux/clusters/fleet/`.
- [x] Grün für `test_flux_devmesh_sources_only`:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py -q -k flux_devmesh
```

## Task 5: Workflow `render-devmesh-artifact.yml`

- [x] Trigger: `push` auf `main` mit den Pfaden aus dem Design (Abschnitt 2),
  `workflow_dispatch`. `permissions: contents: read, packages: write,
  id-token: write`. `concurrency: render-devmesh-artifact`.
- [x] Schritte: Checkout, Werkzeuge (kustomize, yq, flux CLI, cosign mit
  SHA-256-Prüfung wie in `render-fleet-artifact.yml`), `bash scripts/ci-dummy-secrets.sh`,
  `bash scripts/devmesh/render-stack.sh core --out ./out`, Render-Gate
  (`grep -rn 'mentolder.de\|fleet-manifests' out/` muss leer sein), Login GHCR mit
  `GITHUB_TOKEN`, `flux push artifact oci://ghcr.io/paddione/devmesh-manifests:latest`
  mit `--source`/`--revision`, Tag `sha-<commit>`, `cosign sign --yes` auf den Digest.
- [x] `actionlint .github/workflows/render-devmesh-artifact.yml` ohne Befund.

## Task 6: Taskfile

- [x] `taskfiles/Taskfile.devmesh.yml`:
  - `flux:install`: flux-operator per helm (`oci://ghcr.io/controlplaneio-fluxcd/charts/flux-operator`)
    in `flux-system` auf Context `devmesh`, dann `kubectl apply -f flux/clusters/devmesh/bootstrap/`
    und `flux/clusters/devmesh/flux-instance.yaml`.
  - `flux:suspend` / `flux:resume`: `flux suspend|resume kustomization --all -n flux-system --context devmesh`.
  - `deploy`: neue Precondition bricht ab, wenn eine nicht suspendierte
    Kustomization in `flux-system` existiert, Override `FORCE=1`; Meldung nennt
    `task devmesh:flux:suspend`.
  - Usage-Kopf um die drei neuen Tasks ergänzen.
- [x] `task --list | grep devmesh:flux` listet drei Tasks.

## Task 7: ADR

- [x] `docs/adr/ADR-015-devmesh-eigenes-flux.md`: Kontext (fleet-Neuaufbau durch
  Gekko, Trennung), Entscheidung (Flux auf devmesh aus `devmesh-manifests`, kein
  Dev-Stack auf fleet, nur Tailnet), Folgen (sish/brainstorm/Session-Hub
  entfallen bis zum Folge-Feature öffentlicher Zugang, `task devmesh:deploy` nur
  Notfallweg), ersetzt ADR-008 Punkt 2 und klärt SP-3 „GitOps“.
- [x] `docs/adr/ADR-008-local-k3s-dev-mesh.md`: bei Punkt 2 und in der
  SP-3-Zeile Verweis „abgelöst durch ADR-015“.

## Task 8: Rollout auf devmesh (live, nur nach Freigabe)

- [x] Freigabe des Nutzers für Installation von Flux auf devmesh einholen.
- [x] read:packages-Token für `ghcr-auth` beim Nutzer anfordern, mit dem
  devmesh-Controller versiegeln (`kubeseal --context devmesh --controller-namespace
  sealed-secrets`), als `flux/clusters/devmesh/bootstrap/ghcr-auth-sealedsecret.yaml`
  committen. Nie Klartext committen.
- [x] Nach Merge von Task 1–7: Workflow-Lauf abwarten, Artefakt vorhanden
  (`crane digest ghcr.io/paddione/devmesh-manifests:latest`), dann
  `task devmesh:flux:install`.
- [x] `flux --context devmesh get kustomizations -A`: `devmesh-platform`,
  `devmesh-secrets`, `devmesh-workspace` Ready. Übernahme-Konflikte nach
  Design Abschnitt 6 behandeln (`task devmesh:flux:suspend`, bereinigen, `resume`).
- [x] Datenkopie: auf fleet `dev-pod` auf 0 skalieren, PVCs `dev-pod-home` und
  `dev-pod-repo` per Hilfs-Pod als `tar` streamen
  (`kubectl --context fleet exec … tar -C /data -cf - . | kubectl --context devmesh exec … tar -C /data -xf -`),
  danach Dateiliste mit Prüfsummen auf beiden Seiten vergleichen.
- [x] Abnahme: `ssh` über das Tailnet auf `dev-pod` (Hostname `dev-pod`),
  Home-Inhalt vorhanden, `repo-sync` aktuell.

## Task 9: Abbau auf fleet

Teil A (live, nur nach Freigabe und erfolgreicher Abnahme aus Task 8):

- [x] `kubectl --context fleet -n flux-system delete kustomization flux-dev flux-dev-pod`.
  Beide haben `prune: true` und löschen ihre Workloads mit; die Daten sind seit
  Task 8 kopiert. Danach `kubectl --context fleet get ns workspace-dev` prüfen und
  verbleibende PVCs/Namespace nur mit Freigabe löschen.

Teil B (Repo):

- [x] Vor dem Löschen Referenzen prüfen und jede Fundstelle anpassen:
```bash
grep -rn 'k3d/dev-stack\|prod-fleet/dev\b\|prod-fleet/dev-pod\|ks-dev' --include=*.yml --include=*.yaml --include=*.sh --include=*.py . | grep -v '^./docs/'
```
- [x] `flux/clusters/fleet/ks-dev.yaml`, `flux/clusters/fleet/ks-dev-pod.yaml`,
  `prod-fleet/dev/`, `prod-fleet/dev-pod/` löschen.
- [x] `scripts/flux-render-artifact.sh`: Blöcke `want dev` und `want dev-pod`
  extrahieren bzw. entfernen (Datei wird kleiner) und die Komponentenliste im
  Kopf anpassen. `want()` (Zeile 53) prüft `--only` heute nicht gegen bekannte
  Namen: neue Validierung nach dem Argument-Parsing, unbekannte Namen brechen mit
  Exit 2 und Meldung „unbekannte Komponente: <name>“ ab.
- [x] `k3d/dev-stack/`: nur entfernen, was keine andere Stelle mehr nutzt
  (Ergebnis des grep oben). `k3d/dev-pod/` bleibt als Basis für Task 2.
- [x] Grün für `test_fleet_dev_components_gone` und den ganzen Vertrag:
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py -q
bash scripts/pytest-run.sh tests/py/spec/test_flux_render_and_security.py -q
```

## Task 10: Finale Verifikation

- [x] Alle Verträge grün, Inventar aktualisiert, nur erwartete Dateien gestagt.
```bash
bash scripts/pytest-run.sh tests/py/spec/devmesh/test_devmesh_flux.py tests/py/spec/test_massage_devmesh.py tests/py/spec/test_flux_render_and_security.py -q
task test:inventory
task workspace:validate
task test:changed
task freshness:regenerate
task freshness:check
```
- [x] Baseline-Key-Anzahl von `docs/code-quality/baseline.json` gegen `main`
  unverändert.

<!-- vitest: kein neuer Test nötig, weil kein Website-Code geändert wird; die Verträge laufen als pytest. -->
