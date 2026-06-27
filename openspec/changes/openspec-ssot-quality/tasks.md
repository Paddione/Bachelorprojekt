---
title: "OpenSpec SSOT Quality Improvements"
ticket_id: T001266
domains: [openspec, ci-cd]
status: plan_staged
---

# openspec-ssot-quality — Implementation Plan

## File Structure

Files changed in this PR:

| File | Change | Budget |
|------|--------|--------|
| `openspec/specs/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.md` | Add `## Purpose` + `## Requirements` H2 headers (insert before existing H3) | — |
| `openspec/config.yaml` | Expand OpenSpec-Komponenten list from 24 → 63 entries (alphabetical) | — |
| `openspec/changes/g-cd01-korczewski-ci-parity/specs/g-cd01-korczewski-ci-parity.md` | Create minimal valid delta stub | — |
| `openspec/changes/g-dep01-npm-vuln/specs/g-dep01-npm-vuln.md` | Create minimal valid delta stub | — |
| `openspec/changes/archive/*/proposal.md` (7 files) | Set `status: archived` where currently `planning` / `plan_staged` / `active` | — |
| `scripts/openspec-validate.ts` | Add `checkConfigDrift()` function; call from main after existing validate pass. Current: 127 lines / limit 600 / residual 473 | 455 |

---

## 1. Pre-flight Baseline

- [ ] 1.1 Run `bash scripts/openspec.sh validate` — note current FAIL count (expected: 3 FAIL lines from t001269 + 2 empty specs/ dirs). This establishes the baseline; expected: FAIL on these three items before any fix is applied.
- [ ] 1.2 Run `wc -l scripts/openspec-validate.ts` — confirm current line count (127) before adding drift check.

## 2. Fix Malformed SSOT Spec (F1)

- [ ] 2.1 Open `openspec/specs/t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp.md`. Insert the following two blocks at the top of the document body (before the existing `### Requirement: TODO` line):

```markdown
## Purpose

Dieses Dokument beschreibt das Mishap-Bundle für T001269 (Skills, dev-flow-execute,
Repo-Worktree-State, Ticket-MCP). Es hält archivierte Erkenntnisse und Anforderungen
aus dem abgeschlossenen Change fest.

## Requirements
```

- [ ] 2.2 Verify the spec now passes `validateSpec()`:
  ```bash
  npx tsx scripts/openspec-validate.ts 2>&1 | grep t001269
  ```
  Expected: no FAIL line for this spec.

## 3. Fix Empty specs/ Directories (F3, F4)

- [ ] 3.1 Create `openspec/changes/g-cd01-korczewski-ci-parity/specs/g-cd01-korczewski-ci-parity.md` with this minimal valid delta content:

```markdown
## MODIFIED Requirements

### Requirement: Stub — to be completed during implementation

The system SHALL implement CI parity for the korczewski brand. Details to be
specified during dev-flow-execute.

#### Scenario: Stub — placeholder for implementation

- **GIVEN** the korczewski brand CI configuration is in place
- **WHEN** a PR is opened against the korczewski namespace
- **THEN** the same checks run as for the mentolder brand
```

- [ ] 3.2 Create `openspec/changes/g-dep01-npm-vuln/specs/g-dep01-npm-vuln.md` with this minimal valid delta content:

```markdown
## MODIFIED Requirements

### Requirement: Stub — to be completed during implementation

The system SHALL resolve the identified npm vulnerability. Details to be specified
during dev-flow-execute.

#### Scenario: Stub — placeholder for implementation

- **GIVEN** the vulnerable npm package is present in the dependency tree
- **WHEN** the dependency update is applied
- **THEN** the vulnerability scanner reports no known critical vulnerabilities
```

- [ ] 3.3 Run `bash scripts/openspec.sh validate` — confirm zero FAIL lines for `g-cd01-korczewski-ci-parity` and `g-dep01-npm-vuln`.

## 4. Update config.yaml OpenSpec-Komponenten (F2)

- [ ] 4.1 Open `openspec/config.yaml`. Replace the existing `OpenSpec-Komponenten:` inline list with the full alphabetically-sorted list of all 63 SSOT spec slugs. Format: multi-line YAML value (one component per line using the `|` block scalar or the existing inline comma-separated style). The full list (derived from `ls openspec/specs/*.md | xargs -I{} basename {} .md | sort`):

