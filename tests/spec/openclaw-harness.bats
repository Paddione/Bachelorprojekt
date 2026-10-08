#!/usr/bin/env bats
# tests/spec/openclaw-harness.bats — Spec openclaw-harness-revive (T900794)
# Vertrag: .agents/plans/openclaw-harness-revive/design.md
#
# Prüfmodus: Registry per YAML-Parser lesen (kein grep auf Bezeichner);
# check.mjs und toolset-context.sh über ihren Exit-Code plus Ausgabe prüfen.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  REGISTRY="${REPO}/docs/agent-guide/registry/capabilities.yaml"
}

# yaml_get <expr über d> — gibt JSON.stringify(<expr>) des geparsten YAML aus.
yaml_get() {
  REPO_DIR="$REPO" REG_YAML="$REGISTRY" node - "$1" <<'JS'
const fs = require('node:fs');
const yaml = require(`${process.env.REPO_DIR}/node_modules/js-yaml`);
const d = yaml.load(fs.readFileSync(process.env.REG_YAML, 'utf8'));
const v = new Function('d', `return (${process.argv[2]});`)(d);
process.stdout.write(v === undefined ? 'undefined' : JSON.stringify(v));
JS
}

@test "Registry enthaelt harnesses.openclaw mit Rolle openclaw-ops und User-Scope-config" {
  run yaml_get 'd.harnesses.openclaw.roles'
  [ "$status" -eq 0 ]
  [ "$output" = '["openclaw-ops"]' ]
  run yaml_get 'd.harnesses.openclaw.config'
  [ "$status" -eq 0 ]
  [ "$output" = '"~/.openclaw/openclaw.json"' ]
}

@test "Schmaler Satz: K8s-Lesen, Task-Runner und Broker tragen openclaw-ops" {
  for inst in "mcp:mcp-kubernetes" "mcp:mcp-task-runner" "cli:openclaw-ask"; do
    run yaml_get "(()=>{for(const [c,insts] of Object.entries(d.capabilities)){if(insts['$inst']&&Array.isArray(insts['$inst'].roles))return insts['$inst'].roles;}return null;})()"
    [ "$status" -eq 0 ]
    [[ "$output" == *'"openclaw-ops"'* ]] || { echo "Rolle fehlt an $inst: $output"; return 1; }
  done
}

@test "check.mjs ist gruen" {
  run node "${REPO}/scripts/toolset/check.mjs"
  [ "$status" -eq 0 ]
}

@test "toolset-context.sh openclaw-ops enthaelt K8s-Lesen und Broker, aber keine Mutation" {
  run bash "${REPO}/scripts/toolset-context.sh" openclaw-ops
  [ "$status" -eq 0 ]
  [[ "$output" == *'mcp:mcp-kubernetes'* ]]
  [[ "$output" == *'cli:openclaw-ask'* ]]
  [[ "$output" == *'mcp:mcp-task-runner'* ]]
  [[ "$output" != *'kubernetes-mutation'* ]]
  [[ "$output" != *'cli:kubectl'* ]]
}

@test "sync --harness openclaw --dry-run bleibt offline-fehig" {
  run node "${REPO}/scripts/toolset/sync.mjs" --harness openclaw --dry-run
  [ "$status" -eq 0 ]
  [[ "$output" == *'SKIP openclaw'* ]]
}

@test "Adapter-Modul ist registriert und kennt das User-Scope-Ziel" {
  run node --input-type=module -e "import { ADAPTERS } from '${REPO}/scripts/toolset/lib/adapters/index.mjs'; if (!ADAPTERS.openclaw) throw new Error('openclaw adapter missing'); if (ADAPTERS.openclaw.file !== '~/.openclaw/openclaw.json') throw new Error('unexpected file: ' + ADAPTERS.openclaw.file); console.log('ok');"
  [ "$status" -eq 0 ]
  [ "$output" = "ok" ]
}
