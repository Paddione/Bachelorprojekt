# Proposal: pocket-id-smtp-port-quoting-hardening

## Why

T001411 ("post-merge deploy fails: pocket-id Deployment SMTP_PORT env value
not a string") was already fixed for the pocket-id/SMTP_PORT case by PR #2429
(`f87b8ebe`, merged 2026-07-01T18:14:50Z, already an ancestor of this branch):
`kustomize build` re-serializes a quoted `value: "${SMTP_PORT}"` placeholder
as bare `value: ${SMTP_PORT}` (quotes aren't syntactically required for a
plain scalar), and `envsubst` then substitutes the numeric `SMTP_PORT=587`
into it, producing a bare YAML integer that `kubectl apply --server-side`
rejects (`expected string, got &value.valueUnstructured{Value:587}`),
aborting the whole apply stream for both brands. PR #2429 inserted a
`sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'` re-quoting
stage between `kustomize build` and `envsubst` in the two `workspace:deploy`
pipelines, and `tests/spec/workspace-deploy.bats` already covers it.

**This proposal does not re-implement that fix.** Investigation
(`docs/superpowers/specs/2026-07-01-pocket-id-smtp-port-quoting-hardening-design.md`)
found the *same latent bug class* is still present, unfixed, in five other
`kustomize build ... | envsubst ... | kubectl apply` call sites in
Taskfile.yml (`workspace:coturn-setup`, `workspace:office:deploy`, and the
three repeated inside `fleet:shared-services` for coturn-stack/office-stack/
rustdesk-stack) — none has a live incident today (their placeholders resolve
to non-numeric strings), but any future manifest change that makes one of
those placeholders numeric/bool-looking (e.g. a purely-numeric node name)
would reproduce the identical deploy-pipeline-blocking failure. There is
also no regression guard that would catch a *new* unfixed `kustomize build`
pipeline being added later.

## What

- Apply the same one-line re-quoting `sed` stage to all five remaining
  `kustomize build k3d/{coturn,office,rustdesk}-stack | envsubst` call sites
  in `Taskfile.yml`.
- Add a generalized, Taskfile-structural BATS test to
  `tests/spec/workspace-deploy.bats` that enumerates every
  `kustomize build ... | envsubst` pipe chain and asserts each one contains
  the re-quoting sed stage — failing today (red) against the three
  unhardened pipelines, passing (green) once the fix above lands.
- Document (not implement) that korczewski's live pocket-id Deployment is
  currently stuck with a literal, unexpanded `${SMTP_PORT}` placeholder
  (confirmed via `kubectl`) because the post-merge job aborted on the
  mentolder step before ever reaching korczewski; recommend the operator
  run `task workspace:deploy ENV=korczewski` immediately after merge as a
  manual remediation, since this is a live-cluster action outside the scope
  of a PR.

_Ticket: T001411_
