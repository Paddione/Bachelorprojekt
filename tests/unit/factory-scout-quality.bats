#!/usr/bin/env bats
# bats file_tags=offline
# factory-scout-quality.bats — Unit tests for evaluateScoutQuality (pure JS, no cluster)

load test_helper

PROJECT_DIR="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
MOD="${PROJECT_DIR}/scripts/factory/scout-quality-check.cjs"

setup() { export PROJECT_DIR MOD; }

@test "scout-quality: module exists" {
  [ -f "$MOD" ]
}

@test "scout-quality: empty touched_files -> weak with touched_files_empty" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:[],spec_content:'x'.repeat(400),plan_path:'p.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'touched_files_empty'* ]]
}

@test "scout-quality: spec under 300 chars -> weak with spec_too_short" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts'],spec_content:'short',plan_path:'p.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'spec_too_short'* ]]
}

@test "scout-quality: missing plan_path -> weak with no_plan_path" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts'],spec_content:'x'.repeat(400),plan_path:null}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":true'* ]]
  [[ "$output" == *'no_plan_path'* ]]
}

@test "scout-quality: clean output -> not weak, empty reasons" {
  run node -e "const {evaluateScoutQuality}=require('$MOD'); const r=evaluateScoutQuality({touched_files:['a.ts','b.ts'],spec_content:'x'.repeat(400),plan_path:'docs/plan.md'}); process.stdout.write(JSON.stringify(r))"
  [ "$status" -eq 0 ]
  [[ "$output" == *'"weak":false'* ]]
  [[ "$output" == *'"reasons":[]'* ]]
}
