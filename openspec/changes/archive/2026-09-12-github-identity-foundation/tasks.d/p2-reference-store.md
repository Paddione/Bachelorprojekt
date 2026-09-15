---
title: "p2 — GitHub reference parser and transactional identity store"
ticket_id: T900159
domains: [database, ticket-system]
status: active
depends_on: [p1, p3]
---

# p2 — GitHub reference parser and transactional identity store

Depends on p1 and the RED tests in p3. This partial owns only
`components/website/src/lib/tickets/github-reference.ts` and
`components/website/src/lib/tickets/github-identity-store.ts`; p1 must have
created the four identity tables and their database constraints before the store
operations can run.

## File Structure

| File | Responsibility | S1 budget |
| --- | --- | --- |
| `components/website/src/lib/tickets/github-reference.ts` | pure typed parsing and formatting; no database or application imports | new file: effective `.ts` threshold 900, current 0, budget 900; implementation cap 220 lines |
| `components/website/src/lib/tickets/github-identity-store.ts` | typed persistence, transfer, binding, relation, resolution, and correction transactions | new file: effective `.ts` threshold 900, current 0, budget 900; implementation cap 650 lines |

Both files are non-baselined. Keep the implementation caps as deliberate growth
reserve rather than adding either file to `docs/code-quality/baseline.json`.

## Task 1: Implement the pure GitHub reference contract

Create `components/website/src/lib/tickets/github-reference.ts` as a leaf module.
It must not import the database pool, schema initializer, identity store, API
handlers, or configuration globals. Export exactly these public types and
functions:

```ts
export type GitHubObjectKind = 'issue' | 'pull_request' | 'advisory';
export type GitHubNumberedObjectKind = Exclude<GitHubObjectKind, 'advisory'>;

export interface GitHubRepositoryCoordinate {
  owner: string;
  repository: string;
}

export interface GitHubReference {
  kind: GitHubNumberedObjectKind;
  owner: string;
  repository: string;
  number: number;
}

export type GitHubReferenceErrorCode =
  | 'invalid_syntax'
  | 'invalid_number'
  | 'missing_default_repository'
  | 'missing_object_kind'
  | 'branch_token_requires_issue';

export class GitHubReferenceError extends Error {
  readonly code: GitHubReferenceErrorCode;
  constructor(code: GitHubReferenceErrorCode, message: string);
}

export interface ParseGitHubReferenceOptions {
  defaultRepository?: GitHubRepositoryCoordinate;
  qualifiedKind?: GitHubNumberedObjectKind;
}

export interface FormatGitHubReferenceOptions {
  defaultRepository?: GitHubRepositoryCoordinate;
  qualify?: boolean;
}

export function parseGitHubReference(
  input: string,
  options?: ParseGitHubReferenceOptions,
): GitHubReference;

export function formatGitHubReference(
  reference: GitHubReference,
  options?: FormatGitHubReferenceOptions,
): string;

export function formatBranchIssueToken(reference: GitHubReference): string;
```

Parsing is anchored, trims outer whitespace only, and accepts these forms:

- `I#<positive base-10 integer>` and `I<positive base-10 integer>` resolve to
  `kind: 'issue'` and require `defaultRepository`.
- `PR#<positive base-10 integer>` resolves to `kind: 'pull_request'` and
  requires `defaultRepository`.
- `<owner>/<repository>#<positive base-10 integer>` requires `qualifiedKind`;
  the syntax intentionally does not guess whether the numbered object is an
  Issue or Pull Request.

Reject zero, signs, decimals, leading/trailing junk, embedded whitespace, empty
owner/repository segments, and values above `Number.MAX_SAFE_INTEGER` with the
specific error codes above. Normalize neither owner nor repository case: these
are display coordinates, while database identity uses node IDs. Bare numbers
are invalid syntax. In particular, parsing `I#5588` without a default repository
must throw `missing_default_repository`, and parsing
`Paddione/Bachelorprojekt#5588` without `qualifiedKind` must throw
`missing_object_kind`.

Formatting rules are deterministic:

- With `qualify: true`, without `defaultRepository`, or when the reference
  repository differs case-insensitively from `defaultRepository`, return
  `<owner>/<repository>#<number>`.
