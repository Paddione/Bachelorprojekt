# Contributing to Homeoffice MVP

## Development Workflow

All changes go through pull requests. Direct pushes to `main` are not allowed.

### Branch Naming

| Prefix       | Purpose                          |
|-------------|----------------------------------|
| `feature/*` | New functionality                |
| `fix/*`     | Bug fixes                        |
| `chore/*`   | Refactoring, dependencies, CI/CD |

### Workflow

1. **Create a branch** from `main`:
   ```bash
   git checkout main && git pull
   git checkout -b feature/my-feature
   ```

2. **Develop locally** with k3d:
   ```bash
   task homeoffice:deploy        # deploy all services
   task homeoffice:status        # check pod health
   task homeoffice:logs -- keycloak  # tail service logs
   ```

3. **Update the tracking database** (mandatory for any significant change):
   - Via the **Tracking UI**: http://tracking.localhost
   - Via **psql**: `task tracking:psql`
   - Via **PostgreSQL MCP** (from OpenClaw or Claude Code)

   At minimum, update the pipeline stage/status for the affected requirement(s).
   If this change introduces a new requirement, create the entry first.

4. **Validate before pushing**:
   ```bash
   task homeoffice:validate      # dry-run k8s manifests
   shellcheck scripts/*.sh       # lint scripts (if modified)
   ```

5. **Push and open a PR**:
   - Use the PR template checklist
   - CI runs automatically (manifest validation, YAML lint, security scan)

6. **CI must pass** before merge. The pipeline checks:
   - Kubernetes manifest validity (kustomize build + kubeconform)
   - YAML linting (k3d manifests)
   - Shell script linting
   - Config validation (realm JSON, PHP OIDC config)
   - Security scan (image pinning, secret detection)

7. **Merge via squash-and-merge** to keep `main` history clean.

### Local k3d Development

Prerequisites: Docker, k3d, kubectl, task (go-task)

```bash
# First time: create cluster + deploy
cd /path/to/k3d-dev
task cluster:create              # creates k3d cluster
task ingress:install             # install NGINX ingress
task homeoffice:deploy           # deploy all services

# Day-to-day
task homeoffice:status           # check everything
task homeoffice:restart -- keycloak  # restart a service
task homeoffice:teardown         # clean up
```

Services are available at:
- **Keycloak (SSO):** http://auth.localhost (admin/devadmin)
- **Mattermost (Chat):** http://chat.localhost
- **Nextcloud (Files):** http://files.localhost
- **Collabora (Office):** http://office.localhost
- **Talk HPB (Signaling):** http://signaling.localhost

### Running Tests

```bash
./tests/runner.sh local              # full test suite against k3d
./tests/runner.sh local SA-08        # single test
./tests/runner.sh local --verbose    # verbose output
```

### Monorepo Rules

1. **k3d/k3s is the only deployment target.** No docker-compose.
2. **All K8s manifests live in `k3d/`.** Use Kustomize.
3. **Domains are centralized** in `k3d/configmap-domains.yaml`. Never hardcode hostnames.
4. **Secrets stay in `k3d/secrets.yaml`** (dev values only). Never commit real credentials.
5. **Shared configs** (proxy configs, adapter code, import scripts) live outside `k3d/` and are loaded as ConfigMaps by the deploy task.

### For AI Assistants (Claude Code)

When asked to develop a feature, fix a bug, or make any code change:

1. **Always create a feature branch** — never commit directly to `main`
2. **Update the tracking database** — mandatory for every significant change:
   - Update pipeline stage/status for affected requirement(s) via psql (`task tracking:psql`) or PostgreSQL MCP
   - If no matching requirement exists, create one first
   - Use schema `bachelorprojekt` for Homeoffice MVP work
3. **Follow the PR template** — fill out the checklist completely
4. **Run `task homeoffice:validate`** before pushing
5. **Create a PR** using `gh pr create` with the appropriate template
6. **Wait for CI** to pass before requesting merge
