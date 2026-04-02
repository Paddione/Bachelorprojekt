# Contributing to Homeoffice MVP

All changes go through pull requests. Direct pushes to `main` are not allowed.

## Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feature/*` | New functionality |
| `fix/*` | Bug fixes |
| `chore/*` | Refactoring, dependencies, CI/CD |

## Workflow

```bash
# 1. Create branch
git checkout main && git pull
git checkout -b feature/my-feature

# 2. Develop locally
task homeoffice:deploy
task homeoffice:status
task homeoffice:logs -- keycloak

# 3. Validate before pushing
task homeoffice:validate        # dry-run K8s manifests
shellcheck scripts/*.sh         # lint scripts (if modified)

# 4. Push + open PR (uses PR template checklist)
```

## CI Checks (must pass before merge)

- Kubernetes manifest validity (kustomize build + kubeconform)
- YAML linting (k3d manifests)
- Shell script linting (shellcheck)
- Config validation (realm JSON, PHP OIDC config)
- Security scan (image pinning, secret detection)

**Merge via squash-and-merge** to keep `main` history clean.

## Monorepo Rules

1. k3d/k3s is the only deployment target — no docker-compose.
2. All K8s manifests live in `k3d/`. Use Kustomize.
3. Domains are centralized in `k3d/configmap-domains.yaml`. Never hardcode hostnames.
4. Secrets stay in `k3d/secrets.yaml` (dev values only). Never commit real credentials.
5. Shared configs (proxy configs, adapter code, import scripts) live outside `k3d/` and are loaded as ConfigMaps by the deploy task.

## For AI Assistants (Claude Code)

1. Always create a feature branch — never commit directly to `main`
2. Follow the PR template checklist
3. Run `task homeoffice:validate` before pushing
4. Create PR with `gh pr create`
5. Wait for CI to pass before requesting merge
