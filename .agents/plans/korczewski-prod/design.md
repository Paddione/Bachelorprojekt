---
ticket_id: null
plan_ref: null
status: active
date: 2026-10-26
---

# Design: korczewski-prod — eigener Prod-Cluster für Website + Auth

Stand 2026-10-26. Pfad: feature. Slug: `korczewski-prod`.

Grundlage: GitOps- und Flux-Audit des devmesh-Clusters (`docs/adr/ADR-016-devmesh-eigenes-flux.md`,
`docs/adr/ADR-015-website-basis-in-k3d.md`, `docs/adr/ADR-008-local-k3s-dev-mesh.md`), Live-Abgleich
gegen `kubectl --context devmesh`. Der Audit hat drei kritische Befunde geliefert, die ein
`korczewski-prod` nicht erben darf:

- **C1 GitOps-Lücke:** 12 Deployments und 7 CronJobs im Namespace `workspace` sind live, aber in
  keinem Manifest; sie tragen `kubectl.kubernetes.io/last-applied-configuration`.
- **C2 Tenant-RBAC:** `flux/clusters/devmesh/tenant-rbac.yaml` bindet `devmesh-tenant-deploy` an
  `cluster-admin`; `spec.cluster.multitenant: true` ist damit nur nominal wirksam.
- **C3 Frischcluster:** `secrets/sealed-secrets.yaml` versiegelt für `monitoring`,
  `workspace-office` und `website`, das Artefakt legt aber nur `workspace` an. Auf einem leeren
  Cluster scheitert `devmesh-secrets` und blockiert `devmesh-workspace` über `dependsOn`.

## Ziel

`korczewski.de` (Website + Pocket ID) läuft als eigenständiger Ziel-Cluster `korczewski-prod`, der
sich ausschließlich über ein signiertes OCI-Artefakt aus diesem Repository rekonstruiert. Der
Cluster selbst (Hardware, k3s, Flux-Bootstrap, Storage, Ingress-Controller) ist **nicht** Teil dieses
Features — der Plan liefert den host-agnostischen Render-, Flux- und RBAC-Pfad und dokumentiert die
Vorbedingungen.

Erfolg:

- `flux get kustomizations -A --context korczewski-prod` ist auf einem frisch gebootstrappten Cluster
  grün, ohne dass ein Objekt manuell per `kubectl apply` entsteht.
- Das Artefakt `ghcr.io/paddione/korczewski-prod-manifests` ist öffentlich, cosign-keyless signiert
  und auf genau eine Workflow-Identität (`render-korczewski-prod-artifact.yml@refs/heads/main`)
  verifiziert.
- Kein Tenant-Deploy-Pfad hat `cluster-admin`; jede Kustomization hat eine Rolle, die genau ihre
  Objektmenge abdeckt.
- `https://web.korczewski.de` und `https://auth.korczewski.de` liefern ein Let's-Encrypt-Wildcard
  für `korczewski.de` (DNS-01 via ipv64/lego-webhook).
- Alle SealedSecrets sind mit dem Schlüssel **des Ziel-Clusters** versiegelt; kein Ciphertext wird
  zwischen devmesh und korczewski-prod geteilt.
- Ein Render-Lauf lokal (`scripts/korczewski-prod/render-stack.sh`) erzeugt denselben Baum wie die
  CI, ohne Netzwerkzugriff und ohne Secrets im Klartext.

## Entscheidungen des Nutzers

| ID | Frage | Entscheidung |
|---|---|---|
| Q1 | Scope | **Website + Auth only** — `website-korczewski` (Astro-SSR) und Pocket ID. Kein Nextcloud, Collabora, Vaultwarden, Brain, Brett, Monitoring. |
| Q2 | Ziel-Cluster | **Host-agnostisch** — Plan liefert Render-/Flux-/RBAC-Pfad; Cluster-Bootstrap (k3s, Longhorn, Traefik, FluxInstance) bleibt separates Runbook. |
| Q3 | Secrets | **Neu versiegeln** mit neuem Cluster-Keypair, kein Key-Sharing dev↔prod. |
| Q4 | Erreichbarkeit | **ipv64 + Let's Encrypt DNS-01** (lego-webhook), Wildcard für `korczewski.de`. |
| Q5 | Tenant-RBAC | **Jetzt einengen** — `cluster-admin` wird durch scoped Rollen ersetzt, nicht dokumentiert weitergereicht. |

