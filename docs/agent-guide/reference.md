# Agent Reference (on-demand)

Moved from `AGENTS.md` (C1b diet, T900560) — read on-demand, do not frontload.

## Quality Gates (read when verifying before merge)

- `task test:changed` (smart selection, vitest-Fallback) · `task freshness:check` (Artefakte committet) · `task test:code-quality` (file-size/import-cycle/hostname).
- Brett: `npm run typecheck && npm test && npm run build --prefix components/brett` · Website: `pnpm test:unit` in `components/website` (vitest) · PR-Titel: Conventional Commits + `[T000XXX]` (advisory).

## Project Overview — Services

**Workspace MVP** — Kubernetes-based self-hosted collaboration platform for small teams (bachelor thesis). Integrates:

- Traefik: Built-in k3s ingress.
- Pocket ID: SSO & OIDC provider (`k3d/pocket-id.yaml`) for ~20 clients via `pocket-id-client-seed` Job.
- Nextcloud + Talk: Files, groupware, and video calls with Talk-HPB + coturn + Janus.
- Collabora: Office suite.
- Vaultwarden: Password management.
- Whiteboard: Collaborative whiteboard server (`k3d/whiteboard/`).
- Brett: Node.js 3D systemic-constellation board (`k3d/brett.yaml`).
- Mailpit: Local SMTP/email inbox.
- DocuSeal: Document signing.
- Tracking & Timeline: DB-backed analytics in shared DB.
- Website: Astro/Svelte platform frontend (`website` namespace).
- Database: Shared PostgreSQL 16 (`shared-db`) in `workspace` namespace. (LiveKit and auto-docs removed).

## Key Components & Manifests

- **`k3d/`**: Base Kubernetes manifests (Kustomize). Applied by pull-based FluxCD pipeline and break-glass deploy.
- **`prod/`**: Shared production patches (TLS, replicas, resource limits).
- **`prod-fleet/mentolder/`, `prod-fleet/korczewski/`**: Overlays applied in prod, referenced by `ENV_OVERLAY` in `environments/<brand>.yaml`. Wraps base overlay with `fleet-common` and node affinity.
- **`prod-fleet/mentolder-jobs/`, `prod-fleet/korczewski-jobs/` (T002207)**: Isolated bootstrap/seed Job overlays (`flux-<brand>-jobs` Kustomizations in `flux/clusters/fleet/ks-jobs-*.yaml`) with `dependsOn`, `force: true`, `wait: false`.
- **`prod-fleet/staging/`, `prod-fleet/website-staging/` (T015004)**: Staging stack wired into Flux (`workspace-staging`, `website-staging`). Env profile: `environments/staging.yaml`. CronJobs target `${WEBSITE_NAMESPACE}`.
- **Flux GitOps Pipeline**: Pull-based deployment. `.github/workflows/render-fleet-artifact.yml` renders the OCI artifact `ghcr.io/paddione/fleet-manifests` on `main` push, reconciled by Flux (`flux/clusters/fleet/`). `task workspace:deploy` is break-glass fallback.
- **`environments/` Config & Secrets Registry**:
  - `environments/<env>.yaml`: Per-environment configuration, read by `scripts/env-resolve.sh`.
  - `environments/.secrets/<env>.yaml`: Plaintext secrets (git-crypt-encrypted at-rest, tracked in git; input to `env:seal`).
  - `environments/sealed-secrets/<env>.yaml`: Committed SealedSecret resources applied before manifests.
  - `environments/schema.yaml`: Authoritative environment variable schema; validated by `env:validate`.
  - `environments/certs/`: Cluster public sealing certificates (`env:fetch-cert`).

## Other References

- `CLAUDE.md` — Claude Code environment harness guidance
- `llms.txt` — machine-readable entry index
- `.agents/docs/` — agent working dossiers (convention + index in `README.md`)
- `.agents/memory/learnings.md` — session learning loop (read at start, append after tasks)
- `.agents/docs/reorg-phase2/` — repo reorg plan dossier (T900560)
- `components/website/CLAUDE.md` — Astro/Svelte quick-start
- `docs/agent-guide/README.md` — agent operating guide
