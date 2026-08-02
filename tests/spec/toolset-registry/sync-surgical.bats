#!/usr/bin/env bats
# tests/spec/toolset-registry/sync-surgical.bats
# Prüfmodus: Chirurgisches Schreiben. Positiv: disabledMcpjsonServers geändert.
# Negativ: Anderes Feld (theme) bleibt unverändert.

load '../test_helper.bash'

@test "toolset sync surgically updates target without touching other fields" {
  local tmp; tmp="$(mktemp -d)"
  mkdir -p "$tmp/registry" "$tmp/out/.claude"
  cat > "$tmp/registry/capabilities.yaml" <<'YAML'
capabilities:
  github:
    cli:gh-axi:
      state: canonical
    mcp:github-mcp:
      state: suppressed
      reason: "Use CLI"
YAML

  cat > "$tmp/out/.claude/settings.json" <<'JSON'
{
  "theme": "dark",
  "disabledMcpjsonServers": []
}
JSON

  run env TOOLSET_REGISTRY="$tmp/registry/capabilities.yaml" TOOLSET_OUT_DIR="$tmp/out" node scripts/toolset/sync.mjs
  [ "$status" -eq 0 ] || { echo "Sync failed (status=$status)"; return 1; }

  grep '"theme": "dark"' "$tmp/out/.claude/settings.json" >/dev/null || { echo "Theme field modified!"; return 1; }
  grep '"github-mcp"' "$tmp/out/.claude/settings.json" >/dev/null || { echo "disabledMcpjsonServers not updated!"; return 1; }
  rm -rf "$tmp"
}
