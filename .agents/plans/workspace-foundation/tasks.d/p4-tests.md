## Task 4: workspace-foundation spec guards and vitest suites (p4-tests)

Partial id `p4` · role `tests` · depends_on `p1,p2,p3`. This partial runs
last: it stages the implemented guard, membership model, and seed/backup
work from the earlier partials and proves the ticket acceptance mapping
with a red→green cycle. No new implementation ships here, only tests.

Context. Extend-check performed as mandated: tests/spec/ was listed and
the closest existing template is the SSO group-gating spec
(auth-sso.bats, render-based manifest assertions around the groups
claim). It is a structural template only (load test_helper, setup_file,
assertion blocks) — extending it would mix kustomize-render concerns
into HTTP guard behavior, so a new spec file is created. The vitest
directory was listed as well (12 entries); the nearest pattern source
is the mockPool-based suite (admin-actions.test.ts), while the
token-alias suite covers unrelated style tokens. No same-module suite
exists for the new guard or the new membership model, so two new
suites are created; no VITEST_EXTEND applies. All assertions verify
observable behavior (status codes, payloads, isolation outcomes, bundle
scan results), never implementation source text.

Target files (only these; S1 computed exactly against gates.yaml and
the baseline, all three new and nicht-baselined):

- `tests/spec/workspace-foundation.bats` Ist 0 · Schwelle n/a (S1 skippt
  `.bats`: kein s1.limits-Eintrag, extname-continue in s1-filesize.mjs)
  → Budget n/a, Planziel ≤ 200 Zeilen mit Reserve.
- `components/website/src/lib/__tests__/owner-guard.test.ts` Ist 0 ·
  Schwelle 900 (`.ts`-Limit aus gates.yaml s1.limits) → Budget 900,
  Planziel ≤ 150 Zeilen mit Reserve.
- `components/website/src/lib/__tests__/business-memberships.test.ts`
  Ist 0 · Schwelle 900 (`.ts`-Limit aus gates.yaml s1.limits) →
  Budget 900, Planziel ≤ 150 Zeilen mit Reserve.

### Steps

- [ ] Create `tests/spec/workspace-foundation.bats` with five guards:
  unauthenticated request to the p1 owner identity endpoint is denied
  (no session cookie, no data leak); session without the owner group is
  denied; session scoped to a foreign business is denied
  (cross-tenant); owner session is allowed (identity payload
  returned); the built client bundle contains no secret markers
  (client secrets, sealed payloads, private keys — env-based config
  only). Structure follows the SSO spec template (test_helper load,
  setup_file staging, one block per guard). The spec reads its HTTP
  target from an env override defaulting to the real p1 endpoints so
  the red step can point it at a negative-control fixture.
- [ ] Create `components/website/src/lib/__tests__/owner-guard.test.ts`
  (vitest): unit cases for the p1 guard export — absent session denied,
  session without groups claim denied, session with a non-owner group
  denied, session with the owner group allowed, owner session against
  a foreign business denied. Fixtures are JWT payloads shaped like the
  inputs of the real claim readers from intel (decodeJwtPayload,
  decodeRealmRoles); every new export used here stays fully typed with
  no explicit any (CQ02: no net increase).
- [ ] Create `components/website/src/lib/__tests__/business-memberships.test.ts`
  (vitest): cases for the p2 membership model using the mockPool
  pattern — lookup returns role for a known user↔business pair,
  unknown user yields no membership, role values map to the documented
  owner/member set, and a user of business A sees no rows of business
  B (cross-tenant isolation). Fully typed, no explicit any (CQ02).
- [ ] RED run (negative control): point the new suites at fixtures
  with no owner group and an empty membership store, so every
  allow-path assertion fails while deny-path assertions hold; this run
  has expected: FAIL outcome, which proves the tests detect absent
  access instead of passing vacuously. Execute both real runner
  invocations
  `tests/unit/lib/bats-core/bin/bats tests/spec/workspace-foundation.bats`
  and
  `(cd components/website && pnpm vitest run src/lib/__tests__/owner-guard.test.ts src/lib/__tests__/business-memberships.test.ts)`
  under the negative control, observe the allow-path failures, and
  keep the failure output as the red evidence for the commit message
  body.
- [ ] GREEN run: point the suites back at the real p1–p3
  implementation and execute the same two runner invocations; every
  test must pass. If any case fails here, fix the test to match the
  real p1/p2 exports and re-run until both suites are fully green.
- [ ] Regenerate the test inventory (side-effect, not a target file)
  with the exact repo command:
  ```bash
  task test:inventory
  ```
  Confirm the regenerated
  `components/website/src/data/test-inventory.json` mentions the three
  new suites, then stage exactly the three target files plus the
  regenerated inventory and commit with the ticket-scoped subject:
  ```bash
  git add tests/spec/workspace-foundation.bats components/website/src/lib/__tests__/owner-guard.test.ts components/website/src/lib/__tests__/business-memberships.test.ts components/website/src/data/test-inventory.json
  git commit -m "feat(T901022): workspace-foundation guards with red-green proof [T901022]"
  ```

### Acceptance criteria

- The new spec covers unauthenticated-denied, wrong-business-denied,
  owner-allowed, and no-secrets-in-client-bundle, asserting only on
  observable behavior.
- Both vitest suites cover the allow/deny matrix of the guard and the
  membership model including cross-tenant isolation, with no new
  explicit any types.
- The red run under the negative control fails on the allow path and
  the green run against the real implementation passes, using the same
  two runner invocations.
- The inventory is regenerated with the repo task and committed
  together with the three suites in one ticket-scoped commit using
  explicit pathspecs.
