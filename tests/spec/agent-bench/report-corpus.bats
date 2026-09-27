# tests/spec/agent-bench/report-corpus.bats — Report, Gate, Korpus (p6).
# Szenarien: Infrastructure error is not blamed on the model · Mixed
# combination is highlighted · Regression fails the gate · Mismatched scoring
# version is refused · Eval cases never reach the corpus · Trajectory with a
# detour is not exported as ideal.

setup() {
  source "$BATS_TEST_DIRNAME/fixtures/helpers.bash"
  T="$(mktemp -d "$BATS_TMPDIR/report-XXXXXX")"
  mkdir -p "$T/runs"
  export AGENT_BENCH_RUNS="$T/runs"
}

teardown() {
  rm -rf "$T"
}

mkmanifest() {
  local dir="$1" id="$2" version="$3" cases="$4"
  mkdir -p "$dir"
  cat > "$dir/manifest.json" <<EOF
{"run_id": "$id", "revision": "abc123", "scoring_version": $version, "profile": "quick", "seed": 7, "sampled": false, "repetitions": 1, "command": "node scripts/llm/agent-bench/bench.mjs run --profile quick", "servers": [{"id": "m-a", "engine": "api", "command": "fake"}], "cases": $cases}
EOF
}

@test "Infrastructure error is not blamed on the model" {
  local r="$T/runs/run-infra"
  mkmanifest "$r" run-infra 1 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  "$FIX/mkresult.sh" "$r/runs/f1__v1__code-worker__m-a__0" f1 v1 code-worker m-a 0 eval 80
  "$FIX/mkresult.sh" "$r/runs/f1__v1__code-worker__m-b__0" f1 v1 code-worker m-b 0 eval 0 0 0 0 "server crashed during run"
  run node "$BENCH" report run-infra
  [ "$status" -eq 0 ]
  # Positiv-Anker: der bewertete Lauf steht im Marginal, der Infra-Fehler separat.
  echo "$output" | grep -q 'server crashed during run'
  echo "$output" | grep -q '| code-worker | m-a | 80.0 |'
  marginal="$(echo "$output" | awk '/## Marginal/,/## Kompatibilitaet/')"
  if echo "$marginal" | grep -q '| code-worker | m-b |'; then infra_mean=1; else infra_mean=0; fi
  [ "$infra_mean" = "0" ]
}

@test "Mixed combination is highlighted" {
  local r="$T/runs/run-mixed"
  mkmanifest "$r" run-mixed 1 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  "$FIX/mkresult.sh" "$r/runs/f1__v1__planner__m-a__0" f1 v1 planner m-a 0 eval 80
  "$FIX/mkresult.sh" "$r/runs/f1__v1__planner__m-b__0" f1 v1 planner m-b 0 eval 50
  "$FIX/mkresult.sh" "$r/runs/f1__v1__code-worker__m-a__0" f1 v1 code-worker m-a 0 eval 50
  "$FIX/mkresult.sh" "$r/runs/f1__v1__code-worker__m-b__0" f1 v1 code-worker m-b 0 eval 70
  run node "$BENCH" report run-mixed
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'm-a` + `m-b'
}

@test "Regression fails the gate" {
  local b="$T/runs/run-base" n="$T/runs/run-reg"
  mkmanifest "$b" run-base 1 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  mkmanifest "$n" run-reg 1 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  "$FIX/mkresult.sh" "$b/runs/f1__v1__orchestrator__m-a__0" f1 v1 orchestrator m-a 0 eval 80
  "$FIX/mkresult.sh" "$b/runs/f1__v1__orchestrator__m-a__1" f1 v1 orchestrator m-a 1 eval 82
  "$FIX/mkresult.sh" "$b/runs/f1__v1__code-worker__m-a__0" f1 v1 code-worker m-a 0 eval 70
  "$FIX/mkresult.sh" "$n/runs/f1__v1__orchestrator__m-a__0" f1 v1 orchestrator m-a 0 eval 60
  "$FIX/mkresult.sh" "$n/runs/f1__v1__code-worker__m-a__0" f1 v1 code-worker m-a 0 eval 70
  run node "$BENCH" gate run-reg --baseline run-base
  [ "$status" -eq 1 ]
  [[ "$output" == *"orchestrator"* ]]
  # Gegenprobe: kein Einbruch, kein Alarm.
  run node "$BENCH" gate run-base --baseline run-base
  [ "$status" -eq 0 ]
}

