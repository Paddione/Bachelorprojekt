#!/usr/bin/env bats
# tests/spec/sidekick-assistant.bats
# SSOT: openspec/specs/sidekick-assistant.md
#
# Covers: Profile-based access separation, nudge API routes, chat interface.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  API_DIR="$REPO/website/src/pages/api/assistant"
}

# ── API routes exist ──────────────────────────────────────────────────

@test "assistant execute API route exists" {
  [ -f "$API_DIR/execute.ts" ]
}

@test "assistant nudges API route exists" {
  [ -f "$API_DIR/nudges.ts" ]
}

@test "assistant chat API route exists" {
  [ -f "$API_DIR/chat.ts" ]
}

@test "assistant dismiss API route exists" {
  [ -f "$API_DIR/dismiss.ts" ]
}

# ── Profile-based access separation ───────────────────────────────────

@test "execute.ts enforces profile validation (admin|portal)" {
  run grep -q "profile.*admin.*portal\|invalid profile" "$API_DIR/execute.ts"
  [ "$status" -eq 0 ]
}

@test "execute.ts rejects non-admin profiles from admin actions" {
  run grep -q '403\|forbidden' "$API_DIR/execute.ts"
  [ "$status" -eq 0 ]
}

@test "nudges.ts enforces profile validation" {
  run grep -q "profile.*admin.*portal\|invalid profile" "$API_DIR/nudges.ts"
  [ "$status" -eq 0 ]
}

@test "chat.ts enforces profile validation" {
  run grep -q "profile.*admin.*portal\|invalid profile" "$API_DIR/chat.ts"
  [ "$status" -eq 0 ]
}

# ── Chat profile separation ───────────────────────────────────────────

@test "chat.ts restricts useBooks to admin profile only" {
  run grep -q "admin.*useBooks\|useBooks.*admin" "$API_DIR/chat.ts"
  [ "$status" -eq 0 ]
}
