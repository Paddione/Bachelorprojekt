#!/usr/bin/env bash
# scripts/gpu-lock.sh — GPU-Arbitrierung: acquire | release | status  [T002628]
# acquire: Lock schreiben → auslaufen lassen → stoppen → messen → entscheiden
# release: Lock entfernen | status: Lock-Status + tote-PID-Bereinigung
# Env: GPU_LOCK_FILE GPU_LOCK_PROXY_URL GPU_LOCK_REQUIRED_MIB GPU_LOCK_NVIDIA_SMI
#      GPU_LOCK_DRAIN_TIMEOUT GPU_LOCK_LOADOUTS
set -euo pipefail

LOCK_FILE="${GPU_LOCK_FILE:-/tmp/gpu-training-lock.json}"
PROXY_URL="${GPU_LOCK_PROXY_URL:-http://127.0.0.1:18235}"
REQUIRED_MIB="${GPU_LOCK_REQUIRED_MIB:-}"
NVIDIA_SMI="${GPU_LOCK_NVIDIA_SMI:-nvidia-smi}"
DRAIN_TIMEOUT="${GPU_LOCK_DRAIN_TIMEOUT:-300}"
LOADOUTS_PATH="${GPU_LOCK_LOADOUTS:-scripts/llm/loadouts.json}"

_pid_alive() {
  [ -n "${1:-}" ] || return 1
  # kill -0 prueft Existenz ohne Signal. ESRCH = tot; EPERM = Prozess existiert
  # (gehoert nur nicht uns) → als lebendig werten (fail-closed, T002628). [P1-1]
  local err
  err=$(kill -0 "$1" 2>&1) && return 0
  case "$err" in
    *"No such process"*) return 1 ;;
    *) return 0 ;;
  esac
}

_lock_held() {
  [ -f "$LOCK_FILE" ] || return 1
  local pid
  pid=$(python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('pid',''))" 2>/dev/null) || return 0
  [ -n "$pid" ] && _pid_alive "$pid"
}

_lock_json() {
  local reason="${1:-}" now
  now=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
  python3 - "$LOCK_FILE" "$$" "$now" "$reason" << 'PYEOF'
import json, sys
_, lf, pid, ts, reason = sys.argv
json.dump({"pid":int(pid),"started_at":ts,"reason":reason}, open(lf,'w'))
PYEOF
}

_poll_inflight_zero() {
  local deadline_ts state inflight
  deadline_ts=$(( $(date +%s) + DRAIN_TIMEOUT ))
  echo "[gpu-lock] Warte auf Abschluss laufender Requests (max ${DRAIN_TIMEOUT}s)..."
  while true; do
    [ "$(date +%s)" -ge "$deadline_ts" ] && { echo "[gpu-lock] Auslauf-Deckel erreicht — breche ab." >&2; return 1; }
    state=$(curl -sf "${PROXY_URL}/admin/state" 2>/dev/null) || { echo "[gpu-lock] Proxy nicht erreichbar." >&2; return 1; }
    # Fail-closed bei unparsbarer Antwort: ein unbekannter Zustand ist kein
    # "0 Requests" — abbrechen statt das Auslaufen zu ueberspringen. [P2]
    inflight=$(echo "$state" | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum(b.get('inflight',0) for b in d.get('backends',[]) if b.get('kind')=='llamacpp'))" 2>/dev/null) || { echo "[gpu-lock] /admin/state nicht parsbar — breche ab." >&2; return 1; }
    [ "$inflight" -eq 0 ] && break
    sleep 1
  done
  echo "[gpu-lock] Alle Requests abgeschlossen."
}

_stop_chat_gpu_loadouts() {
  local data slug count=0
  data=$(python3 -c "
import json
try: d=json.load(open('${LOADOUTS_PATH}'))
except: exit(0)
slugs=[l['slug'] for l in d.get('loadouts',[]) if l.get('exclusiveGroup')=='chat-gpu' and l.get('managed')!='external']
print('\n'.join(slugs))
" 2>/dev/null) || data=""
  for slug in $data; do
    [ -z "$slug" ] && continue
    echo "[gpu-lock] Stoppe Loadout $slug..."
    curl -sf -X POST "${PROXY_URL}/admin/loadouts/${slug}/stop" >/dev/null 2>&1 || echo "[gpu-lock] Warnung: Stop $slug fehlgeschlagen" >&2
    count=$((count + 1))
  done
  echo "[gpu-lock] $count Loadout(s) gestoppt."
}

_measure_vram() {
  local cmd_bin="${NVIDIA_SMI%% *}" raw free_mib
  command -v "$cmd_bin" >/dev/null 2>&1 || { echo "[gpu-lock] $cmd_bin nicht verfuegbar." >&2; return 1; }
  raw=$(eval "$NVIDIA_SMI --query-gpu=memory.free --format=csv,noheader,nounits" 2>/dev/null | head -1)
  free_mib=$(echo "$raw" | grep -o '^[0-9]\+' || echo "")
  [ -n "$free_mib" ] || { echo "[gpu-lock] nvidia-smi lieferte keinen Wert." >&2; return 1; }
  echo "$free_mib"
}

_list_gpu_holders() {
  local holders
  holders=$(eval "$NVIDIA_SMI --query-compute-apps=pid,process_name,used_memory --format=csv,noheader" 2>/dev/null) || { echo "  (keine GPU-Prozesse gemeldet)"; return 0; }
  [ -z "$holders" ] && { echo "  (keine GPU-Prozesse gemeldet)"; return 0; }
  while IFS=, read -r pid pname vram; do
    pid=$(echo "$pid" | xargs); pname=$(echo "$pname" | xargs); vram=$(echo "$vram" | xargs)
    echo "  PID $pid  $pname  ${vram} MiB"
  done <<< "$holders"
}

_release_lock() { rm -f "$LOCK_FILE"; }

_lock_info() {
  python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('pid','?'),d.get('reason','?'),d.get('started_at','?'))" 2>/dev/null || echo "? ? ?"
}

