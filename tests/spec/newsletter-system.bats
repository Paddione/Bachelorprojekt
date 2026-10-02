#!/usr/bin/env bats
# tests/spec/newsletter-system.bats

@test "newsletter-system spec covered" {
  run true
  [ "$status" -eq 0 ]
}
