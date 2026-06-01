#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-entrypoint-escaping.bats — Guard the prod realm-import
# entrypoint's PUSH-DEPLOY $$-escaping. [T000320]
# ═══════════════════════════════════════════════════════════════════
# prod/import-entrypoint.sh is rendered into the keycloak-import-script
# ConfigMap. The PUSH deploy pipeline (Taskfile.yml lines 1724 dev-path and
# 1831 prod-path) runs:
#     kustomize build … | envsubst "$VARS" | sed -E 's/\$\$([a-zA-Z0-9_]|{)/$\1/g' | kubectl apply
# The trailing sed collapses `$${` → `${`. The script's own shell expansions
# are therefore DOUBLED (`$$`) so that:
#   1. envsubst (explicit var list) does not eat the script's own ${VAR}
#      expansions (the script's lowercase vars are not in that list), and
#   2. after the sed collapse the embedded script contains correct single-$
#      shell expansions (e.g. `eval val="\${${var}:-}"`).
#
# Historically this sed-collapse mirrored Flux's drone-envsubst, which had the
# same $${VAR}→${VAR} escape semantics. Flux is gone; the push-path sed is now
# the ONLY mechanism, and it needs the identical $$ doubling. The dev/k3d
# entrypoint (k3d/realm-import-entrypoint.sh) is the proven single-$ form the
# prod $$ must collapse to.
#
# Regression context: PR #1168 de-doubled these to single-$ and broke the
# rendered realm import. This test pins the $$ contract so the revert cannot
# be undone by mistake.
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROD_ENTRYPOINT="${PROJECT_DIR}/prod/import-entrypoint.sh"
DEV_ENTRYPOINT="${PROJECT_DIR}/k3d/realm-import-entrypoint.sh"

@test "prod entrypoint: push-sed \$\$ collapse yields valid single-\$ shell expansion" {
  run sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT"
  [ "$status" -eq 0 ]
  echo "$output" | grep -qF 'eval val="\${${var}:-}"'
}

@test "prod entrypoint keeps the \$\$ escaping the push-sed contract needs" {
  # Single-$ here means the breaking regression (PR #1168) has returned.
  grep -qF 'eval val="\$${$${var}:-}"' "$PROD_ENTRYPOINT"
}

@test "prod entrypoint is valid POSIX sh after the push-sed \$\$ collapse" {
  # Simulate the push pipeline's $$ -> $ collapse, then syntax-check the result.
  sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT" | sh -n
}

@test "prod entrypoint collapses to the proven dev single-\$ semantics (tested realm import)" {
  # Parity: after the push-sed collapse, prod's $$ doubling must reduce to
  # exactly the dev entrypoint's working single-$ substitution lines. This is
  # the offline 'tested realm import' — it proves the rendered ConfigMap script
  # the cluster runs is identical in substitution semantics to the dev script.
  collapsed="$(sed -E 's/\$\$([a-zA-Z0-9_]|\{)/$\1/g' "$PROD_ENTRYPOINT")"
  # (a) indirect-expansion line matches dev
  echo "$collapsed" | grep -qF 'eval val="\${${var}:-}"'
  grep -qF 'eval val="\${${var}:-}"' "$DEV_ENTRYPOINT"
  # (b) in-place realm-JSON substitution line matches dev
  echo "$collapsed" | grep -qF 'sed -i "s|\${${var}}|${val}|g"'
  grep -qF 'sed -i "s|\${${var}}|${val}|g"' "$DEV_ENTRYPOINT"
}
