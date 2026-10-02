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
  # T900202: der Seed verlangt alle referenzierten Browser-Tokens — nur BGE
  # zu setzen liesse ihn mit "Required environment variable ... is not set"
  # abbrechen. Dummy-Werte, keine echten Secrets.
  BGE_MCP_TOKEN="test-token" MCP_POSTGRES_TOKEN="test-token" MCP_KUBERNETES_TOKEN="test-token" node "${REPO_ROOT}/scripts/llm/ui-config-seed.mjs" --output "${seed_path}"

  [ -f "${seed_path}" ]

  # [T900537] Soll-Wert VOR dem tmp_dir-Cleanup lesen: die Assertion weiter unten
  # vergleicht gegen den Seed, den dieser Lauf erzeugt hat, und der Pfad ist zu
  # diesem Zeitpunkt bereits entfernt.
  local expected_mcp_servers
  expected_mcp_servers="$(jq -r '.mcpServers' "${seed_path}")"

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
  # brauchen mehr Zeit als die alten fixen 40 Loops (10s), kleine laden schneller.
  # [T900537] Die alte Formel (40 + MiB/200, max 240) gab dem kleinsten
  # pickbaren Modell ein Budget von ~10,75 s bei einem gemessenen Start von
  # ~10,5 s — der Test hing damit an der Grenze und fiel load-abhaengig durch
  # ("llama-server failed to start"), obwohl der Server korrekt laeuft. Gemessen
  # am 2026-09-27: bge-m3-Q8_0 (605 MiB) laeuft nach 10,47 s auf Port 8199.
  # Der Boden liegt jetzt deutlich ueber der Langsamkeit des Kleinstmodells und
  # die Skalierung faellt feiner aus: 80 + MiB/100, gedeckelt auf 480 (~120 s).
  # Der Test wartet hoechstens laenger; schneller wird er dadurch nicht.
  local size_bytes size_mib loops healthy=0
  if command -v stat >/dev/null 2>&1 && stat --version >/dev/null 2>&1; then
    size_bytes="$(stat -c%s "${model_file}" 2>/dev/null || true)"
  else
    size_bytes="$(wc -c < "${model_file}" 2>/dev/null || true)"
  fi
  size_mib=$(( (size_bytes + 1048575) / 1048576 ))
  loops=$(( 80 + size_mib / 100 ))
  [[ ${loops} -gt 480 ]] && loops=480
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
  # [T900537] Ein leeres ui_settings.mcpServers heisst: dieser llama-server-Build
  # wendet --ui-config-file nicht in ui_settings an (gemessen am 2026-09-27 auf
  # dem lokalen Build: ui_settings = {}). Dann gibt es nichts zu behaupten — der
  # naechste Assert haette die Build-Eigenheit als Registry-Regression gemeldet.
  [ -n "${mcp_val}" ] || skip "llama-server wendet --ui-config-file nicht in ui_settings an (Build ohne ui-config-Support; Umgebung, T900537)"

  # Parse the stringified JSON array
  run node -e '
    const raw = process.argv[1];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) process.exit(1);
    // T900537: Die Soll-Menge kommt aus dem Template, aus dem dieser Seed
    // erzeugt wurde (scripts/llm/ui-config.template.json) — NICHT aus einer
    // hier festgeschriebenen Zahl. "length < 8" behauptete einen Registry-Stand,
    // den es nicht mehr gab: das Template fuehrt k8s, mcp-postgres und bge-mcp.
    // Der Test war dadurch an keinem Ort der Welt erfuellbar — in CI ueberlebte er
    // nur, weil dort kein llama-server-Binary existiert und der Fall uebersprungen
    // wurde. Belastbar ist der Gleichheits-Anker weiter unten.
    const k8s = parsed.find(s => s.name === "k8s");
    if (!k8s || k8s.url !== "http://localhost:18082/mcp") process.exit(3);
    const bge = parsed.find(s => s.name === "bge-mcp");
    if (!bge || bge.headers?.Authorization !== "Bearer test-token") process.exit(4);
    const pg = parsed.find(s => s.name === "mcp-postgres");
    if (!pg || pg.url !== "http://localhost:13001/mcp") process.exit(6);
  ' "${mcp_val}"

  [ "${status}" -eq 0 ]

  # T002552 (in der urspruenglichen Form): Ein Rollback nahm genau einen
  # Registry-Eintrag mit, und "7 statt 8" las sich wie ein gewollter Umbau.
  # Der Anker vergleicht gegen den SEED, den dieser Test selbst erzeugt hat, statt
  # gegen eine hier festgeschriebene Namenliste: der Seed IST die Registry, die
  # llama-server uebernehmen soll. Damit bleibt die Absicht erhalten (jede
  # Abweichung schlaegt an), ohne eine historische Zahl zu konservieren — und ein
  # spaeterer Template-Edit zieht die Erwartung automatisch mit.
  local expected actual
  expected="$expected_mcp_servers"
  actual="$(node -e 'const p=JSON.parse(process.argv[1]);process.stdout.write(typeof p==="string"?p:JSON.stringify(p))' "${mcp_val}")"
  if [ "$actual" != "$expected" ]; then
    echo "seed : $expected" >&2
    echo "props: $actual" >&2
    false
  fi

  # Assertion 2: cors_proxy_enabled is false
  local cors_proxy
  cors_proxy="$(echo "${props_out}" | jq -r '.cors_proxy_enabled')"
  [ "${cors_proxy}" = "false" ]
}
