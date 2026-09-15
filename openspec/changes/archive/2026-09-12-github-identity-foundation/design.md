---
title: GitHub identity foundation
ticket_id: T900159
plan_ref: openspec/changes/github-identity-foundation/tasks.md
status: draft
---

# GitHub Identity Foundation

## Context

GitHub Issue I#5587 defines a program that will eventually make GitHub Issues and
Pull Requests the human-facing SDLC source of truth and remove all `T######`
records from production. This first child, I#5588, establishes only the durable
identity primitives needed by the later reconciler, planner flip, closure flip,
and destructive cutover.

The existing `tickets.tickets.id` UUID remains the invisible relational key for
factory plans, comments, readiness, phase events, and other operational state.
GitHub identity is external, repository-scoped, and immutable at the object level.

## Decisions

### D1 — Separate immutable object identity from mutable coordinates

`tickets.github_objects` represents a GitHub object by its opaque GitHub node ID
and kind (`issue`, `pull_request`, or `advisory`). It also preserves an optional
provider-native reference; this is required and unique for advisories such as
`GHSA-xxxx-xxxx-xxxx`. Repository owner/name, number, and URL are coordinates,
not identity: Issues can be transferred and repositories can be renamed.

`tickets.github_object_coordinates` records coordinate history with validity
timestamps. At most one coordinate is current for an object. Repository identity
uses GitHub's repository node ID; owner/name remain display snapshots.
Advisories do not require a repository/number coordinate.

### D2 — Bind operational work items without overloading external_id

`tickets.work_item_refs` binds `tickets.tickets.id` to a GitHub Issue or Advisory
with role `canonical` or `alias`. Legacy rows may have no binding during the
additive migration. A work item may have at most one current canonical binding,
while prior or mistaken references remain resolvable as immutable aliases.

Pull Requests cannot be canonical work items. They are delivery objects related
to Issues through explicit object relationships.

### D3 — Corrections append relationships; they never rewrite history

`tickets.github_object_relations` stores directed relationships including
`implements`, `closes`, `duplicate_of`, `replaces`, and `transferred_to`, with
source and timestamps. Correction operations atomically retire a canonical
binding, add its alias/history, establish the replacement canonical binding, and
append the explaining relationship. Cycle checks apply to redirect-like
relationships.

### D4 — Human syntax is presentation, not a database key

The pure reference module parses and formats:

- `I#123` for an Issue in the configured default repository;
- `PR#124` for a Pull Request in the configured default repository;
- `owner/repo#123` when repository qualification is required;
- `I123` as the branch-safe representation of an Issue.

Stored uniqueness uses GitHub node IDs and repository node ID plus number. A bare
number is never a cross-repository machine key.

### D5 — Preserve UUID anchoring and additive rollout

All new foreign keys point through the existing ticket UUID or the new local
GitHub-object UUID. No existing `external_id`, sequence, trigger, ticket link,
poller, or consumer changes semantics in this child change. Later changes may
populate and consume the layer after idempotent import and compatibility tests.

## Rejected Alternatives

### Replace external_id with I# immediately

Rejected because hundreds of CLI, MCP, OpenSpec, factory, UI, and test consumers
currently address `external_id`. A big-bang rewrite would combine identity,
behavior, and destructive migration without a rollback boundary.

### Use PR# as the work-item identifier

Rejected because a PR does not exist during intake/planning, one Issue can have
several delivery attempts, and one PR can close several Issues.

### Key objects by number alone

Rejected because numbers are repository-local and the program already spans
Bachelorprojekt and related repositories such as `Paddione/brain`.

### Mutate aliases during correction

Rejected because transferred, duplicated, or mistakenly classified objects must
remain resolvable for audit and recovery. Corrections append history.

### Include import or legacy deletion here

Rejected because importer correctness and production deletion have independent
failure modes. The cutover remains a later, explicitly destructive child of
I#5587 with backup, restore, reconciliation, and rollback gates.

## Data Flow

```text
GitHub node ID
      │
      ▼
github_objects ──1:N── github_object_coordinates
      │
      ├──N:M── work_item_refs ──▶ tickets.tickets UUID
      │
      └──N:M── github_object_relations ──▶ github_objects
```

## Failure and Recovery Semantics

- Replaying schema initialization is idempotent.
- Duplicate node IDs or repository coordinates fail closed.
- A second current canonical binding for one ticket fails closed.
- A PR proposed as a canonical work-item binding fails closed.
- Redirect cycles fail closed without partially changing canonical state.
- A transfer updates the current coordinate and closes the prior coordinate; it
  does not replace the GitHub object identity.

## Scope Boundary

This change does not call GitHub, import current history, expose new creation
commands, alter branch names, close Issues, remove T-only tooling, or delete any
production record.