## Pfad-Wahl (Begründung)

`feature`, nicht `fix`/`chore`: neues Deployment-Ziel, neues OCI-Artefakt, neuer Workflow und eine
strukturell andere RBAC-Form ändern das Verhalten des Repos (neue Lieferkette, neue Tests, neue
Vorbedingungen). Ein `chore` wäre es nur, wenn ausschließlich Dateien umbenannt oder kopiert würden.

## Ist-Stand (belegt)

| Baustein | Heute | Beleg |
|---|---|---|
| devmesh-Flux | `FluxInstance` + 3 Kustomizations (`devmesh-{platform,secrets,workspace}`), Artefakt `devmesh-manifests`, rev `v0.0.31` | `flux/clusters/devmesh/*`, Live `kubectl --context devmesh` |
| devmesh-Render | `scripts/devmesh/render-stack.sh core --out ./out` → `out/{platform,workspace,secrets}` | `scripts/devmesh/render-stack.sh` |
| devmesh-Publish | `.github/workflows/render-devmesh-artifact.yml` → push/tag/cosign | Workflow-Datei |
| devmesh-Tenant | SA `devmesh-tenant-deploy` → **`cluster-admin`** | `flux/clusters/devmesh/tenant-rbac.yaml` |
| fleet-korczewski | Overlays `prod-fleet/korczewski`, `prod-fleet/website-korczewski`, `prod-fleet/korczewski-auth`; Kustomization `flux-korczewski` ist `suspend: true` | `flux/clusters/fleet/ks-korczewski.yaml`, `flux/clusters/fleet/DECOMMISSIONED.md` |
| fleet-korczewski-Env | `environments/korczewski.yaml`, `context: fleet`, `secrets_ref: sealed-secrets/korczewski.yaml` (Cluster abgebaut) | `environments/korczewski.yaml` |
| Website-Basis | `k3d/website.yaml` + `k3d/website-seller-config.yaml` sind SSOT, Overlays referenzieren sie (ADR-015) | `docs/adr/ADR-015-website-basis-in-k3d.md` |
| Auth-Basis | `k3d/pocket-id.yaml`, `k3d/pocket-id-db-init-sql.yaml`, `k3d/pocket-id-client-seed*.yaml` | `dev-local/core/kustomization.yaml` |
| Image-Tag | `ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}` — `latest` bzw. Build-SHA, nicht digest-gepinnt | `k3d/website.yaml:252` |

## Design

### 1. Topologie: drei Namespaces plus Cluster-Bootstrap

```
korczewski-prod (Ziel-Cluster, Bootstrap extern)
├── flux-system                FluxInstance "flux", OCIRepository "korczewski-prod-manifests"
├── cert-manager               ClusterIssuer, Certificate, TLSStore (Cluster-Bootstrap, einmalig)
├── sealed-secrets             Controller (Cluster-Bootstrap)
├── workspace-korczewski       Pocket ID (Deployment, Service, PVC, Seed-Jobs)
└── website-korczewski         Website (Deployment, Service, Ingress/IngressRoute, RBAC)
```

Der Cluster-Bootstrap erzeugt bewusst nur: k3s, StorageClass, Traefik (CRDs `Middleware`,
`IngressRoute`, `TLSStore`), cert-manager, lego-webhook, sealed-secrets-Controller und die
`FluxInstance` aus `flux/clusters/korczewski-prod/flux-instance.yaml`. Alles danach kommt aus dem
Artefakt.

### 2. Vier getrennte Sync-Pfade statt eines Monolithen

