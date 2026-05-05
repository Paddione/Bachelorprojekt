# TOOLS.md - Local Notes

Workspace-specific infrastructure and tool context.

## Clusters

| Context name | Role | Where |
|---|---|---|
| `k3d-k3d-dev` | Local dev cluster | localhost via k3d |
| `mentolder` | Unified production cluster (ArgoCD hub) | Hetzner VPS (6 CPs + 6 home workers) |
| `korczewski` | Alias — same physical cluster as `mentolder` | Resolves to pk-hetzner (62.238.9.39:6443) |

The separate korczewski cluster was disbanded 2026-05-05. All former korczewski nodes (pk-hetzner/pk-hetzner-2/pk-hetzner-3) are now control-planes in the unified mentolder cluster. korczewski.de workloads run in the `workspace-korczewski` namespace on mentolder, managed by ArgoCD via the `cluster-korczewski` secret.

ArgoCD tasks hardcode `--context mentolder` — do not run them expecting korczewski behavior.

**12-node topology:**
- CPs (Hetzner): `gekko-hetzner-2` (178.104.169.206), `gekko-hetzner-3` (46.225.125.59), `gekko-hetzner-4` (178.104.159.79), `pk-hetzner` (62.238.9.39, WG hub), `pk-hetzner-2` (77.42.33.194), `pk-hetzner-3` (62.238.23.79)
- Workers (home LAN, WireGuard): `k3s-1` (.20), `k3s-2` (.11), `k3s-3` (.12), `k3w-1` (.4), `k3w-2` (.3), `k3w-3` (.13)
- **CNI partition:** Flannel VXLAN between Hetzner CPs and home workers is broken. System pods (CoreDNS, ArgoCD) must stay on Hetzner nodes via nodeAffinity.

## Key Services & Hostnames

| Service | Dev hostname | Prod hostname |
|---|---|---|
| Traefik ingress | *.localhost | *.mentolder.de / *.korczewski.de |
| Keycloak | auth.localhost | auth.mentolder.de |
| Nextcloud | files.localhost | files.mentolder.de |
| Collabora | office.localhost | office.mentolder.de |
| Vaultwarden | vault.localhost | vault.mentolder.de |
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

- Hetzner CPs: `root@<ip>` with `~/.ssh/id_ed25519_hetzner`
- Home workers: double-jump via pk-hetzner, e.g. `ssh -J root@62.238.9.39,patrick@192.168.100.11 patrick@10.0.3.1`
- All nodes in single `mentolder` context; `korczewski` kubeconfig context resolves to same cluster (pk-hetzner)

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
