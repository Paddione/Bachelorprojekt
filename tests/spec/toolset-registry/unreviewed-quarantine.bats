#!/usr/bin/env bats
# tests/spec/toolset-registry/unreviewed-quarantine.bats
# Prüfmodus: Prüft, dass unreviewed Einträge erkannt werden.

load '../test_helper.bash'

@test "toolset loader identifies unreviewed entries" {
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/registry"
  cat > "$tmp/registry/capabilities.yaml" <<'YAML'
capabilities:
  unknown-cap:
    mcp:foo:
      state: unreviewed
      reason: "Needs review"
YAML

  run node -e "import('./scripts/toolset/lib/registry.mjs').then(({ loadRegistry }) => { const r = loadRegistry('$tmp/registry/capabilities.yaml'); if (r.capabilities['unknown-cap']['mcp:foo'].state !== 'unreviewed') process.exit(1); });"
  [ "$status" -eq 0 ] || { echo "Loader failed for unreviewed entry"; return 1; }
  rm -rf "$tmp"
}
