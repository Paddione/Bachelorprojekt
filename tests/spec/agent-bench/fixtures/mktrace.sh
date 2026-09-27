#!/usr/bin/env bash
# fixtures/mktrace.sh — haengt eine Recorder-Trace-Zeile an trace.jsonl an.
# Aufruf: mktrace.sh <dir> <rolle> <user-text> <antwort-text> [images-json]
set -euo pipefail
dir="$1"; role="$2"; user="$3"; answer="$4"; images="${5:-[]}"
mkdir -p "$dir"
esc() { node -e "console.log(JSON.stringify(process.argv[1]))" "$1"; }
cat >> "$dir/trace.jsonl" <<EOF
{"ts": "2026-09-27T00:00:00.000Z", "role": "$role", "request": {"messages": [{"role": "user", "content": $(esc "$user")}], "tools": [], "model": "fake", "params": {}}, "response": {"message": {"role": "assistant", "content": $(esc "$answer")}, "finish_reason": "stop", "usage": null}, "ms": 5, "images": $images, "image_count": 0}
EOF
