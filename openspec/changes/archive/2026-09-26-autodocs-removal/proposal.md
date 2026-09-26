# Proposal: autodocs-removal

## Why

The auto-docs machinery builds and serves two public sites
(`docs.mentolder.de`, `docs.korczewski.de`) from a 16 MB generated HTML
tree: `build-docs.yml` workflow, `scripts/docs-gen/` (32 files, 6.1k
lines), `k3d/docs-content-built/` (244 files), `k3d/docs.yaml` +
SSO proxy, `docs:*` tasks. ADR-009 (points 4+6) retires it: docs live
in the repo from now on. The measured split matters: `freshness-regen.yml`
regenerates ONLY gate/plumbing artifacts (no reading-docs part exists
in that workflow) — it stays; everything that renders, ships or serves
reading-docs goes.

## What Changes

- Delete the generator: `.github/workflows/build-docs.yml`,
  `scripts/docs.Dockerfile`, `scripts/build-docs.mjs`,
  `scripts/docs-gen/` (whole dir); relocate the one foreign caller
  (`systembrett-html.mjs` → `scripts/`, import rewired); remove the
  `docs` service from `feature-promote.sh` + `promote-phases.sh`;
  clean dead ignore/exclusion lines (`index-repo.ts`, `codeql.yml`,
  `build-graph.mjs`, `scan.test.mjs`, both githooks) and the
  `package.json` scripts.
- Delete the serving path: `k3d/docs.yaml`,
  `k3d/oauth2-proxy-docs.yaml`, `k3d/docs-content-built/` (whole tree);
  remove refs (kustomization, ingress `docs.localhost` block,
  `DOCS_DOMAIN`/`DOCS_IMAGE` keys, `DOCS_URL` in 4 environment files,
  Vaultwarden `Docs` seed login).
- Tasks: delete `docs:build`, `docs:build:import`, `docs:deploy`,
  `test:docs-gen`; shrink `docs:refresh-diagrams` (diagram generation
  stays, redeploy goes) and the datamodel-workflow task (markdown
  generation stays, `--rebuild-page`/HTML-copy/deploy hint goes).
- Docs sweep: delete `docs/brain/k4-brain-wiki.md`,
  `docs/DOCS-DESIGN-STANDARDS.md` (solely about the generated site);
  update `docs/bereitstellungsdetails.md`, `registry/tools.yaml`
  (+ regenerate `20-werkzeuge.md`), `CLAUDE.md` (2 spots).
- Guards: delete `docs-content-guards.bats`, `fa-13-docs.spec.ts`
  (+ playwright entry); shrink 4 guards + coverage-allowlist; new
  absence guard.
- Keepers (explicitly NOT touched): `freshness-regen.yml` + all of
  `freshness:regenerate` (gate/plumbing only), `graph:build-docs`
  (repo markdown diagram, despite the name), `docs/legacy-html/`
  (inert committed content, no reader left — consciously standing),
  ADR-009, history mentions, DNS entries.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openspec/specs/ci-cd.md`: docs-content requirements removed,
  freshness/lazy-guard requirements trimmed, machinery-absence added.
- `openspec/specs/workspace-deploy.md`: docs image/deploy mentions
  removed, Collabora scenario kept standalone.
- `openspec/specs/agent-skills.md`, `devflow-selection-archive-hardening.md`,
  `openspec/specs/local-dev-mesh.md`, `openspec/specs/nextcloud-integration.md`,
  `openspec/specs/repo-structure.md`: dead docs-path/task mentions removed.

## Impact

- ~40 files + 1 workflow + 1 service (deployment, proxy, ingress,
  seed login) + 4 tasks deleted; docs.*.de go offline (DNS untouched,
  out of scope).
- No brand runtime change; gate/plumbing pipeline byte-identical.
- Mechanical same-file overlap with 4/6 (`k3d/kustomization.yaml`,
  `k3d/ingress.yaml`, disjoint blocks) and 6/6 (`CLAUDE.md`) —
  resolved by epic order + rebase, noted in the plan.

_Ticket: T900452_
