#!/usr/bin/env bats
# model-registry.bats — T002629
# Prüfmodus: Output-Verifikation (Command output/Exit-Code), siehe CLAUDE.md
# T002448-M4. Die DB wird per MODEL_REGISTRY_DB_URL auf ein Fake-psql auf PATH
# umgeleitet (kein kubectl, keine echte DB), die llama.cpp-Inferenz auf einen
# lokalen Stub-HTTP-Server (kein GPU, kein echtes Modell). [T002629]

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  CLI="$REPO_ROOT/scripts/finetune/model-registry.sh"
  TMPD="$(mktemp -d)"

  # --- 1. Fake-psql: protokolliert alle Statements, antwortet auf -t -A-Calls ---
  cat > "$TMPD/psql" <<EOF
#!/bin/bash
LOG_FILE="$TMPD/psql-calls.log"
echo "\$*" >> "\$LOG_FILE"
# SQL kommt seit T004445 ueber stdin (psql :'var' ersetzt nur bei stdin/-f)
STDIN_SQL="\$(cat)"
[ -n "\$STDIN_SQL" ] && echo "\$STDIN_SQL" >> "\$LOG_FILE"

TA=""
CMD=""
for arg in "\$@" "\$STDIN_SQL"; do
  [ "\$arg" = "-t" ] && TA="\$TA-t"
  [ "\$arg" = "-A" ] && TA="\$TA-A"
done
for arg in "\$@" "\$STDIN_SQL"; do
  case "\$arg" in
    *insert_adapter*) CMD="insert_adapter" ;;
    *get_adapter*)    CMD="get_adapter" ;;
    *list_adapters*)  CMD="list_adapters" ;;
    *upsert_eval_score*) CMD="upsert_eval_score" ;;
    *upsert_stat_requirements*) CMD="upsert_stat_requirements" ;;
    *upsert_provenance*) CMD="upsert_provenance" ;;
  esac
done

case "\$CMD" in
  insert_adapter)
    echo "\${FAKE_ADAPTER_ID:-42}"
    ;;
  get_adapter)
    echo "\$FAKE_GET_ADAPTER_LINE"
    ;;
  list_adapters)
    if [ "\$TA" = "-t-A" ]; then :; else
      printf 'name|base_model|quantization|role|score|vram_mb|max_context\nadapter1|model1|Q8|scout|0.9|1000|32768\n'
    fi
    ;;
  upsert_*)
    : # void — nur protokollieren
    ;;
esac
exit 0
EOF
  chmod +x "$TMPD/psql"

  # --- 2. Stub-llama.cpp-Server: leere Completion => "keine Aktion" ---
  cat > "$TMPD/mock_llm.py" <<'PY'
import http.server, json
class H(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        out = json.dumps({"choices": [{"text": "", "finish_reason": "stop"}]}).encode()
        self.send_response(200); self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out))); self.end_headers()
        self.wfile.write(out)
    def log_message(self, *a): pass
http.server.HTTPServer(("127.0.0.1", 18778), H).serve_forever()
PY
  python3 "$TMPD/mock_llm.py" &
  STUB_PID=$!
  for _ in $(seq 1 50); do
    python3 -c "import socket; socket.create_connection(('127.0.0.1',18778),0.2).close()" 2>/dev/null && break
    sleep 0.1
  done

  export PATH="$TMPD:$PATH"
  export MODEL_REGISTRY_DB_URL="postgres://fake:fake@localhost:5432/website"
  export FAKE_ADAPTER_ID=42
}

teardown() {
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  rm -rf "$TMPD"
}

@test "help zeigt Usage, Exit 0" {
  run bash "$CLI" --help
  [ "$status" -eq 0 ]
  [[ "$output" == *"Usage:"* ]]
}

@test "ohne Argumente Exit 1" {
  run bash "$CLI"
  [ "$status" -eq 1 ]
}

@test "register ruft insert_adapter mit name/base_model/quant auf" {
  export FAKE_ADAPTER_ID=7
  run bash "$CLI" register my-adapter gemma-4-9b-it --quant Q8_0
  [ "$status" -eq 0 ]
  grep -q "insert_adapter" "$TMPD/psql-calls.log"
  # Werte als psql-Variablen (injection-sicher, T004445)
  grep -q "name=my-adapter" "$TMPD/psql-calls.log"
  grep -q "base_model=gemma-4-9b-it" "$TMPD/psql-calls.log"
  grep -q "quant=Q8_0" "$TMPD/psql-calls.log"
}

