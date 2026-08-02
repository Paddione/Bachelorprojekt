#!/usr/bin/env bats
# tests/spec/toolset-registry/sync-all-harnesses.bats
# Prüfmodus: Prüft, dass sync.mjs für alle verfügbaren Harness-Ziele durchläuft.

load '../test_helper.bash'

@test "toolset sync runs without error" {
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/registry" "$tmp/out/.claude" "$tmp/out/.opencode"
  cat > "$tmp/registry/capabilities.yaml" <<'YAML'
capabilities:
  github:
    cli:gh-axi:
      state: canonical
YAML

  cat > "$tmp/out/.claude/settings.json" <<'JSON'
{
  "disabledMcpjsonServers": []
}
JSON

  run env TOOLSET_REGISTRY="$tmp/registry/capabilities.yaml" TOOLSET_OUT_DIR="$tmp/out" node scripts/toolset/sync.mjs
  [ "$status" -eq 0 ] || { echo "Sync failed (status=$status)"; return 1; }
  rm -rf "$tmp"
}
