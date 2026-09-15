# Proposal: github-identity-foundation

## Why

The current SDLC has three competing identities: a mutable Postgres ticket with a
generated `T######` external ID, a PR number stored directly on ticket links, and
partial GitHub PR projections. GitHub Issues are currently treated as disposable
intake even though the desired lifecycle begins with an Issue and uses GitHub as
the human-facing source of truth. Replacing the current flow safely requires an
additive identity layer before importers, planners, closure logic, or production
data can move.

## What

- Add an immutable, repository-scoped representation of GitHub Issues, Pull
  Requests, and Security Advisories based on GitHub node IDs.
- Preserve historical repository/number coordinates so transfers and correction
  do not destroy old references.
- Bind the existing invisible ticket UUID to zero or one active canonical GitHub
  work item plus immutable aliases during the compatibility period.
- Represent Issue/PR delivery and correction relationships explicitly, including
  `implements`, `closes`, `duplicate_of`, `replaces`, and `transferred_to`.
- Provide a pure parser/formatter for human references (`I#123`, `PR#124`, and
  `owner/repo#123`) and branch-safe Issue tokens (`I123`).
- Keep the entire change additive: no GitHub history import, writer flip,
  `external_id` rewrite, legacy ticket deletion, or production cutover occurs in
  this change.

Canonical epic: [I#5587](https://github.com/Paddione/Bachelorprojekt/issues/5587)

Canonical child issue: [I#5588](https://github.com/Paddione/Bachelorprojekt/issues/5588)

_Ticket: T900159_
