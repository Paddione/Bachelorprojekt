#!/usr/bin/env bash
# bench-concurrent.sh — Misst den Durchsatz eines llama-server unter N
# gleichzeitigen Anfragen und trennt dabei zwei Groessen, die bei mehreren
# Slots auseinanderlaufen:
#
#   Einzelstrom  — was EIN Client sieht (predicted_per_second seiner Antwort)
#   Gesamtdurchsatz — was die GPU insgesamt liefert (Summe der erzeugten Token
#                     geteilt durch die Wanduhrzeit des gesamten Fensters)
#
# Bei -np 1 sind beide fast gleich. Bei -np 3 sinkt der Einzelstrom, waehrend
# der Gesamtdurchsatz steigt — welcher der beiden zaehlt, haengt an der
# Nutzung. Ein Mittelwert ueber die Einzelstroeme waere hier die falsche Zahl:
# er verschweigt genau den Effekt, den man messen wollte.
#
# Die Wanduhr ist fuer den Gesamtdurchsatz NOETIG (nicht die timings-Summe):
# die Anfragen ueberlappen, ihre Einzelzeiten addieren sich also zu mehr als
# der real vergangenen Zeit.
#
# Aufruf:
#     scripts/llm/bench-concurrent.sh <port> <nebenlaeufigkeit> [label]
#
# Beispiel:
#     scripts/llm/bench-concurrent.sh 8089 3 "np3-kvu-mtp"
set -euo pipefail

PORT="${1:?port}"
CONC="${2:?nebenlaeufigkeit}"
LABEL="${3:-unbenannt}"
BASE="http://127.0.0.1:${PORT}"
N_PREDICT="${N_PREDICT:-512}"

command -v jq >/dev/null || { echo "jq fehlt" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Unterschiedliche Prompts je Client: identische Prompts wuerden sich den
# Prompt-Cache teilen und den Prefill kuenstlich verbilligen.
_prompt_for() {
  case "$(( $1 % 3 ))" in
    0) printf 'Erklaere ausfuehrlich die Funktionsweise von Kuehlkreislaeufen in Rechenzentren, Variante %s.' "$1" ;;
    1) printf 'Schreibe eine vollstaendige Python-Klasse fuer einen LRU-Cache mit Typannotationen, Variante %s.' "$1" ;;
    *) printf 'Beschreibe den Aufbau eines verteilten Logsystems mit Backpressure, Variante %s.' "$1" ;;
  esac
}

echo "== $LABEL (nebenlaeufigkeit=$CONC, n_predict=$N_PREDICT) =="

# Aufwaermen: der erste Lauf traegt Kernel-Kompilierung und Allokationen.
curl -s --max-time 300 -H 'content-type: application/json' \
  -d '{"prompt":"Hallo","n_predict":16,"stream":false}' "${BASE}/completion" >/dev/null

start_ns="$(date +%s%N)"
for i in $(seq 1 "$CONC"); do
  (
    body="$(jq -n --arg p "$(_prompt_for "$i")" --argjson n "$N_PREDICT" \
      '{prompt:$p, n_predict:$n, temperature:0, cache_prompt:false, stream:false}')"
    curl -s --max-time 900 -H 'content-type: application/json' \
      -d "$body" "${BASE}/completion" > "${WORK}/resp-${i}.json"
  ) &
done
wait
end_ns="$(date +%s%N)"

wall_ms=$(( (end_ns - start_ns) / 1000000 ))

jq -s --argjson wall "$wall_ms" --arg label "$LABEL" --argjson conc "$CONC" '
  [ .[] | .timings ] as $t
  | ($t | map(.predicted_n) | add) as $tok
  | ($t | map(.predicted_per_second) | add / length) as $single
  | ($t | map(.draft_n // 0) | add) as $dn
  | ($t | map(.draft_n_accepted // 0) | add) as $da
  | [
      "  wanduhr        : \($wall) ms fuer \($conc) gleichzeitige Anfragen",
      "  erzeugte token : \($tok)",
      "  GESAMT         : \(($tok / ($wall / 1000)) | floor) tok/s (alle Slots zusammen)",
      "  einzelstrom    : \($single | floor) tok/s (Mittel je Anfrage)",
      (if $dn > 0
       then "  draft          : \($da)/\($dn) angenommen = \((($da / $dn) * 100) | floor)%"
       else "  draft          : kein spekulatives Dekodieren aktiv"
       end)
    ] | .[]' "${WORK}"/resp-*.json
