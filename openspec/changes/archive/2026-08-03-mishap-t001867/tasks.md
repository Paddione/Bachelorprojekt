---
title: "mishap-t001867 — Implementation Plan"
ticket_id: T001867
domains: [website]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t001867 — Implementation Plan

_Ticket: T001867_

## File Structure

```
website/pnpm-workspace.yaml
website/src/lib/__tests__/admin-token-alias.test.ts
website/src/components/PortalSidekick.test.ts
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Run the stale test suites for PortalSidekick and admin color token assertions. They should fail on the current code state.

```bash
npx vitest run website/src/lib/__tests__/admin-token-alias.test.ts website/src/components/PortalSidekick.test.ts
# expected: FAIL
```

- [ ] **Fix pnpm release age excludes.** Add the Stripe, ast-v8-to-istanbul, electron-to-chromium, openai, and svelte 5.56.5 dependencies to the `minimumReleaseAgeExclude` list in `website/pnpm-workspace.yaml`.

- [ ] **Fix admin token alias test assertions.** Update `admin-token-alias.test.ts` to assert against `factory-tokens.css` instead of `global.css`, remove unused variables, and verify `factory-tokens.css` exists.

- [ ] **Fix PortalSidekick stale test assertions.** Update `PortalSidekick.test.ts` to search for Token-Budget inexactly and remove removed settings labels.

- [ ] **Green Verification.** Run the test suites again. They should now pass.

```bash
npx vitest run website/src/lib/__tests__/admin-token-alias.test.ts website/src/components/PortalSidekick.test.ts
# expected: PASS
```

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
