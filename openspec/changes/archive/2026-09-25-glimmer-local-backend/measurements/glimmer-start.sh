#!/usr/bin/env bash
# Startet Glimmer IQ3_XXS + DFlash2-Drafter auf PORT (Messwerkzeug, T900365).
# Nutzung: glimmer-start.sh <port> <ctx> <ctk> <n_max> [extra...]   (n_max 0 = ohne Drafter)
# DEVD=CUDA1 (Drafter auf der 3060 Ti) bricht beim Laden ab: DFlash2 teilt
# output.weight des Targets ("pre-allocated tensor (output.weight) in a buffer
# (CUDA0) that cannot run the operation"). Default ist deshalb CUDA0 fuer beide.
PORT="$1"; CTX="$2"; CTK="$3"; NMAX="$4"; shift 4
BIN="$HOME/opt/llama.cpp-e85e15c/build/bin/llama-server"
M="$HOME/models/Muse-Glimmer-30B"
export CUDA_DEVICE_ORDER=PCI_BUS_ID
export CUDA_VISIBLE_DEVICES=GPU-7dc4bd81-3a8d-c414-1751-f74dee8882f4,GPU-6b9ac882-e9e9-a364-4423-92d838536b86
pkill -f "llama-server.*--port $PORT" 2>/dev/null; sleep 2
if [ "$NMAX" = "0" ]; then
  SPEC=(-dev "${DEV:-CUDA0}" -ngl 999)
else
  SPEC=(-md "$M/Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf" --spec-type draft-dflash --spec-draft-n-max "$NMAX"
        -dev "${DEV:-CUDA0}" -devd "${DEVD:-CUDA0}" -ngl 999 -ngld all)
fi
nohup "$BIN" \
  -m "$M/Muse-Glimmer-30B-UD-IQ3_XXS.gguf" \
  "${SPEC[@]}" \
  -c "$CTX" -fit off -fa on -ctk "$CTK" -ctv "$CTK" \
  -np 1 --jinja --alias Muse-Glimmer-30B \
  --temp 1.0 --top-p 0.95 --top-k 64 \
  --host 127.0.0.1 --port "$PORT" "$@" \
  > "/tmp/glimmer-$PORT.log" 2>&1 &
echo "PID $!"
