#!/usr/bin/env bats
# FA-SF-33: classify-failure.sh maps a CI log to exactly one failure class.
setup() {
  load 'test_helper.bash'
  TMPLOG="$(mktemp)"
}
teardown() { rm -f "$TMPLOG"; }

_cf() { source scripts/factory/classify-failure.sh; classify_failure "$TMPLOG"; }

@test "FA-SF-33: psql/SQL error classifies as sql" {
  printf 'psql: ERROR:  relation "tickets.foo" does not exist\n' > "$TMPLOG"
  run _cf
  [ "$status" -eq 0 ]
  [ "$output" = "sql" ]
}

@test "FA-SF-33: kustomize build error classifies as manifest" {
  printf 'Error: kustomize build failed: accumulating resources\n' > "$TMPLOG"
  run _cf
  [ "$output" = "manifest" ]
}

@test "FA-SF-33: sealed secret error classifies as secret" {
  printf 'no key could decrypt secret (sealedsecret)\n' > "$TMPLOG"
  run _cf
  [ "$output" = "secret" ]
}

@test "FA-SF-33: keycloak realm import error classifies as realm" {
  printf 'failed to import realm realm-workspace-dev.json\n' > "$TMPLOG"
  run _cf
  [ "$output" = "realm" ]
}

@test "FA-SF-33: vitest failure classifies as test" {
  printf '1 failed | 12 passed (vitest)\nFAIL src/lib/foo.test.ts\n' > "$TMPLOG"
  run _cf
  [ "$output" = "test" ]
}

@test "FA-SF-33: eslint failure classifies as lint" {
  printf '/website/src/foo.ts\n  3:1  error  Missing semicolon  eslint\n' > "$TMPLOG"
  run _cf
  [ "$output" = "lint" ]
}

@test "FA-SF-33: github actions step failure classifies as ci" {
  printf '##[error]Process completed with exit code 1.\n' > "$TMPLOG"
  run _cf
  [ "$output" = "ci" ]
}

@test "FA-SF-33: unrecognised log classifies as other" {
  printf 'all good, nothing to report here\n' > "$TMPLOG"
  run _cf
  [ "$output" = "other" ]
}

@test "FA-SF-33: missing log file classifies as other" {
  run bash -c 'source scripts/factory/classify-failure.sh; classify_failure /nonexistent/path.log'
  [ "$output" = "other" ]
}
