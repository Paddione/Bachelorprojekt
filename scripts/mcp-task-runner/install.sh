#!/usr/bin/env bash
set -euo pipefail

# Installs or updates the /usr/local/bin/mcp-task-runner wrapper script
# pointing to scripts/mcp-task-runner/server.mjs.

TARGET="/usr/local/bin/mcp-task-runner"
TMP_WRAPPER="$(mktemp)"

cat << 'EOF' > "$TMP_WRAPPER"
#!/usr/bin/env bash
if [[ -f "./scripts/mcp-task-runner/server.mjs" ]]; then
  EXEC_SCRIPT="./scripts/mcp-task-runner/server.mjs"
elif [[ -n "$(git rev-parse --show-toplevel 2>/dev/null)" && -f "$(git rev-parse --show-toplevel 2>/dev/null)/scripts/mcp-task-runner/server.mjs" ]]; then
  EXEC_SCRIPT="$(git rev-parse --show-toplevel)/scripts/mcp-task-runner/server.mjs"
elif [[ -f "/home/patrick/Bachelorprojekt/scripts/mcp-task-runner/server.mjs" ]]; then
  EXEC_SCRIPT="/home/patrick/Bachelorprojekt/scripts/mcp-task-runner/server.mjs"
else
  echo "mcp-task-runner: cannot locate scripts/mcp-task-runner/server.mjs" >&2
  exit 1
fi

exec node "$EXEC_SCRIPT" "$@"
EOF

chmod +x "$TMP_WRAPPER"

if install -m 0755 "$TMP_WRAPPER" "$TARGET" 2>/dev/null; then
  echo "mcp-task-runner: installed wrapper to $TARGET"
elif sudo -n install -m 0755 "$TMP_WRAPPER" "$TARGET" 2>/dev/null; then
  echo "mcp-task-runner: installed wrapper to $TARGET (sudo)"
else
  echo "mcp-task-runner: $TARGET not writable — skipping install"
fi

rm -f "$TMP_WRAPPER"
