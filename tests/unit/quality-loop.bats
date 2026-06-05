#!/usr/bin/env bats
# quality-loop.bats — Unit tests for scripts/code-quality/loop.sh
# Stubs: ticket.sh, psql seam (QUALITY_LOOP_PSQL_CMD), groups seam.
# All tests run offline — no live cluster or DB required.

load test_helper

SCRIPT="${PROJECT_DIR}/scripts/code-quality/loop.sh"

setup() {
  FAKE_BIN="$(mktemp -d)"

  # Stub ticket.sh: records all invocations; returns fake external_id|id on create
  cat > "${FAKE_BIN}/ticket.sh" <<'EOF'
#!/usr/bin/env bash
echo "$@" >> "${TICKET_CALLS_LOG}"
case "${1:-}" in
  create) echo "T000999|42" ;;
  *) exit 0 ;;
esac
EOF
  chmod +x "${FAKE_BIN}/ticket.sh"

  # Stub kubectl: should never be called when psql seam is active
  cat > "${FAKE_BIN}/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "UNEXPECTED kubectl: $*" >&2; exit 1
EOF
  chmod +x "${FAKE_BIN}/kubectl"

  export PATH="${FAKE_BIN}:${PATH}"
  export FAKE_BIN
  export TICKET_CALLS_LOG="${BATS_TEST_TMPDIR}/ticket_calls.log"

  # Fixture: two-group JSON (S1:website + S3:infra-manifests)
  export QUALITY_GROUPS_FIXTURE="${BATS_TEST_TMPDIR}/groups.json"
  cat > "${QUALITY_GROUPS_FIXTURE}" <<'EOJSON'
[
  {
    "gate": "S1",
    "subsystem": "website",
    "count": 15,
    "title": "CQ-GATE:S1:website — 15 Dateien kürzen",
    "violation_keys": ["S1:website/src/pages/foo.astro", "S1:website/src/pages/bar.astro"]
  },
  {
    "gate": "S3",
    "subsystem": "infra-manifests",
    "count": 3,
    "title": "CQ-GATE:S3:infra-manifests — 3 Hostnames extrahieren",
    "violation_keys": ["S3:k3d/foo.yaml:x.mentolder.de"]
  }
]
EOJSON

  # Default psql stub script: no open tickets for any group
  PSQL_STUB="${FAKE_BIN}/psql-stub.sh"
  cat > "${PSQL_STUB}" <<'EOF'
#!/usr/bin/env bash
# Reads SQL from stdin, returns empty (no open tickets)
cat > /dev/null
echo ""
EOF
  chmod +x "${PSQL_STUB}"
  export QUALITY_LOOP_PSQL_CMD="${PSQL_STUB}"
}

teardown() {
  rm -rf "${FAKE_BIN}"
}

# ── DRY_RUN tests ─────────────────────────────────────────────────────────────

@test "DRY_RUN=1 with empty baseline exits 0 and creates zero tickets" {
  export QUALITY_LOOP_GROUPS_CMD="printf '[]'"
  run env DRY_RUN=1 bash "$SCRIPT"
  assert_success
  assert [ ! -f "${TICKET_CALLS_LOG}" ]
}

@test "DRY_RUN=1 with two groups prints both groups and no side effects" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"
  run env DRY_RUN=1 bash "$SCRIPT"
  assert_success
  assert_output --partial "CQ-GATE:S1:website"
  assert_output --partial "CQ-GATE:S3:infra-manifests"
  assert_output --partial "[DRY_RUN]"
  assert [ ! -f "${TICKET_CALLS_LOG}" ]
}

# ── Throttle test ─────────────────────────────────────────────────────────────

@test "MAX_NEW=1 with 2 eligible groups creates exactly one ticket" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"
  # psql stub already returns empty (no existing tickets)
  run env MAX_NEW=1 bash "$SCRIPT"
  assert_success
  local calls
  calls="$(grep -c "^create" "${TICKET_CALLS_LOG}" 2>/dev/null || echo 0)"
  assert_equal "$calls" "1"
}

# ── Dedup test ────────────────────────────────────────────────────────────────

@test "open CQ-GATE:S1:website ticket causes that group to be skipped" {
  export QUALITY_LOOP_GROUPS_CMD="cat ${QUALITY_GROUPS_FIXTURE}"

  # psql stub: echo the open-ticket title when SQL contains S1:website, else empty
  DEDUP_PSQL_STUB="${FAKE_BIN}/dedup-psql-stub.sh"
  cat > "${DEDUP_PSQL_STUB}" <<'EOF'
#!/usr/bin/env bash
sql="$(cat)"
if echo "$sql" | grep -q "S1:website"; then
  echo "CQ-GATE:S1:website — 15 Dateien kürzen"
else
  echo ""
fi
EOF
  chmod +x "${DEDUP_PSQL_STUB}"
  export QUALITY_LOOP_PSQL_CMD="${DEDUP_PSQL_STUB}"

  run env MAX_NEW=2 bash "$SCRIPT"
  assert_success
  # Only S3:infra-manifests should have been created
  local calls
  calls="$(grep -c "^create" "${TICKET_CALLS_LOG}" 2>/dev/null || echo 0)"
  assert_equal "$calls" "1"
  run grep "S3:infra-manifests" "${TICKET_CALLS_LOG}"
  assert_success
}
