#!/usr/bin/env bats
# FA-AR-02: classify-risk.sh emits a tier verdict from a diff numstat.
setup() { load 'test_helper.bash'; }

CR="scripts/factory/classify-risk.sh"

# numstat rows are: <added>\t<deleted>\t<path>
@test "FA-AR-02: trivial tier (5 lines, 3 files)" {
  run env CLASSIFY_NUMSTAT=$'2\t0\tsrc/a.ts\n1\t1\tsrc/b.ts\n0\t1\tsrc/c.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"trivial"'
}

@test "FA-AR-02: lite tier (80 lines, 10 files)" {
  local ns=""
  for i in $(seq 1 10); do ns+=$'8\t0\tsrc/f'"$i"$'.ts\n'; done
  run env CLASSIFY_NUMSTAT="$ns" bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"lite"'
}

@test "FA-AR-02: full tier (150 lines)" {
  run env CLASSIFY_NUMSTAT=$'150\t0\tsrc/big.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
}

@test "FA-AR-02: security escalation — small k3d change is full" {
  run env CLASSIFY_NUMSTAT=$'1\t1\tk3d/website.yaml' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
  echo "$output" | grep -q 'k3d/website.yaml'
}

@test "FA-AR-02: scripts/factory change escalates to full" {
  run env CLASSIFY_NUMSTAT=$'1\t0\tscripts/factory/foo.sh' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | grep -q '"tier": *"full"'
}

@test "FA-AR-02: output is valid JSON with required keys" {
  run env CLASSIFY_NUMSTAT=$'3\t0\tsrc/a.ts' bash "$CR" HEAD
  [ "$status" -eq 0 ]
  echo "$output" | jq -e '.tier and (.linesChanged|type=="number") and (.fileCount|type=="number") and (.securityFiles|type=="array")'
}