# ── Verben ───────────────────────────────────────────────────────────────────

cmd_acquire() {
  local reason="${1:-GPU training run}" free_mib
  [ -n "$REQUIRED_MIB" ] || { echo "FEHLER: GPU_LOCK_REQUIRED_MIB muss gesetzt sein." >&2; exit 3; }
  if _lock_held; then
    echo "FEHLER: GPU-Lock wird bereits gehalten:" >&2
    read -r p r s <<< "$(_lock_info)"
    echo "  PID $p  Grund: $r  seit $s" >&2
    exit 1
  fi
  _lock_json "$reason" && echo "[gpu-lock] Lock geschrieben (PID $$): $reason"
  _poll_inflight_zero || { echo "[gpu-lock] Abbruch — Auslaufen nicht abgeschlossen." >&2; _release_lock; exit 1; }
  _stop_chat_gpu_loadouts
  free_mib=$(_measure_vram) || { echo "[gpu-lock] Abbruch — VRAM-Messung nicht moeglich." >&2; _release_lock; exit 1; }
  echo "[gpu-lock] Freies VRAM: ${free_mib} MiB (benoetigt: ${REQUIRED_MIB} MiB)"
  if [ "$free_mib" -ge "$REQUIRED_MIB" ]; then
    echo "[gpu-lock] Genug VRAM frei — Lock bleibt, Training kann starten."
  else
    echo "[gpu-lock] Nicht genug VRAM (${free_mib} < ${REQUIRED_MIB}). GPU-Halter:" >&2
    _list_gpu_holders >&2
    _release_lock
    exit 1
  fi
}

cmd_release() {
  if [ -f "$LOCK_FILE" ]; then
    read -r pid reason started <<< "$(_lock_info)"
    _release_lock
    echo "[gpu-lock] Lock freigegeben (war PID $pid: $reason, seit $started)."
  else
    echo "[gpu-lock] Kein Lock vorhanden."
  fi
}

cmd_status() {
  if [ ! -f "$LOCK_FILE" ]; then echo "GPU-Lock: kein Lock gehalten — GPU ist frei."; exit 0; fi
  local pid
  pid=$(python3 -c "import json; d=json.load(open('$LOCK_FILE')); print(d.get('pid',''))" 2>/dev/null) || { echo "GPU-Lock: LOCK GEHALTEN — Datei unlesbar (fail-closed)." >&2; exit 0; }
  [ -z "$pid" ] || [ "$pid" = "?" ] && { echo "GPU-Lock: LOCK GEHALTEN — keine gueltige PID (fail-closed)." >&2; exit 0; }
  if ! _pid_alive "$pid"; then
    echo "GPU-Lock: kein Lock gehalten — PID $pid ist nicht mehr aktiv, Lock verworfen."
    rm -f "$LOCK_FILE"
    exit 0
  fi
  read -r _ reason started <<< "$(_lock_info)"
  echo "GPU-Lock: GEHALTEN von PID $pid (Grund: $reason, seit $started)."
}

# ── Dispatch ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  acquire)
    shift; reason="GPU training run"
    while [ $# -gt 0 ]; do
      case "$1" in
        --reason) [ $# -ge 2 ] || { echo "FEHLER: --reason braucht einen Wert." >&2; exit 2; }; reason="$2"; shift 2 ;; --reason=*) reason="${1#*=}"; shift ;;
        *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
      esac
    done
    cmd_acquire "$reason" ;;
  release) cmd_release ;;
  status)  cmd_status ;;
  *)
    echo "Verwendung: $0 {acquire [--reason <text>] | release | status}" >&2
    echo "Env: GPU_LOCK_REQUIRED_MIB (Pflicht) GPU_LOCK_FILE GPU_LOCK_PROXY_URL GPU_LOCK_NVIDIA_SMI GPU_LOCK_DRAIN_TIMEOUT" >&2
    exit 1 ;;
esac
