# Workspace MVP - Gemini Context

This document provides essential context and instructions for AI assistants working on the **Workspace MVP** (Bachelorprojekt). This project is a Kubernetes-based collaboration platform designed for small teams, integrating several open-source services with Single Sign-On (SSO) and a self-hosted AI assistant.

## Project Overview

- **Core Technologies:** Kubernetes (k3d/k3s), Kustomize, Go (billing-bot), Shell scripts, Taskfile.
- **Architecture:** A microservices-oriented architecture running primarily in the `workspace` namespace.
- **Key Services:**
  - **Keycloak (SSO):** Identity management and OIDC provider (`auth.localhost`).
  - **Mattermost:** Team chat and collaboration (`chat.localhost`).
  - **Nextcloud:** File storage, Talk (video), and Collabora Office (`files.localhost`).
  - **Claude Code (AI Assistant):** Self-hosted AI interface with MCP-based tool use (`ai.localhost`).
  - **WordPress:** Customer request portal and external website (`web.localhost`).
  - **Billing Bot:** A Go service bridging Mattermost interactive messages with Invoice Ninja.
  - **Invoice Ninja:** Accounting and invoicing platform (`billing.localhost`).
- **Infrastructure:**
  - **Ingress:** Traefik (built-in k3s). No separate NGINX Ingress installation required.
  - **AI Backend:** Ollama (Local LLM backend with Qwen 2.5) and Anthropic API.
  - **Communication:** coturn (STUN/TURN), signaling-server (Talk HPB), Janus Gateway.
  - **Auxiliary:** Mailpit (SMTP development), Opensearch (search), Vaultwarden (passwords), Spacedeck (whiteboard), and backup cronjobs.

## Building and Running

The project uses `task` (go-task) for orchestration.

### Key Commands

- **Cluster Management:**
  - `task cluster:create`: Create the local k3d cluster (uses k3d-config.yaml).
  - `task cluster:delete`: Remove the k3d cluster.
- **Deployment:**
  - `task workspace:deploy`: Deploy all services to the cluster (Kustomize).
  - `task workspace:validate`: Perform a dry-run and validate Kubernetes manifests.
- **Observability:**
  - `task workspace:monitoring`: Install Prometheus + Grafana stack (required for NFA-02).
  - `task workspace:status`: Check the status of all pods and services.
  - `task workspace:logs -- <service>`: Tail logs for a specific service (e.g., `keycloak`).
  - `task workspace:restart -- <service>`: Restart a specific service.

### Testing

Run the automated test suite (Bash + Playwright) against the local cluster:
```bash
./tests/runner.sh local              # Run all tests
./tests/runner.sh local <TEST-ID>    # Run a specific test (e.g., SA-08)
```

## Development Conventions

### Branching and PRs
- **Branching Policy:** Always work on a feature branch (`feature/*`, `fix/*`, `chore/*`). **Never commit directly to `main`.**
- **Pull Requests:** All changes must go through a PR. Use the PR template and ensure CI (YAML lint, Shellcheck, manifest validation) passes.
- **Merging:** Use **squash-and-merge** to keep the `main` history clean.

### Kubernetes & Configuration
- **Manifests:** Base manifests are in `k3d/`. Production-specific overlays/patches are in `prod/`.
- **Kustomize:** Always use Kustomize for managing Kubernetes resources.
- **Centralized Domains:** Hostnames are centralized in `k3d/configmap-domains.yaml`. Do not hardcode hostnames in other manifests.
- **Secrets:** Use `k3d/secrets.yaml` for development secrets. Never commit real production credentials.

## AI Assistant Guidelines

When executing a directive:
1. **Research:** Understand the service interaction.
2. **Strategy:** Plan changes across K8s manifests, scripts, or the billing-bot code.
3. **Branching:** Create a dedicated branch using `git checkout -b`.
4. **Collaboration:** Work with **Claude Code** in the admin-only Mattermost channels if available.
5. **Execution:** 
   - Apply surgical changes.
   - If modifying Kubernetes manifests, run `task workspace:validate`.
6. **Validation:** Run relevant tests using `./tests/runner.sh local`.
7. **PR:** Use `gh pr create` with the repository's template.
