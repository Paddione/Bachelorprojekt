#!/usr/bin/env bats
# T900809: svelte-check muss in components/website 0 Fehler melden, und CI muss es ausführen.
# Ursache: der CI-Schritt `pnpm run astro:check` prüft keine .svelte-Dateien (0 Fehler bei
# 1323 Dateien), svelte-check fand 85 Fehler in 37 Svelte-Komponenten.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  WEB="$REPO_ROOT/components/website"
}

@test "T900809: svelte-check meldet 0 Fehler in components/website" {
  [ -x "$WEB/node_modules/.bin/svelte-check" ] || skip "svelte-check nicht installiert (pnpm install in components/website)"
  run bash -c "cd '$WEB' && ./node_modules/.bin/svelte-check --threshold error --output machine 2>&1"
  # Positiv-Anker: ohne COMPLETED-Zeile ist der Lauf abgebrochen, 0 ERROR-Zeilen wären dann kein Beleg.
  echo "$output" | grep -q ' COMPLETED ' || { echo "svelte-check lief nicht durch:"; echo "$output" | tail -20; false; }
  errors=$(echo "$output" | grep -c ' ERROR ' || true)
  echo "svelte-check errors: $errors"
  echo "$output" | grep ' ERROR ' | head -20
  [ "$errors" -eq 0 ]
}

@test "T900809: CI-Job Vitest (website) führt svelte-check als blockierenden Schritt aus" {
  run bash -c "awk '/^  vitest-website:/{f=1} f && /^  [a-z0-9-]+:\$/ && !/vitest-website/{exit} f' '$REPO_ROOT/.github/workflows/ci.yml'"
  [ "$status" -eq 0 ]
  echo "$output" | grep -q 'svelte-check --threshold error'
}
