# TOOLS.md - Local Notes

Workspace-specific infrastructure and tool context.

## Clusters

| Context name | Role | Where |
|---|---|---|
| `k3d-k3d-dev` | Local dev cluster | localhost via k3d |
| `mentolder` | Production hub (ArgoCD lives here) | Hetzner VPS |
| `korczewski` | Production spoke | Separate server |

ArgoCD on `mentolder` manages both `mentolder` and `korczewski` via ApplicationSets.  
ArgoCD tasks hardcode `--context mentolder` — do not run them expecting korczewski behavior.

## Key Services & Hostnames

| Service | Dev hostname | Prod hostname |
|---|---|---|
| Traefik ingress | *.localhost | *.mentolder.de / *.korczewski.de |
| Keycloak | auth.localhost | auth.mentolder.de |
| Nextcloud | files.localhost | files.mentolder.de |
| Collabora | office.localhost | office.mentolder.de |
| Vaultwarden | vault.localhost | vault.mentolder.de |
| Claude Code | ai.localhost | ai.mentolder.de |
| Website (Astro) | web.localhost | web.mentolder.de |
| Mailpit (dev only) | mail.localhost | — |
| Docs | docs.localhost | docs.mentolder.de |

All hostnames are defined in `k3d/configmap-domains.yaml` — never hardcode elsewhere.

## Task Runner

Uses `go-task` (`task`). All commands in `Taskfile.yaml` at repo root.  
`ENV=` must be explicit for env-sensitive tasks: `ENV=mentolder` or `ENV=korczewski`.

## Secrets

- **Dev**: `k3d/secrets.yaml` (plaintext, dev values only — never commit real creds)
- **Prod**: SealedSecrets managed via `task env:seal`. `prod/kustomization.yaml` has a `$patch: delete` on `workspace-secrets` to prevent dev secrets overwriting prod — never remove it.

## SSH / Infrastructure

- Hetzner VPS hosts `mentolder` cluster — accessible via kubectl context `mentolder`
- `korczewski` cluster — kubectl context `korczewski`

## Scripts

All utility scripts in `scripts/`. Key ones:
- `scripts/env-resolve.sh` — must be **sourced**, never executed directly
- `scripts/mcp-register.sh` — registers MCP servers in Claude Code database
- `scripts/dsgvo-check.sh` — DSGVO compliance verification

## Tests

```bash
./tests/runner.sh local              # All tests
./tests/runner.sh local <TEST-ID>    # Single test
./tests/runner.sh report             # Markdown report
```

Test IDs: `FA-01`–`FA-25`, `SA-01`–`SA-10`, `NFA-01`–`NFA-09`, `AK-03`, `AK-04`.
