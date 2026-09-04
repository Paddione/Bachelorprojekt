#!/usr/bin/env bash
# bench-engine-ab.sh — Engine-Isolation: gpt-oss-20b auf FreeToken (:1919) gegen
# dieselben Gewichte auf llama.cpp (:8097). Identisches Modell auf beiden Engines,
# damit der Vergleich die ENGINE misst und nicht das Modell.
#
# Warum: die bisherige Backend-Entscheidung (T014028/T014105) vermengt zwei Fragen.
# FreeToken erschien schneller, weil eine Offload-MoE gegen ein DICHTES Modell
# (qwen38-220k) gemessen wurde. gpt-oss-20b liegt in beiden Formaten vor — die
# Isolation ist damit ohne Modelldownload zu haben.
#
# Aufruf:
#     scripts/llm/bench-engine-ab.sh --tag <name> [--n-predict N] [--warmup-requests N]
#                                    [--skip-llamacpp] [--skip-freetoken]
#
# Beispiel:
#     scripts/llm/bench-engine-ab.sh --tag smoke001
#
# DIESES SKRIPT BAUT KEINE MESSLOGIK NACH. Es ist ein duenner Treiber ueber drei
# vorhandene Skripte, deren Zustaendigkeit hier nur referenziert wird:
#   scripts/llm/bench-decode.sh <port> <label>
#       liest den timings-Block von llama.cpp /completion (prompt_per_second,
#       predicted_per_second, draft_n/draft_n_accepted). llama.cpp-Seite.
#       Waermt intern bereits vor — kein zusaetzlicher Warmup noetig.
#   scripts/llm/bench-concurrent.sh <port> <n> <label>
#       trennt Einzelstrom von Gesamtdurchsatz. Hier nur als np=1-Beleg, weil das
#       FreeToken-Profil gptoss-65k fest auf --max-running-requests 1 steht und ein
#       Vergleich bei hoeherer Parallelitaet nicht moeglich ist.
#   scripts/llm/bench-freetoken-prefill.sh --tag <t> --base-url <url>
#       end-to-end Wanduhr fuer Prefill (kalt/Radix-Cache-Treffer) und Decode gegen
#       FreeToken /v1/chat/completions. FreeToken-Seite.
#
# Die Startskripte pruefen Test-Path auf ihr Modell selbst — dieses Skript
# dupliziert die Pruefung NICHT, sondern gibt deren stderr weiter.
#
# VORBEDINGUNG (P1, T900087): start-gptoss-server.ps1 braucht den UUID-gebundenen
# VRAM-Check. Ohne ihn bricht der Start mit "Cannot convert the System.Object[]
# value ... to type System.Int32" ab, weil nvidia-smi bei zwei Karten zwei Zeilen
# liefert.
#
# Mess-Konvention T002717: jede Ausgabedatei traegt Tag, erzeugenden Befehl und
# Commit-Stand.
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

TAG=""
N_PREDICT="${N_PREDICT:-512}"
WARMUP_REQUESTS=5
SKIP_LLAMACPP=0
SKIP_FREETOKEN=0

usage() {
  sed -n '2,40p' "$0"
  echo
  echo "Optionen:"
  echo "  --tag <name>              Pflicht. Geht in Dateinamen und Log-Zeilen ein."
  echo "  --n-predict N             Default 512, an bench-decode/bench-concurrent durchgereicht."
  echo "  --warmup-requests N       Default 5. FreeToken-JIT-Warmfahren, siehe unten."
  echo "  --skip-llamacpp           Nur die FreeToken-Phase laufen lassen."
  echo "  --skip-freetoken          Nur die llama.cpp-Phase laufen lassen."
  echo "  --help                    Diese Hilfe."
}

while [ $# -gt 0 ]; do
  case "$1" in
    --tag) TAG="${2:?--tag braucht einen Wert}"; shift 2 ;;
    --n-predict) N_PREDICT="${2:?--n-predict braucht einen Wert}"; shift 2 ;;
    --warmup-requests) WARMUP_REQUESTS="${2:?--warmup-requests braucht einen Wert}"; shift 2 ;;
    --skip-llamacpp) SKIP_LLAMACPP=1; shift ;;
    --skip-freetoken) SKIP_FREETOKEN=1; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "bench-engine-ab.sh: unbekannte Option '$1'" >&2; exit 2 ;;
  esac
done

if [ -z "$TAG" ]; then
  echo "bench-engine-ab.sh: --tag <name> ist Pflicht" >&2
  exit 2
