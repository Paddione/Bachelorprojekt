#!/usr/bin/env bats
# tests/spec/llm-local-dev/glimmer-worker-mcp.bats — T900373
# SSOT: openspec/specs/llm-local-dev.md
#   Requirement: Glimmer Worker MCP for Muse Code
#   Requirement: Windows Paths Are Accepted by the Glimmer Worker
#   Requirement: The Glimmer Worker Is Registered Only in Muse Code
#
# PRUEFMODUS: Output-Verifikation. Der Server wird GESTARTET und per curl
# angesprochen; opencode ist durch einen Stub ersetzt, :1919 durch ein totes
# Ziel. Der Installer laeuft gegen Temp-Settings (--register-only).

setup_file() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  export GW_DIR="$REPO/scripts/glimmer-worker-mcp"
  export T_DIR="$BATS_FILE_TMPDIR"
  export PORT="$(python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])')"
  export TOKEN="test-token"
  mkdir -p "$T_DIR/bin" "$T_DIR/repo" "$T_DIR/nogit"
  cat > "$T_DIR/bin/opencode" <<EOF
#!/usr/bin/env bash
printf '%s\n' "\$@" > "$T_DIR/argv"
dir=""; prev=""
for a in "\$@"; do [ "\$prev" = "--dir" ] && dir="\$a"; prev="\$a"; done
echo edited >> "\$dir/worked.txt"
echo "worker done"
EOF
  chmod +x "$T_DIR/bin/opencode"
  git -C "$T_DIR/repo" init -q
  echo base > "$T_DIR/repo/README"
  git -C "$T_DIR/repo" add README
  git -C "$T_DIR/repo" -c user.email=t@t -c user.name=t commit -qm init
  if [ -f "$GW_DIR/server.mjs" ]; then
    GLIMMER_WORKER_OPENCODE="$T_DIR/bin/opencode" GLIMMER_WORKER_MCP_PORT="$PORT" \
    GLIMMER_WORKER_MCP_TOKEN="$TOKEN" GLIMMER_WORKER_LLAMA_URL="http://127.0.0.1:9" \
      node "$GW_DIR/server.mjs" > "$T_DIR/server.log" 2>&1 &
    echo $! > "$T_DIR/server.pid"
    for _ in $(seq 1 50); do
      curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break
      sleep 0.1
    done
  fi
}

teardown_file() {
  [ -f "$BATS_FILE_TMPDIR/server.pid" ] && kill "$(cat "$BATS_FILE_TMPDIR/server.pid")" 2>/dev/null || true
}

# JSON-RPC-Aufruf; gibt den result-Block aus. $1 = method, $2 = params-JSON
rpc() {
  curl -s "http://127.0.0.1:$PORT/mcp" -H 'content-type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "$(jq -cn --arg m "$1" --argjson p "${2:-{\}}" '{jsonrpc:"2.0",id:1,method:$m,params:$p}')" | jq -c '.result'
}

# Tool-Aufruf; gibt den Text des ersten content-Blocks aus (bzw. isError).
call() {
  rpc tools/call "$(jq -cn --arg n "$1" --argjson a "$2" '{name:$n,arguments:$a}')"
}

@test "health endpoint answers (positive anchor)" {
  run curl -sf "http://127.0.0.1:$PORT/health"
  [ "$status" -eq 0 ]
  [ "$(jq -r .ok <<<"$output")" = "true" ]
}

@test "tools/list requires the bearer token and lists exactly three tools" {
  run curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/mcp" -H 'content-type: application/json' \
    -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
  [ "$output" = "401" ]
  run rpc tools/list
  [ "$(jq -r '[.tools[].name] | sort | join(",")' <<<"$output")" = "glimmer_worker_result,glimmer_worker_start,glimmer_worker_status" ]
}

