# Service → SealedSecret-Mapping (FluxCD / Bitnami)

Standard: Alle Kubernetes-Service-Secrets werden als `kind: SealedSecret`
(Bitnami SealedSecrets, FluxCD-kompatibel) abgelegt und per Flux
appliziert. Dieses Dokument verlinkt Services mit ihren Manifesten,
damit der Code-Repo-Graph sie navigierbar macht. Enthält keine
Secret-Werte und keine privaten Schlüssel.

## Prod/Stage-Umgebungen (`environments/sealed-secrets/`)

SSOT für Schlüsselnamen: `environments/schema.yaml`.
Erzeugung/Versiegelung nur via `task env:generate` /
`task env:seal` (vgl. Security-Specialist-Regeln);
`environments/.secrets/*.yaml` ist Plaintext, gitignored, nie committen.

| Datei | SealedSecrets (name / namespace, Metadaten) |
|---|---|
| `environments/sealed-secrets/fleet-mentolder.yaml` | `workspace-secrets`/`workspace`, `knowledge-secrets`/`workspace`, `website-content-token`/`website`, `grafana-oidc`/`monitoring`, `coturn-secrets`/`coturn`, `website-secrets`/`website`, `rustdesk-secrets`/`rustdesk`, `collabora-secrets`/`workspace-office`, `ipv64-api-key`/`cert-manager`, `otel-collector-auth`/`monitoring` |
| `environments/sealed-secrets/fleet-korczewski.yaml` | `workspace-secrets`/`workspace-korczewski`, `website-content-token`/`website-korczewski`, `grafana-oidc`/`monitoring`, `knowledge-secrets`/`workspace-korczewski`, `website-secrets`/`website-korczewski`, `collabora-secrets`/`workspace-office`, `ipv64-api-key`/`cert-manager`, `otel-collector-auth`/`monitoring` |
| `environments/sealed-secrets/korczewski-prod.yaml` | `workspace-secrets`/`workspace-korczewski`, `website-content-token`/`website-korczewski`, `website-secrets`/`website-korczewski`, `ipv64-api-key`/`cert-manager` |
| `environments/sealed-secrets/staging.yaml` | `workspace-secrets`/`workspace-staging`, `website-content-token`/`website-staging`, `grafana-oidc`/`monitoring`, `website-secrets`/`website-staging`, `knowledge-secrets`/`workspace-staging`, `collabora-secrets`/`workspace-office`, `ipv64-api-key`/`cert-manager`, `otel-collector-auth`/`monitoring` |
| `environments/sealed-secrets/dev.yaml` | `workspace-secrets`/`workspace`, `website-secrets`/`workspace`, `knowledge-secrets`/`workspace`, `grafana-oidc`/`monitoring`, `collabora-secrets`/`workspace-office`, `ipv64-api-key`/`cert-manager`, `website-content-token`/`workspace`, `otel-collector-auth`/`monitoring` |

Hinweis Korczewski-Workspace: seit 2026-07-23 eingefroren, skaliert auf 0;
aktiv bleiben Massage-Website- und Pocket-ID-Anteile sowie
`flux-sealed-secrets-korczewski` (siehe
`docs/runbooks/credentials-finden.md`).

## Flux-Bootstrap (`flux/clusters/`)

| secretRef | SealedSecret-Manifest |
|---|---|
| `ghcr-auth` (`flux-system`) | `flux/clusters/fleet/bootstrap/ghcr-auth-sealedsecret.yaml`, `flux/clusters/devmesh/bootstrap/ghcr-auth-sealedsecret.yaml` |
| `github-token` (`flux-system`) | `flux/clusters/fleet/bootstrap/github-token-sealedsecret.yaml` |
| `flux-webhook-token` (`flux-system`) | `flux/clusters/fleet/bootstrap/flux-webhook-token-sealedsecret.yaml` |
| Kustomizationen | `flux/clusters/fleet/ks-sealed-secrets.yaml`, `flux/clusters/devmesh/ks-secrets.yaml`, `flux/clusters/korczewski-prod/ks-secrets.yaml` |

Ausnahmen (begründet, kein Verstoß):
- `flux/clusters/fleet-gekko/gekko-mentolder-git-verify-secret.yaml`
  ist `kind: Secret` und enthält nur öffentliche GPG-Keys.
  Offene Klärung: `ghcr-auth`-Herkunft für
  `flux/clusters/fleet-gekko/` ist nicht in diesem Verzeichnis belegt
  (Cross-Cluster-Referenz prüfen, kein neues Secret anlegen).

## Lokal/Dev (keine K8s-Service-Secrets)

- `k3d/secrets.yaml`, `k3d/website-dev-secrets.yaml` und weitere
  `k3d/*.yaml` enthalten `kind: Secret`-Platzhalter für devmesh
  (z. B. `dev-*`). Ausschließlich lokal, nie als Prod-Quelle referenzieren.
- `components/VideoVault/README.md` beschreibt Compose-Env-Dateien
  (`env/.env-postgres`, `env/.env-app`, `.env-dev`, `.env-prod`,
  alle gitignored, Vorlage `env/.env.example`). Lokaler
  Compose-Workflow, kein Fleet-Service-Secret.
- Host-Tooling (`~/.config/*/*.env`, `chmod 600`, außerhalb des Repos)
  und Dotfiles-`git-crypt` (`environments/.secrets/`, Key out-of-band)
  bleiben bestehen und werden nicht nach SealedSecrets migriert
  (Out of Scope).
- Im Repo ist nur `components/website/.env.example` getrackt
  (Platzhalter `...`, keine Werte). `components/website/.env` und
  `.env` im Root sind gitignored.

## Lookup-Reihenfolge

1. `environments/schema.yaml` (Schlüsselname klären).
2. Versiegelte CRDs oben (Prod/Stage bzw. `dev.yaml`).
3. Cluster nur lesend abgleichen (`kubectl ... get secret ... -o json`
   nur Keys auflisten, keine Werte ausgeben).
   Details: `docs/runbooks/credentials-finden.md`,
   `docs/runbooks/derived-secrets.md`,
   `docs/bereitstellungsdetails.md` (§4 Services, §4.15 Sealed Secrets).

## Validierung (ohne Entschlüsselung)

```bash
grep -rl "kind: SealedSecret" environments/sealed-secrets/ flux/ | sort
grep -rh "kind: SealedSecret" environments/sealed-secrets/ flux/ | wc -l
git ls-files | grep -E "(^|/)\.env$" || true  # nur *.example erwartet
git status --short --untracked-files=no | head
```

Graph: `codebase-memory-mcp` `list_projects`, `index_status` und
`check_index_coverage` für `home-patrick` und
`home-patrick-Bachelorprojekt`; `search_code` (`SealedSecret`)
zeigt `docs/`-, `environments/`-, `flux/`- und `k3d/`-Treffer.
Private Schlüssel (`environments/.secrets/sealed-secrets-key.*.yaml`,
`~/dotfiles-git-crypt.key`) werden nie gelesen oder indexiert.
