#!/usr/bin/env bats

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  EMIT="${REPO}/scripts/factory/otel-emit.sh"
  TMP="$(mktemp -d)"
}
teardown() { rm -rf "${TMP}"; }

@test "no-op exits 0 when OTEL endpoint unset" {
  unset OTEL_EXPORTER_OTLP_ENDPOINT
  run bash "${EMIT}" metric factory.tick.count 1 brand=mentolder
  [ "$status" -eq 0 ]
}

@test "no-op when OTEL_SDK_DISABLED=true" {
  OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" OTEL_SDK_DISABLED=true \
    run bash "${EMIT}" metric factory.tick.count 1
  [ "$status" -eq 0 ]
}

@test "posts via curl when endpoint set (stubbed curl)" {
  cat > "${TMP}/curl" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "${OTEL_BATS_CAPTURE}"
exit 0
EOF
  chmod +x "${TMP}/curl"
  OTEL_BATS_CAPTURE="${TMP}/cap" PATH="${TMP}:${PATH}" \
    OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" \
    run bash "${EMIT}" metric factory.tick.count 1 brand=mentolder
  [ "$status" -eq 0 ]
  grep -q '/v1/metrics' "${TMP}/cap"
}

@test "curl failure never propagates non-zero (fire-and-forget)" {
  cat > "${TMP}/curl" <<'EOF'
#!/usr/bin/env bash
exit 7
EOF
  chmod +x "${TMP}/curl"
  PATH="${TMP}:${PATH}" OTEL_EXPORTER_OTLP_ENDPOINT="https://otel.example.invalid" \
    run bash "${EMIT}" metric factory.tick.count 1
  [ "$status" -eq 0 ]
}
