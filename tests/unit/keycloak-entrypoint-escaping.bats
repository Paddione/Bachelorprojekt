#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-entrypoint-escaping.bats — Guard the prod realm-import
# entrypoint's Flux drone-envsubst escaping. [T000320]
# ═══════════════════════════════════════════════════════════════════
# prod/import-entrypoint.sh is generated into the keycloak-import-script
# ConfigMap and the prod overlays are reconciled by Flux, whose
# postBuild.substituteFrom runs drone-style envsubst over the rendered
# manifest. drone-envsubst treats `$${VAR}` as an ESCAPE that emits a
# literal `${VAR}`. The script's own shell expansions therefore MUST be
# doubled (`$$`) so that:
#   1. drone-envsubst parses the manifest (no "unable to parse variable
#      name"), and
#   2. after substitution the embedded script contains correct single-$
#      shell expansions (e.g. `eval val="\${${var}:-}"`).
#
# Regression context: PR #1168 de-doubled these to single-$ to silence a
# runtime "bad substitution" seen only on the manual GNU-envsubst deploy
# path. That broke Flux reconciliation on BOTH prod clusters ("unable to
# parse variable name"). This test pins the Flux contract so the revert
# cannot be undone by mistake. The dev/k3d entrypoints (no Flux) keep
# single-$ and are intentionally NOT covered here.
# ═══════════════════════════════════════════════════════════════════

load test_helper

PROD_ENTRYPOINT="${PROJECT_DIR}/prod/import-entrypoint.sh"

@test "prod/import-entrypoint.sh survives Flux drone-envsubst (flux CLI)" {
  command -v flux >/dev/null 2>&1 || skip "flux CLI not available"
  run flux envsubst < "$PROD_ENTRYPOINT"
  [ "$status" -eq 0 ]
  # After Flux substitution the indirect-expansion line must be valid
  # single-$ shell — proves the $$ escaping resolved correctly.
  echo "$output" | grep -qF 'eval val="\${${var}:-}"'
}

@test "prod/import-entrypoint.sh keeps the \$\$ escaping the Flux contract needs" {
  # CI-safe guard (no flux dependency): the escaped indirect-expansion
  # line must be present in its doubled form. Single-$ here means the
  # Flux-breaking regression has returned.
  grep -qF 'eval val="\$${$${var}:-}"' "$PROD_ENTRYPOINT"
}

@test "prod/import-entrypoint.sh is valid POSIX sh after de-escaping" {
  # Simulate Flux's $$ -> $ collapse, then syntax-check the result so a
  # de-escaped script can never ship a shell syntax error.
  sed 's/\$\$/\$/g' "$PROD_ENTRYPOINT" | sh -n
}