@test "register mit Provenienz ruft upsert_provenance auf" {
  export FAKE_ADAPTER_ID=7
  run bash "$CLI" register my-adapter gemma-4-9b-it --corpus "wiki" --lora-rank 16 --lora-alpha 32 --git-commit "abc1234"
  [ "$status" -eq 0 ]
  grep -q "upsert_provenance" "$TMPD/psql-calls.log"
  grep -q "corpus=wiki" "$TMPD/psql-calls.log"
  grep -q "rank=16" "$TMPD/psql-calls.log"
  grep -q "alpha=32" "$TMPD/psql-calls.log"
  grep -q "git_commit=abc1234" "$TMPD/psql-calls.log"
}

@test "eval ohne --dry-run: Score landet in upsert_eval_score-Aufruf" {
  run bash "$CLI" eval my-adapter scout --endpoint http://127.0.0.1:18778/v1
  [ "$status" -eq 0 ]
  grep -q "upsert_eval_score" "$TMPD/psql-calls.log"
  grep -q "0.54" "$TMPD/psql-calls.log"
  [[ "$output" == *'"dry_run": false'* ]]
}

@test "eval mit --dry-run macht KEINE DB-Calls" {
  run bash "$CLI" eval my-adapter scout --dry-run --endpoint http://127.0.0.1:18778/v1
  [ "$status" -eq 0 ]
  [ ! -s "$TMPD/psql-calls.log" ] || ! grep -q "insert_adapter\|upsert_eval_score" "$TMPD/psql-calls.log"
}

@test "eval Exit 2 wenn Endpunkt down (stderr) und kein DB-Call" {
  run bash "$CLI" eval my-adapter scout --endpoint http://127.0.0.1:19999/v1 2>&1
  [ "$status" -eq 2 ]
  [[ "$output" == *"nicht erreichbar"* ]]
  [ ! -s "$TMPD/psql-calls.log" ] || ! grep -q "insert_adapter\|upsert_eval_score" "$TMPD/psql-calls.log"
}

@test "stats --dry-run --json liefert JSON mit adapter-Feld (kein Netzwerk)" {
  run bash "$CLI" stats my-adapter --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *'"adapter": "my-adapter"'* ]]
  [[ "$output" == *'"throughput_toks": null'* ]]
}

@test "list ruft list_adapters mit role/min-score auf" {
  run bash "$CLI" list --role scout --min-score 0.7
  [ "$status" -eq 0 ]
  grep -q "list_adapters" "$TMPD/psql-calls.log"
  grep -q "role=scout" "$TMPD/psql-calls.log"
  grep -q "min_score=0.7" "$TMPD/psql-calls.log"
  [[ "$output" == *"name"* ]]
}

@test "export-loadout: unbekannter Adapter Exit 1" {
  export FAKE_GET_ADAPTER_LINE=""
  run bash "$CLI" export-loadout unknown-adapter 2>&1
  [ "$status" -eq 1 ]
  [[ "$output" == *"not found"* ]]
}

@test "export-loadout mit Daten liefert JSON-Block" {
  export FAKE_GET_ADAPTER_LINE="5|my-adapter|gemma-4-9b-it|Q8_0|8192|32768|42.5|3500|0.85|scout"
  run bash "$CLI" export-loadout my-adapter
  [ "$status" -eq 0 ]
  [[ "$output" == *'"slug": "my-adapter"'* ]]
  [[ "$output" == *'"minCtx": 32768'* ]]
}

@test "eval-runner validiert das Testset (zu kurz -> Exit 1)" {
  short="$TMPD/short.jsonl"
  head -n 10 "$REPO_ROOT/scripts/finetune/testsets/agent-actions.jsonl" > "$short"
  run bash "$CLI" eval my-adapter scout --testset "$short" --dry-run --endpoint http://127.0.0.1:18778/v1
  [ "$status" -eq 1 ]
}