- In the default repository return `I#<number>` for Issues and
  `PR#<number>` for Pull Requests.
- Advisories are outside this numbered parser/formatter contract. Their
  provider-native `GHSA-…` value is persisted by the store without inventing a
  second reference prefix.
- `formatBranchIssueToken` returns `I<number>` and throws
  `branch_token_requires_issue` for Pull Requests.

Acceptance for this task: every successful parse returns a fully qualified
repository plus explicit kind; `parseGitHubReference(formatGitHubReference(x,
{ defaultRepository }), { defaultRepository, qualifiedKind: x.kind })` preserves
all fields for supported references; and the module remains independently
importable without initializing PostgreSQL.

## Task 2: Implement typed identity-store records and errors

Create `components/website/src/lib/tickets/github-identity-store.ts`. Import
`pool` from `../db-pool.ts`, `initTicketsSchema` from `../tickets-schema.ts`, and
only `import type` the reference-module types. Do not create a reverse import
from either schema file, which would introduce an S2 cycle.

Export exactly these persistence vocabulary types:

```ts
export type WorkItemRefRole = 'canonical' | 'alias';
export type GitHubRelationKind =
  | 'implements'
  | 'closes'
  | 'duplicate_of'
  | 'replaces'
  | 'transferred_to';
export type RedirectRelationKind =
  | 'duplicate_of'
  | 'replaces'
  | 'transferred_to';

export interface GitHubCoordinateInput {
  repositoryNodeId: string;
  owner: string;
  repository: string;
  number: number;
  url: string;
}

export interface GitHubObjectRecord {
  id: string;
  githubNodeId: string;
  kind: GitHubObjectKind;
  providerNativeRef: string | null;
  createdAt: Date;
}

export interface GitHubCoordinateRecord extends GitHubCoordinateInput {
  id: string;
  objectId: string;
  validFrom: Date;
  validUntil: Date | null;
}

export interface WorkItemRefRecord {
  id: string;
  ticketId: string;
  objectId: string;
  role: WorkItemRefRole;
  validFrom: Date;
  validUntil: Date | null;
  reason: string | null;
}

export interface GitHubRelationRecord {
  id: string;
  fromObjectId: string;
  toObjectId: string;
  kind: GitHubRelationKind;
  source: string;
  reason: string | null;
  createdAt: Date;
}

export type GitHubIdentityStoreErrorCode =
  | 'invalid_input'
  | 'data_integrity'
  | 'object_identity_conflict'
  | 'coordinate_conflict'
  | 'object_not_found'
  | 'ticket_not_found'
  | 'canonical_kind_forbidden'
  | 'canonical_binding_conflict'
  | 'current_coordinate_conflict'
  | 'provider_reference_conflict'
  | 'relation_conflict'
  | 'relation_kind_forbidden'
  | 'relation_self_edge'
  | 'redirect_cycle'
  | 'canonical_binding_missing';

export class GitHubIdentityStoreError extends Error {
  readonly code: GitHubIdentityStoreErrorCode;
  constructor(code: GitHubIdentityStoreErrorCode, message: string);
}
```

Map expected constraint failures to these domain errors without using `any`;
preserve unexpected PostgreSQL errors as their original exceptions. All row
mappers must be explicit so snake-case SQL columns become the exported
camel-case records and timestamps remain `Date` values.

## Task 3: Implement registration, resolution, binding, and relations

Export exactly these operation inputs and functions:

```ts
export interface RegisterNumberedGitHubObjectInput {
  githubNodeId: string;
  kind: GitHubNumberedObjectKind;
  providerNativeRef?: never;
  coordinate: GitHubCoordinateInput;
  observedAt?: Date;
}

export interface RegisterAdvisoryGitHubObjectInput {
  githubNodeId: string;
  kind: 'advisory';
  providerNativeRef: string;
  coordinate?: never;
  observedAt?: Date;
}

export type RegisterGitHubObjectInput =
  | RegisterNumberedGitHubObjectInput
  | RegisterAdvisoryGitHubObjectInput;

export interface RegisterGitHubObjectResult {
  object: GitHubObjectRecord;
  coordinate: GitHubCoordinateRecord | null;
  created: boolean;
}

export async function registerGitHubObject(
  input: RegisterGitHubObjectInput,
): Promise<RegisterGitHubObjectResult>;

export interface ResolveGitHubObjectInput {
  repositoryNodeId: string;
  number: number;
  kind: GitHubNumberedObjectKind;
}

export interface ResolvedGitHubObject {
  object: GitHubObjectRecord;
  matchedCoordinate: GitHubCoordinateRecord;
  currentCoordinate: GitHubCoordinateRecord;
}

export async function resolveGitHubObject(
  input: ResolveGitHubObjectInput,
): Promise<ResolvedGitHubObject | null>;

export interface BindWorkItemRefInput {
  ticketId: string;
  objectId: string;
  role: WorkItemRefRole;
  reason?: string;
  effectiveAt?: Date;
}

export async function bindWorkItemRef(
  input: BindWorkItemRefInput,
): Promise<WorkItemRefRecord>;

export interface RecordDeliveryRelationInput {
  fromObjectId: string;
  toObjectId: string;
  kind: 'implements' | 'closes';
  source: string;
  reason?: string;
  createdAt?: Date;
}

export interface RecordRedirectRelationInput {
  fromObjectId: string;
  toObjectId: string;
  kind: RedirectRelationKind;
  source: string;
  reason: string;
  createdAt?: Date;
}

export type RecordGitHubRelationInput =
  | RecordDeliveryRelationInput
  | RecordRedirectRelationInput;

export async function recordGitHubRelation(
  input: RecordGitHubRelationInput,
): Promise<GitHubRelationRecord>;
```

Every public database operation first awaits `initTicketsSchema()`. Registration
uses one checked-out `PoolClient` transaction. Issue and Pull Request input must
provide `coordinate`; Advisory input provides a case-insensitive `GHSA-…`
`providerNativeRef` and has no coordinate. Canonicalize that advisory reference
to uppercase before persistence and comparison. The same
node ID, kind, provider-native reference, and current coordinate is an
idempotent replay and returns `created: false`; the same node ID with another
kind or provider-native reference fails `object_identity_conflict`. A provider
reference already owned by another Advisory fails `provider_reference_conflict`.
Registration does not silently interpret a changed coordinate as a transfer:
it fails `current_coordinate_conflict` and directs callers to
`transferGitHubObject`. An already-current `(repository_node_id, number)` owned
by another object fails `coordinate_conflict` without replacing either row.

Resolution matches current or historical coordinates by repository node ID,
number, and kind, then returns both the coordinate that matched and the object's
single current coordinate. This is what keeps an old repository/number alias
resolvable after a transfer. More than one match or no current coordinate is a
`data_integrity` error rather than an arbitrary first-row result.

`bindWorkItemRef` locks the ticket and relevant object. Both canonical and alias
bindings accept only `issue` and `advisory`; `pull_request` fails
`canonical_kind_forbidden`. Replaying the same active binding is idempotent.
Adding an alias never retires or replaces an existing alias. A different active
canonical for the ticket, or a canonical object already bound to another
ticket, fails `canonical_binding_conflict`; this primitive does not perform
correction implicitly.

Relations are immutable. Identical `(from, to, kind)` input with the same source
and reason is an idempotent replay; a replay that changes provenance fails
`relation_conflict`, and an object cannot relate to itself. Enforce PR →
Issue/Advisory for `implements` and `closes`, and same-kind endpoints for each
redirect kind; violations fail `relation_kind_forbidden`. `implements` and
`closes` do not participate in redirect traversal. For `duplicate_of`,
`replaces`, and `transferred_to`, use the serialized cycle guard described in
Task 5 before inserting the edge; p1's trigger remains the database-level
defense for direct writes.

## Task 4: Implement coordinate transfer

Export exactly:

```ts
export interface TransferGitHubObjectInput {
  objectId: string;
  from: Pick<GitHubCoordinateInput, 'repositoryNodeId' | 'number'>;
  to: GitHubCoordinateInput;
  observedAt?: Date;
}

export interface TransferGitHubObjectResult {
  object: GitHubObjectRecord;
  previousCoordinate: GitHubCoordinateRecord;
  currentCoordinate: GitHubCoordinateRecord;
  changed: boolean;
}

export async function transferGitHubObject(
  input: TransferGitHubObjectInput,
): Promise<TransferGitHubObjectResult>;
```