| Kustomization | Pfad im Artefakt | ServiceAccount | Inhalt |
|---|---|---|---|
| `korczewski-prod-bootstrap` | `./cluster-bootstrap` | `korczewski-prod-bootstrap` | ausschließlich cluster-scoped: `ClusterIssuer`, `TLSStore`, `ClusterRole`/`ClusterRoleBinding` für die Tenant-SAs, CRD-Ausnahme falls nötig |
| `korczewski-prod-platform` | `./platform` | `korczewski-prod-platform` | HelmRepositories + HelmReleases (cert-manager, lego-webhook), namespaced |
| `korczewski-prod-secrets` | `./secrets` | `korczewski-prod-tenant` | nur SealedSecrets für `cert-manager`, `workspace-korczewski`, `website-korczewski` |
| `korczewski-prod-apps` | `./apps` | `korczewski-prod-tenant` | Website + Pocket ID, namespaced |

Begründung der Trennung: cluster-scoped Objekte unter `prune: true` in einem Tenant-Pfad sind genau
der Audit-Befund, der eine breite Rolle erzwingt. Sie bekommen einen eigenen Pfad mit eigener,
auf `resourceNames` verengter Rolle. `dependsOn` läuft `bootstrap → platform → secrets → apps`, damit
die CRDs vor den CRs und die entsiegelten Secrets vor den Pods existieren. `wait: true` bleibt nur
dort, wo ein echtes Rollout-Gate existiert; für die beiden Seed-Jobs (`pocket-id-db-init`,
`pocket-id-client-seed`) werden explizite `healthChecks` gesetzt, statt sich auf `wait` auf
Job-Semantik zu verlassen.

### 3. RBAC: kein `cluster-admin`, keine ClusterRole für Namespaced-Pfade

`korczewski-prod-tenant` (apps + secrets) erhält ausschließlich namespaced `Role`/`RoleBinding` in
`website-korczewski` und `workspace-korczewski`:

- `apps`: `deployments`, `statefulsets` (apps), `jobs`, `cronjobs` (batch), `services`, `configmaps`,
  `secrets`, `serviceaccounts`, `persistentvolumeclaims` ("")
- `networking.k8s.io`: `ingresses`, `networkpolicies`
- `traefik.io`: `ingressroutes`, `middlewares` (nur in `website-korczewski`)

`korczewski-prod-bootstrap` erhält eine `ClusterRole` mit:

- `cert-manager.io/clusterissuers` — `get,list,watch,create,patch,update` mit `resourceNames:
  [letsencrypt-korczewski-prod]`
- `traefik.io/tlsstores` — dito mit `resourceNames: [default]`
- `rbac.authorization.k8s.io/clusterroles,clusterrolebindings` — `get,list,watch,create,patch,update,
  delete` mit `resourceNames` auf die drei Bootstrap-Namen

`korczewski-prod-platform` erhält `Role` in `cert-manager` und `flux-system` für
`helmrepositories`, `helmreleases` (helm.toolkit.fluxcd.io) plus Leserechte auf `secrets` in
`cert-manager` (Webhook-Konfiguration liest `ipv64-api-key`).

Der Guard `test_tenant_rbac_has_no_cluster_admin` pinnt das: kein `ClusterRoleBinding` im Artefakt
darf auf `cluster-admin` zeigen, und die Tenant-SAs dürfen in keinem `ClusterRoleBinding` als
Subjekt auftauchen.

### 4. Render-Pfad: ein Skript, zwei Umgebungen

Neues `scripts/korczewski-prod/render-stack.sh` mit derselben Schnittstelle wie
`scripts/devmesh/render-stack.sh` (`--out <dir>`, stdout ohne `--out`), aber:

- `source scripts/env-resolve.sh korczewski-prod`
- ein `--out`-Layout `{cluster-bootstrap,platform,secrets,apps}`
- fail-closed: leere Ergebnisdatei, `\${`-Reste, `mentolder.de`, `fleet-manifests`, `workspace-dev`
  und `latest`-Tags brechen mit Exit 1 ab
- keine Netzwerkabhängigkeit; `envsubst`-Whitelist wie im devmesh-Pfad

