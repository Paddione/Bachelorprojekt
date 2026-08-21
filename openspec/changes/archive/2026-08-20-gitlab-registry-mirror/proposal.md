# Proposal: gitlab-registry-mirror

## Why

Die GitLab-CI-Migration (Etappen 1-3, T011790/T012177/T012405) hat die Pruefung
redundant gemacht, die Auslieferung aber nicht. Jedes Container-Image und das
Flux-OCI-Artefakt `fleet-manifests` liegen ausschliesslich auf `ghcr.io`. Faellt
ghcr.io oder GitHub aus, laesst sich weder ein Rollout noch ein **Rollback auf
einen bereits gebauten Stand** ausfuehren — auch dann nicht, wenn die
GitLab-Pipeline gruen ist. Eine gruene Pipeline ohne ausliefbares Artefakt
aendert am Ausfall nichts.

Gemessen gegen `origin/main` b28103f4f (2026-08-18):

```bash
git ls-files '.github/workflows/*.yml' | xargs grep -l 'ghcr.io' | wc -l   # 12
grep -rn 'image: ghcr.io' k3d/ --include='*.yaml' | wc -l                  # 20
```

## What

Die in GitHub Actions **bereits gebauten** Artefakte werden zusaetzlich in die
GitLab Container Registry gespiegelt. Es wird nichts neu gebaut: Der Spiegel
kopiert Manifest und Signatur, sodass die bestehende cosign-Verifikation in
`flux/clusters/fleet/oci-source.yaml` unveraendert gueltig bleibt.

- Zehn Build-Workflows pushen ihre Tags zusaetzlich nach `registry.gitlab.com`.
- `render-fleet-artifact.yml` spiegelt das signierte OCI-Artefakt per
  `cosign copy` (kopiert Signatur-Tags mit, anders als `crane copy`).
- Eine zweite, **suspendierte** `OCIRepository` plus `imagePullSecret` liegen im
  Cluster bereit; die Umschaltung ist ein dokumentierter Runbook-Schritt.

Nicht Teil dieses Change: kein Gate-Flip (GitHub bleibt SSOT und Merge-Gate),
keine Build-Jobs in `.gitlab-ci.yml`, keine Aufweichung der cosign-verify-Policy.

_Ticket: T012415_