Within one transaction, lock the object and its current coordinate with
`FOR UPDATE`. If `input.to` is already current for the same object and a
historical coordinate matching `input.from` exists, return an idempotent
`changed: false` result. Otherwise require the current repository node ID and
number to match `input.from`, then verify the destination coordinate is not
owned by another object. Set only the old current coordinate's
`valid_until` to `observedAt ?? new Date()`, insert the new current coordinate
with the same timestamp as `valid_from`, and commit. Preserve the old owner,
repository, URL, and number snapshots unchanged. Roll back on every error, so a
destination conflict cannot leave the object without a current coordinate.

This operation models a coordinate move of one immutable GitHub object and does
not create a `transferred_to` relation: that relation is reserved for a
correction between two distinct GitHub object identities.

## Task 5: Implement cycle-safe canonical correction

Export exactly:

```ts
export interface CorrectCanonicalWorkItemInput {
  ticketId: string;
  currentObjectId: string;
  replacementObjectId: string;
  relationKind: RedirectRelationKind;
  source: string;
  reason: string;
  correctedAt?: Date;
}

export interface CorrectCanonicalWorkItemResult {
  previousCanonical: WorkItemRefRecord;
  alias: WorkItemRefRecord;
  canonical: WorkItemRefRecord;
  relation: GitHubRelationRecord;
  changed: boolean;
}

export async function correctCanonicalWorkItem(
  input: CorrectCanonicalWorkItemInput,
): Promise<CorrectCanonicalWorkItemResult>;
```

Use the same transaction helper for redirect insertion and canonical correction:

1. Begin a transaction and take
   `pg_advisory_xact_lock(hashtext('tickets:github-identity-redirects'))` before
   reading the redirect graph. This serializes graph writers and prevents a
   concurrent phantom edge from defeating the cycle check.
2. Reject self-edges. Run a recursive CTE from the proposed target following
   only `duplicate_of`, `replaces`, and `transferred_to` edges; if it reaches
   the proposed source, throw `redirect_cycle` before any write.
3. During correction, additionally lock the ticket, its active canonical
   binding, `currentObjectId`, and `replacementObjectId`. On the first call the
   active canonical must equal `currentObjectId`; this compare-and-swap contract
   prevents a stale caller from correcting a newly changed binding. The
   replacement must be an Issue or Advisory. Missing state gets the specific
   domain error.
4. With one shared `correctedAt ?? new Date()` value, retire the previous
   canonical row by setting `valid_until`, insert-or-resolve an immutable alias
   for the previous object with the supplied reason, insert the replacement as
   the sole current canonical, and append the redirect relation from previous
   object to replacement object with source and reason.
5. Commit only after all four records are available. On any error, issue
   `ROLLBACK` in `catch` and always release the client in `finally`.

Replaying an already completed correction is idempotent only when the active
canonical is `replacementObjectId` and the alias and relation from
`currentObjectId` already exist with the same kind, source, and reason; return
those records with `changed: false`. Any other active canonical is
`canonical_binding_conflict`. Never delete or repurpose the previous binding,
alias, coordinate, or relation, and never mutate `tickets.tickets.external_id`.

## Acceptance Checks

- `github-reference.ts` has no runtime imports and accepts only the documented
  four human forms; all ambiguous or unsafe inputs return stable typed errors.
- Both registration and all correction operations are replay-safe; duplicate
  retries return the same persisted identity instead of adding history rows.
- PR canonical binding, second canonical binding, stale transfer source,
  destination collision, self-edge, and redirect cycle each fail without a
  partial write.
- Transfer closes exactly one coordinate and leaves exactly one current
  coordinate while historical resolution still finds the object.
- Correction atomically leaves one current canonical, preserves the old object
  as an alias, and records its directed reason-bearing relation.
- The p3 focused Vitest suite passes after implementation:

```bash
pnpm --dir components/website exec vitest run src/lib/tickets/github-reference.test.ts src/lib/tickets/github-identity-store.test.ts
```

- CQ02 remains at zero explicit `any` uses and no brand-domain literal is added:

```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```
