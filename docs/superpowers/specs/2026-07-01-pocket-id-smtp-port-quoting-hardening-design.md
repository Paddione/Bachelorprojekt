---
ticket_id: T001411
plan_ref: null
status: active
date: 2026-07-01
---

# pocket-id-smtp-port-quoting-hardening — Design

## Root cause (investigated, confirmed)

`kustomize build` (v5.8.1) round-trips YAML through its internal marshaller. A
double-quoted plain-scalar placeholder like `value: "${SMTP_PORT}"` in
`k3d/pocket-id.yaml` doesn't syntactically require quoting (it isn't a
number/bool/null literal at kustomize's own type-detection stage — the value is
literally the string `${SMTP_PORT}`), so kustomize's YAML emitter drops the
quotes and re-serializes it as a bare `value: ${SMTP_PORT}`. When `envsubst`
later substitutes the numeric-looking `SMTP_PORT=587` into that now-unquoted
placeholder, the result is a genuine YAML integer scalar (`value: 587`)
instead of a string. `kubectl apply --server-side --force-conflicts` then
rejects the entire multi-document apply stream during typed-patch
construction against the OpenAPI schema (`corev1.EnvVar.Value` is
`type: string`):

```
Error from server: failed to create typed patch object (workspace/pocket-id; apps/v1, Kind=Deployment):
.spec.template.spec.containers[name="pocket-id"].env[name="SMTP_PORT"].value: expected string, got &value.valueUnstructured{Value:587}
```

Because `kubectl apply -f -` is fed the whole rendered manifest set for a
brand in one pipe, this one malformed field aborted the *entire*
`workspace:deploy` task run, blocking the post-merge deploy pipeline for both
brands (`fleet:shared-services`/post-merge.yml calls `task workspace:deploy
ENV=mentolder` then `ENV=korczewski` — if the first fails, the second never
runs). Reproduced in GH Actions run 28535987163 (commit ea8e7b3e, 2026-07-01T17:34:41Z).

## The code fix for pocket-id/SMTP_PORT is ALREADY MERGED

PR #2429 (`f87b8ebe`, merged 2026-07-01T18:14:50Z, tagged `[T001411]`) already
fixed this for the two `workspace:deploy` pipelines by inserting a
re-quoting `sed` stage between `kustomize build` and `envsubst`:

```
kustomize build ... \
  | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
  | envsubst "$ENVSUBST_VARS" \
  | ...
```

`git merge-base --is-ancestor f87b8ebe HEAD` is true in this worktree — the
fix is already present. Verified by re-running the full prod pipeline
locally (`kustomize build prod-fleet/mentolder/ | <sed> | envsubst
"$ENVSUBST_VARS"`): `SMTP_PORT` now renders as `value: "587"`. `tests/spec/
workspace-deploy.bats` already asserts (a) both pipelines contain the sed
stage, and (b) the full mentolder overlay render produces a quoted
`SMTP_PORT`. **Do not re-implement this — it is done and tested.**

## What is NOT yet covered — the actual scope of this plan

### 1. The same bug class is unfixed in three sibling deploy pipelines

`Taskfile.yml` has five more `kustomize build ... | envsubst ... | kubectl
apply` pipelines that never received the re-quoting sed stage, because the
T001411 fix was scoped narrowly to `workspace:deploy`/`workspace:partial-deploy`:

- `workspace:coturn-setup` (~line 1580) — `kustomize build k3d/coturn-stack | envsubst ...`
- `workspace:office:deploy` (~line 1740) — `kustomize build k3d/office-stack | envsubst ...`
- `fleet:shared-services` (~line 2430-2452) — repeats office-stack, coturn-stack,
  and adds `kustomize build k3d/rustdesk-stack | envsubst '$TURN_NODE' | ...`

None of these currently has a *live* incident: the bare placeholders they
substitute (`$TURN_NODE`, `$TURN_PUBLIC_IP`, `$PROD_DOMAIN`,
`$TLS_SECRET_NAME`) are hostname/IP/domain strings, not numeric-looking, so
they don't currently trip YAML's int/bool auto-typing. `$COLLABORA_SSL_TERMINATION`
(a `"true"`/`"false"` value, which *would* be a live incident risk since a bare
`value: true` parses as a YAML bool) is embedded inside a longer string
(`"--o:ssl.enable=false --o:ssl.termination=${COLLABORA_SSL_TERMINATION}"`),
which forces quoting regardless (kustomize must quote because the string
contains spaces/colons), so it isn't actually vulnerable today.