@test "Mismatched scoring version is refused" {
  local b="$T/runs/run-base" n="$T/runs/run-v2"
  mkmanifest "$b" run-base 1 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  mkmanifest "$n" run-v2 2 '[{"id": "f1", "split": "eval", "source_ref": "T1", "variants": ["v1"]}]'
  "$FIX/mkresult.sh" "$b/runs/f1__v1__orchestrator__m-a__0" f1 v1 orchestrator m-a 0 eval 80
  "$FIX/mkresult.sh" "$n/runs/f1__v1__orchestrator__m-a__0" f1 v1 orchestrator m-a 0 eval 80
  run node "$BENCH" gate run-v2 --baseline run-base
  [ "$status" -eq 2 ]
  [[ "$output" == *"mismatch"* ]]
}

@test "Eval cases never reach the corpus" {
  local r="$T/runs/run-corpus"
  mkmanifest "$r" run-corpus 1 '[{"id": "f-train", "split": "train", "source_ref": "T1", "variants": ["v1"]}, {"id": "f-eval", "split": "eval", "source_ref": "T2", "variants": ["v1"]}]'
  local good="$r/runs/f-train__v1__code-worker__m-a__0"
  "$FIX/mkresult.sh" "$good" f-train v1 code-worker m-a 0 train 100 1 0 0
  "$FIX/mktrace.sh" "$good" code-worker "tu es" "getan"
  node -e "require('fs').writeFileSync('$good/abc.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
  "$FIX/mktrace.sh" "$good" code-worker "und das Bild" "gesehen" '[{"sha256": "abc", "mime": "image/png", "file": "abc.png"}]'
  local bad="$r/runs/f-train__v1__code-worker__m-a__1"
  "$FIX/mkresult.sh" "$bad" f-train v1 code-worker m-a 1 train 20 0.2 0 0
  "$FIX/mktrace.sh" "$bad" code-worker "tu es" "versagt"
  local evil="$r/runs/f-eval__v1__code-worker__m-a__0"
  "$FIX/mkresult.sh" "$evil" f-eval v1 code-worker m-a 0 eval 100 1 0 0
  "$FIX/mktrace.sh" "$evil" code-worker "tu es" "getan-eval"
  run node "$BENCH" export-corpus run-corpus --out "$T/corpus"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'sft=1'
  echo "$output" | grep -q 'preferences=1'
  # Positiv-Anker: die Train-Trajektorie ist drin, mit Bild im Korpus.
  grep -q 'f-train' "$T/corpus/sft.jsonl"
  [ -f "$T/corpus/images/abc.png" ]
  if grep -q 'f-eval' "$T/corpus/sft.jsonl" "$T/corpus/preferences.jsonl"; then
    leaked=1
  else
    leaked=0
  fi
  [ "$leaked" = "0" ]
}

@test "Trajectory with a detour is not exported as ideal" {
  local r="$T/runs/run-gaps"
  mkmanifest "$r" run-gaps 1 '[{"id": "f-train", "split": "train", "source_ref": "T1", "variants": ["v1"]}]'
  local d="$r/runs/f-train__v1__reviewer__m-a__0"
  "$FIX/mkresult.sh" "$d" f-train v1 reviewer m-a 0 train 92 1 0 1
  "$FIX/mktrace.sh" "$d" reviewer "pruefe" "ok"
  run node "$BENCH" export-corpus run-gaps --out "$T/corpus2"
  [ "$status" -eq 0 ]
  # Positiv-Anker: die Luecke ist namentlich verzeichnet ...
  grep -q 'reviewer' "$T/corpus2/gaps.json"
  grep -q 'f-train' "$T/corpus2/gaps.json"
  # ... und die SFT-Datei bleibt leer.
  [ ! -s "$T/corpus2/sft.jsonl" ]
}
