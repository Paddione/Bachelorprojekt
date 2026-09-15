# Proposal: require-review-before-automerge

## Why

`auto-enable-automerge.yml` arms squash auto-merge for every eligible PR, while
the live `main` branch protection has no required pull-request review. Once CI
is green, an unreviewed change can therefore merge before the review gate in
`dev-flow-execute` has any effect.

## What

Require one approving pull-request review in the versioned branch-protection
installer and make the verification script reject a zero-review policy. Retain
automatic squash merge: GitHub will merge only after both required CI and the
approval requirement are satisfied.

_Ticket: T900089_
