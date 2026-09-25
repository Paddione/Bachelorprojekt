#!/usr/bin/env bats
# tests/spec/llm-local-dev/comfy-image-mcp.bats — T900379
# SSOT: openspec/specs/llm-local-dev.md
#   Requirement: Image Generation MCP for Muse Code
#   Requirement: Image Output Is Confined to Git Working Trees
#   Requirement: ComfyUI Runs Only While Images Are Requested
#   Requirement: Generated Images Can Be Cut Out and Pixelated
#   Requirement: The Image MCP Is Registered Only in Muse Code
#
# PRUEFMODUS: Output-Verifikation. Der Server wird GESTARTET und per curl
# angesprochen; ComfyUI ist durch fake-comfyui.py ersetzt, systemctl durch
# einen Stub, der den Fake startet/stoppt und jeden Aufruf protokolliert.

setup_file() {
  export REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  export CI_DIR="$REPO/scripts/comfy-image-mcp"
  export T_DIR="$BATS_FILE_TMPDIR"
  free_port() { python3 -c 'import socket;s=socket.socket();s.bind(("127.0.0.1",0));print(s.getsockname()[1])'; }
  export PORT="$(free_port)"
  export FAKE_PORT="$(free_port)"
  export TOKEN="test-token"
  export FAKE_COMFY_DIR="$T_DIR"
  mkdir -p "$T_DIR/bin" "$T_DIR/repo/assets" "$T_DIR/nogit"
  cat > "$T_DIR/bin/systemctl" <<EOF
#!/usr/bin/env bash
echo "\$*" >> "$T_DIR/systemctl.log"
case "\$*" in
  "--user start comfyui")
    FAKE_COMFY_DIR="$T_DIR" nohup python3 "$BATS_TEST_DIRNAME/fake-comfyui.py" "$FAKE_PORT" >/dev/null 2>&1 &
    echo \$! > "$T_DIR/fake.pid" ;;
  "--user stop comfyui")
    [ -f "$T_DIR/fake.pid" ] && kill "\$(cat "$T_DIR/fake.pid")" 2>/dev/null; rm -f "$T_DIR/fake.pid" ;;
esac
exit 0
EOF
  chmod +x "$T_DIR/bin/systemctl"
  : > "$T_DIR/systemctl.log"
  echo base > "$T_DIR/repo/README"
  git -C "$T_DIR/repo" init -q
  git -C "$T_DIR/repo" add README
  git -C "$T_DIR/repo" -c user.email=t@t -c user.name=t commit -qm init
  if [ -f "$CI_DIR/server.mjs" ]; then
    COMFY_IMAGE_MCP_PORT="$PORT" COMFY_IMAGE_MCP_TOKEN="$TOKEN" \
    COMFY_IMAGE_URL="http://127.0.0.1:$FAKE_PORT" COMFY_IMAGE_SYSTEMCTL="$T_DIR/bin/systemctl" \
    COMFY_IMAGE_PYTHON="${COMFY_IMAGE_TEST_PYTHON:-python3}" COMFY_IMAGE_IDLE_S=3 COMFY_IMAGE_TIMEOUT_FLOOR_S=1 \
    COMFY_IMAGE_START_TIMEOUT_S=15 \
      node "$CI_DIR/server.mjs" > "$T_DIR/server.log" 2>&1 &
    echo $! > "$T_DIR/server.pid"
    for _ in $(seq 1 50); do
      curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && break
      sleep 0.1
    done
  fi
}

teardown_file() {
  [ -f "$BATS_FILE_TMPDIR/server.pid" ] && kill "$(cat "$BATS_FILE_TMPDIR/server.pid")" 2>/dev/null || true
  [ -f "$BATS_FILE_TMPDIR/fake.pid" ] && kill "$(cat "$BATS_FILE_TMPDIR/fake.pid")" 2>/dev/null || true
}

rpc() {
  curl -s "http://127.0.0.1:$PORT/mcp" -H 'content-type: application/json' \
    -H "Authorization: Bearer $TOKEN" \
    -d "$(jq -cn --arg m "$1" --argjson p "${2:-{\}}" '{jsonrpc:"2.0",id:1,method:$m,params:$p}')" | jq -c '.result'
}

