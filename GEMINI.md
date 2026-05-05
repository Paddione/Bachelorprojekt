# Gemini CLI Context: Workspace MVP

## Project Overview

This is an infrastructure-as-code and deployment monorepo for a Kubernetes-based collaboration platform designed for small teams. The "Workspace MVP" integrates various open-source and custom services into a cohesive environment.

**Core Services:**
*   **Keycloak:** Identity Provider (SSO/OIDC)
*   **Nextcloud:** File sharing, Calendars, Contacts, and Video (Talk)
*   **Collabora Online:** Office suite backend for Nextcloud
*   **Talk HPB:** WebRTC Signaling (Janus + NATS + coturn)
*   **Vaultwarden:** Password manager (Bitwarden-compatible)
*   **DocuSeal:** E-Signature
*   **Whiteboard / Brett:** Collaborative tools
*   **Claude Code MCP Server:** AI integration infrastructure
*   **Website:** Astro + Svelte based frontend (mentolder.de / korczewski.de)
*   **Traefik:** Ingress Controller
*   **PostgreSQL:** Shared database

**Infrastructure:**
*   Deployed locally using **k3d** (development) and in production using **k3s**.
*   Configuration management is handled entirely via **Kustomize** (no Helm charts or docker-compose for the main stack).
*   **ArgoCD** is used for GitOps multi-cluster federation (Hub and Spoke model).

## Building and Running

The project relies heavily on [`task`](https://taskfile.dev/) as the unified command runner. 

### Quick Start
To set up the cluster and deploy the full Workspace MVP locally:
```bash
task workspace:up
```

### Key Task Commands
*   `task cluster:create` / `task cluster:delete`: Manage the local k3d development cluster.
*   `task workspace:deploy`: Deploy the main workspace services via Kustomize.
*   `task workspace:status`: View the status of pods, services, and ingress rules.
*   `task workspace:logs -- <service>`: Tail logs for a specific service.
*   `task website:dev`: Run the Astro website dev server with hot-reload.
*   `task mcp:deploy`: Deploy Claude Code MCP pods.
*   `task test:all`: Run all offline tests (unit, manifests, dry-run).
*   `task workspace:dsgvo-check`: Run DSGVO/GDPR compliance verification (NFA-01).
*   `task workspace:sync-db-passwords`: Sync DB passwords between K8s secrets and Postgres roles (run after secret rotation).
*   `task workspace:vaultwarden:seed`: Seed production Vaultwarden with secret templates (critical after fresh prod deploy).

### Specialized Taskgroups
*   **`wireguard:*`**: Manage the VPN tunnel connecting the local GPU worker (for AI transcription) to the production cluster.
*   **`keycloak:sync`**: Push realm config and secret updates to the live cluster without a full redeploy.
*   **`sealed-secrets:*`**: Lifecycle of the Sealed Secrets controller (required for `env:seal`).
*   **`einvoice-sidecar:*`**: Build and manage the ZUGFeRD/XRechnung sidecar image (Java/Mustangproject).
*   **`billing:validate-einvoice`**: Validate e-invoice XML/PDF output locally.

### User Lifecycle Management
*   `task workspace:create-guest`: Provision a guest account in Keycloak and Nextcloud.
*   `task workspace:import-users`: Bulk-import users from CSV.
*   `task workspace:migrate`: Interactive data migration assistant.

*Tip: Review the `Taskfile.yml` or run `task --list` for an exhaustive list of available commands.*

## Operational Footguns & Warnings

> [!CAUTION]
> **ENV= Behavior & Context Safety:**
> The `ENV=` variable is explicit. Omitting it defaults to `dev`. 
> **Crucially:** The kubectl context mismatch check **only runs when `ENV != dev`**.
> If your active kubectl context points to a production cluster and you run a command without `ENV=`, you will deploy `dev` configuration to `prod` without warning. Always verify your context or use explicit `ENV=` flags.

## Development Conventions

1.  **Kubernetes Native:** The only deployment path is k3d/k3s. `docker-compose` is not used for deployment.
2.  **Manifest Location:** All base Kubernetes manifests reside in `k3d/`. Overlays for production are in `prod/`, `prod-korczewski/`, and `k3s/`.
3.  **Kustomize:** Kustomize is the primary tool for orchestrating Kubernetes manifests.
4.  **Git Workflow:** Changes must be made via Pull Requests. No direct pushes to `main`.
5.  **CI Enforcement:** The CI pipeline (manifest validation, YAML linting, shellcheck, security scans) must pass before merging.
6.  **Centralized Domains:** Domain configuration is centralized in `k3d/configmap-domains.yaml`. Hardcoded hostnames in manifests are forbidden.
7.  **Secrets Management:** Development secrets are in `k3d/secrets.yaml`. **Never commit real credentials.** Production uses Sealed Secrets.
8.  **Testing:** Automated tests (Bash + Playwright + BATS) are run locally via `./tests/runner.sh local`.

## Documentation
Additional detailed documentation (Architecture, Services, Keycloak SSO, Migration, etc.) can be served locally via `task docs:deploy` and viewed at `http://docs.localhost`. Markdown sources are located in `k3d/docs-content/`.