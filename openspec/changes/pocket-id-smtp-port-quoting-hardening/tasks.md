---
title: "pocket-id-smtp-port-quoting-hardening — Implementation Plan"
ticket_id: T001411
domains: [infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# pocket-id-smtp-port-quoting-hardening — Implementation Plan

_Ticket: T001411 — hardening follow-up to the already-merged pocket-id/SMTP_PORT fix (PR #2429, `f87b8ebe`)._

## Context & scope

PR #2429 already fixed the live pocket-id/SMTP_PORT deploy failure by inserting a
re-quoting `sed` stage between `kustomize build` and `envsubst` in the two
`workspace:deploy` branches and in `workspace:partial-deploy`. That fix is an
ancestor of this branch, tested by `tests/spec/workspace-deploy.bats`, and is
**out of scope here — do not touch it, and do not touch `k3d/pocket-id.yaml`.**

This plan closes the *same latent defect class* in the five remaining
`kustomize build k3d/{coturn,office,rustdesk}-stack | envsubst` call sites in
`Taskfile.yml` that never received the stage, and adds a generalized,
Taskfile-structural regression guard so a future unhardened pipeline can't
silently reintroduce the gap. The five call sites (confirmed by grep, addressed
by name — no hardcoded line numbers, since Taskfile.yml line numbers shift):

- `workspace:coturn-setup` — `kustomize build k3d/coturn-stack | envsubst '$TURN_NODE $TURN_PUBLIC_IP $PROD_DOMAIN $TLS_SECRET_NAME'`
- `workspace:office:deploy` — `kustomize build k3d/office-stack | envsubst '$PROD_DOMAIN $COLLABORA_HOST …'`
- `fleet:shared-services` (office-stack) — repeats the office-stack pipeline
- `fleet:shared-services` (coturn-stack) — repeats the coturn-stack pipeline
- `fleet:shared-services` (rustdesk-stack) — `kustomize build k3d/rustdesk-stack | envsubst '$TURN_NODE'`

None of these has a *live* incident today (their placeholders resolve to
non-numeric host/IP/domain strings), but any future manifest change making one
numeric/bool-looking would reproduce the identical `kubectl apply --server-side`
type-coercion abort. This is a cheap, defensive close of a `hoch`-priority
deploy-pipeline-blocking bug class.

### Operational note — live korczewski remediation (NOT a repo task)

This is called out for the human reviewer and is **not** a `tasks.md` task,
because it is a live-cluster action, not a repo file change, and produces no PR
diff. Confirmed via `kubectl`: the fleet `workspace-korczewski/pocket-id`
Deployment is currently stuck with the literal, unexpanded `${SMTP_PORT}`
placeholder (Pocket-ID's SMTP magic-link auth is broken on korczewski right
now). korczewski never redeployed because `post-merge.yml` runs `ENV=mentolder`
before `ENV=korczewski`, and every pre-`f87b8ebe` mentolder run aborted the job
before reaching the korczewski step. This predates and is unrelated to this
PR's code change and **self-heals on the next successful
`task workspace:deploy ENV=korczewski` run**. After this PR merges, the operator
should run `task workspace:deploy ENV=korczewski` out-of-band to remediate
immediately rather than waiting for the next manifest-touching post-merge push.

## File Structure

```
tests/spec/workspace-deploy.bats   # (edit) + 1 generalized Taskfile-structural @test, tagged (T001411)
Taskfile.yml                        # (edit) insert the re-quoting sed stage into the 5 remaining call sites
```

Neither file is S1-gated in a way that binds here:
- `Taskfile.yml` — extension `.yml` is **ungated** by S1 (not in the limit table); baseline: `not-baselined`. wc -l = 4549. No line budget applies; the change adds 5 one-line continuations.
- `tests/spec/workspace-deploy.bats` — extension `.bats`, static limit **300**, baseline: `not-baselined` → effective threshold = 300. wc -l = **102** → **budget ≈ 198**. Adding one `@test` (~12 lines) stays far under threshold.

No new files, no orphan-manifest/script risk (S4 N/A), no hostname literals (S3 N/A), no `website/src` or `any`/Vitest concerns (CQ02, W1 N/A).

## Add re-quoting sed stage to all remaining kustomize|envsubst deploy pipelines

This operation implements the ADDED requirement in
`openspec/changes/pocket-id-smtp-port-quoting-hardening/specs/workspace-deploy.md`
("All `kustomize build | envsubst` deploy pipelines re-quote stripped
placeholders") and its four scenarios.

### Requirement: A Taskfile-structural regression guard proves every pipeline re-quotes (RED first)

Maps to the delta scenario *"Taskfile-structural regression guard catches a
future unhardened pipeline"*. Written first so it FAILS on the current
(pre-fix) `Taskfile.yml`, where 5 call sites still lack the stage.

#### Scenario: enumerate every `kustomize build … | envsubst` chain and assert an intervening sed re-quoting stage

- [ ] **Failing-Test-Step (RED).** Add ONE new `@test` to
      `tests/spec/workspace-deploy.bats`, name tagged `(T001411)`, that is
      Taskfile-structural (not pipeline-specific). It scans `Taskfile.yml` for
      every `kustomize build k3d/…` line and, within the same contiguous pipe
      chain, checks whether an `envsubst` follows **without** an intervening
      re-quoting `sed` line; it counts such gap occurrences and asserts the
      count is `0`. It must not depend on hardcoded line numbers. Model it on
      the existing `run bash -c "…"` assertion style already used in this file
      (see the two existing `(T001411)` tests near the bottom and the
      `_workspace_deploy_block` helper pattern). The re-quoting stage to detect
      is the exact regex used by the merged fix:
      `s/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g`.

      A count-based scanner (literal `index()` matching sidesteps regex-escaping
      pain) is the intended shape:

      ```bash
      @test "every kustomize build | envsubst pipeline in Taskfile.yml re-quotes stripped \${VAR} placeholders (T001411)" {
        run bash -c '
          awk '\''
            /kustomize build k3d\// { pending=1; sed_seen=0; next }
            pending && index($0, "s/: \\$\\{([a-zA-Z0-9_]+)\\}[[:space:]]*$/: \"${\\1}\"/g") { sed_seen=1 }
            pending && /envsubst/ { if (!sed_seen) bad++; pending=0; next }
            END { print bad+0 }
          '\'' "'"$TASKFILE"'"
        '
        [ "$status" -eq 0 ]
        [ "$output" -eq 0 ]
      }
      ```

      Run it and confirm it is red on the current branch:

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
      # expected: FAIL (red — 5 call sites in coturn-setup / office:deploy /
      #           fleet:shared-services still lack the re-quoting sed stage,
      #           so the awk gap-count is 5, not 0)
      ```

### Requirement: All five remaining `kustomize build … | envsubst` call sites re-quote before substitution (GREEN)

Maps to the delta scenarios *"coturn-stack pipeline re-quotes…"*,
*"office-stack pipeline re-quotes…"*, and *"fleet:shared-services pipelines
re-quote…"*.

#### Scenario: insert the identical sed stage into all five call sites

- [ ] **Fix-Step (GREEN).** In `Taskfile.yml`, insert the identical re-quoting
      line — same regex/format as the already-merged fix — immediately after
      each `kustomize build k3d/{coturn,office,rustdesk}-stack \` line and
      before its `| envsubst …` line, following the existing `\`
      line-continuation style and the 10-space pipe-continuation indentation
      already used at those sites:

      ```
      kustomize build k3d/coturn-stack \
        | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g' \
        | envsubst '$TURN_NODE $TURN_PUBLIC_IP $PROD_DOMAIN $TLS_SECRET_NAME' \
        | kubectl $context_flag apply -f -
      ```

      Apply to all five: `workspace:coturn-setup` (coturn-stack),
      `workspace:office:deploy` (office-stack), and the three inside
      `fleet:shared-services` (office-stack, coturn-stack, rustdesk-stack). Do
      NOT touch the already-fixed `workspace:deploy` / `workspace:partial-deploy`
      pipelines, and do NOT touch `k3d/pocket-id.yaml`.

- [ ] **Confirm GREEN.** Re-run the new test (and the whole file, to prove no
      regression of the existing `(T001411)` tests):

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/workspace-deploy.bats
      # expected: PASS (awk gap-count is now 0 across all pipelines)
      ```

## Final Verification

- [ ] Regenerate the test inventory (a `@test` was added) and sanity-check
      manifests are unaffected:

      ```bash
      task test:inventory        # regenerate website/src/data/test-inventory.json, commit it
      task workspace:validate    # kustomize renders still valid (no manifest change, sanity only)
      ```

- [ ] Run the three mandatory CI gates and confirm all pass before opening the PR:

      ```bash
      task test:changed          # targeted tests for changed domains (incl. the new BATS test)
      task freshness:regenerate  # refresh generated artifacts (test-inventory, repo-index, …)
      task freshness:check       # CI-equivalent: freshness + quality:check (S1–S4 ratchet) + baseline assertion
      ```
