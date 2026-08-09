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
  # T002872: deterministische Modellwahl ueber den Helper (kleinste GGUF, ohne
  # mmproj-/draft-Nebendateien) statt `find … | head -n1` — vorher hing die
  # Ladezeit und damit der Health-Wait-Erfolg vom Dateisystem-Cache-Zustand ab
  # (teils zufaellig ein 12B-Modell). Das feste 10s-Budget war Testfragilitaet,
  # kein Konfig-Drift (G-LLM03 widerlegt). Root-Cause-Analyse:
  # openspec/changes/llm-proxy-bats-local-red/design.md
  local model_file helper
  helper="${REPO_ROOT}/tests/spec/local-llm-proxy/lib/pick-small-model.sh"
  # shellcheck source=/dev/null
  source "${helper}"
  if ! model_file="$(pick_small_test_model ~/models/gguf /mnt/c/Users/PatrickKorczewski/.lmstudio/models)"; then
    skip "No GGUF model file found to launch short-lived llama-server"
  fi

  "${bin}" -m "${model_file}" --port "${port}" --host 127.0.0.1 -ngl 0 -c 512 --ui-config-file "${seed_path}" >/dev/null 2>&1 &
  local server_pid=$!

  # Wait for server to respond on /props or /health.
  # T002872: Das Wartebudget skaliert mit der Modellgroesse — grosse Modelle
  # brauchen mehr Zeit als die alten fixen 40 Loops (10s), kleine laden schneller:
  # loops = 40 + (size_mib / 200), gedeckelt auf 240 (60s bei 0.25s-Intervall).
  local size_bytes size_mib loops healthy=0
  if command -v stat >/dev/null 2>&1 && stat --version >/dev/null 2>&1; then
    size_bytes="$(stat -c%s "${model_file}" 2>/dev/null || true)"
  else
    size_bytes="$(wc -c < "${model_file}" 2>/dev/null || true)"
  fi
  size_mib=$(( (size_bytes + 1048575) / 1048576 ))
  loops=$(( 40 + size_mib / 200 ))
  [[ ${loops} -gt 240 ]] && loops=240
  for _ in $(seq 1 "${loops}"); do
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
    if (parsed.length < 8) process.exit(2);
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
