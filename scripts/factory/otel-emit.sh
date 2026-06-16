#!/usr/bin/env bash
# scripts/factory/otel-emit.sh — curl twin of otel-emit.cjs. Emits one OTLP/HTTP-JSON
# metric to ${OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics. No-op when endpoint unset or
# OTEL_SDK_DISABLED=true. NEVER fails the caller (fire-and-forget; always exits 0).
#
# Usage: otel-emit.sh metric <name> <value> [k=v ...]
#        otel-emit.sh phase  <phase> <state> [k=v ...] [ticket_id=...] [durationMs=...]
set -uo pipefail

_endpoint() {
  [[ "${OTEL_SDK_DISABLED:-}" == "true" ]] && return 1
  [[ -n "${OTEL_EXPORTER_OTLP_ENDPOINT:-}" ]] || return 1
  printf '%s' "${OTEL_EXPORTER_OTLP_ENDPOINT%%/}"
}

_auth_header() {
  local raw="${OTEL_EXPORTER_OTLP_HEADERS:-}"
  [[ "$raw" =~ Authorization=([^,]+) ]] && printf 'Authorization: %s' "${BASH_REMATCH[1]}"
}

_attrs_json() {
  local out="" first=1 kv k v
  for kv in "$@"; do
    [[ "$kv" == *=* ]] || continue
    k="${kv%%=*}"; v="${kv#*=}"
    [[ $first -eq 0 ]] && out+=","
    out+="{\"key\":\"${k}\",\"value\":{\"stringValue\":\"${v}\"}}"
    first=0
  done
  printf '%s' "$out"
}

emit_metric() {
  local name="$1" value="$2"; shift 2
  local base; base="$(_endpoint)" || return 0
  local t; t="$(( $(date +%s) * 1000000000 ))"
  local attrs; attrs="$(_attrs_json "$@")"
  local body
  body="$(cat <<JSON
{"resourceMetrics":[{"resource":{"attributes":[{"key":"service.name","value":{"stringValue":"software-factory"}}]},
"scopeMetrics":[{"scope":{"name":"factory.otel-emit.sh"},"metrics":[{"name":"${name}",
"sum":{"aggregationTemporality":2,"isMonotonic":true,"dataPoints":[{"asDouble":${value},
"timeUnixNano":"${t}","startTimeUnixNano":"${t}","attributes":[${attrs}]}]}}]}]}]}
JSON
)"
  local auth; auth="$(_auth_header)"
  curl -sS -m 5 -X POST "${base}/v1/metrics" \
    -H 'Content-Type: application/json' \
    ${auth:+-H "$auth"} \
    --data "${body}" >/dev/null 2>&1 || true
  return 0
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    metric) emit_metric "$@" ;;
    phase)
      local phase="${1:-}" state="${2:-}"; shift 2 || true
      emit_metric "factory.phase.transition" 1 "phase=${phase}" "state=${state}" "$@"
      ;;
    *) : ;;  # unknown verb: no-op, never fail
  esac
  return 0
}
main "$@"
