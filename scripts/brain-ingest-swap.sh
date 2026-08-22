#!/usr/bin/env bash
# scripts/brain-ingest-swap.sh — Loadout-Swap um den Brain-Ingest herum. [T013593]
#
# Merkt sich das laufende chat-gpu-Loadout, wechselt auf 'brain-ingest', faehrt
# den Ingest und stellt danach den vorherigen Zustand wieder her — auch bei
# Fehler oder Abbruch. Waehrend des Laufs haelt ein Loadout-Pin die Modellwahl
# fest: der Proxy weist fremde start/stop-Aufrufe mit 423 ab.
#
# Env: SWAP_PROXY_URL GPU_PIN_FILE SWAP_DRAIN_TIMEOUT SWAP_HEALTH_TIMEOUT
#      SWAP_LOADOUTS BRAIN_INGEST_SH  sowie alle LM_*/MAX_* des Ingests
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

PROXY_URL="${SWAP_PROXY_URL:-http://127.0.0.1:18235}"
PIN_FILE="${GPU_PIN_FILE:-/tmp/loadout-pin.json}"
DRAIN_TIMEOUT="${SWAP_DRAIN_TIMEOUT:-300}"
HEALTH_TIMEOUT="${SWAP_HEALTH_TIMEOUT:-240}"
LOADOUTS="${SWAP_LOADOUTS:-${REPO_ROOT}/scripts/llm/loadouts.json}"
INGEST_SH="${BRAIN_INGEST_SH:-${REPO_ROOT}/scripts/brain-ingest.sh}"
SLUG="brain-ingest"

PIN_TOKEN=""
PREVIOUS=""        # Slug des vorher laufenden Loadouts, leer = es lief keines
SWAPPED=0          # 1, sobald wir angefangen haben zu wechseln

log() { echo "[ingest-swap] $*" >&2; }

# ── Pin: lokale Datei, genau wie der GPU-Lock (scripts/gpu-lock.sh). Der Proxy
#    liest sie und weist fremde start/stop-Aufrufe ab. Kein HTTP noetig — ein
#    Pin, den nur der laufende Proxy kennt, ueberlebte dessen Neustart nicht.
pin_acquire() {
  PIN_TOKEN="$(python3 - "$PIN_FILE" "$$" "$SLUG" << 'PYEOF'
import json, os, sys, uuid, datetime
pin_file, pid, slug = sys.argv[1], int(sys.argv[2]), sys.argv[3]

# Ein bestehender Pin einer noch lebenden PID wird nicht ueberschrieben.
if os.path.exists(pin_file):
    try:
        cur = json.load(open(pin_file))
        other = cur.get("pid")
        if isinstance(other, int):
            try:
                os.kill(other, 0)
                print("", end="")
                sys.exit(3)
            except ProcessLookupError:
                pass
            except PermissionError:
                sys.exit(3)
    except (ValueError, OSError):
        # Unlesbar heisst gehalten (fail-closed) — dieselbe Regel wie im Proxy.
        sys.exit(3)

token = str(uuid.uuid4())
json.dump({
    "slug": slug, "pid": pid, "reason": "brain-ingest", "token": token,
    "started_at": datetime.datetime.now(datetime.timezone.utc)
        .strftime("%Y-%m-%dT%H:%M:%SZ"),
}, open(pin_file, "w"))
print(token)
PYEOF
)" || { log "Ein fremder Loadout-Pin wird gehalten — Abbruch."; exit 1; }
  [ -n "$PIN_TOKEN" ] || { log "Pin konnte nicht gesetzt werden."; exit 1; }
  log "Pin auf ${SLUG} gesetzt (pid $$)."
}

pin_release() {
  [ -f "$PIN_FILE" ] || return 0
  rm -f "$PIN_FILE"
  log "Pin geloest."
}

# ── Proxy-Aufrufe. start/stop tragen das Pin-Token, sonst weist der Proxy uns
#    mit unserem eigenen Pin ab.
loadout_op() {  # <start|stop> <slug>
  curl -sf -X POST -H "x-loadout-pin: ${PIN_TOKEN}" \
    "${PROXY_URL}/admin/loadouts/$2/$1" >/dev/null
}

