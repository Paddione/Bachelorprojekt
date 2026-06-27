#!/usr/bin/env bats
# SSOT: openspec/changes/s1-violations-batch2/proposal.md
# G-RH01: S1-Frozen-Violations Batch 2 — baseline.json 70→≤30
# Counts only S1-prefixed keys (file-size violations). S2/S3/S4 are
# independent gates tracked separately and not in scope for G-RH01.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "G-RH01 batch2: baseline.json S1-Einträge ≤ 30" {
  count=$(jq -r '[keys[] | select(startswith("S1:"))] | length' "$REPO_ROOT/docs/code-quality/baseline.json")
  [ "$count" -le 30 ]
}

@test "G-RH01 batch2: tickets-db.ts ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/website/src/lib/tickets-db.ts")
  [ "$loc" -le 600 ]
}

@test "G-RH01 batch2: backup-restore.sh ist unter S1-Limit" {
  loc=$(wc -l < "$REPO_ROOT/scripts/backup-restore.sh")
  [ "$loc" -le 500 ]
}

@test "G-RH01 batch2: tickets-db.ts ist auf Re-Export-Index geschrumpft" {
  # Nach dem Split in Task 2 muss tickets-db.ts fast nur aus re-exports bestehen
  loc=$(wc -l < "$REPO_ROOT/website/src/lib/tickets-db.ts")
  [ "$loc" -le 200 ]
}

@test "G-RH01 batch2: backup-restore.sh ist auf Dispatcher geschrumpft" {
  # Nach dem Split in Task 1 darf der Dispatcher < 500 Zeilen sein
  loc=$(wc -l < "$REPO_ROOT/scripts/backup-restore.sh")
  [ "$loc" -le 200 ]
}
