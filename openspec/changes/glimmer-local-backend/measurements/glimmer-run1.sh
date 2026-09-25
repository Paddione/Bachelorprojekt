#!/usr/bin/env bash
# Startet Glimmer mit Parametern und zeigt Lade-Diagnose.
# Nutzung: glimmer-run1.sh <port> <ctx> <ctk> <nmax> [extra...]
PORT="$1"
sed -i 's/\r$//' /tmp/glimmer-*.sh; chmod +x /tmp/glimmer-*.sh
/tmp/glimmer-start.sh "$@"
for i in $(seq 1 80); do
  curl -sf "http://127.0.0.1:$PORT/health" >/dev/null && { echo "healthy after $((i*3))s"; break; }
  pgrep -f "llama-server.*--port $PORT" >/dev/null || { echo "PROCESS DIED"; break; }
  sleep 3
done
grep -iE "error|fail|dflash|n_ctx|model buffer size|KV buffer|compute buffer|draft" "/tmp/glimmer-$PORT.log" | grep -v "^main: *$" | head -40
tail -3 "/tmp/glimmer-$PORT.log"
nvidia-smi --query-gpu=name,memory.used --format=csv,noheader
