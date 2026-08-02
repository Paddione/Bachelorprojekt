#!/usr/bin/env bats
# tests/spec/toolset-registry/check-drift-detection.bats
# Prüfmodus: Führt das Gate aus (kein Quell-Grep). Positiv-Anker: konsistente
# Fixture → Exit 0. Negativ: Hand-Edit eines verwalteten Keys → Exit != 0,
# Ausgabe nennt Datei und Schlüssel.

load '../test_helper.bash'

@test "toolset gate detects hand-edited target config (drift)" {
  local tmp; tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' RETURN

  # 1) Fixture-Registry: github → cli:gh-axi canonical, mcp:github-mcp suppressed
  mkdir -p "$tmp/registry" "$tmp/out/.claude"
  cat > "$tmp/registry/capabilities.yaml" <<'YAML'
capabilities:
  github:
    cli:gh-axi:
      state: canonical
    mcp:github-mcp:
      state: suppressed
      reason: "Fixture: gh-axi ist der mandatierte GitHub-Pfad."
YAML

  # 2) Fixture-Ziel: konsistent zur Registry (suppressed mcp → disabledMcpjsonServers)
  cat > "$tmp/out/.claude/settings.json" <<'JSON'
{
  "theme": "dark",
  "disabledMcpjsonServers": ["github-mcp"]
}
JSON

  # 3) Positiv-Anker: unveränderte Fixture → Exit 0
  run env TOOLSET_REGISTRY="$tmp/registry/capabilities.yaml" TOOLSET_OUT_DIR="$tmp/out" node scripts/toolset/check.mjs
  [ "$status" -eq 0 ] || { echo "Positiv-Anker: Gate gegen konsistente Fixture muss Exit 0 liefern (status=$status)"; return 1; }

  # 4) Drift: suppressed mcp-Instanz wieder aktivieren (verwalteter Key verfälscht)
  cat > "$tmp/out/.claude/settings.json" <<'JSON'
{
  "theme": "dark",
  "disabledMcpjsonServers": []
}
JSON

  run env TOOLSET_REGISTRY="$tmp/registry/capabilities.yaml" TOOLSET_OUT_DIR="$tmp/out" node scripts/toolset/check.mjs
  [ "$status" -ne 0 ] || { echo "Drift muss nicht-Null-Exit liefern"; return 1; }
  # Verengte Assertion: Datei UND Schlüssel in derselben Ausgabezeile (kein unqualifiziertes 'toolset')
  grep -E 'settings\.json.*disabledMcpjsonServers|disabledMcpjsonServers.*settings\.json' <<<"$output" >/dev/null \
    || { echo "Ausgabe nennt nicht Datei und Schlüssel in einer Zeile: $output"; return 1; }
}
