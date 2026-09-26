#!/usr/bin/env bats

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  WORKDIR="$(mktemp -d)"
  printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6Y5AAAAAASUVORK5CYII=' | base64 -d > "$WORKDIR/shot.png"
  cat > "$WORKDIR/vision.jsonl" <<'EOF'
{"messages":[{"role":"user","content":[{"type":"text","text":"What failed?"},{"type":"image","image":"shot.png"}]},{"role":"assistant","content":[{"type":"text","text":"Inspect the build log."}]}]}
EOF
  printf '{"row_count":1,"tokenizer_source":"transformers"}\n' > "$WORKDIR/report.json"
}

teardown() { rm -rf "$WORKDIR"; }

@test "Qwen3-VL snapshot validates image corpus without loading CUDA" {
  run python3 "$REPO_ROOT/scripts/finetune/train_vision.py" \
    --model unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit \
    --corpus "$WORKDIR/vision.jsonl" --max-seq-length 1024 --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *'1 rows, 1 images'* ]]
}

@test "vision corpus rejects a missing image" {
  sed 's/shot.png/missing.png/' "$WORKDIR/vision.jsonl" > "$WORKDIR/missing.jsonl"
  run python3 "$REPO_ROOT/scripts/finetune/train_vision.py" \
    --model unsloth/Qwen3-VL-4B-Instruct-unsloth-bnb-4bit \
    --corpus "$WORKDIR/missing.jsonl" --max-seq-length 1024 --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *'image not found'* ]]
}

@test "text trainer refuses the local Qwen3-VL snapshot" {
  snapshot="$WORKDIR/snapshot"
  mkdir -p "$snapshot"
  printf '{"model_type":"qwen3_vl"}\n' > "$snapshot/config.json"
  run python3 "$REPO_ROOT/scripts/finetune/train.py" \
    --model "$snapshot" --corpus "$WORKDIR/vision.jsonl" \
    --measure-report "$WORKDIR/report.json" --max-seq-length 1024 --dry-run
  [ "$status" -ne 0 ]
  [[ "$output" == *'train_vision.py'* ]]
}
