#!/usr/bin/env bash
# scripts/factory/classify-failure.sh — map a CI log to one failure class.
# SOURCE, do not execute. Defines classify_failure.
#
# classify_failure <ci-log-file> echoes exactly ONE of:
#   freshness | ci | test | lint | sql | manifest | secret | realm | other
# Specific classes (freshness/sql/manifest/secret/realm) are checked first so they
# win over the generic ci/test/lint signal a failed step also emits. freshness is
# checked before manifest because the stale-file list includes route-manifest.json.

classify_failure() {
  local log="${1:-}"
  if [[ -z "$log" || ! -f "$log" ]]; then
    echo "other"
    return 0
  fi

  # Stale generated artifacts (freshness:check). Checked FIRST: the stale-file list
  # includes route-manifest.json, so the word 'manifest' would otherwise mis-route it
  # to the `manifest` class. A deterministic `task freshness:regenerate` fixes it.
  if grep -qiE "is stale — run 'task freshness:regenerate'|generated artifact\(s\) are stale|freshness:regenerate locally and commit" "$log"; then
    echo "freshness"; return 0
  fi

  # Specific, high-signal classes first.
  if grep -qiE 'psql:|sqlstate|relation .* does not exist|syntax error at or near|duplicate key value' "$log"; then
    echo "sql"; return 0
  fi
  if grep -qiE 'realm-workspace.*\.json|import realm|keycloak realm' "$log"; then
    echo "realm"; return 0
  fi
  if grep -qiE 'sealedsecret|no key could decrypt|could not decrypt|sealed-secrets' "$log"; then
    echo "secret"; return 0
  fi
  if grep -qiE 'kustomize build|kubectl apply.*error|error validating data|unable to recognize|manifest error|invalid manifest|manifest validation' "$log"; then
    echo "manifest"; return 0
  fi
  # Generic build classes.
  if grep -qiE 'eslint|prettier|astro check|tsc .*error|lint' "$log"; then
    echo "lint"; return 0
  fi
  if grep -qiE 'vitest|FAIL src/|[0-9]+ failed|not ok |bats|playwright' "$log"; then
    echo "test"; return 0
  fi
  if grep -qiE '##\[error\]|process completed with exit code|the job (was )?cancell?ed|workflow' "$log"; then
    echo "ci"; return 0
  fi
  echo "other"
  return 0
}
