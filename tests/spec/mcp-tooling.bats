#!/usr/bin/env bats
# tests/spec/mcp-tooling.bats
# SSOT spec: openspec/specs (capability mcp-skill-integration). HARD CI guard —
# fails when a skill-critical ticket.sh verb loses its ticket-mcp wrapper.
# (Slice 3 appends a second @test: every Go tool must be listed in the guide.)
# Simple [ ] assertions (tests/spec/* convention — bats-assert is not loaded).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TOOLS_DIR="$REPO_ROOT/scripts/ticket-mcp/go/internal/tools"
  GUIDE="$REPO_ROOT/.claude/skills/references/mcp-tool-guide.md"
}

@test "every skill-critical ticket.sh verb has a ticket-mcp wrapper" {
  [ -d "$TOOLS_DIR" ]
  verbs=(phase grill stage-plan create enqueue set-touched-files get-attachments archive-plan add-pr-link get add-comment)
  missing=()
  for v in "${verbs[@]}"; do
    # A wrapper = the verb appears as a quoted RunTicket argument in the Go source.
    grep -rqF "\"$v\"" "$TOOLS_DIR" || missing+=("$v")
  done
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "# Verbs without a ticket-mcp wrapper: ${missing[*]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

@test "every ticket-mcp Go tool is listed in mcp-tool-guide.md" {
  [ -d "$TOOLS_DIR" ]
  [ -f "$GUIDE" ]
  missing=()
  while IFS= read -r tool; do
    [ -z "$tool" ] && continue
    grep -qF "$tool" "$GUIDE" || missing+=("$tool")
  done < <(grep -rhoE 'mcp\.NewTool\("[a-z_]+"' "$TOOLS_DIR" | sed -E 's/.*"([a-z_]+)"/\1/' | sort -u)
  if [ "${#missing[@]}" -gt 0 ]; then
    echo "# Tools missing from mcp-tool-guide.md: ${missing[*]}" >&2
  fi
  [ "${#missing[@]}" -eq 0 ]
}

# T001274: antigravity-cli sandbox interceptor blocks direct gh invocations
# expected: FAIL (before fix — settings.json lacks permissions.allow for gh)
@test "antigravity-cli settings.json pre-grants Bash(gh *) permission" {
  local settings="$HOME/.gemini/antigravity-cli/settings.json"
  if [ ! -f "$settings" ]; then
    skip "antigravity-cli not installed on this machine (settings.json absent)"
  fi
  # The permissions.allow list must contain an entry matching 'gh'
  python3 - "$settings" <<'PYEOF'
import json, sys
try:
    d = json.load(open(sys.argv[1]))
    allows = d.get("permissions", {}).get("allow", [])
    has_gh = any("gh" in entry for entry in allows)
    if not has_gh:
        print("# ERROR: permissions.allow missing Bash(gh *) entry", file=sys.stderr)
        print("# Current allows:", allows, file=sys.stderr)
        sys.exit(1)
    sys.exit(0)
except Exception as e:
    print(f"# ERROR parsing settings.json: {e}", file=sys.stderr)
    sys.exit(1)
PYEOF
}
