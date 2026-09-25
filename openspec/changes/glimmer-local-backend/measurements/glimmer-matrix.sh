#!/usr/bin/env bash
# Laeuft die Varianten nacheinander durch: <ctk> <nmax>  (nmax 0 = ohne Drafter)
set -u
run() {
  local ctk="$1" nmax="$2"
  local label="solo-${ctk}kv-n${nmax}-${3:-a}"
  echo "######## $label"
  bash /tmp/glimmer-run1.sh 1920 131072 "$ctk" "$nmax" | grep -E "healthy|DIED|MiB"
  bash /tmp/glimmer-bench.sh 1920 "$label" | grep -E "pred_tps|finish|MiB, "
}
for v in ${MATRIX:-"q8_0 0" "q8_0 6" "q8_0 4 b"}; do run $v; done
