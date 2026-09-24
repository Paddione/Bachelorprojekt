#!/usr/bin/env bats
# T900203 — FreeToken-Konsolidierung (T900164): der llamacpp-local-Katalog
# fuehrt genau ein Modell (seit T900348 Qwen3.8-27B-gsq, 153600 served KV),
# keine active/*-Aliase und keine freetoken-thinking/fast-Agenten mehr, und
# das alte Opencode-Plugin freetoken-active.ts ist entfernt.
#
# Pruefmodus: Source-Grep auf Repo-Konfiguration. Das ist die dokumentierte
# Ausnahme von der Output-Verifikation [T002448-M4]: der Zustand "Katalog
# enthaelt X" manifestiert sich ausschliesslich im Quelltext von
# .opencode/agent-models.jsonc bzw. im Verzeichnis .opencode/plugin/.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  MODELS_CFG="${REPO_ROOT}/.opencode/agent-models.jsonc"
  PLUGIN_DIR="${REPO_ROOT}/.opencode/plugin"
}

@test "T900203: llamacpp-local catalog holds exactly the single static model" {
  # Positiv-Anker [T002356-M1]: ohne ihn waere "genau eins" vakuos erfuellt,
  # sobald der Provider oder das Modell umbenannt wird und die Liste leer ist.
  run node -e "
    const d = require('json5').parse(require('fs').readFileSync('$MODELS_CFG','utf8'));
    const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};
    if (!('Qwen3.8-27B-gsq' in m)) {
      console.error('positive anchor failed: Qwen3.8-27B-gsq fehlt im llamacpp-local-Katalog'); process.exit(1);
    }
    const keys = Object.keys(m);
    if (keys.length !== 1) {
      console.error('catalog holds ' + keys.length + ' models, expected exactly 1: ' + keys.join(',')); process.exit(1);
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900203: no active/thinking/fast agent aliases remain" {
  # Positiv-Anker [T002356-M1]: die erwartete lokale Familie muss existieren,
  # sonst waere die Negativ-Aussage unten vakuos erfuellt.
  run node -e "
    const d = require('json5').parse(require('fs').readFileSync('$MODELS_CFG','utf8'));
    const a = d.agent || {};
    for (const name of ['local', 'reviewer', 'qwen38-primary']) {
      if (!(name in a)) {
        console.error('positive anchor failed: agent ' + name + ' fehlt'); process.exit(1);
      }
    }
    const bad = Object.keys(a).filter(k =>
      k === 'active' || k === 'active-thinking' || k === 'active-fast' ||
      k === 'freetoken-thinking' || k.startsWith('freetoken-fast'));
    if (bad.length) {
      console.error('stale agent aliases still declared: ' + bad.join(',')); process.exit(1);
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900203: freetoken-active plugin file is absent" {
  # Positiv-Anker [T002356-M1]: das Plugin-Verzeichnis muss existieren und
  # Eintraege tragen — sonst waere "nicht darunter" vakuos erfuellt.
  [ -d "$PLUGIN_DIR" ]
  run bash -c "ls -A '$PLUGIN_DIR' | grep -c ."
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run bash -c "ls -A '$PLUGIN_DIR'"
  [ "$status" -eq 0 ]
  run bash -c "ls -A '$PLUGIN_DIR' | grep -Fx 'freetoken-active.ts' || true"
  [ -z "$output" ]
}
