#!/usr/bin/env bats
# tests/unit/vda-core.bats
# Offline test of vda-core.sh helpers.

@test "vda_header prints banner" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_header "Test Header"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"Test Header"* ]]
  [[ "$output" == *"──"* ]]
}

@test "vda_section prints bullet point" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_section "key" "value"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"• key: value"* ]]
}

@test "vda_list prints numbered list" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_list "Items" "one" "two"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"Items:"* ]]
  [[ "$output" == *"1. one"* ]]
  [[ "$output" == *"2. two"* ]]
}

@test "vda_error outputs to stderr" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_error "danger"'
  [ "$status" -eq 0 ]
  [[ "$output" == *"danger"* ]]
}

@test "vda_choose returns default in non-interactive mode" {
  run bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_choose "Select?" "first" "second"'
  [ "$status" -eq 0 ]
  [ "$output" = "first" ]
}

@test "vda_confirm returns true in non-interactive mode" {
  run bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_confirm "Continue?"'
  [ "$status" -eq 0 ]
}

@test "vda_input returns default in non-interactive mode" {
  run bash -c 'source scripts/lib/vda-core.sh; VDA_NONINTERACTIVE=1 vda_input "Name?" "default"'
  [ "$output" = "default" ]
}

@test "vda_json builds JSON without jq" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_json key=value num=42'
  [[ "$output" == *'"key":"value"'* ]]
  [[ "$output" == *'"num":"42"'* ]]
}

@test "vda_exec runs a command" {
  run bash -c 'source scripts/lib/vda-core.sh; vda_exec "echo hello"'
  [[ "$output" == *"hello"* ]]
}

@test "vda_dry_run does not execute" {
  local tmpfile="tests/unit/dry_run_test_file"
  rm -f "$tmpfile"
  run bash -c "source scripts/lib/vda-core.sh; DRY_RUN=1 vda_exec 'touch $tmpfile'"
  [ ! -f "$tmpfile" ]
}
