# INVENTORY — Prod-only-Exportsatz für das Gekko-Repo (T016564)

Quelle: `scripts/export-mentolder-prod.sh` (`--ref HEAD`). Jede Zeile nennt den
Pfad im neuen Repo, die Herkunft im Bachelorprojekt und den Grund.

## Verbatim übernommen (unverändert, Quelle = Bachelorprojekt)

**Flux-Einstieg (Gekko-Cluster):**

- `flux/clusters/fleet-gekko/ks-prod.yaml` — die fünf Prod-Kustomizations
  (sealed-secrets, infra-controllers, mentolder, website-mentolder, coturn).
  Pfade zeigen ins OCI-Artefakt, daher identitätsfrei und ohne Platzhalter.

**Kustomize-Quellen (Render-Eingaben):**

- `prod-fleet/mentolder/` — Marken-Overlay Workspace-Namespace.
- `prod-fleet/website-mentolder/` — Website-Overlay (Namespace `website`).
- `prod-fleet/website-common/` — markenneutrale Domain-Config (`domain-config.yaml`,
  via `${PROD_DOMAIN}` parametriert), referenziert vom Website-Overlay.
- `prod-fleet/coturn/` — Talk-HPB (gekko-hetzner-2, hostNetwork).
- `prod-fleet/platform/` — Cluster-Basis (ClusterIssuer, IngressClass, RBAC).
- `prod-fleet/components/` — `fleet-common` (Cross-Brand-NetPols) und Rest.
- `prod-mentolder/` — Marken-Basis (Namespace `workspace`), referenziert von
  `prod-fleet/mentolder`.
- `prod/` — Prod-Basis (Ingress, Zertifikate, Patches), referenziert von
  `prod-mentolder`.
- `k3d/` — Vollständige Kustomize-Basis (trotz des Namens kein Dev-Only:
  `prod/` baut darauf auf). Enthält auch Dev-Anteile (`dev-stack/`,
  `dev-cluster/`), die für fleet-gekko nicht gerendert werden — sie sind
  inert, bleiben aber aus Wartbarkeitsgründen dabei (kein selektives
  File-Picking, das bei jedem Upstream-Refactoring brechen würde).

**Umgebung und Secrets:**

- `environments/fleet-mentolder.yaml` — Profil des Gekko-Prods (Domains,
  Node-Affinität, TURN, Image-Digests als Offline-Fallback).
- `environments/mentolder.yaml` — Alt-Profil (ENV-Alias, Referenz).
- `environments/schema.yaml` + `environments/versions.yaml` — autoritative
  Spezifikation und Komponenten-Versionen (vom Render gelesen).
- `environments/sealed-secrets/fleet-mentolder.yaml` — SealedSecrets im Klartext
  (nur mit dem Controller-Schlüssel des Clusters entschlüsselbar; bleibt nach
  dem Split gültig, solange der Schlüssel nicht rotiert wird).
- `environments/certs/fleet-mentolder.pem` — öffentliches Zertifikat (unkritisch).
- `environments/.secrets/fleet-mentolder.yaml` — Klartext-Secrets, per
  `git show HEAD:` als **Ciphertext** exportiert (nie entschlüsselt).
- `environments/.secrets/sealed-secrets-key.fleet.yaml` — Controller-Schlüssel-
  Backup (Ciphertext). Nur für Disaster-Recovery des SealedSecrets-Controllers.
- `.gitattributes` — enthält den git-crypt-Filter für `environments/.secrets/**`.

**Werkzeuge (Render-/Secrets-Closure):**

- `scripts/env-resolve.sh`, `scripts/lib/render-subst-list.sh`,
  `scripts/render-guard.sh`, `scripts/website-config-sha.sh` — Render-Pipeline.
- `scripts/ci-dummy-secrets.sh`, `scripts/resolve-image-digest.sh` — CI-Pfad.
- `scripts/env-seal.sh`, `scripts/env-generate.sh`, `scripts/secret-rotate.sh`,
  `scripts/lib/seal-extra-namespaces.sh`, `scripts/lib/secrets-env.sh` —
  Secrets-Betrieb (Sealen, Rotation).

**Docs (Betriebswissen):**

- `docs/runbooks/git-crypt-key-distribution.md` — Schlüsselübergabe-Verfahren.
- `docs/runbooks/credentials-finden.md` — Suchreihenfolge für Zugangsdaten.
- `docs/runbooks/business-restore.md`, `docs/runbooks/gitlab-restore.md` —
  Wiederherstellung.
- `docs/runbooks/ssh-zugang-fleet.md`, `docs/runbooks/pocket-id-bootstrap.md` —
  Zugang und IdP-Bootstrap.
- `docs/fleet-stage2-cutover-runbook.md` — DNS-Cutover (falls Rebuild nötig).
- `docs/adr/ADR-001-fleet-konsolidierung.md`,
  `docs/adr/ADR-002-push-basiertes-deploy.md`,
  `docs/adr/ADR-003-brand-namespace-split.md` — Architektur-Kontext.

## Neu generiert (Templates mit `__GEKKO_*__`-Platzhaltern)

- `README.md`, `.gitignore`, `Taskfile.yml` (nur `flux:render`,
  `manifests:validate`, `flux:push`).
- `scripts/flux-render-artifact.sh` — Mentolder-only-Variante des Upstream-
  Skripts (identische `render_component`-Logik und Guards; nur die vier
  Gekko-Targets plus SealedSecrets-Kopie). Herkunft der Logik im Kopf vermerkt.
- `flux/clusters/fleet-gekko/{flux-instance,source,oci-source}.yaml` —
  Repo-URL, OCI-Artefakt und Cosign-Identität als Platzhalter.
- `.github/workflows/render-fleet-artifact.yml` — CI-Pipeline mit
  GHCR-Ziel als Platzhalter.

## Bewusst NICHT enthalten

- `prod-fleet/{korczewski,korczewski-auth,korczewski-jobs,staging,dev,dev-pod,website-korczewski,website-staging}/` und
  `environments/{fleet-korczewski,korczewski,staging,dev*,fleet}.yaml` —
  andere Marke / Staging / Dev (Ziel: devmesh, nicht Gekko).
- `components/`, `packages/`, `apps/` — App-Quellcode. Prod bezieht Images
  (`ghcr.io/paddione/website`, `workspace-brett`, `studio-server`); siehe
  README-Checkliste zur Image-Versorgung.
- `tests/`, `.agents/`, `scripts/` (Rest) — Suite und Agent-Tooling des
  Monorepos; im neuen Repo ohne das Monorepo nicht lauffähig.
- `flux/clusters/fleet/` + `bootstrap/` — alter Cluster und dessen Bootstrap-
  Secrets. Gekko bootstrapt `fleet-gekko` neu (Checkliste im README).
- `migrations/`, `backups/` — keine Live-Daten im Repo.
