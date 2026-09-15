#!/usr/bin/env bats
# tests/spec/local-llm-proxy/dev-pod-loadouts-path.bats
# SSOT: openspec/specs/local-llm-proxy.md
# Ticket: T900109

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  case "$(uname -s)" in MINGW*|MSYS*|CYGWIN*) REPO_ROOT="$(cygpath -m "$REPO_ROOT")" ;; esac
  export REPO_ROOT
}

@test "1.1: readLoadouts() succeeds when cwd is outside the repo root" {
  cd "$BATS_TEST_TMPDIR"
  run node -e "
    import('${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs').then(m => {
      const { doc } = m.readLoadouts();
      if (!doc || typeof doc.roles !== 'object') process.exit(1);
      console.log('OK');
    }).catch(err => {
      console.error(err.message);
      process.exit(2);
    });
  "
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "1.2: resolveDefaultLoadoutsPath() respects LOADOUTS_PATH env var" {
  local custom_loadouts="${BATS_TEST_TMPDIR}/custom-loadouts.json"
  printf '{"version":1,"modelRoots":[],"loadouts":[],"roles":{"embed":{"chain":["http://127.0.0.1:8080"]}}}' > "$custom_loadouts"

  cd "$BATS_TEST_TMPDIR"
  run env LOADOUTS_PATH="$custom_loadouts" node -e "
    import('${REPO_ROOT}/scripts/llm-proxy/loadouts.mjs').then(m => {
      const p = m.resolveDefaultLoadoutsPath ? m.resolveDefaultLoadoutsPath() : m.DEFAULT_PATH;
      if (p !== process.env.LOADOUTS_PATH) {
        console.error('mismatch: ' + p);
        process.exit(1);
      }
      const { doc } = m.readLoadouts();
      if (doc?.roles?.embed?.chain?.[0] !== 'http://127.0.0.1:8080') process.exit(2);
      console.log('OK');
    }).catch(err => {
      console.error(err.message);
      process.exit(3);
    });
  "
  echo "output: $output"
  [ "$status" -eq 0 ]
  [ "$output" = "OK" ]
}

@test "1.3: supervisor.sh passes LOADOUTS_PATH to llm-proxy" {
  run grep -E 'LOADOUTS_PATH=.*loadouts\.json' "${REPO_ROOT}/docker/mcp-node/supervisor.sh"
  echo "supervisor check: $output"
  [ "$status" -eq 0 ]
}
