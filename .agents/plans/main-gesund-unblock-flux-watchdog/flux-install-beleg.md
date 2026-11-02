# Task 4 — devmesh Flux-Install: Beleg (Stand 2026-11-02, Branch fix/main-gesund-unblock-flux-watchdog)

## Vorher-Beleg (#7057 reproduziert)

- `kubectl --context devmesh get crd | grep -ci flux` → `0`
- `kubectl --context devmesh get kustomizations -A` → `NotFound (CRD fehlt)`
- `kubectl --context devmesh get ns flux-system` → `NotFound`
- Hinweis: `KUBECONFIG=~/.kube/devmesh.yaml` ist stale (x509 unknown authority,
  zeigt auf alten Cluster-Key). Geprueft und verwendet: Default-Kubeconfig
  Context `devmesh` (Server `https://gpu-cluster2:6443`, Cluster 4h alt, gesund).

## Durchgefuehrt

- `task devmesh:flux:install` → flux-operator 0.62.1 (ghcr.io) installiert,
  `fluxinstance/flux` Ready=True (v2.10.0), `flux/clusters/devmesh/bootstrap/`
  appliziert.
- `flux/clusters/devmesh/bootstrap/ghcr-auth-sealedsecret.yaml` neu versiegelt:
  alte Versiegelung galt dem vorherigen Cluster (Rebuild ~02.11.2026, neuer
  Sealed-Secrets-Key → `ErrUnsealFailed: no key could decrypt`). Neu versiegelt
  mit frischem Cert (`task env:fetch-cert ENV=dev`, Cert gitignored) aus
  `GHCR_PAT` (environments/.secrets/dev.yaml, entsperrt) + Username des
  Token-Owners (`gh api user` → Paddione, kein Secret-Material). Keine Werte
  in Logs/Commits.

## Nachher-Beleg (Reconciliation)

| Git-Pfad | Flux-Objekt | Status |
|---|---|---|
| flux/clusters/devmesh (main@a445e9f) | kustomization/flux-system | Ready=True |
| oci://ghcr.io/paddione/devmesh-manifests (v0.0.66) | ocirepository/devmesh-manifests | Ready=True (cosign-verifiziert, ghcr-auth funktioniert Ende-zu-Ende) |
| ./platform (aus OCI) | kustomization/devmesh-platform | **False — siehe Blocker A** |
| ./secrets (aus OCI) | kustomization/devmesh-secrets | False (wartet auf devmesh-platform, dependsOn-Kette) |
| ./workspace (aus OCI) | kustomization/devmesh-workspace | False (wartet auf devmesh-secrets) |
| ./apps/agent-board (Git dotfiles) | kustomization/agent-board | **False — siehe Blocker B** |

Namespaces neu: `flux-system`, `tailscale` (von Flux angelegt, leer).

## Blocker A — tailscale-Operator fehlt auf frischem Cluster

`devmesh-platform` dry-run: `no matches for kind "Connector" in version
"tailscale.com/v1alpha1"`. `dev-local/platform/` enthaelt Operator-HelmRelease
UND Connector im selben Kustomize-Batch → Deadlock: ohne CRD schlaegt der
Dry-Run fehl, das HelmRelease (das die CRDs braechte) wird nie appliziert.
Zusaetzlich hat das `operator-oauth`-Secret (tailscale-HelmRelease values)
keine Quelle im Repo (kein TAILSCALE-Key in dev.yaml/Schema, kein Render in
render-stack.sh). Auf dem alten Cluster war der Operator offenbar manuell
vorhanden. Kein Fix geraten: braucht Entwurfsentscheid (Kustomization-Split
mit dependsOn vs. Operator als Bootstrap-Voraussetzung + OAuth-Secret-
Management). → Follow-up ans Goal/Operator.

## Blocker B — dotfiles-auth SSH-Key ohne legitime Quelle

`gitrepository/dotfiles` (ssh://git@github.com/Paddione/dotfiles.git, privat):
`dotfiles-auth` SealedSecret ebenfalls fuer alten Cluster-Key versiegelt.
Gesucht nach credentials-finden.md (feste Reihenfolge, nur Schluesselnamen,
keine Werte): git-crypt (`dev.yaml`, `dev-tools.yaml`, `fleet-*.yaml`,
`staging.yaml`) → kein SSH-Key; Cluster (neu) → nichts; Vaultwarden →
interaktiv, als Subagent nicht verfuegbar. Operator-Frage: SSH-Deploy-Key
(read, Paddione/dotfiles) bereitstellen oder neu versiegeln nach
`flux/clusters/devmesh/bootstrap/dotfiles-auth-sealedsecret.yaml`.
