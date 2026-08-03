#!/usr/bin/env bash
# scripts/llm/bench-bge-embed.sh — Throughput-Benchmark fuer den bge-m3 Embedding-Server.
#
# WARUM ES DAS GIBT [T002572]: Die CPU-Tuning-Aenderung (-t <threads> + limits.cpu 4000m)
# soll die Embedding-Durchsatzrate messbar verbessern. Ohne ein reproduzierbares Messskript
# ist "vorher/nachher" nur eine Handmessung (Baseline 2026-08-02: ~0.67 chunks/s bei 100 docs,
# batch 64, 3 runs, 2000m ohne -t). Dieses Skript misst chunks/s gegen den llama.cpp-Server
# hinter dem Service llm-gateway-embed (Port 8081) im Cluster.
#
# Vergleichbarkeit ist der Kern:
#   - Deterministische Doku-Generierung (fester Seed) -> zwei Laeufe erzeugen identische Last.
#   - Restart-Guard [T002580]: steigt restartCount des bge-embed-Containers waehrend eines
#     Runs, wird der Run als INVALID markiert und von der Median-Bildung ausgeschlossen.
#   - Jede chunks/s-Zahl wird IMMER mit ihrer Messbasis ausgegeben (docs, words, batch, node).
#
# Usage:
#   bash scripts/llm/bench-bge-embed.sh [ENV] [--runs N] [--docs N] [--batch N] [--words N]
#   bash scripts/llm/bench-bge-embed.sh --help
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: bash scripts/llm/bench-bge-embed.sh [ENV] [options]

Throughput-Benchmark fuer den bge-m3 Embedding-Server (llm-gateway-embed, Port 8081).

Positional:
  ENV                     Umgebung (default: mentolder)

Options:
  --runs N                Anzahl Messlaeufe (default: 3)
  --docs N                Anzahl Dokumente pro Run (default: 100)
  --batch N               Batch-Groesse pro Request (default: 64)
  --words N               Woerter pro Dokument (default: 60)
  --help                  Diese Hilfe anzeigen

Ausgabe: chunks/s + Dauer pro Run, Median ueber gueltige Runs, immer mit Messbasis
(docs, words, batch, Pod-Node). Runs mit Container-Restart werden als INVALID markiert.
EOF
}

# ── Argumente parsen ─────────────────────────────────────────────
ENV="mentolder"
RUNS=3
DOCS=100
BATCH=64
WORDS=60

while [[ $# -gt 0 ]]; do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --runs)   RUNS="$2"; shift 2 ;;
    --docs)   DOCS="$2"; shift 2 ;;
    --batch)  BATCH="$2"; shift 2 ;;
    --words)  WORDS="$2"; shift 2 ;;
    -*)       echo "Unbekannte Option: $1" >&2; usage >&2; exit 1 ;;
    *)        ENV="$1"; shift ;;
  esac
done

# ── ENV aufloesen (MUSS gesourced werden, nie ausfuehren) ────────
source scripts/env-resolve.sh "$ENV"
ns="${WORKSPACE_NAMESPACE:-workspace}"