fi

export N_PREDICT

COMMIT="$(git rev-parse HEAD)"
RAW_DIR="scripts/llm/measurements/raw"
mkdir -p "$RAW_DIR"
SUMMARY="$RAW_DIR/${TAG}-summary.log"

LLAMACPP_PORT=8097
FREETOKEN_PORT=1919
LLAMA_DIR="C:\\Users\\PatrickKorczewski\\llama-b10090-13.3"

echo "# commit: $COMMIT"
echo "# erzeugt von: scripts/llm/bench-engine-ab.sh --tag $TAG (siehe Skriptkopf fuer den vollen Aufruf)"

# --- Strikte Sequenzierung -------------------------------------------------------
# FreeToken belegt ~15,7 von 16 GB VRAM exklusiv, evictet llama.cpp nicht und wird
# nicht evictet (docs/runbooks/freetoken-native.md). Beide Engines MUESSEN daher
# strikt nacheinander laufen, mit verifiziertem Prozessende zwischen den Phasen —
# "Start-Process hat zurueckgegeben" ist kein Prozessende.

wait_port_free() {
  local port="$1" timeout_s="${2:-60}" waited=0
  while [ "$waited" -lt "$timeout_s" ]; do
    if ! powershell.exe -NoProfile -Command \
        "if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" \
        >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$((waited + 1))
  done
  echo "FEHLER: Port $port ist nach ${timeout_s}s noch belegt — die naechste Phase" >&2
  echo "        wuerde gegen einen lebenden Prozess starten und die Isolation verletzen." >&2
  exit 1
}

stop_freetoken() {
  powershell.exe -NoProfile -ExecutionPolicy Bypass \
    -File scripts/llm/restart-freetoken.ps1 -Stop >/dev/null 2>&1 || true
  wait_port_free "$FREETOKEN_PORT" 60
}

stop_llamacpp() {
  # PID-Pfad-Muster aus start-gptoss-server.ps1: $LlamaDir\gptoss.pid. Bei
  # abweichendem -LlamaDir schlaegt dieser Helper bewusst fehl statt zu raten —
  # ein falsch geratener Pfad wuerde keinen Fehler werfen und den Prozess
  # stattdessen weiterlaufen lassen.
  local pidfile
  pidfile="$(powershell.exe -NoProfile -Command \
    "Write-Output (Join-Path '$LLAMA_DIR' 'gptoss.pid')" 2>/dev/null | tr -d '\r')"
  powershell.exe -NoProfile -Command "
    \$f = '$pidfile'
    if (Test-Path \$f) {
      \$line = Get-Content \$f -First 1
      if (\$line -match '(\d+)') { & taskkill.exe /F /T /PID \$matches[1] 2>&1 | Out-Null }
    }" >/dev/null 2>&1 || true
  # Idempotent: fehlt die PID-Datei oder ist der Port schon frei, ist das kein Fehler.
  wait_port_free "$LLAMACPP_PORT" 60
}

trap 'stop_llamacpp; stop_freetoken' EXIT

# Phase 1 startet mit beiden Engines garantiert unten.
stop_freetoken
stop_llamacpp

# --- Phase 1: llama.cpp (Port 8097) ---------------------------------------------
if [ "$SKIP_LLAMACPP" -eq 0 ]; then
  echo "== Phase 1: llama.cpp gpt-oss-20b auf :$LLAMACPP_PORT =="
  if ! powershell.exe -NoProfile -ExecutionPolicy Bypass \
        -File scripts/llm/start-gptoss-server.ps1; then
    echo "FEHLER: start-gptoss-server.ps1 fehlgeschlagen. Tail von gptoss-err.log:" >&2
    powershell.exe -NoProfile -Command \
      "Get-Content (Join-Path '$LLAMA_DIR' 'gptoss-err.log') -Tail 30" 2>/dev/null >&2 || true
    exit 1
  fi

  bash scripts/llm/bench-decode.sh "$LLAMACPP_PORT" "llamacpp-gptoss20b-${TAG}" \
    2>&1 | tee "$RAW_DIR/${TAG}-llamacpp-decode.log"

  # np=1 als EIGENE Messgroesse, nicht um sie mit FreeToken zu mitteln.
  bash scripts/llm/bench-concurrent.sh "$LLAMACPP_PORT" 1 "llamacpp-gptoss20b-${TAG}-np1" \
    2>&1 | tee "$RAW_DIR/${TAG}-llamacpp-concurrent.log"

  stop_llamacpp
fi

