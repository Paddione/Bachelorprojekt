---
title: "korczewski-prod — Implementation Plan"
domains: [infra, security, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
depends_on_plans: []
---

# korczewski-prod — Implementation Plan

`korczewski.de` bekommt einen eigenen, host-agnostischen Prod-Lieferketten-Pfad: eigenes
signiertes OCI-Artefakt, eigene FluxInstance, eingeengte Tenant-RBAC und ein eigener
SealedSecrets-Key. Scope ist Website (Astro-SSR) plus Pocket ID. Der Cluster-Bootstrap selbst
(k3s, Longhorn, Traefik, Flux) bleibt separates Runbook; dieser Plan macht ihn zur dokumentierten
Vorbedingung statt zur stillen Annahme.

## Ausgangslage (belegt 2026-10-26, main@bc0772bf5)

- **Ziel-Slot ist tot.** `environments/korczewski.yaml` zeigt `context: fleet`,
  `overlay: prod-fleet/korczewski`, `secrets_ref: sealed-secrets/korczewski.yaml`.
  `flux/clusters/fleet/ks-korczewski.yaml` steht `suspend: true`,
  `flux/clusters/fleet/DECOMMISSIONED.md` erklärt den Pfad für beendet.
- **Vorbild devmesh, mit drei Erblast.** `flux/clusters/devmesh/` liefert `FluxInstance` +
  drei Kustomizations + Artefakt `ghcr.io/paddione/devmesh-manifests` (live `v0.0.31`).
  Befunde, die dieser Plan nicht kopiert: 12 Deployments und 7 CronJobs live-only ohne
  Manifest (C1); `devmesh-tenant-deploy` an `cluster-admin` gebunden trotz
  `multitenant: true` (C2); `environments/sealed-secrets/dev.yaml` versiegelt für
  `monitoring`, `workspace-office`, `website`, während das Artefakt nur `workspace` anlegt (C3).
- **Website-Basis ist bereits SSOT.** `prod-fleet/website-korczewski/kustomization.yaml`
  referenziert `../../k3d/website.yaml` und `../../k3d/website-seller-config.yaml`
  (ADR-015); `kustomize build` braucht `--load-restrictor=LoadRestrictionsNone`.
- **Auth-Basis liegt in `k3d/`.** `k3d/pocket-id.yaml` (Image
  `ghcr.io/pocket-id/pocket-id:v2.18.0@sha256:323e7ef5…`), `k3d/pocket-id-db-init-sql.yaml`,
  `k3d/pocket-id-client-seed.yaml` + RBAC.
- **Website-Image ist mutabel.** `k3d/website.yaml:252` rendert
  `ghcr.io/paddione/${WEBSITE_IMAGE}:${WEBSITE_IMAGE_TAG}` — `latest` bzw. Build-SHA, kein Digest.
- **Secrets-Bedarf ist exakt vier.** `k3d/website.yaml` referenziert `website-secrets` und
  `website-content-token`, `k3d/pocket-id.yaml` und `k3d/pocket-id-client-seed.yaml`
  referenzieren `workspace-secrets`, der DNS-01-Solver braucht `ipv64-api-key`.
- **Render-Vertrag existiert.** `scripts/devmesh/render-stack.sh` rendert
  `dev-local/<profil>` nach `{platform,workspace,secrets}` und ist laut ADR-016 D3 die eine
  Render-Logik; `.github/workflows/render-devmesh-artifact.yml` pusht, taggt und signiert keyless.

## Entscheidungen

- **D1 — Vier Sync-Pfade statt Monolith.** `bootstrap → platform → secrets → apps`, jeweils
  eigene Kustomization mit eigenem ServiceAccount. Cluster-scoped Objekte (ClusterIssuer,
  TLSStore, ClusterRole/Binding) liegen ausschließlich im `bootstrap`-Pfad. Grund: genau die
  Mischung aus cluster- und namespaced Objekten unter `prune: true` erzwingt heute
  `cluster-admin` (C2).
- **D2 — Kein `cluster-admin`.** Apps und Secrets bekommen ausschließlich namespaced
  `Role`/`RoleBinding` in `website-korczewski` und `workspace-korczewski`. Der Bootstrap-Pfad
  bekommt eine `ClusterRole` mit `resourceNames` auf `letsencrypt-korczewski-prod`, `default`
  (TLSStore) und die drei Bootstrap-RBAC-Objekte.
- **D3 — Ein Render-Vertrag, zweite Instanz.** `scripts/korczewski-prod/render-stack.sh` spiegelt
  die Schnittstelle von `scripts/devmesh/render-stack.sh` (`--out`, stdout ohne `--out`) und
  bleibt fail-closed. Ein gemeinsames `scripts/lib/render-stack-core.sh` ist bewusst nicht Teil
  dieses Plans.
- **D4 — Overlays referenzieren, nicht kopieren.** `korczewski-prod/website/` baut auf
  `prod-fleet/website-korczewski` (und damit über ADR-015 auf `k3d/`), `korczewski-prod/auth/`
  baut Pocket ID direkt aus `k3d/`. Kein zweiter Manifest-Baum.
- **D5 — Neuer Key, vier SealedSecrets.** `scripts/env-seal.sh --env korczewski-prod` gegen den
  Controller des Ziel-Clusters; Klartext-SSOT nur unter `environments/.secrets/` (gitignored).
  Kein Ciphertext wird zwischen devmesh und korczewski-prod geteilt.
- **D6 — Wildcard als Traefik-Default, kein Secret-Kopierer.** `Certificate` +
  `TLSStore default` in `kube-system` (Muster `dev-local/cluster/tls.yaml`) ersetzen
  `tls-sync`/`reflector` aus dem fleet-Overlay. Damit entfällt eine ClusterRole, die sonst
  wieder `secrets` clustervweit lesen dürfte.
- **D7 — Images digest-gepinnt.** Jedes `image:` im gerenderten Baum endet auf `@sha256:`; der
  Website-Patch ersetzt den `latest`-Tag aus `k3d/website.yaml`.
- **D8 — Artefakt öffentlich, aber identitätsgebunden.** `cosign verify` pinnt Issuer
  `https://token.actions.githubusercontent.com` und Subject
  `render-korczewski-prod-artifact.yml@refs/heads/main`. ADR-017 hält die Abweichung von
  ADR-016 D1 („privat+signiert") fest.

## File Structure

| Datei | Ist | Rest |
|---|---|---|
| `flux/clusters/korczewski-prod/flux-instance.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/oci-source.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/ks-bootstrap.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/ks-platform.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/ks-secrets.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/ks-apps.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/tenant-rbac.yaml` | neu | n/a (YAML, S1-ungated) |
| `flux/clusters/korczewski-prod/bootstrap/README.md` | neu | n/a (MD, S1-ungated) |
| `environments/korczewski-prod.yaml` | neu | n/a (YAML, S1-ungated) |
| `environments/sealed-secrets/korczewski-prod.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/cluster-bootstrap/kustomization.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/cluster-bootstrap/cluster-issuer.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/cluster-bootstrap/tls.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/cluster-bootstrap/rbac.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/platform/kustomization.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/platform/helm-repositories.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/platform/cert-manager-helmrelease.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/platform/lego-webhook-helmrelease.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/website/kustomization.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/website/website-patch.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/website/ingress.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/auth/kustomization.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/auth/namespace.yaml` | neu | n/a (YAML, S1-ungated) |
| `korczewski-prod/auth/patch-pocket-id.yaml` | neu | n/a (YAML, S1-ungated) |
| `scripts/korczewski-prod/render-stack.sh` | neu | 800 (Limit `.sh`, nicht baselined) |
| `.github/workflows/render-korczewski-prod-artifact.yml` | neu | n/a (YAML, S1-ungated) |
| `docs/adr/ADR-017-korczewski-prod-flux.md` | neu | n/a (MD, S1-ungated) |
| `tests/py/spec/korczewski-prod/conftest.py` | neu | 800 (Limit `.py`, nicht baselined) |
| `tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py` | neu | 800 (Limit `.py`, nicht baselined) |
| `tests/py/spec/korczewski-prod/test_render_guards.py` | neu | 800 (Limit `.py`, nicht baselined) |

Verantwortung: `flux/clusters/korczewski-prod/` ist die Git-synchronisierte Steuer-Ebene
(FluxInstance, Quelle, Kustomizations, RBAC). `environments/korczewski-prod.yaml` ist der
einzige Ort für Domain-, Namespace- und CIDR-Werte; `environments/sealed-secrets/korczewski-prod.yaml`
trägt ausschließlich Ciphertext. `korczewski-prod/` ist der Manifest-Baum, den der Renderer
baut. `scripts/korczewski-prod/render-stack.sh` plus der Workflow sind die Lieferkette.
`tests/py/spec/korczewski-prod/` pinnt die Invarianten offline.

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-env-secrets.md | impl | `environments/korczewski-prod.yaml`, `environments/sealed-secrets/korczewski-prod.yaml` |  |
| p2 | tasks.d/p2-flux-cluster.md | impl | `flux/clusters/korczewski-prod/flux-instance.yaml`, `flux/clusters/korczewski-prod/oci-source.yaml`, `flux/clusters/korczewski-prod/ks-bootstrap.yaml`, `flux/clusters/korczewski-prod/ks-platform.yaml`, `flux/clusters/korczewski-prod/ks-secrets.yaml`, `flux/clusters/korczewski-prod/ks-apps.yaml`, `flux/clusters/korczewski-prod/tenant-rbac.yaml`, `flux/clusters/korczewski-prod/bootstrap/README.md` | p1 |
| p3 | tasks.d/p3-overlay-bootstrap-platform.md | impl | `korczewski-prod/cluster-bootstrap/kustomization.yaml`, `korczewski-prod/cluster-bootstrap/cluster-issuer.yaml`, `korczewski-prod/cluster-bootstrap/tls.yaml`, `korczewski-prod/cluster-bootstrap/rbac.yaml`, `korczewski-prod/platform/kustomization.yaml`, `korczewski-prod/platform/helm-repositories.yaml`, `korczewski-prod/platform/cert-manager-helmrelease.yaml`, `korczewski-prod/platform/lego-webhook-helmrelease.yaml` | p1 |
| p4 | tasks.d/p4-overlay-website.md | impl | `korczewski-prod/website/kustomization.yaml`, `korczewski-prod/website/website-patch.yaml`, `korczewski-prod/website/ingress.yaml` | p1, p3 |
| p8 | tasks.d/p8-overlay-auth.md | impl | `korczewski-prod/auth/kustomization.yaml`, `korczewski-prod/auth/namespace.yaml`, `korczewski-prod/auth/patch-pocket-id.yaml` | p1, p3 |
| p5 | tasks.d/p5-render-pipeline.md | impl | `scripts/korczewski-prod/render-stack.sh`, `.github/workflows/render-korczewski-prod-artifact.yml` | p3, p4, p8 |
| p6 | tasks.d/p6-adr.md | impl | `docs/adr/ADR-017-korczewski-prod-flux.md` | p1, p2, p3, p4, p5, p8 |
| p7 | tasks.d/p7-tests.md | tests | `tests/py/spec/korczewski-prod/conftest.py`, `tests/py/spec/korczewski-prod/test_korczewski_prod_flux.py`, `tests/py/spec/korczewski-prod/test_render_guards.py` | p2, p3, p4, p5, p8 |

## Risiken und Offenes

- **R1 — Cluster-CIDRs sind Pflicht-Input.** Weichen `POD_CIDR`/`SERVICE_CIDR` im Env-File von
  den k3s-Werten ab, geraten die NetworkPolicies fail-open (Pods ohne Netz) oder fail-closed
  (Website unerreichbar). Das Bootstrap-README macht die Prüfung zur Gate-Bedingung; p7 pinnt
  nur die Existenz der Werte, nicht ihre Cluster-Wahrheit.
- **R2 — Traefik-Version ohne `TLSStore`-Default.** Dann tragen die Ingresses kein Zertifikat.
  Fallback ist im ADR-017 dokumentiert: `Certificate` pro Namespace plus Secret-Ref, ohne
  clusterweiten Secret-Reader.
- **R3 — `k3d/website.yaml` ist geteilte SSOT.** Eine Änderung dort bricht den Prod-Render.
  `test_render_out_layout` läuft deshalb in CI, nicht nur lokal.
- **R4 — SealedSecrets mit fremdem Key.** Die `secrets`-Kustomization bliebe `False`, ohne dass
  ein Manifest falsch aussieht. p7 pinnt die Namespace-Parität, das Bootstrap-README den
  Key-Bezug.
- **R5 — Öffentliches Artefakt.** ADR-016 D1 sagt „privat", Realität ist public (anonymer Pull
  HTTP 200 auf `devmesh-manifests`, `fleet-manifests` 401). Der Plan erbt das bewusst und
  kompensiert über die gepinnte cosign-Identität (D8); ADR-017 hält es fest.
- **R6 — Kein Ort für den Klartext.** `environments/.secrets/korczewski-prod.yaml` muss von
  Hand gepflegt und darf nie committet werden. p1 verweist auf `.gitignore`-Status als
  Vorbedingung, p7 prüft nur den Ciphertext-Baum.
- **Ausgeklammert:** Cluster-Bootstrap-Automatisierung, Longhorn/Traefik-Installation,
  Nextcloud/Collabora/Vaultwarden/Brain/Monitoring, Sanierung der devmesh-RBAC, C1-Fix auf
  devmesh, der tote `render-fleet-artifact.yml`.

## Tasks

- [ ] **0. Rotphase (liegt vor, main@bc0772bf5):**
  `pytest tests/py/spec/korczewski-prod/ -q` → `ERROR: file or directory not found`
  (expected: FAIL — kein Prod-Pfad, kein Renderer, kein Test).
  Gegenprobe, dass die Lücke echt ist: `kustomize build korczewski-prod/website` →
  `unable to find one of 'kustomization.yaml'`; `grep -c korczewski-prod flux/clusters/*/*.yaml`
  → 0.
- [ ] **p1–p8** in Reihenfolge der `depends_on`-Kette ausführen, je Partial ein Commit,
  kein PR (Staging per Push).
- [ ] **Finaler Verifikations-Task:** `task test:changed`, `task freshness:regenerate`,
  `task freshness:check`; dazu `task test:inventory` (neue Testdateien) und
  `task workspace:validate` (Manifest-Änderungen). Erst bei grünem Lauf ist der Plan
  ausführbereit.
