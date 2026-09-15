# Design: require-review-before-automerge

## Root cause

The repository enables auto-merge when an eligible PR opens. Branch protection
currently reports `required_pull_request_reviews: null`, so GitHub considers
the review condition already satisfied. The later, client-side review check in
`dev-flow-execute` cannot prevent the server-side merge.

## Decision

Keep automatic squash merge. The authoritative GitHub branch-protection payload
will require one approving review, and the local checker will treat zero or
missing required approvals as non-compliant. This makes GitHub hold auto-merge
until review completion instead of relying on agent timing.

## Scope

- Update the idempotent branch-protection installer to preserve existing review
  options while raising the minimum approval count to one.
- Update its local compliance checker and BATS fixtures to reject a zero-review
  configuration.
- Modify the CI/CD OpenSpec requirement to specify the review gate before
  auto-merge.

## Non-goals

- Do not disable auto-merge or alter the dependency-PR exception.
- Do not change required CI checks or make E2E required.
- Do not apply the live GitHub protection from this planning change; execution
  will use the existing administrator-scoped task after the code is merged.
