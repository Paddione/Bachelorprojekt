#!/usr/bin/env bats
# tests/spec/e2e-test-infrastructure/purge-fn-website-sync.bats — T900381
# SSOT: openspec/specs/e2e-test-infrastructure.md
#   Requirement: Website Schema Init Installs the Latest Purge Function
#
# PRUEFMODUS: Output-Verifikation. Das TS-Modul wird mit node (Type-Stripping)
# IMPORTIERT und der exportierte SQL-Rumpf gegen den Rumpf der neuesten
# scripts/one-shot/purge-fn-v*.sql verglichen. Der Einzel-Definitions-Test ist ein
# Querschnitts-grep ueber die Website-Quellen (Konvention, T002448-M4-Ausnahme).

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  LATEST="$(ls -1 "$REPO"/scripts/one-shot/purge-fn-v*.sql | sort -V | tail -1)"
  MOD="$REPO/components/website/src/lib/tickets/purge-fn.ts"
}

# Gibt PURGE_FN_BODY des TS-Moduls aus.
module_body() {
  node --experimental-strip-types --no-warnings --input-type=module -e "
    const m = await import('file://$MOD');
    process.stdout.write(m.PURGE_FN_BODY);
  "
}

# Rumpf der SQL-Datei zwischen 'AS \$\$' und '\$\$;' (exklusive).
file_body() {
  awk '/^AS \$\$$/{on=1; next} /^\$\$;$/{on=0} on' "$LATEST"
}

norm() { tr -s '[:space:]' ' ' | sed 's/^ //; s/ $//'; }

@test "the latest migration declares a runtime-check marker (positive anchor)" {
  run grep -oP 'RUNTIME-CHECK: function=tickets\.fn_purge_test_data marker=\K\S+' "$LATEST"
  [ "$status" -eq 0 ]
  [ -n "$output" ]
}

@test "the runtime definition carries the marker of the latest migration" {
  local marker; marker="$(grep -oP 'RUNTIME-CHECK: function=tickets\.fn_purge_test_data marker=\K\S+' "$LATEST")"
  run module_body
  [ "$status" -eq 0 ]
  grep -qF -- "$marker" <<<"$output"
}

@test "the runtime body equals the latest migration body" {
  run module_body
  [ "$status" -eq 0 ]
  local a b
  a="$(norm <<<"$output")"
  b="$(file_body | norm)"
  [ -n "$b" ]
  [ "$a" = "$b" ]
}

@test "no other website module defines the purge function" {
  run grep -rlF 'CREATE OR REPLACE FUNCTION tickets.fn_purge_test_data' "$REPO/components/website/src/lib"
  [ "$status" -eq 0 ]
  [ "$output" = "$MOD" ]
}
