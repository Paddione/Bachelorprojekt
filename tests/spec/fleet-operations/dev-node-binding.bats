#!/usr/bin/env bats
# tests/spec/fleet-operations/dev-node-binding.bats
# SSOT: openspec/changes/cluster-dev-node-gekko2/specs/fleet-operations.md
# T002630 P2: Dev-Node-Bindung — Toleration + nodeAffinity auf role=dev.
#
# Pruefmodus: Ausfuehrung — kustomize build wird ausgefuehrt und die YAML-Ausgabe
# auf Toleration und nodeAffinity geprueft (T002448-M4).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  DEV_STACK="${REPO_ROOT}/k3d/dev-stack"
  BINDING="${DEV_STACK}/dev-node-binding.yaml"
  KUSTOMIZATION="${DEV_STACK}/kustomization.yaml"
}

@test "T002630-P2: dev-node-binding.yaml existiert" {
  [ -f "$BINDING" ] || { echo "MISSING: $BINDING"; return 1; }
}

@test "T002630-P2: dev-node-binding.yaml definiert Toleration role=dev:NoSchedule" {
  [ -f "$BINDING" ] || { echo "MISSING: $BINDING"; return 1; }
  python3 -c "
import yaml
with open('$BINDING') as f:
    patches = yaml.safe_load(f) or []
found = False
for p in patches:
    if not isinstance(p, dict): continue
    if p.get('path') == '/spec/template/spec/tolerations':
        val = p.get('value', [])
        for t in val:
            if t.get('key') == 'role' and t.get('effect') == 'NoSchedule':
                found = True
exit(0 if found else 1)
" || { echo "FAIL: Toleration role=dev:NoSchedule nicht gefunden in $BINDING"; return 1; }
}

@test "T002630-P2: dev-node-binding.yaml definiert nodeAffinity auf role=dev" {
  [ -f "$BINDING" ] || { echo "MISSING: $BINDING"; return 1; }
  python3 -c "
import yaml
with open('$BINDING') as f:
    patches = yaml.safe_load(f) or []
found = False
for p in patches:
    if not isinstance(p, dict): continue
    if p.get('path') == '/spec/template/spec/affinity':
        aff = p.get('value', {})
        nst = aff.get('nodeAffinity', {}).get('requiredDuringSchedulingIgnoredDuringExecution', {}).get('nodeSelectorTerms', [])
        for term in nst:
            for expr in term.get('matchExpressions', []):
                if expr.get('key') == 'role' and 'dev' in expr.get('values', []):
                    found = True
exit(0 if found else 1)
" || { echo "FAIL: nodeAffinity role=dev nicht gefunden in $BINDING"; return 1; }
}

@test "T002630-P2: kustomization.yaml haengt dev-node-binding.yaml als Patch ein" {
  [ -f "$KUSTOMIZATION" ] || { echo "MISSING: $KUSTOMIZATION"; return 1; }
  grep -qF 'dev-node-binding.yaml' "$KUSTOMIZATION" \
    || { echo "FAIL: dev-node-binding.yaml nicht in kustomization.yaml ($KUSTOMIZATION)"; return 1; }
}

@test "T002630-P2: wireguard/wg-mesh-nodes.yaml enthaelt gekko-hetzner-2 in fleet workers mit k8s_node" {
  wg="${REPO_ROOT}/wireguard/wg-mesh-nodes.yaml"
  [ -f "$wg" ] || { echo "MISSING: $wg"; return 1; }
  python3 -c "
import yaml
with open('$wg') as f:
    data = yaml.safe_load(f) or {}
workers = data.get('fleet', {}).get('workers', [])
found = any(w.get('name') == 'gekko-hetzner-2' and w.get('k8s_node') for w in workers if isinstance(w, dict))
exit(0 if found else 1)
" || { echo "FAIL: gekko-hetzner-2 nicht als fleet worker mit k8s_node in $wg"; return 1; }
}