Damit bleibt ADR-016 D3 („`render-stack.sh` ist die eine Render-Logik") gewahrt: es entsteht kein
zweiter, abweichender Render-Mechanismus, sondern eine zweite Instanz desselben Vertrags. Das
Duplikat ist bewusst und klein (die Overlays unterscheiden sich strukturell); ein gemeinsames
`scripts/lib/render-stack-core.sh` ist als Folge-Refactor notiert, nicht Teil dieses Features.

### 5. Overlays: ADR-015-Kette weiterverwenden, nicht kopieren

`korczewski-prod/` ist ein neues Top-Level-Overlay, das die bestehenden Brand-Overlays als Basis
nimmt:

```
korczewski-prod/
├── kustomization.yaml        # meta: listet die vier Teilbäume
├── platform/                 # cert-manager + lego-webhook HelmReleases, HelmRepositories
├── cluster-bootstrap/        # ClusterIssuer letsencrypt-korczewski-prod, TLSStore, ClusterRoles
├── website/                  # → ../../prod-fleet/website-korczewski + Patches
└── auth/                     # → ../../k3d/pocket-id*.yaml + Patches
```

`website/` referenziert `prod-fleet/website-korczewski` (das seinerseits `k3d/website.yaml` und
`k3d/website-seller-config.yaml` referenziert) und patcht:

- `image` auf `ghcr.io/paddione/website@${WEBSITE_IMAGE_DIGEST}` (Digest statt `latest`) — behebt den
  Mutabilitäts-Befund aus dem Audit für den Prod-Pfad
- `issuerRef`/`Certificate`-Bezug auf `letsencrypt-korczewski-prod` und `korczewski-prod-wildcard-tls`
- Entfernen der `tls-sync`-/`reflector`-Kopplung: das Wildcard liegt als Traefik-Default-TLSStore in
  `kube-system` (Muster `dev-local/cluster/tls.yaml`), es braucht keine Secret-Kopien pro Namespace

`auth/` baut Pocket ID direkt aus `k3d/pocket-id.yaml` + `k3d/pocket-id-db-init-sql.yaml` +
`k3d/pocket-id-client-seed*.yaml` (ohne `prod/wildcard-certificate.yaml` und `prod/reflector.yaml`,
die im fleet-Overlay an der dortigen Platform hängen) im Namespace `workspace-korczewski`.

### 6. Secrets: neuer Key, vier SealedSecrets

`environments/korczewski-prod.yaml` setzt `secrets_env: korczewski-prod`. Die Klartext-SSOT liegt
out-of-band unter `environments/.secrets/korczewski-prod.yaml` (gitignored), die versiegelte Form
unter `environments/sealed-secrets/korczewski-prod.yaml`, erzeugt mit
`scripts/env-seal.sh --env korczewski-prod` gegen den Controller **des Ziel-Clusters**.

Genau vier SealedSecrets, exakt die von Website + Auth referenzierten:

| Namespace | Name | Zweck |
|---|---|---|
| `cert-manager` | `ipv64-api-key` | DNS-01-Solver |
| `workspace-korczewski` | `workspace-secrets` | Pocket-ID-DB-Credentials, `POCKET_ID_API_KEY`, `POCKET_ID_WEBSITE_SECRET` |
| `website-korczewski` | `website-secrets` | `WEBSITE_DB_PASSWORD` u. a. |
| `website-korczewski` | `website-content-token` | `GITHUB_CONTENT_TOKEN` (optional) |

Weil C3 genau darin bestand, dass SealedSecrets für nicht existierende Namespaces mitgeliefert
werden, pinnt ein Test die Gleichheit von „Namespaces, die das Artefakt anlegt" und „Namespaces, für
die SealedSecrets im Artefakt liegen".

Die DB selbst (`postgres`/pgvector, Datenbank `website_massage`) ist Vorbedingung des Ziel-Clusters
und nicht Teil des Artefakts; sie wird im Bootstrap-Runbook als `shared-db`-Äquivalent beschrieben.
Ein eigener `pocket-id-db-init`-Job bleibt im Auth-Pfad, weil Pocket ID seine Rolle zwingend selbst
initialisiert.

### 7. Erreichbarkeit und TLS

`korczewski-prod/cluster-bootstrap/cluster-issuer.yaml`: `ClusterIssuer letsencrypt-korczewski-prod`
mit `dns01.webhook` (Gruppe `lego.dns-solver`, Provider `ipv64`, API-Key aus
`cert-manager/ipv64-api-key`). `tls.yaml`: `Certificate korczewski-prod-wildcard-tls` in
`kube-system` für `korczewski.de` und `*.korczewski.de`, plus `TLSStore default` als
Default-Zertifikat. Ingress-Hosts: `web.korczewski.de` (Website, Astro-SSR, `PRIMARY_FRONTEND:
astro`), `korczewski.de` (Apex-Redirect), `auth.korczewski.de` (Pocket ID).

### 8. Artefakt-Pipeline

`.github/workflows/render-korczewski-prod-artifact.yml`, strukturgleich zu
`render-devmesh-artifact.yml`, mit eigenem Concurrency-Group, `permissions: contents:read,
packages:write, id-token:write` und Trigger auf `korczewski-prod/**`, `environments/korczewski-prod.yaml`,
`environments/sealed-secrets/korczewski-prod.yaml`, `scripts/korczewski-prod/**`,
`flux/clusters/korczewski-prod/**`, `k3d/**`, `prod-fleet/website-korczewski/**`,
`prod-fleet/website-common/**` und sich selbst. Pushes nach `oci://ghcr.io/paddione/korczewski-prod-manifests:latest`,
Tags `sha-<sha>` und `v0.0.<run>`, danach `cosign sign --yes` keyless.

`OCIRepository.verify.matchOIDCIdentity` pinnt Issuer `https://token.actions.githubusercontent.com`
und Subject `^https://github\.com/Paddione/Bachelorprojekt/\.github/workflows/render-korczewski-prod-artifact\.yml@refs/heads/main$`.
Der Render-Gate-Schritt verbietet `mentolder.de`, `fleet-manifests`, `workspace-dev` und
`:latest` im gerenderten Baum.

### 9. Vorbedingungen des Ziel-Clusters (Bootstrap-Runbook, nicht Artefakt)

`flux/clusters/korczewski-prod/bootstrap/README.md` listet, was der Cluster vor dem ersten Sync
haben muss, jeweils mit Prüfbefehl:

1. k3s mit `podCIDR`/`serviceCIDR`, die exakt den Werten in `environments/korczewski-prod.yaml`
   entsprechen (Netzwerk-Policies hängen daran; Abweichung = fail-open).
2. StorageClass `longhorn` (oder benannte Alternative) für `pocket-id-data`.
3. Traefik mit den CRDs `Middleware`, `IngressRoute`, `TLSStore` sowie `ingressClass` für die
   Website-Ingresses.
4. cert-manager + lego-webhook **vor** dem Bootstrap-Pfad (CRDs müssen existieren, bevor der
   `ClusterIssuer` entsteht).
5. sealed-secrets-Controller; dessen Zertifikat ist die Eingabe für `env-seal.sh`.
6. `postgres`-Instanz mit Datenbank `website_massage` und Rolle `website_massage` erreichbar unter
   `shared-db.workspace-korczewski.svc.cluster.local:5432` (Name im Env-File konfigurierbar).
7. `FluxInstance` aus `flux/clusters/korczewski-prod/flux-instance.yaml` (Bootstrap-Commit), weil
   die Instanz sich selbst nicht deployen kann.

Bewusste Abweichung zu devmesh: `distribution.version` wird auf einen konkreten Minor gepinnt
(`2.9.x`) statt `2.x`, und die `FluxInstance` bekommt `spec.sync.pullSecret`-freien anonymen Fetch
wie devmesh (Repo public).

### 10. Tests (Guard-First)

Neuer Testbaum `tests/py/spec/korczewski-prod/`:

| Test | Pinnt |
|---|---|
| `test_render_out_layout` | `render-stack.sh --out` erzeugt `cluster-bootstrap/`, `platform/`, `secrets/`, `apps/`, jede Datei mit ≥1 Dokument |
| `test_no_devmesh_or_fleet_refs` | kein Dokument enthält `mentolder.de`, `fleet-manifests`, `workspace-dev`, `devmesh.korczewski.de` |
| `test_cluster_scoped_only_in_bootstrap` | `ClusterRole`, `ClusterRoleBinding`, `ClusterIssuer`, `TLSStore`, CRDs liegen ausschließlich unter `cluster-bootstrap/` |
| `test_tenant_rbac_has_no_cluster_admin` | kein `cluster-admin`-RoleRef; Tenant-SAs in keinem `ClusterRoleBinding` |
| `test_sealed_secret_namespaces_match_created_namespaces` | Menge der SealedSecret-Namespaces ⊆ Menge der im Artefakt erzeugten Namespaces (C3-Regression) |
| `test_images_are_digest_pinned` | jeder `image:`-Wert im Baum endet auf `@sha256:` |
| `test_workflow_verify_identity_anchored` | `oci-source.yaml` pinnt Issuer und Workflow-Subject; Workflow pusht und signiert |
| `test_flux_instances_isolated` | `flux/clusters/korczewski-prod` referenziert weder `devmesh-manifests` noch `fleet` |

Die Tests laufen offline (kein Cluster); `test_render_out_layout` und
`test_sealed_secret_namespaces_match_created_namespaces` bedienen sich `subprocess` + `yaml` wie
`tests/py/spec/devmesh/test_devmesh_flux.py`.

### 11. Ausdrücklich außerhalb des Scope

- Cluster-Bootstrap-Automatisierung (k3s, Longhorn, Traefik, FluxInstance-Rollout).
- Nextcloud, Collabora, Vaultwarden, Brain, Brett, Mediaviewer, Monitoring/Alerting.
- Der Audit-Befund C1 (live-only Workloads auf devmesh) — eigener Fix auf devmesh.
- Einengung der devmesh-RBAC selbst; hier wird nur der neue Pfad korrekt gebaut.
- Migration der historischen `prod-fleet/*`-Overlays; sie bleiben als Basis referenziert.
- Der tote `render-fleet-artifact.yml`, der weiterhin `fleet-manifests` pusht — eigener Aufräum-Task,
  hier nur als Risiko notiert.

## Risiken

| Risiko | Wirkung | Gegenmaßnahme im Plan |
|---|---|---|
| Cluster-CIDRs weichen von den Env-Werten ab | NetworkPolicies fail-open oder Pods ohne Netz | Bootstrap-Checkliste + `test_no_*`-Guard; CIDR-Werte als Pflicht-Input markiert |
| Traefik-Version ohne `TLSStore`-Default | Ingresses ohne Zertifikat | Vorbedingung 3 + Prüfbefehl; Fallback: `Certificate` pro Namespace dokumentiert |
| `k3d/website.yaml` ändert sich und bricht das Prod-Overlay | Prod-Render rot | ADR-015-Kette bleibt; Guard `test_render_out_layout` läuft in CI |
| SealedSecrets mit fremdem Key | `secrets`-Kustomization bleibt `False` | `env-seal.sh` gegen Ziel-Cluster; Namespace-Paritätstest |
| Öffentliches Artefakt trotz ADR-016 „privat" | Supply-Chain-Annahme falsch | cosign-Verify mit gepinnter Identität; ADR-017 hält die Abweichung fest |
| Doppelte Render-Logik driftet | devmesh und prod rendern unterschiedlich | bewusst akzeptiert, Folge-Refactor `scripts/lib/render-stack-core.sh` notiert |

## Verifikation (Ende der Ausführung)

```bash
task test:changed                    # neue pytest-Dateien + betroffene Suites
bash scripts/korczewski-prod/render-stack.sh --out /tmp/kp-out && ls /tmp/kp-out
kustomize build korczewski-prod/website --load-restrictor=LoadRestrictionsNone >/dev/null
kubeconform -strict -ignore-missing-schemas /tmp/kp-out
task freshness:regenerate && task freshness:check   # repo.generated_artifacts: true
```

Die Live-Verifikation (`flux get kustomizations -A`, HTTPS-Abruf) ist ausdrücklich Sache des
Bootstrap-Runbooks und nicht Gate dieses Plans.
