#!/usr/bin/env bats
# bats file_tags=offline
# factory-scout-drift.bats — Unit tests for scout-drift.cjs (pure JS, no cluster)

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
MOD="${PROJECT_DIR}/scripts/factory/scout-drift.cjs"

setup() { export PROJECT_DIR MOD; }

@test "scout-drift: module exists" {
  [ -f "$MOD" ]
}

@test "scout-drift: P == A -> distance 0" {
  run node -e "const {jaccardDistance}=require('$MOD'); process.stdout.write(String(jaccardDistance(['a.ts','b.ts'],['a.ts','b.ts'])))"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "scout-drift: disjoint sets -> distance 1" {
  run node -e "const {jaccardDistance}=require('$MOD'); process.stdout.write(String(jaccardDistance(['a.ts'],['b.ts'])))"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "scout-drift: P empty, A non-empty -> distance 1" {
  run node -e "const {jaccardDistance}=require('$MOD'); process.stdout.write(String(jaccardDistance([],['a.ts'])))"
  [ "$status" -eq 0 ]
  [ "$output" = "1" ]
}

@test "scout-drift: both empty -> distance 0" {
  run node -e "const {jaccardDistance}=require('$MOD'); process.stdout.write(String(jaccardDistance([],[])))"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "scout-drift: partial overlap (|intersect|=1, |union|=3) -> ~0.666" {
  run node -e "const {jaccardDistance}=require('$MOD'); const d=jaccardDistance(['a.ts','b.ts'],['a.ts','c.ts']); process.stdout.write(d.toFixed(4))"
  [ "$status" -eq 0 ]
  [ "$output" = "0.6667" ]
}

@test "scout-drift: filterNoise removes docs/generated/**" {
  run node -e "const {filterNoise}=require('$MOD'); process.stdout.write(JSON.stringify(filterNoise(['src/a.ts','docs/generated/x.md'])))"
  [ "$status" -eq 0 ]
  [ "$output" = '["src/a.ts"]' ]
}

@test "scout-drift: filterNoise removes repo-index.json" {
  run node -e "const {filterNoise}=require('$MOD'); process.stdout.write(JSON.stringify(filterNoise(['src/a.ts','docs/code-quality/repo-index.json'])))"
  [ "$status" -eq 0 ]
  [ "$output" = '["src/a.ts"]' ]
}

@test "scout-drift: filterNoise removes test-inventory.json" {
  run node -e "const {filterNoise}=require('$MOD'); process.stdout.write(JSON.stringify(filterNoise(['src/a.ts','website/src/data/test-inventory.json'])))"
  [ "$status" -eq 0 ]
  [ "$output" = '["src/a.ts"]' ]
}

@test "scout-drift: filterNoise removes plan/spec markdown" {
  run node -e "const {filterNoise}=require('$MOD'); process.stdout.write(JSON.stringify(filterNoise(['src/a.ts','docs/superpowers/plans/p.md','docs/superpowers/specs/s.md'])))"
  [ "$status" -eq 0 ]
  [ "$output" = '["src/a.ts"]' ]
}

@test "scout-drift: filterNoise returns [] for non-array input" {
  run node -e "const {filterNoise}=require('$MOD'); process.stdout.write(JSON.stringify(filterNoise(null)))"
  [ "$status" -eq 0 ]
  [ "$output" = "[]" ]
}
