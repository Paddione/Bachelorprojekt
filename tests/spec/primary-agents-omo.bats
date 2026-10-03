#!/usr/bin/env bats
# tests/spec/primary-agents-omo.bats — T900858
#   Requirement: three thin domain primaries (bp-build/bp-run/bp-ship) replace
#   the six legacy bachelorprojekt-* domain agents plus the legacy opencode
#   primaries (glimmer-primary, big-pickle, ox-alpha, ox-alpha-free).
#
# PRUEFMODUS: Source-Grep auf Repo-Konfiguration. Wie single-static-model.bats
# dokumentiert, ist das die Ausnahme von der Output-Verifikation [T002448-M4]:
# der Zustand "Roster enthaelt X" manifestiert sich ausschliesslich im Quelltext
# von .opencode/agent-models.jsonc, .claude/agents/ und der Registry.
#
# Red phase: auf dem Basis-Commit faellt diese Suite mit expected: FAIL
# (legacy roster noch vorhanden, keine bp-* primaries).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  MODELS_CFG="${REPO_ROOT}/.opencode/agent-models.jsonc"
  AGENTS_DIR="${REPO_ROOT}/.claude/agents"
  REGISTRY="${REPO_ROOT}/docs/agent-guide/registry/agents.yaml"
}

@test "T900858: opencode declares bp-build/bp-run/bp-ship as primaries" {
  # Positiv-Anker [T002356-M1]: ohne parse-Anker waere "nicht deklariert"
  # vakuos erfuellt, sobald die Config unlesbar wird.
  run node -e "
    const d = require('json5').parse(require('fs').readFileSync('$MODELS_CFG','utf8'));
    const a = d.agent || {};
    # T900929: bp-ship zeigt auf den in-client verifizierten Chat-Rail
    # (`opencode-go`, 2026-10-03); `opencode-go-oai` antwortet mit
    # Invalid credential und ist stillgelegt — der alte Pin waere tot.
    const expect = {
      'bp-build': 'llamacpp-local/Qwen3.8-27B',
      'bp-run': 'llamacpp-local/Qwen3.8-27B',
      'bp-ship': 'opencode-go/muse-spark-1.3-contributor',
    };
    for (const [name, model] of Object.entries(expect)) {
      const v = a[name];
      if (!v) { console.error('primary ' + name + ' fehlt in agent-models.jsonc'); process.exit(1); }
      if (v.mode !== 'primary') { console.error(name + ' mode ' + v.mode + ' != primary'); process.exit(1); }
      if (v.model !== model) { console.error(name + ' model ' + v.model + ' != ' + model); process.exit(1); }
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900858: .claude/agents mirrors the bp-* triple with tier models" {
  # Positiv-Anker: das Agenten-Verzeichnis muss existieren und Eintraege
  # tragen — sonst waere "kein bachelorprojekt-*" vakuos erfuellt.
  [ -d "$AGENTS_DIR" ]
  run bash -c "ls -A '$AGENTS_DIR' | grep -c ."
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]

  run node -e "
    const fs = require('fs');
    const expect = { 'bp-build': 'opus', 'bp-run': 'sonnet', 'bp-ship': 'sonnet' };
    for (const [name, model] of Object.entries(expect)) {
      const p = '$AGENTS_DIR/' + name + '.md';
      let s;
      try { s = fs.readFileSync(p, 'utf8'); }
      catch (e) { console.error('mirror fehlt: ' + p); process.exit(1); }
      if (!s.includes('name: ' + name)) { console.error(p + ': frontmatter name fehlt'); process.exit(1); }
      if (!s.includes('model: ' + model)) { console.error(p + ': model ' + model + ' fehlt'); process.exit(1); }
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900858: no bachelorprojekt-* agent file remains" {
  run bash -c "ls '$AGENTS_DIR'/bachelorprojekt-*.md 2>/dev/null || true"
  [ -z "$output" ]
}

@test "T900858: legacy opencode primaries are retired from agent-models.jsonc" {
  # Positiv-Anker: die bleibende Belegschaft muss existieren, sonst waere
  # die Negativ-Aussage unten vakuos erfuellt.
  run node -e "
    const d = require('json5').parse(require('fs').readFileSync('$MODELS_CFG','utf8'));
    const a = d.agent || {};
    for (const name of ['local', 'qwen3-4b', 'exe-muse', 'reviewer']) {
      if (!(name in a)) { console.error('positive anchor failed: agent ' + name + ' fehlt'); process.exit(1); }
    }
    const retired = ['glimmer-primary', 'big-pickle', 'ox-alpha', 'ox-alpha-free'];
    const bad = retired.filter(k => k in a);
    if (bad.length) { console.error('retired primaries still declared: ' + bad.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900858: agents.yaml registry tracks the cutover (roles + runtimes)" {
  run node -e "
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('$REGISTRY','utf8'));
    for (const name of ['bp-build', 'bp-run', 'bp-ship']) {
      if (!d.roles || !(name in d.roles)) { console.error('role fehlt: ' + name); process.exit(1); }
      if (!d.runtimes || !(name in d.runtimes)) { console.error('runtime fehlt: ' + name); process.exit(1); }
    }
    const retired = ['bachelorprojekt-ops', 'bachelorprojekt-db', 'bachelorprojekt-infra',
      'bachelorprojekt-test', 'bachelorprojekt-website', 'bachelorprojekt-security',
      'glimmer-primary', 'big-pickle', 'ox-alpha', 'ox-alpha-free'];
    const bad = retired.filter(k => (d.roles && k in d.roles) || (d.runtimes && k in d.runtimes));
    if (bad.length) { console.error('retired entries still in registry: ' + bad.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}