# ── Deterministische Dokumente (fester Seed) ─────────────────────
# Fester Seed => zwei Laeufe erzeugen identische Last. Das ist die Voraussetzung
# fuer eine valide vorher/nachher-Messung. Woerter aus einem kleinen Pool, damit
# die JSON-Payload kompakt bleibt.
WORDS_POOL=(alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega)
SEED=42
gen_docs() {
  local n=$1 w=$2
  local i j idx
  local -a doc
  for ((i=0; i<n; i++)); do
    doc=()
    for ((j=0; j<w; j++)); do
      idx=$(( (SEED + i * 31 + j * 17) % ${#WORDS_POOL[@]} ))
      doc+=("${WORDS_POOL[$idx]}")
    done
    printf '%s' "${doc[*]}"
    printf '\n'
  done
}

# ── Port-Forward aufbauen + Cleanup ──────────────────────────────
LOCAL_PORT="${LOCAL_PORT:-18081}"
PF_PID=""
cleanup() {
  [[ -n "$PF_PID" ]] && kill "$PF_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "── bge-embed Benchmark (ENV=$ENV, ns=$ns) ──"
echo "  Basis: docs=$DOCS words=$WORDS batch=$BATCH runs=$RUNS"

kubectl --context "$ENV_CONTEXT" -n "$ns" port-forward "svc/llm-gateway-embed" "$LOCAL_PORT:8081" >/dev/null 2>&1 &
PF_PID=$!

# Readiness-Wait auf dem lokalen Port (kein fester Sleep).
for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "http://127.0.0.1:$LOCAL_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS --max-time 2 "http://127.0.0.1:$LOCAL_PORT/health" >/dev/null 2>&1; then
  echo "FEHLER: Port-Forward auf :$LOCAL_PORT antwortet nicht." >&2
  exit 1
fi

# ── Pod-Node + restartCount ermitteln ────────────────────────────
POD="$(kubectl --context "$ENV_CONTEXT" -n "$ns" get pod -l app=bge-embed -o jsonpath='{.items[0].metadata.name}')"
NODE="$(kubectl --context "$ENV_CONTEXT" -n "$ns" get pod "$POD" -o jsonpath='{.spec.nodeName}')"
restart_count() {
  kubectl --context "$ENV_CONTEXT" -n "$ns" get pod "$POD" -o jsonpath='{.status.containerStatuses[?(@.name=="llama-cpp")].restartCount}'
}

echo "  Pod: $POD (Node: $NODE)"

# ── Dokumente einmalig erzeugen (deterministisch, fester Seed) ────
# JSON-Batches werden pro Request in eine Temp-Datei geschrieben und per
# --data-binary @<file> gesendet. Kein jq --args, damit die Payload
# deterministisch und portabel bleibt.
TMP="$(mktemp)"
trap 'rm -f "$TMP"; [[ -n "$PF_PID" ]] && kill "$PF_PID" 2>/dev/null || true' EXIT

gen_docs "$DOCS" "$WORDS" > "$TMP.docs"

# ── Messlaeufe ───────────────────────────────────────────────────
valid=0
sum=0
for ((run=1; run<=RUNS; run++)); do
  rc_before="$(restart_count)"
  start=$(date +%s.%N)
  # Batch-Groesse: BATCH Dokumente pro Request, DOCS/BATCH Requests pro Run.
  # Die Payload wird je Request aus den seed-deterministischen Dokumenten gebaut
  # (tail/head auf $TMP.docs), damit EXAKT DOCS Dokumente gesendet werden.
  for ((off=0; off<DOCS; off+=BATCH)); do
    {
      echo -n '{"model":"bge-m3","input":['
      first=1
      cnt=0
      while IFS= read -r line && (( cnt < BATCH )); do
        [[ -z "$line" ]] && continue
        [[ $first -eq 0 ]] && echo -n ','
        first=0
        printf '"%s"' "$line"
        cnt=$((cnt+1))
      done < <(tail -n +$((off+1)) "$TMP.docs" | head -n "$BATCH")
      echo ']}'
    } > "$TMP.batch"
    curl -fsS --max-time 300 -X POST "http://127.0.0.1:$LOCAL_PORT/v1/embeddings" \
      -H "Content-Type: application/json" \
      --data-binary @"$TMP.batch" >/dev/null
  done
  end=$(date +%s.%N)
  rc_after="$(restart_count)"

  dur=$(awk -v s="$start" -v e="$end" 'BEGIN{printf "%.2f", e-s}')
  cps=$(awk -v d="$DOCS" -v t="$dur" 'BEGIN{printf "%.3f", d/t}')

  if [[ "$rc_before" != "$rc_after" ]]; then
    echo "  Run $run/$RUNS: INVALID (container restarted, restartCount $rc_before -> $rc_after)"
    continue
  fi
  echo "  Run $run/$RUNS: ${cps} chunks/s (${dur}s)"
  valid=$((valid+1))
  sum=$(awk -v a="$sum" -v c="$cps" 'BEGIN{print a+c}')
done

# ── Ergebnis ─────────────────────────────────────────────────────
if [[ $valid -eq 0 ]]; then
  echo "FEHLER: kein gueltiger Run (alle durch Container-Restart invalidiert)." >&2
  exit 1
fi
median=$(awk -v s="$sum" -v v="$valid" 'BEGIN{printf "%.3f", s/v}')
echo "── Ergebnis ──"
echo "  Median: ${median} chunks/s (${valid}/${RUNS} gueltige Runs)"
echo "  Basis: docs=$DOCS words=$WORDS batch=$BATCH node=$NODE"
