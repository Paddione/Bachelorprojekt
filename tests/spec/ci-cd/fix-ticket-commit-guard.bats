#!/usr/bin/env bats
# SSOT: openspec/specs/ci-cd.md
# Prüfmodus: command output verification (T002448-M4) — ruft
# scripts/check-fix-ticket-guard.sh mit Beispiel-Commit-Messages auf und
# prüft die Exit-Codes. Positiv-Anker zuerst (T002356-M1).

setup() {
  bats_require_minimum_version 1.5.0
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  GUARD="$REPO_ROOT/scripts/check-fix-ticket-guard.sh"
}

@test "fix-Commit MIT Ticket-ID passiert (Positiv-Anker)" {
  cd "$REPO_ROOT"
  local msg_file
  msg_file="$(mktemp)"
  printf 'fix(scripts): irgendein Fix [T004899]' > "$msg_file"
  run bash "$GUARD" "$msg_file"
  [ "$status" -eq 0 ]
  rm -f "$msg_file"
}

@test "fix-Commit OHNE Ticket-ID wird geblockt" {
  cd "$REPO_ROOT"
  local msg_file
  msg_file="$(mktemp)"
  printf 'fix(scripts): irgendein Fix ohne Ticket' > "$msg_file"
  run bash "$GUARD" "$msg_file"
  [ "$status" -eq 1 ]
  rm -f "$msg_file"
}

@test "SKIP_FIX_TICKET_GUARD=1 umgeht den Block" {
  cd "$REPO_ROOT"
  local msg_file
  msg_file="$(mktemp)"
  printf 'fix(scripts): Notfall ohne Ticket' > "$msg_file"
  run env SKIP_FIX_TICKET_GUARD=1 bash "$GUARD" "$msg_file"
  [ "$status" -eq 0 ]
  rm -f "$msg_file"
}

@test "feat-Commit ohne Ticket bleibt unberührt" {
  cd "$REPO_ROOT"
  local msg_file
  msg_file="$(mktemp)"
  printf 'feat(website): neue Seite' > "$msg_file"
  run bash "$GUARD" "$msg_file"
  [ "$status" -eq 0 ]
  rm -f "$msg_file"
}
