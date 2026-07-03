# Proposal: t001562-ci-rot

## Why

Commit `a9dcb6cc0` (brain-quartz-deploy + brain-initial-ingest) appended 5 lines of
Deployment env-var boilerplate to `k3d/secrets.yaml`, breaking its multi-document YAML
structure. This causes the post-merge `task workspace:deploy` workflow to fail with
`MalformedYAMLError` — blocking all PRs from being deployed after merge to main.

## What

- Remove the 5 stray lines from `k3d/secrets.yaml` (a Deployment-style env stanza and a
  dangling comment header).
- Add a YAML-validity BATS test in `tests/spec/ci-cd.bats` that catches future regressions.
- Verify with `task workspace:validate` (kustomize dry-run).

_Ticket: T001562_
