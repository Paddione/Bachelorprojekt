#!/usr/bin/env bats
# tests/spec/fleet-operations/membership-drift.bats
# SSOT: openspec/changes/cluster-dev-node-gekko2/specs/fleet-operations.md
# T002630 P3: Drift-Gate — fleet-membership-check.sh meldet beide Richtungen
# und skipped ohne Cluster-Zugang.
#
# Pruefmodus: Ausfuehrung — das Skript wird mit synthetischer Registry
# ausgefuehrt und Exit-Code plus Ausgabe geprueft (T002448-M4).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/fleet-membership-check.sh"
  TMPDIR="$(mktemp -d)"
}

teardown() {
  rm -rf "$TMPDIR"
}

@test "T002630-P3: fleet-membership-check.sh existiert und ist ausfuehrbar" {
  [ -f "$SCRIPT" ] || { echo "MISSING: $SCRIPT"; return 1; }
  [ -x "$SCRIPT" ] || { echo "NOT executable: $SCRIPT"; return 1; }
}

@test "T002630-P3: Skript skipped ohne Cluster-Zugang (kubectl unerreichbar)" {
  # Synthetische Registry mit einem Node, kubectl auf nichtexistenten Context
  cat > "$TMPDIR/test-registry.yaml" <<'EOF'
fleet:
  nodes:
    - name: pk-hetzner-4
      k8s_node: true
  workers: []
EOF
  run bash -c "KUBECTL=nonexistent-kubectl WG_REGISTRY_FILE=$TMPDIR/test-registry.yaml $SCRIPT 2>&1"
  [ "$status" -eq 0 ] \
    || { echo "FAIL: exit=$status, expected 0 (Skip). output=$output"; return 1; }
  echo "$output" | grep -qi 'uebersprungen\|skip\|nicht erreichbar' \
    || { echo "FAIL: Skript meldet keinen Skip bei fehlendem Cluster. output=$output"; return 1; }
}

@test "T002630-P3: Skript meldet deklariert-aber-abwesend (Exit != 0)" {
  # Registry deklariert pk-hetzner-99 (existiert nicht), Cluster hat nur pk-hetzner-4
  cat > "$TMPDIR/test-registry.yaml" <<'EOF'
fleet:
  nodes:
    - name: pk-hetzner-4
      k8s_node: true
    - name: pk-hetzner-99
      k8s_node: true
  workers: []
EOF
  # Simuliere kubectl mit nur pk-hetzner-4
  cat > "$TMPDIR/kubectl" <<'KUBE'
#!/usr/bin/env bash
if [[ "$*" == *"get nodes"* ]]; then
  echo "node/pk-hetzner-4"
  exit 0
fi
exit 1
KUBE
  chmod +x "$TMPDIR/kubectl"
  PATH="$TMPDIR:$PATH" KUBECTL="$TMPDIR/kubectl" WG_REGISTRY_FILE="$TMPDIR/test-registry.yaml" \
    run bash "$SCRIPT" 2>&1
  [ "$status" -ne 0 ] \
    || { echo "FAIL: exit=$status, expected != 0 bei Drift. output=$output"; return 1; }
  echo "$output" | grep -q 'pk-hetzner-99' \
    || { echo "FAIL: Ausgabe nennt nicht den fehlenden Node pk-hetzner-99. output=$output"; return 1; }
}

@test "T002630-P3: Skript Exit 0 bei Deckungsgleichheit" {
  cat > "$TMPDIR/test-registry.yaml" <<'EOF'
fleet:
  nodes:
    - name: pk-hetzner-4
      k8s_node: true
  workers: []
EOF
  cat > "$TMPDIR/kubectl" <<'KUBE'
#!/usr/bin/env bash
if [[ "$*" == *"get nodes"* ]]; then
  echo "node/pk-hetzner-4"
  exit 0
fi
exit 1
KUBE
  chmod +x "$TMPDIR/kubectl"
  PATH="$TMPDIR:$PATH" KUBECTL="$TMPDIR/kubectl" WG_REGISTRY_FILE="$TMPDIR/test-registry.yaml" \
    run bash "$SCRIPT" 2>&1
  [ "$status" -eq 0 ] \
    || { echo "FAIL: exit=$status, expected 0 bei Deckungsgleichheit. output=$output"; return 1; }
}

@test "T002630-P3: Taskfile.yml enthaelt task fleet:membership (S4-Erreichbarkeit)" {
  taskfile="${REPO_ROOT}/Taskfile.yml"
  [ -f "$taskfile" ] || { echo "MISSING: $taskfile"; return 1; }
  grep -q 'fleet:membership' "$taskfile" \
    || { echo "FAIL: Taskfile.yml enthaelt keinen fleet:membership Task"; return 1; }
}