call() {
  rpc tools/call "$(jq -cn --arg n "$1" --argjson a "$2" '{name:$n,arguments:$a}')"
}

# Startet einen Job und gibt das Ergebnis-JSON (Text des content-Blocks) aus.
run_job() {
  local out job
  out="$(call image_generate "$1")"
  job="$(jq -r '.content[0].text | fromjson | .job_id' <<<"$out")"
  [ -n "$job" ] && [ "$job" != "null" ] || { echo "start failed: $out"; return 1; }
  call image_result "$(jq -cn --arg j "$job" '{job_id:$j,wait_s:30}')" | jq -r '.content[0].text'
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
  [ "$(jq -r '[.tools[].name] | sort | join(",")' <<<"$output")" = "image_generate,image_result,image_status" ]
}

@test "output outside a git working tree is refused and nothing is started" {
  run call image_generate "$(jq -cn --arg p "$T_DIR/nogit/x.png" '{prompt:"a fox",out_path:$p}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
  [ -z "$(grep -F 'start' "$T_DIR/systemctl.log" || true)" ]
}

@test "an existing file is not overwritten by default" {
  echo keep > "$T_DIR/repo/assets/keep.png"
  local before; before="$(sha256sum "$T_DIR/repo/assets/keep.png")"
  run call image_generate "$(jq -cn --arg p "$T_DIR/repo/assets/keep.png" '{prompt:"a fox",out_path:$p}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
  [ "$(sha256sum "$T_DIR/repo/assets/keep.png")" = "$before" ]
}

@test "a job starts comfyui and writes the image into the working tree" {
  run run_job "$(jq -cn --arg p "$T_DIR/repo/assets/hero.png" '{prompt:"a red fox",out_path:$p}')"
  [ "$status" -eq 0 ]
  [ "$(jq -r .status <<<"$output")" = "done" ]
  local seed; seed="$(jq -r .seed <<<"$output")"
  [[ "$seed" =~ ^[0-9]+$ ]]
  grep -q 'assets/hero.png' <<<"$(jq -r .git_status <<<"$output")"
  [ "$(head -c 8 "$T_DIR/repo/assets/hero.png" | od -An -tx1 | tr -d ' \n')" = "89504e470d0a1a0a" ]
  grep -qx -- '--user start comfyui' "$T_DIR/systemctl.log"
  grep -q 'a red fox' "$T_DIR/last_prompt.json"
  grep -q "\"seed\": *$seed" "$T_DIR/last_prompt.json"
}

@test "a UNC out_path resolves to the WSL working tree" {
  local unc="\\\\wsl.localhost\\distro${T_DIR//\//\\}\\repo\\assets\\unc.png"
  run run_job "$(jq -cn --arg p "$unc" '{prompt:"a tree",out_path:$p}')"
  [ "$(jq -r .status <<<"$output")" = "done" ]
  [ -f "$T_DIR/repo/assets/unc.png" ]
}

@test "a prompt rejected by comfyui fails the job with the node error" {
  run run_job "$(jq -cn --arg p "$T_DIR/repo/assets/bad.png" '{prompt:"FAIL_PROMPT",out_path:$p}')"
  [ "$(jq -r .status <<<"$output")" = "failed" ]
  grep -q 'bad node' <<<"$(jq -r .error <<<"$output")"
}

@test "transparent + pixelate keeps the raw image and hints the white background" {
  "${COMFY_IMAGE_TEST_PYTHON:-python3}" -c 'import PIL' 2>/dev/null || skip "Pillow not installed"
  "${COMFY_IMAGE_TEST_PYTHON:-python3}" -c 'import rembg' 2>/dev/null || skip "rembg not installed"
  run run_job "$(jq -cn --arg p "$T_DIR/repo/assets/sprite.png" \
    '{prompt:"a knight",out_path:$p,transparent:true,pixelate:{size:16,colors:4}}')"
  [ "$(jq -r .status <<<"$output")" = "done" ]
  [ -f "$T_DIR/repo/assets/sprite.raw.png" ]
  [ -f "$T_DIR/repo/assets/sprite.png" ]
  grep -q 'plain white background' "$T_DIR/last_prompt.json"
}

