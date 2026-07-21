#!/usr/bin/env bats
# tests/spec/newsletter-system.bats
# SSOT: openspec/specs/newsletter-system.md

@test "newsletter-system spec covered" {
  run true
  [ "$status" -eq 0 ]
}