# --- Phase 2: FreeToken (Port 1919) ---------------------------------------------
if [ "$SKIP_FREETOKEN" -eq 0 ]; then
  echo "== Phase 2: FreeToken gpt-oss-20b (Profil gptoss-65k) auf :$FREETOKEN_PORT =="
  if ! powershell.exe -NoProfile -ExecutionPolicy Bypass \
        -File scripts/llm/restart-freetoken.ps1 -Profile gptoss-65k -Tag "ab-${TAG}"; then
    echo "FEHLER: restart-freetoken.ps1 fehlgeschlagen." >&2
    exit 1
  fi

  # restart-freetoken.ps1 wartet auf status=ok UND maintenance=serving. Das ist
  # PROZESSBEREITSCHAFT, NICHT JIT-Warmheit — zwei verschiedene Dinge. Die ersten
  # Requests laufen mit 4-40 tok/s, bis die Triton-Kernel kompiliert sind. Ohne
  # explizites Warmfahren misst bench-freetoken-prefill.sh den Compiler statt die
  # Engine. Die Warmup-Zeiten werden EINZELN geloggt statt stumm verworfen: der
  # sichtbare Abfall ist der Beleg, dass der Fallstrick adressiert wurde.
  {
    echo "# warmup ($WARMUP_REQUESTS Requests, JIT-Kernel-Kompilierung)"
    for i in $(seq 1 "$WARMUP_REQUESTS"); do
      t0=$(date +%s.%N)
      curl -sS --max-time 60 "http://127.0.0.1:${FREETOKEN_PORT}/v1/chat/completions" \
        -H 'Content-Type: application/json' \
        -d '{"model":"gpt-oss-20b","messages":[{"role":"user","content":"Sag OK."}],"max_tokens":16,"temperature":0.0}' \
        -o /dev/null || true
      t1=$(date +%s.%N)
      echo "  warmup $i/$WARMUP_REQUESTS: $(awk -v a="$t0" -v b="$t1" 'BEGIN{printf "%.2f", b-a}')s"
    done
    echo "# HINWEIS: das Profil gptoss-65k steht fest auf --max-running-requests 1."
    echo "# Parallelitaet ist hier NICHT vergleichbar zu bench-concurrent.sh — die"
    echo "# np=1-Zahl der llama.cpp-Seite ist eine eigene Messgroesse, kein Mittelwert."
  } | tee "$RAW_DIR/${TAG}-freetoken-warmup.log"

  bash scripts/llm/bench-freetoken-prefill.sh \
    --tag "freetoken-gptoss20b-${TAG}" \
    --base-url "http://127.0.0.1:${FREETOKEN_PORT}" \
    2>&1 | tee "$RAW_DIR/${TAG}-freetoken-prefill.log"

  stop_freetoken
fi

# --- Zusammenfuehrung ohne Messlogik-Nachbau -------------------------------------
{
  echo "== Zusammenfassung ${TAG} (commit ${COMMIT}) =="
  echo "erzeugender Befehl: scripts/llm/bench-engine-ab.sh --tag ${TAG}"
  grep '^  decode' "$RAW_DIR/${TAG}-llamacpp-decode.log" 2>/dev/null | sed 's/^/llama.cpp  /' || true
  grep '^decode ' "$RAW_DIR/${TAG}-freetoken-prefill.log" 2>/dev/null | sed 's/^/freetoken /' || true
  echo "(unterschiedliche Messmethodik: llama.cpp = interne timings, FreeToken = end-to-end Wanduhr — beide Zahlen nebeneinander lesen, nicht subtrahieren)"
  echo
  echo "ABBRUCHPUNKT-2: unbewertet"
  echo "# Manuell zu setzen (kein automatischer Sieger, siehe Skriptkopf): verliert"
  echo "# llama.cpp bei IDENTISCHEN Gewichten bereits in Decode-tok/s gegen FreeToken?"
  echo "#   ja   -> Zeile auf 'ABBRUCHPUNKT-2: erreicht' aendern. Der Modellvergleich"
  echo "#           (P5, ~26 GB Download) entfaellt dann. Das ist ein ERGEBNIS, kein"
  echo "#           Fehlschlag, und wird in P6 als solches berichtet."
  echo "#   nein -> Zeile auf 'ABBRUCHPUNKT-2: nicht erreicht' aendern, P5 laeuft."
} | tee "$SUMMARY"

echo
echo "Rohdaten: $RAW_DIR/${TAG}-*.log"
echo "P6 liest: $SUMMARY"
