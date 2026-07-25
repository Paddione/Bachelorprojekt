#!/usr/bin/env bats

setup() {
  PROMTAIL_VALUES="k3d/monitoring/values/promtail-values.yaml"
  OTEL_EMIT="scripts/factory/otel-emit.cjs"
}

@test "promtail values contains numeric pino level mapping" {
  [ -f "$PROMTAIL_VALUES" ]
  grep -q 'template:' "$PROMTAIL_VALUES" && grep -q '50' "$PROMTAIL_VALUES" && grep -q 'error' "$PROMTAIL_VALUES"
}

@test "promtail values places regex match-all or namespace rule after korczewski rule" {
  [ -f "$PROMTAIL_VALUES" ]
  KORCZEWSKI_LINE=$(grep -n 'regex: ".*-korczewski"' "$PROMTAIL_VALUES" | head -n1 | cut -d: -f1)
  OTHER_LINE=$(grep -n 'regex: ' "$PROMTAIL_VALUES" | tail -n1 | cut -d: -f1)
  [ -n "$KORCZEWSKI_LINE" ]
  [ -n "$OTHER_LINE" ]
  [ "$KORCZEWSKI_LINE" -lt "$OTHER_LINE" ]
}

@test "otel-emit exports required functions" {
  [ -f "$OTEL_EMIT" ]
  node -e "const m = require('./$OTEL_EMIT'); if (typeof m.emitMetric !== 'function' || typeof m.emitPhase !== 'function') process.exit(1);"
}
