#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# keycloak-entrypoint-escaping.bats — Guard the realm-import entrypoint
# against doubled-dollar ($$) escaping artifacts. [T000320]
# ═══════════════════════════════════════════════════════════════════
# prod/import-entrypoint.sh is loaded VERBATIM into the realm-template
# ConfigMap by the prod-mentolder/prod-korczewski configMapGenerator
# (behavior: replace). Kustomize does NOT de-escape $$ -> $, and the
# prod manifest-level envsubst leaves $$ untouched too. So any $$ in
# this file reaches /bin/sh literally and the runtime expansion
# `${$${var}:-}` throws "bad substitution" on every Keycloak startup.
#
# The canonical siblings (scripts/import-entrypoint.sh,
# k3d/realm-import-entrypoint.sh) use single $ and must stay $$-free.
# This test fails while the artifact is present (red) and passes once
# the escaping is de-doubled (green).
# ═══════════════════════════════════════════════════════════════════

load test_helper

@test "prod/import-entrypoint.sh has no doubled-dollar (\$\$) escaping artifacts" {
  local f="${PROJECT_DIR}/prod/import-entrypoint.sh"
  [[ -f "$f" ]] || { echo "missing: $f"; return 1; }
  if grep -nF '$$' "$f"; then
    echo "Found doubled-dollar (\$\$) in $f — kustomize embeds this file"
    echo "verbatim, so \$\$ reaches /bin/sh and triggers 'bad substitution'."
    return 1
  fi
}

@test "canonical entrypoint siblings stay free of doubled-dollar artifacts" {
  for f in "${PROJECT_DIR}/scripts/import-entrypoint.sh" \
           "${PROJECT_DIR}/k3d/realm-import-entrypoint.sh"; do
    [[ -f "$f" ]] || continue
    if grep -nF '$$' "$f"; then
      echo "Unexpected doubled-dollar in canonical file $f"
      return 1
    fi
  done
}
