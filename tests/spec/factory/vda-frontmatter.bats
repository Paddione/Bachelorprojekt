#!/usr/bin/env bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T013107 — vda.sh frontmatter Domain-Ableitung ignoriert Code-Blöcke

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  VDA="${REPO_ROOT}/scripts/vda.sh"
  TMP="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMP"
}

@test "vda.sh frontmatter ignores code blocks when deriving domains" {
  cat > "$TMP/repro-db.md" <<'PLAN'
# Plan

This is a factory tooling change.

```sql
SELECT * FROM psql;
```
PLAN

  run bash "$VDA" frontmatter "$TMP/repro-db.md"
  [ "$status" -eq 0 ]

  # Darf NICHT als db abgeleitet werden
  ! grep -q 'domains:.*db' "$TMP/repro-db.md"
}
