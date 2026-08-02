#!/usr/bin/env bats
# tests/spec/local-llm-proxy/ui-config-seed.bats
# Ticket: T002544 — MCP-Serverliste der llama-WebUI vorbelegen

setup() {
  load '../test_helper.bash'
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
}

@test "Task 8: llama-server liefert ui_settings.mcpServers aus seed" {
  local tmp_dir
  tmp_dir="$(mktemp -d)"
  local seed_path="${tmp_dir}/ui-config.json"
  local port=8199

  # Generate seed using helper script
  BGE_MCP_TOKEN="test-token" node "${REPO_ROOT}/scripts/llm/ui-config-seed.mjs" --output "${seed_path}"

  [ -f "${seed_path}" ]

  # Start short-lived llama-server on CPU with small dummy/test model or --help/mock if binary present
  local bin="${HOME}/opt/llama-current/bin/llama-server"
  if [ ! -x "${bin}" ]; then
    bin="$(which llama-server 2>/dev/null || true)"
  fi

  if [ -z "${bin}" ] || [ ! -x "${bin}" ]; then
    skip "llama-server binary not found at ~/opt/llama-current/bin/llama-server or PATH"
  fi

  # Start llama-server CPU-only without a real heavy model if possible or small model if available
  # We test flags: --ui-config-file ${seed_path} --port ${port} --host 127.0.0.1
  # To avoid GPU VRAM collision, pass -ngl 0
  local model_file
  model_file="$(find ~/models/gguf /mnt/c/Users/PatrickKorczewski/.lmstudio/models -name "*.gguf" 2>/dev/null | head -n 1 || true)"

  if [ -z "${model_file}" ]; then
    skip "No GGUF model file found to launch short-lived llama-server"
  fi

  "${bin}" -m "${model_file}" --port "${port}" --host 127.0.0.1 -ngl 0 -c 512 --ui-config-file "${seed_path}" >/dev/null 2>&1 &
  local server_pid=$!

  # Wait for server to respond on /props or /health
  local healthy=0
  for _ in $(seq 1 40); do
    if curl -sf "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      healthy=1
      break
    fi
    sleep 0.25
  done

  if [ "${healthy}" -eq 0 ]; then
    kill "${server_pid}" 2>/dev/null || true
    rm -rf "${tmp_dir}"
    echo "llama-server failed to start" >&2
    return 1
  fi

  run curl -sf "http://127.0.0.1:${port}/props"
  local props_out="${output}"

  kill "${server_pid}" 2>/dev/null || true
  rm -rf "${tmp_dir}"

  [ "${status}" -eq 0 ]

  # Assertion 1: ui_settings.mcpServers is string containing double-encoded array with expected servers
  local mcp_val
  mcp_val="$(echo "${props_out}" | jq -r '.ui_settings.mcpServers // empty')"
  [ -n "${mcp_val}" ]

  # Parse the stringified JSON array
  run node -e '
    const raw = process.argv[1];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) process.exit(1);
    if (parsed.length !== 8) process.exit(2);
    const k8s = parsed.find(s => s.name === "k8s");
    if (!k8s || k8s.url !== "http://localhost:18082/mcp") process.exit(3);
    const bge = parsed.find(s => s.name === "bge-mcp");
    if (!bge || bge.headers?.Authorization !== "Bearer test-token") process.exit(4);
    // T002552: github-mcp NAMENTLICH, nicht nur ueber die Gesamtzahl. Der
    // Rollback in #3638 nahm genau diesen Eintrag mit; "7 statt 8" liest sich
    // wie ein gewollter Registry-Umbau, "github-mcp fehlt" nicht.
    if (!parsed.find(s => s.name === "github-mcp")) process.exit(5);
  ' "${mcp_val}"

  [ "${status}" -eq 0 ]

  # Assertion 2: cors_proxy_enabled is false
  local cors_proxy
  cors_proxy="$(echo "${props_out}" | jq -r '.cors_proxy_enabled')"
  [ "${cors_proxy}" = "false" ]
}
