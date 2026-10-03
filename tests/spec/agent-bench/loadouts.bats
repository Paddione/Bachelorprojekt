# tests/spec/agent-bench/loadouts.bats — GPU-Loadouts (p3): Kernel-Check,
# Spill-Check, Restore nach Abbruch.
# Szenarien: Marlin fallback is refused · Production orchestrator is
# restored after an abort · Spill wird als Infra-Fehler gemeldet.
# Dazu: vllm-kernel-check.py gegen Fake-Serverlogs.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/loadouts-XXXXXX")"
}

@test "Marlin fallback is refused" {
  printf 'vllm serve gestarted\nselected NVFP4 backend: marlin (fallback)\n' > "$T/marlin.log"
  run node --input-type=module -e "
import { checkKernel } from '$LIB/loadouts.mjs';
console.log(JSON.stringify(await checkKernel({ engine: 'vllm', id: 'm' }, { logPath: '$T/marlin.log' })));
"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":false'* ]]
  [[ "$output" == *"marlin"* ]]
  # Gegenprobe: echter FP4-Kernel wird akzeptiert.
  printf 'vllm serve gestartet\nselected NVFP4 backend: flashinfer fp4 kernel ready\n' > "$T/good.log"
  run node --input-type=module -e "
import { checkKernel } from '$LIB/loadouts.mjs';
console.log(JSON.stringify(await checkKernel({ engine: 'vllm', id: 'm' }, { logPath: '$T/good.log' })));
"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":true'* ]]
}

@test "Spill wird als Infra-Fehler gemeldet" {
  cat > "$T/pool.json" <<'EOF'
{"spill_threshold_mib": 15900, "gpu_uuids": {"testgpu": "GPU-aaa"}, "production_services": [], "models": []}
EOF
  export AGENT_BENCH_NVIDIA_SMI="$FIX/fake-bin/nvidia-smi"
  export FAKE_BIN_LOG="$T/bin.log"
  export FAKE_NVIDIA_SMI_OUTPUT="GPU-aaa, 16000"
  run node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { checkSpill } from '$LIB/loadouts.mjs';
const pool = JSON.parse(readFileSync('$T/pool.json', 'utf8'));
console.log(JSON.stringify(await checkSpill(pool, 'testgpu')));
"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":false'* ]]
  [[ "$output" == *'"infra":true'* ]]
  [[ "$output" == *"spill"* ]]
  # Gegenprobe: unter der Grenze ist alles gut.
  export FAKE_NVIDIA_SMI_OUTPUT="GPU-aaa, 1000"
  run node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { checkSpill } from '$LIB/loadouts.mjs';
const pool = JSON.parse(readFileSync('$T/pool.json', 'utf8'));
console.log(JSON.stringify(await checkSpill(pool, 'testgpu')));
"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"ok":true'* ]]
}

@test "Production orchestrator is restored after an abort" {
  export PATH="$FIX/fake-bin:$PATH"
  export FAKE_BIN_LOG="$T/bin.log"
  export FAKE_REAL_CURL="$(command -v curl)"
  export AGENT_BENCH_GPU_LOCK="$FIX/fake-bin/gpu-lock.sh"
  node -e "
const fs = require('fs');
const pool = JSON.parse(fs.readFileSync('$FIX/pool.json', 'utf8'));
pool.production_services = ['qwen38-gsq-iq3xxs.service'];
fs.writeFileSync('$T/pool.json', JSON.stringify(pool));
"
  export POOL_JSON="$T/pool.json"
  : > "$T/bin.log"
  DRIVE_SLEEP_MS=20000 node "$FIX/drive-restore.mjs" > "$T/driver.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 100); do grep -q 'DRIVE-RESTORE-READY' "$T/driver.log" 2>/dev/null && break; sleep 0.05; done
  grep -q 'DRIVE-RESTORE-READY' "$T/driver.log"
  kill -INT "$pid"
  wait "$pid" || true
  grep -q 'start qwen38-gsq-iq3xxs.service' "$T/bin.log"
  grep -q 'gpu-lock release' "$T/bin.log"
}

@test "vllm-kernel-check.py prueft das Serverlog" {
  printf 'boot\nselected NVFP4 backend: cutlass fp4 kernel ready\n' > "$T/good.log"
  run python3 "$REPO/scripts/llm/agent-bench/vllm-kernel-check.py" "$T/good.log" --skip-capability
  [ "$status" -eq 0 ]
  [[ "$output" == *"kernel=cutlass"* ]]
  printf 'boot\nselected NVFP4 backend: marlin fp4 fallback active\n' > "$T/marlin.log"
  run python3 "$REPO/scripts/llm/agent-bench/vllm-kernel-check.py" "$T/marlin.log" --skip-capability
  [ "$status" -eq 1 ]
  run python3 "$REPO/scripts/llm/agent-bench/vllm-kernel-check.py" "$T/fehlt.log" --skip-capability
  [ "$status" -eq 2 ]
  # Geraete-Check nur mit torch; ohne torch wird uebersprungen.
  if python3 -c "import torch" 2>/dev/null; then
    run python3 "$REPO/scripts/llm/agent-bench/vllm-kernel-check.py" "$T/good.log" --expect-capability 0.0
    [ "$status" -eq 1 ]
    [[ "$output" == *"capability-mismatch"* ]]
  else
    skip "torch not installed"
  fi
}