This is nonetheless the exact same latent defect class documented in T001411's
own root cause — any future manifest change that turns one of these bare
placeholders into a numeric/bool-looking value (e.g. a purely-numeric node
name, or lifting `$COLLABORA_SSL_TERMINATION` out of its string context) would
reproduce the identical "expected string, got ..." apply failure and abort
these deploy paths too. Given this is a `hoch`-priority, deploy-pipeline-
blocking bug class, closing the gap defensively (apply the same one-line sed
fix to all five remaining call sites) is cheap and consistent with "same
failure class as T001397's IngressRoute rejection" reasoning already used to
justify the original fix.

### 2. No regression guard against a *new* unfixed `kustomize build` pipeline

The existing `tests/spec/workspace-deploy.bats` T001411 tests are hard-coded
to the two `workspace:deploy` branches — they wouldn't catch it if a *sixth*
pipeline were added later without the sed stage. Add one generalized,
Taskfile-structural test that enumerates every `kustomize build ... |
envsubst` pipe chain in `Taskfile.yml` and asserts each one contains the
re-quoting sed stage between the two. This test currently **fails** (red)
against the un-hardened Taskfile.yml (the three sibling pipelines/five call
sites are missing the stage) and turns green once Task 1 is applied — this is
the rot→grün failing test required by the fix-path.

### 3. Live remediation still outstanding (operational, not a PR task)

Confirmed via direct cluster inspection:

```
$ kubectl --context fleet -n workspace get deployment pocket-id -o yaml | grep -A2 SMTP_PORT
        - name: SMTP_PORT
          value: "587"          # mentolder: correctly deployed

$ kubectl --context fleet -n workspace-korczewski get deployment pocket-id -o yaml | grep -A2 SMTP_PORT
        - name: SMTP_PORT
          value: ${SMTP_PORT}    # korczewski: STILL the literal, unexpanded placeholder
```

korczewski never got a chance to redeploy because post-merge.yml runs
`ENV=mentolder` before `ENV=korczewski`, and every failing mentolder deploy
run (before f87b8ebe merged) aborted the job before the korczewski step ran.
This is a real, live production defect (Pocket-ID's SMTP magic-link auth is
broken on korczewski right now — literal `${SMTP_PORT}` cannot be parsed as a
port by Pocket-ID) but it is **not fixable by a code change** — it self-heals
on the next successful `task workspace:deploy ENV=korczewski` run (which will
happen automatically on the next post-merge push that touches k3d/prod-fleet
paths, since the mentolder step now succeeds). This plan flags it explicitly
as a manual/immediate remediation the operator should trigger out-of-band
(`task workspace:deploy ENV=korczewski`) rather than a plan task, since
dev-flow-execute's implementation phase produces PRs, not live cluster
mutations.

## Scope for this plan (dev-flow-execute)

1. Apply the same `sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'`
   re-quoting stage to all five `kustomize build k3d/{coturn,office,rustdesk}-stack
   | envsubst` call sites in Taskfile.yml (workspace:coturn-setup,
   workspace:office:deploy, and the three repeated inside fleet:shared-services).
2. Add a generalized BATS test to `tests/spec/workspace-deploy.bats` that
   greps `Taskfile.yml` for every `kustomize build ... | envsubst` sequence and
   asserts a re-quoting sed stage sits between them — failing today, passing
   after (1).
3. Note (documentation only, not a task): recommend the operator run `task
   workspace:deploy ENV=korczewski` immediately after merge to remediate the
   live stuck deployment, rather than waiting for the next unrelated
   manifest-touching merge.

## Out of scope

- Re-implementing the pocket-id/SMTP_PORT fix itself (PR #2429, already merged).
- Any change to `k3d/pocket-id.yaml` or its IngressRoute (T001397, already merged).
- Live cluster remediation as a plan *task* (operational action, called out as a note instead).
