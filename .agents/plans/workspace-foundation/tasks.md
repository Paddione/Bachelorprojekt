---
title: workspace-foundation — staged implementation plan
ticket_id: T901022
domains: [website, db, security, test]
status: ready
---

# workspace-foundation — Implementation Plan

Staged plan for T901022 (feat): business workspace foundation and protected
owner access. Held for `dev-flow-execute` (`stage-plan --hold`); execution
additionally waits for the ticket hold review and T901035 for hard
tenant enforcement. Decisions: groups-claim owner auth, separate `/owner`
area with central guard, brand-column foundation now, new
`business_memberships` table, extended seed/secrets flow, backup scope
plus restore demo. Details: `design.md`, `proposal.md`, `intel.json`.

## File Structure

Union of all partial target files (disjoint per partial, D1):

- `components/website/src/lib/owner-guard.ts` (new)
- `components/website/src/pages/owner/index.astro` (new)
- `components/website/src/pages/owner/anfragen.astro` (new)
- `components/website/src/pages/api/owner/me.ts` (new)
- `components/website/src/lib/auth.ts` (modify)
- `components/website/src/db/migrations/20261007_business_memberships.sql` (new)
- `components/website/src/lib/business-memberships.ts` (new)
- `components/website/src/lib/messaging-db.ts` (modify)
- `components/website/src/lib/website-db.ts` (modify)
- `k3d/pocket-id-client-seed.yaml` (modify)
- `environments/sealed-secrets/dev.yaml` (modify)
- `scripts/backup-restore-db.sh` (modify)
- `docs/runbooks/business-restore.md` (new)
- `tests/spec/workspace-foundation.bats` (new)
- `components/website/src/lib/__tests__/owner-guard.test.ts` (new)
- `components/website/src/lib/__tests__/business-memberships.test.ts` (new)

Regeneration side-effect (not a target file): test inventory via
`task test:inventory` updates
`components/website/src/data/test-inventory.json` (owned by partial p4).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-owner-auth.md | impl | components/website/src/lib/owner-guard.ts, components/website/src/pages/owner/index.astro, components/website/src/pages/owner/anfragen.astro, components/website/src/pages/api/owner/me.ts, components/website/src/lib/auth.ts |  |
| p2 | tasks.d/p2-membership-data.md | impl | components/website/src/db/migrations/20261007_business_memberships.sql, components/website/src/lib/business-memberships.ts, components/website/src/lib/messaging-db.ts, components/website/src/lib/website-db.ts |  |
| p3 | tasks.d/p3-secrets-backup.md | impl | k3d/pocket-id-client-seed.yaml, environments/sealed-secrets/dev.yaml, scripts/backup-restore-db.sh, docs/runbooks/business-restore.md |  |
| p4 | tasks.d/p4-tests.md | tests | tests/spec/workspace-foundation.bats, components/website/src/lib/__tests__/owner-guard.test.ts, components/website/src/lib/__tests__/business-memberships.test.ts | p1,p2,p3 |

## Task 5: Final verification (all partials implemented)

Context. Runs after p1–p4 are implemented and committed. Executes the
mandatory repo verification sequence.

### Steps

- [ ] `task test:changed`
- [ ] `task freshness:regenerate`
- [ ] Commit regenerated artifacts with explicit pathspecs.
- [ ] `task freshness:check`
- [ ] CQ02 any-count stays within limit:
  `bash -c "count=$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: $count (limit: 200)\"; [ $count -le 200 ]"`

### Acceptance criteria

- All three commands pass; no S1–S4 ratchet violations; baseline key
  count unchanged; any-count within the CQ02 limit.