```yaml
  OpenSpec-Komponenten: |
    active-sessions-hub, admin-cockpit, auth-sso, backup-pipeline, billing-pipeline,
    brett, centralized-logging, chat-inbox, ci-cd, ci-speed, coaching-studio,
    cockpit-direct-ticket-links, cockpit-fullscreen-overview, cockpit-sidekick-global,
    collabora-integration, database, datev-export, decouple-tickets-db, dev-flow-plan,
    docker-build-speedup, fix-awaiting-deploy-visualization-gaps,
    fix-coaching-studio-prod-manifest, fleet-operations, g-dep02-major-deps-website,
    grilling-flow, korczewski-monolith-keycloak-auth, livekit-integration, llm-local-dev,
    llm-pipeline, mcp-gateway, mcp-skill-integration, mcp-task-runner, mediaviewer,
    monitoring-alerts, newsletter-system, nextcloud-integration, openspec-pgvector,
    openspec-ticket-detail-view, openspec-workflow, planning-office,
    platform-cockpit-alignment, pocket-id-oidc-wiring, portal, projekttickets-cockpit,
    questionnaire-system, react-homepage-blocks, react-login-edit-homepage,
    secret-rotation, secret-rotation-guards, secrets-deploy-automation, security,
    sessions-server, sidekick-ai-quality, sidekick-assistant,
    sidekick-cleanup-grilling-broadcast, software-factory,
    t001269-mishap-bundle-skills-dev-flow-execute-repo-worktree-state-ticket-mcp,
    t001272-mishap-bundle-ticket-sh-factory-ticket-mcp, t1224-lockfile-drift,
    ticket-system, vaultwarden-integration, website-core, workspace-deploy
```

## 5. Archive Status Cleanup (F6)

- [ ] 5.1 For each of the following files, change the `status:` line to `status: archived`:
  - `openspec/changes/archive/2026-06-21-cockpit-dor-inline-editor/proposal.md` (currently `planning`)
  - `openspec/changes/archive/2026-06-21-ticket-mcp/proposal.md` (currently `plan_staged`)
  - `openspec/changes/archive/2026-06-21-sessions-history-archive/proposal.md` (currently `planning`)
  - `openspec/changes/archive/2026-06-21-openspec-pgvector/proposal.md` (currently `planning`)
  - `openspec/changes/archive/2026-06-21-fix-coaching-studio-prod-manifest/proposal.md` (currently `planning`)
  - `openspec/changes/archive/2026-06-22-ts-suppression-elimination/proposal.md` (currently `active`)
  - `openspec/changes/archive/2026-06-27-agent-lock-dev-flow-mishaps/proposal.md` (currently `plan_staged`)

- [ ] 5.2 Verify: `grep -r "^status:" openspec/changes/archive/ | grep -v "archived\|completed"` — expected: no output.

## 6. Add Drift Check to openspec-validate.ts (D5)

- [ ] 6.1 Add a `checkConfigDrift()` function to `scripts/openspec-validate.ts`. Insert after the existing `validateSpecsDir()` function. The function:
  - Reads `openspec/config.yaml` using the already-imported `readFileSync`
  - Parses the `OpenSpec-Komponenten` field (comma-separated string or block scalar) to extract a Set of slugs
  - Reads all `.md` filenames from `openspec/specs/` using the already-imported `readdirSync`
  - For each spec filename (stripped of `.md`) not found in the config set, pushes a `WARN: <slug> not listed in config.yaml OpenSpec-Komponenten` entry to `warnings`
  - Returns `{ ok: true, errors: [], warnings }` (never generates errors — WARN only)

- [ ] 6.2 Call `checkConfigDrift()` from the `main()` function after the existing `validateSpecsDir()` call. Merge its `warnings` into the global warnings array.

- [ ] 6.3 Verify `wc -l scripts/openspec-validate.ts` — expected: ≤ 150 lines (well within the 600-line limit, residual ≥ 450).

## 7. Verify

- [ ] 7.1 Run `task test:openspec` — expected: exit 0, 0 FAIL lines. WARN lines for the config drift check are acceptable if any spec was added after Task 4.
- [ ] 7.2 Run `task test:changed` — all offline tests must pass.
- [ ] 7.3 Run `task freshness:regenerate` — regenerate repo-index and freshness artefacts.
- [ ] 7.4 Run `task freshness:check` — freshness gate must pass.
- [ ] 7.5 Stage all changes and verify git status shows only expected files.
