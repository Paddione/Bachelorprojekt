---
title: "p3 — GitHub identity foundation tests"
ticket_id: T900159
domains: [testing, database, ticket-system]
status: pending
depends_on: []
---

# p3 — GitHub identity foundation tests

## Scope and budgets

This partial executes first to establish RED and owns exactly these files:

| File | Current lines | Effective S1 budget |
| --- | ---: | ---: |
| `components/website/src/lib/tickets/github-reference.test.ts` (new) | 0 | 900 |
| `components/website/src/lib/tickets/github-identity-store.test.ts` (new) | 0 | 900 |
| `components/website/src/data/test-inventory.json` | 6500 | not S1-gated (`.json`) |

Keep each new test module comfortably below 80% of its 900-line threshold. The production
modules remain owned by p1/p2; p3 must not edit them to make a failing assertion pass. The test
harness may use `pg-mem` only where it executes the production DDL and store queries faithfully;
do not replace uniqueness, transaction, or redirect-cycle behavior with mocks that merely assert
SQL strings.

## Task 1 — Reference parser and formatter cases

Create `components/website/src/lib/tickets/github-reference.test.ts` and exercise the public,
pure API from `github-reference.ts` with table-driven Vitest cases:

- Parse `I#123` with a configured default repository as Issue 123, and parse `PR#124` as Pull
  Request 124 in that same repository.
- Parse the repository-qualified `owner/repo#123` as Issue 123 without silently substituting the
  configured default repository; preserve the supplied owner/repository coordinate.
- Parse branch token `I5588` as Issue 5588 and format that parsed Issue back to `I5588` in
  branch-safe mode.
- Format default-repository Issues and Pull Requests as `I#123` and `PR#124`; format an Issue from
  another repository as `owner/repo#123`. Assert parse/format round trips for all four supported
  forms.
- Reject a bare `5588` when kind or default repository information is absent, with an actionable
  ambiguity error rather than guessing Issue versus Pull Request or repository.
- Trim outer whitespace, but reject embedded whitespace, zero, negative, decimal, signed,
  malformed repository, and unsupported
  typed forms (`I#0`, `I#-1`, `I#1.5`, `+1`, `owner/#1`, `#1`, `BUG#1`).
- Prove that parsing does not treat a numeric coordinate as a globally unique machine identity:
  equal issue numbers under two repository coordinates remain distinct parsed references.

Use exact object assertions for kind, number, repository owner/name, and syntax/qualification
metadata rather than snapshots. No network, environment mutation, database, or GitHub mock belongs
in this pure test file.

## Task 2 — Schema replay and fail-closed constraints

Create `components/website/src/lib/tickets/github-identity-store.test.ts` with a fresh isolated
database fixture per test group, a minimal pre-existing `tickets.tickets` table keyed by UUID, and
the real p1 schema initializer plus p2 store operations. Cover:

- Run the identity schema initializer twice after inserting one object, current coordinate, and
  work-item binding. The second run succeeds; row counts, local object UUID, GitHub node ID,
  coordinate validity timestamps, binding role, and legacy ticket row are unchanged.
- Insert a legacy ticket whose `external_id` is `T900159`, initialize the additive schema, and
  assert the ticket still reads/writes normally and receives no implicit work-item binding.
- Register the same opaque GitHub object node ID twice with conflicting object data. The second
  registration fails and the first object remains unchanged.
- Register Issue number 12 in two different repository node IDs and assert both succeed. Attempt a
  second current `(repository_node_id, number)` coordinate in the same repository and assert it is
  rejected without replacing the existing coordinate.
- Bind an Issue canonically to a ticket, then attempt a second current canonical binding. Assert
  the write fails and the original canonical binding is still the only current one.
- Attempt to bind a `pull_request` object as canonical. Assert rejection and zero binding rows for
  that PR. Also register and canonically bind an Advisory using an uppercase-normalized, unique
  `GHSA-…` provider-native reference and no repository coordinate.

Assertions must inspect persisted rows after every rejected operation, so a thrown error alone
cannot hide partial mutation.

## Task 3 — Transfers, corrections, and redirect cycles

In `github-identity-store.test.ts`, add transaction-level cases for the p2 mutation API:

- Transfer one Issue, identified by the same GitHub node ID, from repository A/number 12 to
  repository B/number 34. Assert the local object UUID is stable, the old coordinate remains with
  a non-null validity end, the new coordinate is the sole current row, and replaying the observed
  destination is idempotent.
- Correct canonical Issue A to Issue B as `duplicate_of` with a non-empty reason. Assert A remains
  resolvable as an alias, B becomes the sole current canonical reference, and the directed
  relation retains kind, source, reason, and timestamp.
- Exercise `implements`, `closes`, and `replaces` as directed Issue/PR relationships and verify
  source/target orientation; replaying an already-recorded provider relation must not duplicate it.
- Seed A `duplicate_of` B, then attempt B `duplicate_of` A. Assert cycle rejection and compare all
  bindings, aliases, coordinates, and relations before/after to prove the failed transaction made
  no partial canonical-state change.
- Repeat the cycle case across three objects using redirect-like kinds (`duplicate_of`, `replaces`,
  `transferred_to`) so cycle detection follows the redirect graph rather than checking only a
  two-node reciprocal edge. A non-redirect delivery edge (`implements` or `closes`) must not be
  falsely rejected as a redirect cycle.

Use deterministic node IDs/repository node IDs and inspect database state through independent
queries, not only values returned by the function under test. Clean up all fixtures and close the
pool in `afterAll` so the Vitest process exits without open handles.

## Task 4 — RED then GREEN focused verification

First add both test files before p1/p2 implementation is available and run exactly:

```bash
pnpm --dir components/website exec vitest run src/lib/tickets/github-reference.test.ts src/lib/tickets/github-identity-store.test.ts
# expected: FAIL (the parser, schema, and transactional identity-store contracts do not exist yet)
```

Record a real failing assertion/import from each test file; a harness/configuration failure does
not satisfy RED. After p1 and p2 are implemented, run the identical focused bundle as GREEN:

```bash
pnpm --dir components/website exec vitest run src/lib/tickets/github-reference.test.ts src/lib/tickets/github-identity-store.test.ts
# expected: PASS
```

All parser formats, replay/constraint checks, transfers, correction atomicity, and two-/three-node
cycle cases must pass together.

## Task 5 — Regenerate the test inventory

Regenerate the committed inventory after the new Vitest files exist:

```bash
task test:inventory
git diff --check -- components/website/src/lib/tickets/github-reference.test.ts components/website/src/lib/tickets/github-identity-store.test.ts components/website/src/data/test-inventory.json
```

Commit the resulting `components/website/src/data/test-inventory.json` change with the two tests.
Do not hand-edit generated entries. Confirm a second `task test:inventory` is diff-free.

## Task 6 — Final verification

Run the focused GREEN command from Task 4, then the mandatory repository gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

The final diff for this partial contains only its three owned target files and does not add a
baseline exception or any explicit `any` type.
