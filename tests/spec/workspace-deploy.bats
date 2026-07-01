#!/usr/bin/env bats
# tests/spec/workspace-deploy.bats
# SSOT: openspec/specs/workspace-deploy.md
# Covers T001396: Pocket-ID SMTP wiring (SMTP_USER unsubstituted in prod,
# missing POCKET_ID_SMTP_TLS derivation).
# Covers T001400: Pocket-ID SMTP_PORT unsubstituted in prod (ENVSUBST_VARS
# missed $SMTP_PORT in the same two prod deploy paths).
# Uses simple [ ... ] assertions (matches tests/spec/* convention).

load 'test_helper'

TASKFILE="${PROJECT_DIR}/Taskfile.yml"
POCKET_ID_MANIFEST="${PROJECT_DIR}/k3d/pocket-id.yaml"

# Extracts the workspace:deploy task body (from its header to the next
# top-level task header) so assertions only look at ENVSUBST_VARS lines
# belonging to this task, not e.g. the dev-branch literal envsubst call
# (which already lists $SMTP_USER correctly) or unrelated tasks.
_workspace_deploy_block() {
  sed -n '/^  workspace:deploy:$/,/^  workspace:partial-deploy:$/p' "$TASKFILE"
}

_workspace_partial_deploy_block() {
  sed -n '/^  workspace:partial-deploy:$/,/^  workspace:fix-tickets-grants:$/p' "$TASKFILE"
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "workspace:deploy prod ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_USER" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$SMTP_PORT" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$SMTP_PORT'"
  [ "$status" -eq 0 ]
}

@test "workspace:partial-deploy ENVSUBST_VARS includes \$POCKET_ID_SMTP_TLS" {
  run bash -c "_block() { sed -n '/^  workspace:partial-deploy:\$/,/^  workspace:fix-tickets-grants:\$/p' '$TASKFILE'; }; _block | grep '^\s*ENVSUBST_VARS=' | grep -F '\$POCKET_ID_SMTP_TLS'"
  [ "$status" -eq 0 ]
}

@test "k3d/pocket-id.yaml wires an SMTP_TLS container env" {
  run grep -c 'name: SMTP_TLS' "$POCKET_ID_MANIFEST"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "workspace:deploy dev branch still envsubsts \$SMTP_USER (no regression)" {
  # The dev-branch pipeline (kustomize build k3d/ | ... | envsubst ... | ... | kubectl apply)
  # may wrap across multiple piped lines (T001411 added a re-quoting sed stage
  # between kustomize build and envsubst), so match across the whole pipe
  # range rather than requiring both tokens on a single physical line.
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p' | grep -F '\$SMTP_USER'"
  [ "$status" -eq 0 ]
}

# T001411: kustomize build re-serializes YAML and drops the quotes around a
# bare `"${VAR}"` placeholder (it isn't syntactically required for a plain
# scalar). When envsubst then substitutes a purely-numeric value like
# SMTP_PORT=587 into that now-unquoted placeholder, the result is a bare YAML
# integer (`value: 587`) instead of a string — which `kubectl apply
# --server-side` rejects for a corev1.EnvVar.Value field, aborting the whole
# apply chain for both brands. The fix inserts a sed stage between
# `kustomize build` and `envsubst` that re-quotes any `: ${VAR}` placeholder
# before substitution happens, so the quotes survive.
@test "workspace:deploy dev branch re-quotes kustomize-stripped \${VAR} placeholders before envsubst (T001411)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build k3d\//,/kubectl apply/p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'s/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'* ]]
}

@test "workspace:deploy prod branch re-quotes kustomize-stripped \${VAR} placeholders before envsubst (T001411)" {
  run bash -c "_block() { sed -n '/^  workspace:deploy:\$/,/^  workspace:partial-deploy:\$/p' '$TASKFILE'; }; _block | sed -n '/kustomize build \"\$overlay\/\"/,/kubectl --context/p'"
  [ "$status" -eq 0 ]
  [[ "$output" == *'s/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g'* ]]
}

@test "prod-fleet mentolder overlay renders pocket-id SMTP_PORT as a quoted string after the full deploy pipeline (T001411)" {
  export SMTP_PORT=587 SMTP_HOST=smtp.example.org SMTP_USER=x POCKET_ID_SMTP_TLS=starttls
  export POCKET_ID_FRONTEND_URL=https://auth.example POCKET_ID_URL=http://pocket-id:1411 POCKET_ID_DOMAIN=id.example
  run kustomize build "${PROJECT_DIR}/prod-fleet/mentolder" --load-restrictor=LoadRestrictionsNone
  [ "$status" -eq 0 ]
  requoted=$(printf '%s\n' "$output" | sed -E 's/: \$\{([a-zA-Z0-9_]+)\}[[:space:]]*$/: "${\1}"/g')
  rendered=$(printf '%s\n' "$requoted" | envsubst '$SMTP_PORT $SMTP_HOST $SMTP_USER $POCKET_ID_SMTP_TLS $POCKET_ID_FRONTEND_URL $POCKET_ID_URL $POCKET_ID_DOMAIN')
  smtp_port_block=$(printf '%s\n' "$rendered" | grep -A1 'name: SMTP_PORT')
  [[ "$smtp_port_block" == *'value: "587"'* ]]
}

# T001411 (hardening follow-up): the same latent bug class fixed above for
# workspace:deploy was still present in five other `kustomize build
# k3d/{coturn,office,rustdesk}-stack | envsubst` call sites (workspace:
# coturn-setup, workspace:office:deploy, and the three repeated inside
# fleet:shared-services) AND in workspace:partial-deploy (which uses
# `kustomize build "$overlay/"`, not a literal k3d/ path — an oversight in
# the original T001411 investigation, which had assumed workspace:
# partial-deploy was already covered by PR #2429; it wasn't). This
# structural scanner enumerates every `kustomize build ...` pipe chain in
# Taskfile.yml — literal k3d/ paths and dynamic ($overlay/, $WEBSITE_OVERLAY,
# ...) paths alike — and asserts each one that flows into an envsubst (via an
# unbroken run of `|`-continuation lines immediately following the
# `kustomize build` line) has the re-quoting sed stage first, so a future
# unhardened pipeline (of either shape) can't silently reintroduce the gap.
# Scoping "pending" to an unbroken pipe-continuation run (rather than "the
# next envsubst anywhere later in the file") is required to avoid false
# positives on build-only invocations that never pipe into envsubst at all —
# e.g. the placeholder-free `fleet:platform` build (piped straight to
# `kubectl apply`) or the `kustomize build ... >/dev/null && echo` dry-run
# sanity checks in `workspace:validate` — which would otherwise get
# spuriously blamed for an unrelated, much later envsubst call.
@test "every kustomize build | envsubst pipeline in Taskfile.yml re-quotes stripped \${VAR} placeholders (T001411)" {
  run bash -c '
    awk '\''
      /kustomize build/ { pending=1; sed_seen=0; next }
      pending && /^[[:space:]]*\|/ {
        if (index($0, "s/: \\$\\{([a-zA-Z0-9_]+)\\}[[:space:]]*$/: \"${\\1}\"/g")) sed_seen=1
        if ($0 ~ /envsubst/) { if (!sed_seen) bad++; pending=0 }
        next
      }
      pending { pending=0 }
      END { print bad+0 }
    '\'' "'"$TASKFILE"'"
  '
  [ "$status" -eq 0 ]
  [ "$output" -eq 0 ]
}