@test "a job runs glimmer-primary in the repo and reports the diff" {
  run call glimmer_worker_start "$(jq -cn --arg c "$T_DIR/repo" '{task:"fix it",cwd:$c}')"
  [ "$(jq -r '.isError // false' <<<"$output")" = "false" ]
  local job; job="$(jq -r '.content[0].text | fromjson | .job_id' <<<"$output")"
  [ -n "$job" ] && [ "$job" != "null" ]

  run call glimmer_worker_result "$(jq -cn --arg j "$job" '{job_id:$j,wait_s:20}')"
  local res; res="$(jq -r '.content[0].text' <<<"$output")"
  [ "$(jq -r .status <<<"$res")" = "done" ]
  [ "$(jq -r .exit_code <<<"$res")" = "0" ]
  grep -q 'worked.txt' <<<"$(jq -r .git_status <<<"$res")"
  grep -q 'worker done' <<<"$(jq -r .summary <<<"$res")"

  grep -qx -e '--agent' "$T_DIR/argv"
  grep -qx 'glimmer-primary' "$T_DIR/argv"
  grep -qx "$T_DIR/repo" "$T_DIR/argv"
}

@test "a cwd outside a git working tree is refused" {
  run call glimmer_worker_start "$(jq -cn --arg c "$T_DIR/nogit" '{task:"x",cwd:$c}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
}

@test "windows and UNC paths map to WSL paths" {
  run node --input-type=module -e "
    import { toWslPath } from '$GW_DIR/lib.mjs';
    for (const p of ['C:\\\\Users\\\\x\\\\repo', '\\\\\\\\wsl.localhost\\\\k3d-dev\\\\home\\\\x\\\\repo', '/home/x/repo']) console.log(toWslPath(p));
  "
  [ "$status" -eq 0 ]
  [ "${lines[0]}" = "/mnt/c/Users/x/repo" ]
  [ "${lines[1]}" = "/home/x/repo" ]
  [ "${lines[2]}" = "/home/x/repo" ]
}

@test "status reports an unreachable llama server without failing" {
  run call glimmer_worker_status '{}'
  [ "$(jq -r '.isError // false' <<<"$output")" = "false" ]
  [ "$(jq -r '.content[0].text | fromjson | .llama.ok' <<<"$output")" = "false" ]
}

@test "installer registers the worker in muse settings without losing entries" {
  local a="$T_DIR/muse-a.json" b="$T_DIR/muse-b.json"
  echo '{"schema_version":1,"mcpServers":{"factory-mcp-node":{"type":"http","url":"http://localhost:13003/mcp"}}}' > "$a"
  echo '{"schema_version":1,"provider":"meta"}' > "$b"
  mkdir -p "$T_DIR/cfg"; echo "GLIMMER_WORKER_MCP_TOKEN=tok123" > "$T_DIR/cfg/server.env"
  run env GLIMMER_WORKER_MUSE_SETTINGS="$a $b" GLIMMER_WORKER_ENV_FILE="$T_DIR/cfg/server.env" \
    bash "$GW_DIR/install.sh" --register-only
  [ "$status" -eq 0 ]
  for f in "$a" "$b"; do
    [ "$(jq -r '.mcpServers["glimmer-worker"].url' "$f")" = "http://127.0.0.1:13007/mcp" ]
    [ "$(jq -r '.mcpServers["glimmer-worker"].headers.Authorization' "$f")" = "Bearer tok123" ]
    [ -f "$f.bak" ]
  done
  [ "$(jq -r '.mcpServers["factory-mcp-node"].url' "$a")" = "http://localhost:13003/mcp" ]
  [ "$(jq -r '.provider' "$b")" = "meta" ]
  # Das Token erscheint nie in der Ausgabe des Installers.
  [ -z "$(grep -F 'tok123' <<<"$output" || true)" ]
}

@test "the MCP registry does not list the worker" {
  grep -q 'factory-mcp' "$REPO/docs/agent-guide/registry/mcp.yaml"
  [ -z "$(grep -F 'glimmer-worker' "$REPO/docs/agent-guide/registry/mcp.yaml" || true)" ]
}
