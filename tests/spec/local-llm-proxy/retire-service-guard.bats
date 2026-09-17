#!/usr/bin/env bats
# tests/spec/local-llm-proxy/retire-service-guard.bats — Guards fuer retire-service.sh [T900213]

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  RETIRE_SCRIPT="${REPO_ROOT}/scripts/llm-proxy/retire-service.sh"
  TMP_BIN="${BATS_TEST_TMPDIR}/bin"
  mkdir -p "${TMP_BIN}"
  LOG_FILE="${BATS_TEST_TMPDIR}/systemctl.log"
}

@test "T900213: retire-service.sh existiert und ist ausfuehrbar" {
  [ -f "${RETIRE_SCRIPT}" ]
  [ -x "${RETIRE_SCRIPT}" ]
}

@test "T900213: retire-service.sh verweigert ohne --confirm (Exit 2)" {
  run bash "${RETIRE_SCRIPT}"
  [ "${status}" -eq 2 ]
  [[ "${output}" == *"Usage: "* ]]
}

@test "T900213: retire-service.sh verweigert unter CI=true (Exit 1)" {
  run env CI=true bash "${RETIRE_SCRIPT}" --confirm
  [ "${status}" -eq 1 ]
  [[ "${output}" == *"Verweigerung unter CI"* ]]
}

@test "T900213: retire-service.sh Happy-Path fuehrt stop und disable in Reihenfolge aus" {
  cat <<'STUB' > "${TMP_BIN}/systemctl"
#!/usr/bin/env bash
echo "$@" >> "$SYSTEMCTL_LOG"
case "$*" in
  *"is-active"*) exit 0 ;;
  *"is-enabled"*) exit 0 ;;
  *"stop"*) exit 0 ;;
  *"disable"*) exit 0 ;;
esac
STUB
  chmod +x "${TMP_BIN}/systemctl"

  : > "${LOG_FILE}"
  run env PATH="${TMP_BIN}:${PATH}" SYSTEMCTL_LOG="${LOG_FILE}" CI="" GITHUB_ACTIONS="" bash "${RETIRE_SCRIPT}" --confirm
  [ "${status}" -eq 0 ]

  # Pruefe, dass stop vor disable gerufen wurde
  stop_line=$(grep -n "stop" "${LOG_FILE}" | head -1 | cut -d: -f1)
  disable_line=$(grep -n "disable" "${LOG_FILE}" | head -1 | cut -d: -f1)

  [ -n "$stop_line" ]
  [ -n "$disable_line" ]
  [ "$stop_line" -lt "$disable_line" ]
}

@test "T900213: retire-service.sh ist idempotent bei bereits gestopptem Service" {
  cat <<'STUB' > "${TMP_BIN}/systemctl"
#!/usr/bin/env bash
echo "$@" >> "$SYSTEMCTL_LOG"
case "$*" in
  *"is-active"*) exit 1 ;;
  *"is-enabled"*) exit 1 ;;
  *"stop"*) echo "FEHLER: stop gerufen" >&2; exit 2 ;;
  *"disable"*) echo "FEHLER: disable gerufen" >&2; exit 2 ;;
esac
STUB
  chmod +x "${TMP_BIN}/systemctl"

  : > "${LOG_FILE}"
  run env PATH="${TMP_BIN}:${PATH}" SYSTEMCTL_LOG="${LOG_FILE}" CI="" GITHUB_ACTIONS="" bash "${RETIRE_SCRIPT}" --confirm
  [ "${status}" -eq 0 ]
  [[ "${output}" == *"bereits inaktiv und deaktiviert"* ]]

  # Weder stop noch disable duerfen gerufen worden sein
  run grep -E 'stop|disable' "${LOG_FILE}"
  [ "${status}" -ne 0 ]
}
