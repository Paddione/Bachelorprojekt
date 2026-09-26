#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/finetune/train.py"
  WORKDIR="$(mktemp -d)"
  printf '{"row_count":1,"tokenizer_source":"transformers"}\n' > "$WORKDIR/report.json"
  printf '{"messages":[{"role":"user","content":"x"},{"role":"assistant","content":"y"}]}\n' > "$WORKDIR/data.jsonl"
}

teardown() { rm -rf "$WORKDIR"; }

@test "Qwen3.5 selects 16-bit LoRA without importing the GPU stack" {
  run python3 "$SCRIPT" --corpus "$WORKDIR/data.jsonl" --model Qwen/Qwen3.5-4B \
    --measure-report "$WORKDIR/report.json" --max-seq-length 2048 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *'"precision": "16bit"'* ]]
}

@test "Qwen3.5 BNB base is rejected for the recommended 16-bit mode" {
  run python3 "$SCRIPT" --corpus "$WORKDIR/data.jsonl" --model unsloth/Qwen3.5-4B-bnb-4bit \
    --measure-report "$WORKDIR/report.json" --max-seq-length 2048 --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *'kein 16bit-Basismodell'* ]]
}

@test "Qwen3 BNB remains available for QLoRA" {
  run python3 "$SCRIPT" --corpus "$WORKDIR/data.jsonl" --model unsloth/Qwen3-4B-bnb-4bit \
    --measure-report "$WORKDIR/report.json" --max-seq-length 2048 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *'"precision": "4bit"'* ]]
}

@test "model splitting cannot silently run with DDP" {
  run env WORLD_SIZE=2 python3 "$SCRIPT" --corpus "$WORKDIR/data.jsonl" \
    --model Qwen/Qwen3-4B --measure-report "$WORKDIR/report.json" \
    --gpu-mode balanced --max-seq-length 2048 --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *'nicht mit DDP'* ]]
}

@test "corpus estimator uses 16-bit weights for Qwen3.5" {
  run python3 - "$REPO_ROOT" <<'PY'
import sys
sys.path.insert(0, sys.argv[1] + '/scripts/finetune')
from measure_corpus import _feasibility_matrix
qwen = _feasibility_matrix([2048], 16)['qwen3.5-4b']
assert qwen['precision'] == '16bit'
assert qwen['weight_gb_16bit'] > 9
print(qwen['weight_gb_16bit'])
PY
  [ "$status" -eq 0 ]
}

@test "dry run refuses a heuristic token count before a GPU job" {
  printf '{"row_count":1,"tokenizer_source":"heuristic-4-chars-per-token"}\n' > "$WORKDIR/report.json"
  run python3 "$SCRIPT" --corpus "$WORKDIR/data.jsonl" --model Qwen/Qwen3.5-4B \
    --measure-report "$WORKDIR/report.json" --max-seq-length 2048 --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *'echtem Modell-Tokenizer'* ]]
}
