# fixtures/helpers.bash — gemeinsame Helfer fuer tests/spec/agent-bench/*.bats.
# Einbinden per: source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
# Pruefmodus aller Tests: Output-Verifikation (Exit-Codes, stdout, Dateien).

REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
# Absolut: Rollen spawnen Fakes mit cwd=Workdir, relative Pfade liefen ins Leere.
FIX="$(cd "$BATS_TEST_DIRNAME/fixtures" && pwd)"
BENCH="$REPO/scripts/llm/agent-bench/bench.mjs"
LIB="$REPO/scripts/llm/agent-bench/lib"
BATS_TMPDIR="${BATS_TMPDIR:-/tmp}"

# Startet den Fake-OpenAI-Server; setzt FAKE_URL + FAKE_PID.
# $1 = Script-JSON (optional), $2 = Logdatei (optional).
start_fake() {
  local script="${1:-}" logf="${2:-}"
  local portfile="$BATS_TMPDIR/fake-$BASHPID-$RANDOM.port"
  FAKE_OPENAI_SCRIPT="$script" FAKE_OPENAI_LOG="$logf" \
    node "$FIX/fake-openai.mjs" > "$portfile" 2>&1 &
  FAKE_PID=$!
  for _ in $(seq 1 100); do
    if grep -q 'FAKE-OPENAI-PORT=' "$portfile" 2>/dev/null; then break; fi
    sleep 0.05
  done
  local port
  port="$(grep -o 'FAKE-OPENAI-PORT=[0-9]*' "$portfile" | cut -d= -f2)"
  if [ -z "$port" ]; then
    echo "fake-openai startete nicht: $(cat "$portfile")" >&2
    return 1
  fi
  FAKE_URL="http://127.0.0.1:$port"
}

stop_fake() {
  if [ -n "${FAKE_PID:-}" ]; then kill "$FAKE_PID" 2>/dev/null || true; fi
  unset FAKE_PID FAKE_URL
}

# Legt AKTEN (gueltige Faelle) unter $1 an: tiny-eval + tiny-train.
mkcases_ok() {
  mkdir -p "$1"
  cp -r "$FIX/cases/tiny-eval" "$FIX/cases/tiny-train" "$1/"
}

# Standard-Bench-Env fuer `run`: Fakes statt GPU/opencode.
# $1 = RUNS-Verzeichnis, $2 = CASES-Verzeichnis. Setzt globals fuer `run`.
bench_env() {
  export AGENT_BENCH_RUNS="$1"
  export AGENT_BENCH_CASES="$2"
  export AGENT_BENCH_MODELS="$FIX/pool.json"
  export AGENT_BENCH_GPU_LOCK="$FIX/fake-bin/gpu-lock.sh"
  export AGENT_BENCH_OPENCODE="$FIX/fake-opencode.sh"
  export AGENT_BENCH_TEACHER_URL="${FAKE_URL:-http://127.0.0.1:1}"
  export FAKE_BIN_LOG="$1/bin.log"
  export FAKE_OPENCODE_LOG="$1/opencode.log"
  : > "$FAKE_BIN_LOG" 2>/dev/null || true
  : > "$FAKE_OPENCODE_LOG" 2>/dev/null || true
}

# JSON-Auszug ohne jq-Pflicht: node -e '...' ueber stdin-Datei.
json_get() {
  node -e "const fs=require('fs');const d=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));console.log(process.argv.slice(2).reduce((o,k)=>o[k],d));" "$@"
}
