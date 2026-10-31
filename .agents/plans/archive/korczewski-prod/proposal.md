# korczewski-prod — Proposal

## WARUM

Der Prod-Slot korczewski ist heute nicht erreichbar: `environments/korczewski.yaml` zeigt mit
`context: fleet`, `overlay: prod-fleet/korczewski` und `secrets_ref: sealed-secrets/korczewski.yaml`
auf einen abgebauten Cluster, die Flux-Kustomization `flux-korczewski` steht `suspend: true`, und
`flux/clusters/fleet/DECOMMISSIONED.md` erklärt den Pfad für beendet. Wer heute `korczewski.de`
ausliefern will, hat keinen GitOps-Weg, sondern nur die historischen `prod-fleet/*`-Overlays ohne
Ziel-Cluster.

Gleichzeitig hat der Audit des devmesh-Deploy-Pfads drei Befunde geliefert, die ein neuer
Prod-Cluster nicht erben darf: live-only Workloads ohne Manifest (C1), `cluster-admin` für den
Tenant-ServiceAccount trotz `multitenant: true` (C2) und SealedSecrets für Namespaces, die das
Artefakt nicht anlegt — auf einem leeren Cluster ein harter Block (C3).

`korczewski-prod` ist deshalb kein „Overlay umbiegen", sondern ein neuer, host-agnostischer
Lieferketten-Pfad: eigenes signiertes OCI-Artefakt, eigene FluxInstance, eigener enger RBAC-Satz,
eigener SealedSecrets-Key.

## WAS

- **Neues Env-File** `environments/korczewski-prod.yaml` (`context: korczewski-prod`,
  `secrets_env: korczewski-prod`, Namespaces `website-korczewski`/`workspace-korczewski`,
  `TLS_SECRET_NAME: korczewski-prod-wildcard-tls`, CIDRs als Pflicht-Input).
- **Neues Overlay** `korczewski-prod/` mit vier Teilbäumen `cluster-bootstrap/`, `platform/`,
  `website/`, `auth/`; `website/` referenziert `prod-fleet/website-korczewski`, `auth/` baut
  Pocket ID direkt aus `k3d/`.
- **Neuer Renderer** `scripts/korczewski-prod/render-stack.sh` mit demselben Vertrag wie
  `scripts/devmesh/render-stack.sh` und fail-closed-Guards (keine `latest`-Tags, keine
  `mentolder.de`/`fleet-manifests`/`workspace-dev`/`devmesh`-Referenzen).
- **Neue Flux-Instanz** `flux/clusters/korczewski-prod/` mit `flux-instance.yaml`, eigenem
  `OCIRepository` (`ghcr.io/paddione/korczewski-prod-manifests`, cosign-Verify auf genau einen
  Workflow) und vier Kustomizations (`bootstrap → platform → secrets → apps`).
- **Eingeengte RBAC:** Namespaced-Pfade bekommen nur `Role`/`RoleBinding`; der
  Bootstrap-Pfad bekommt eine `ClusterRole` mit `resourceNames` auf `ClusterIssuer`, `TLSStore`
  und die drei Bootstrap-`ClusterRole(Binding)`s. Kein `cluster-admin`.
- **Neue Secrets:** vier SealedSecrets (`cert-manager/ipv64-api-key`,
  `workspace-korczewski/workspace-secrets`, `website-korczewski/website-secrets`,
  `website-korczewski/website-content-token`), versiegelt mit dem Key des Ziel-Clusters über
  `scripts/env-seal.sh --env korczewski-prod`.
- **Neue Artefakt-Pipeline** `.github/workflows/render-korczewski-prod-artifact.yml`:
  Render-Gate, Push nach GHCR, Tags `sha-<sha>`/`v0.0.<run>`, keyless `cosign sign`.
- **Neue Tests** unter `tests/py/spec/korczewski-prod/`: Render-Layout, Fremd-Referenz-Verbot,
  Cluster-Scope-Trennung, `cluster-admin`-Verbot, SealedSecret-/Namespace-Parität, Digest-Pinning,
  cosign-Identitäts-Anker, Flux-Instanz-Isolation.
- **ADR-017** hält die Entscheidung und die bewusste Abweichung von ADR-016 (öffentliches Artefakt)
  fest.

## NICHT

Hardware/k3s/Flux-Bootstrap, Longhorn/Traefik-Installation, Nextcloud/Collabora/Vaultwarden/Brain/
Monitoring, die Sanierung der devmesh-RBAC selbst, der C1-Fix auf devmesh und der tote
`render-fleet-artifact.yml`.