# Laufendes Loadout der Gruppe chat-gpu. 'running' kommt vom Proxy, die
# Gruppenzugehoerigkeit aus loadouts.json — der Status-Endpunkt fuehrt sie nicht.
running_chat_gpu() {
  local status
  status="$(curl -sf "${PROXY_URL}/admin/loadouts/status")" || {
    log "Proxy nicht erreichbar (${PROXY_URL})."; return 1
  }
  python3 - "$LOADOUTS" "$SLUG" << PYEOF
import json, sys
status = json.loads('''${status}''')
loadouts = json.load(open(sys.argv[1]))
group = {l["slug"]: l.get("exclusiveGroup") for l in loadouts.get("loadouts", [])}
for entry in status.get("status", []):
    slug = entry.get("slug")
    if entry.get("running") and slug != sys.argv[2] and group.get(slug) == "chat-gpu":
        print(slug)
        break
PYEOF
}

# Warten, bis kein Request mehr laeuft. Laufende Requests werden NICHT
# abgebrochen; nach dem Deckel bricht der Swap ab, statt zu verdraengen.
# Unerreichbar oder unparsbar heisst abbrechen — ein unbekannter Zustand ist
# kein "nichts in flight".
drain() {
  local deadline state inflight
  deadline=$(( $(date +%s) + DRAIN_TIMEOUT ))
  log "Warte auf inflight==0 (max ${DRAIN_TIMEOUT}s)..."
  while true; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      log "Auslauf-Deckel erreicht — es wird nichts verdraengt."
      return 1
    fi
    state="$(curl -sf "${PROXY_URL}/admin/state")" || { log "Proxy nicht erreichbar."; return 1; }
    inflight="$(python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
print(sum(b.get('inflight',0) for b in d.get('backends',[]) if b.get('kind')=='llamacpp'))
" <<< "$state")" || { log "/admin/state nicht parsbar."; return 1; }
    [ "$inflight" -eq 0 ] && break
    sleep 1
  done
  log "Keine Requests mehr in flight."
}

wait_healthy() {  # <port>
  local deadline
  deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    curl -sf "http://127.0.0.1:$1/health" >/dev/null 2>&1 && return 0
    curl -sf "http://127.0.0.1:$1/v1/models" >/dev/null 2>&1 && return 0
    sleep 2
  done
  log "WARNUNG: ${SLUG} auf Port $1 meldete sich nicht gesund — der Ingest laeuft trotzdem an."
  return 0
}

# ── Wiederherstellung. Wird VOR dem ersten Stop scharf gemacht, damit auch ein
#    Abbruch im Fenster zwischen Stop und Start noch zurueckdreht.
restore() {
  local rc=$?
  trap - EXIT INT TERM
  if [ "$SWAPPED" -eq 1 ]; then
    loadout_op stop "$SLUG" || log "WARNUNG: ${SLUG} liess sich nicht stoppen."
    if [ -n "$PREVIOUS" ]; then
      if loadout_op start "$PREVIOUS"; then
        log "${PREVIOUS} wiederhergestellt."
      else
        log "WARNUNG: ${PREVIOUS} liess sich nicht starten."
      fi
    else
      log "Vorher lief kein chat-gpu-Loadout — es wird keines gestartet."
    fi
  fi
  pin_release
  exit "$rc"
}

main() {
  command -v python3 >/dev/null 2>&1 || { log "python3 wird benoetigt."; exit 2; }
  [ -x "$INGEST_SH" ] || [ -f "$INGEST_SH" ] || { log "Ingest-Skript fehlt: ${INGEST_SH}"; exit 2; }

  local port
  port="$(python3 -c "
import json,sys
d=json.load(open('${LOADOUTS}'))
print(next(l['port'] for l in d['loadouts'] if l['slug']=='${SLUG}'))
")"

  PREVIOUS="$(running_chat_gpu)" || exit 1
  if [ -n "$PREVIOUS" ]; then
    log "Laufendes Loadout gemerkt: ${PREVIOUS}."
  else
    log "Es laeuft kein chat-gpu-Loadout."
  fi

  pin_acquire
  trap restore EXIT INT TERM

  drain || exit 1

  SWAPPED=1
  [ -n "$PREVIOUS" ] && { loadout_op stop "$PREVIOUS" || { log "Stop von ${PREVIOUS} fehlgeschlagen."; exit 1; }; }
  loadout_op start "$SLUG" || { log "Start von ${SLUG} fehlgeschlagen."; exit 1; }
  wait_healthy "$port"

  # Explizite Overrides gewinnen — ein Lauf gegen ein anderes Backend bleibt moeglich.
  LM_STUDIO_URL="${LM_STUDIO_URL:-http://127.0.0.1:${port}}" \
  LM_MODEL="${LM_MODEL:-gemma-4-12b-qat}" \
  MAX_PARALLEL="${MAX_PARALLEL:-3}" \
    bash "$INGEST_SH" "$@"
}

main "$@"