@test "a second job for the same out_path is refused while the first runs" {
  local p="$T_DIR/repo/assets/dup.png"
  run call image_generate "$(jq -cn --arg p "$p" '{prompt:"SLOW_PROMPT castle",out_path:$p}')"
  local job; job="$(jq -r '.content[0].text | fromjson | .job_id' <<<"$output")"
  [ -n "$job" ] && [ "$job" != "null" ]
  run call image_generate "$(jq -cn --arg p "$p" '{prompt:"another castle",out_path:$p,overwrite:true}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
  grep -q 'already writes' <<<"$(jq -r '.content[0].text' <<<"$output")"
  run call image_result "$(jq -cn --arg j "$job" '{job_id:$j,wait_s:30}')"
  [ "$(jq -r '.content[0].text | fromjson | .status' <<<"$output")" = "done" ]
}

@test "an existing raw file and symlinked targets are refused" {
  echo keep > "$T_DIR/repo/assets/tile.raw.png"
  run call image_generate "$(jq -cn --arg p "$T_DIR/repo/assets/tile.png" '{prompt:"a tile",out_path:$p,pixelate:{size:16}}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
  [ "$(cat "$T_DIR/repo/assets/tile.raw.png")" = "keep" ]
  ln -sf "$T_DIR/nogit/target.png" "$T_DIR/repo/assets/link.png"
  run call image_generate "$(jq -cn --arg p "$T_DIR/repo/assets/link.png" '{prompt:"x",out_path:$p,overwrite:true}')"
  [ "$(jq -r '.isError' <<<"$output")" = "true" ]
  [ ! -e "$T_DIR/nogit/target.png" ]
}

@test "an idle server stops comfyui" {
  sleep 5
  grep -qx -- '--user stop comfyui' "$T_DIR/systemctl.log"
  run call image_status '{}'
  [ "$(jq -r '.content[0].text | fromjson | .comfy.ok' <<<"$output")" = "false" ]
}

@test "installer registers the image server in muse settings without losing entries" {
  local a="$T_DIR/muse-a.json" b="$T_DIR/muse-b.json"
  echo '{"schema_version":1,"mcpServers":{"glimmer-worker":{"type":"http","url":"http://127.0.0.1:13007/mcp"}}}' > "$a"
  echo '{"schema_version":1,"provider":"meta"}' > "$b"
  mkdir -p "$T_DIR/cfg"; echo "COMFY_IMAGE_MCP_TOKEN=tok456" > "$T_DIR/cfg/server.env"
  run env COMFY_IMAGE_MUSE_SETTINGS="$a $b" COMFY_IMAGE_ENV_FILE="$T_DIR/cfg/server.env" \
    bash "$CI_DIR/install.sh" --register-only
  [ "$status" -eq 0 ]
  for f in "$a" "$b"; do
    [ "$(jq -r '.mcpServers["comfy-image"].url' "$f")" = "http://127.0.0.1:13008/mcp" ]
    [ "$(jq -r '.mcpServers["comfy-image"].headers.Authorization' "$f")" = "Bearer tok456" ]
    [ -f "$f.bak" ]
  done
  [ "$(jq -r '.mcpServers["glimmer-worker"].url' "$a")" = "http://127.0.0.1:13007/mcp" ]
  [ -z "$(grep -F 'tok456' <<<"$output" || true)" ]
}

@test "the MCP registry does not list the image server" {
  grep -q 'factory-mcp' "$REPO/docs/agent-guide/registry/mcp.yaml"
  [ -z "$(grep -F 'comfy-image' "$REPO/docs/agent-guide/registry/mcp.yaml" || true)" ]
}

@test "the comfyui unit is never started at login" {
  grep -q -- '--port 8189' "$CI_DIR/comfyui.service"
  [ -z "$(grep -E '^WantedBy=' "$CI_DIR/comfyui.service" || true)" ]
}
