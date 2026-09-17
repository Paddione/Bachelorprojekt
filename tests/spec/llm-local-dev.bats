#!/usr/bin/env bats
# tests/spec/llm-local-dev.bats
# SSOT: openspec/specs/llm-local-dev.md
#
# Covers: Taskfile.openclaw.yml validity, required tasks, env.example config.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO/taskfiles/Taskfile.openclaw.yml"
  ENV_EXAMPLE="$REPO/openclaw/.env.example"
}

# ── Taskfile existence and validity ───────────────────────────────────

@test "Taskfile.openclaw.yml exists" {
  [ -f "$TASKFILE" ]
}

@test "Taskfile.openclaw.yml is valid YAML (parseable)" {
  run python3 -c "import yaml; yaml.safe_load(open('$TASKFILE'))"
  [ "$status" -eq 0 ]
}

# ── Required task declarations ────────────────────────────────────────

@test "Taskfile.openclaw.yml declares install task" {
  run grep -qE '^\s*install:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares configure task" {
  run grep -qE '^\s*configure:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares start task" {
  run grep -qE '^\s*start:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares status task" {
  run grep -qE '^\s*status:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares logs task" {
  run grep -qE '^\s*logs:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares backup task" {
  run grep -qE '^\s*backup:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares restore task" {
  run grep -qE '^\s*restore:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

@test "Taskfile.openclaw.yml declares wipe task" {
  run grep -qE '^\s*wipe:' "$TASKFILE"
  [ "$status" -eq 0 ]
}

# ── Env example config ────────────────────────────────────────────────

@test "openclaw/.env.example exists" {
  [ -f "$ENV_EXAMPLE" ]
}

@test "openclaw/.env.example sets OPENAI_BASE_URL to local Ollama endpoint" {
  run grep -qE '^OPENAI_BASE_URL=http://10\.10\.0\.3:11434/v1$' "$ENV_EXAMPLE"
  [ "$status" -eq 0 ]
}

@test "openclaw/.env.example sets OPENAI_MODEL to qwen2.5 series" {
  run grep -qE '^OPENAI_MODEL=qwen2\.5:' "$ENV_EXAMPLE"
  [ "$status" -eq 0 ]
}

# ── opencode llamacpp-mtp provider config (T002159) ───────────────────
# Der Provider-Key `llamacpp-gemma26` darf NUR in .opencode/agent-models.jsonc
# definiert sein. Diese Datei ist die Sync-Quelle (Taskfile.yml -> 
# scripts/opencode-sync-agents.sh -> ~/.config/opencode/opencode.jsonc).
# Eine zweite Definition in .opencode/opencode.jsonc ueberschreibt den
# gesyncten Wert projekt-lokal und driftet unbemerkt ab.

@test "opencode.jsonc defines no duplicate llamacpp-gemma26 provider" {
  # Semantische Pruefung statt Textsuche: erklaerende Kommentare duerfen den
  # Provider-Namen nennen, nur eine echte Definition im provider-Objekt ist verboten.
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/opencode.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    process.exit('llamacpp-gemma26' in (o.provider || {}) ? 1 : 0);
  "
  [ "$status" -eq 0 ]
}

@test "no .opencode config points a baseURL at the Bonsai port 8093" {
  # Kommentarzeilen ausgenommen — der Bonsai-Port darf dokumentiert werden,
  # nur nicht als aktive baseURL gesetzt sein.
  run bash -c "grep -hE '\"baseURL\": *\"https?://[^\"]*:8093' \"$REPO\"/.opencode/*.jsonc | grep -vE '^\s*//'"
  [ -z "$output" ]
}

@test "agent-models.jsonc defines the llamacpp-local provider (T002545/T002633)" {
  # T002633: die Provider llamacpp-gemma26 und llamacpp-gemma9 wurden zurueckgezogen —
  # ihre GGUF-Gewichte sind weg. Der lokale llama.cpp-Provider heisst seither
  # llamacpp-local und traegt die Loadouts gptoss-context und devstral-quality.
  run grep -q '"llamacpp-local"' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc points the local llama.cpp provider at the llm-proxy, not at :8091 (T002558)" {
  # T002558: opencode geht durch den Proxy. Damit gilt max_inflight=1 auch fuer
  # die Agenten (sie serialisieren statt gleichzeitig auf den Server zu gehen),
  # und die Fallback-Kette gemma -> deepseek -> opencode-zen greift auch lokal.
  # Vorher stand hier :8091 — direkt am Proxy vorbei.
  # [T900208] Der llm-proxy (:18235) ist stillgelegt — der Provider zeigt direkt
  # auf FreeToken-native :1919 (openspec/specs/llm-local-dev.md).
  run grep -qE '"baseURL": *"http://127\.0\.0\.1:1919/v1"' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -eq 0 ]
  run grep -qE '"baseURL": *"http://127\.0\.0\.1:18235' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -ne 0 ]

  # Negativ-Aussage nach dem Anker: kein llamacpp-Provider zeigt mehr direkt
  # auf den Server.
  run bash -c "python3 - <<'EOF'
import re
s = open('$REPO/.opencode/agent-models.jsonc').read()
bad = re.findall(r'\"(llamacpp[^\"]*)\"\s*:\s*\{.*?\"baseURL\"\s*:\s*\"[^\"]*:8091[^\"]*\"', s, re.S)
print(len(bad))
EOF"
  [ "$output" = "0" ]
}

@test "agent-models.jsonc declares a MEASURED context for the local model, not n_ctx_train (T002545/T002558/T002633)" {
  # T900203: der llamacpp-local-Katalog fuehrt seit der FreeToken-Konsolidierung
  # (T900164) genau ein Modell: Qwen3.6-35B-A3B-NVFP4. limit.context 200000 ist
  # die GEMESSENE served KV (/v1/cache/status num_pages, model-matrix.md) —
  # nicht das advertised max_model_len 262144, das ueber dem real Verfuegbaren
  # liegt. Die fruehere Loadout-Kopplung (loadouts.json) ist entfallen:
  # FreeToken faehrt einen statischen 200k-KV-Pool, die Zahl steht im
  # Provider-Eintrag.
  #
  # Geprueft wird deshalb die EIGENSCHAFT: positive ganze Zahl, ungleich 262144
  # (advertised max_model_len) und nicht groesser als 200000 (served KV).
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    const m = ((o.provider || {})['llamacpp-local'] || {}).models || {};
    const entry = m['Qwen3.6-35B-A3B-NVFP4'];
    if (!entry) { console.error('Qwen3.6-35B-A3B-NVFP4 fehlt im llamacpp-local-Katalog'); process.exit(1); }
    const ctx = (entry.limit || {}).context;
    if (!Number.isInteger(ctx) || ctx <= 0) {
      console.error('ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
    }
    if (ctx === 262144) {
      console.error('ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
    }
    if (ctx > 200000) {
      console.error('ctx ' + ctx + ' uebersteigt die served 200k KV'); process.exit(1);
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc defines the local family on Qwen3.6 (T002545/T900203)" {
  # T900203: die fuenf Familien-Handles (gptoss/devstral/gemma/gemma12/qwen38)
  # sind 2026-09-16 zu einem `local` kollabiert (T900164) — kein gemma-Subagent
  # mehr. Die lokale Familie ist: local + reviewer als Subagenten und
  # qwen38-primary als Primary, alle drei auf
  # llamacpp-local/Qwen3.6-35B-A3B-NVFP4.
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const a = JSON.parse(j).agent || {};
    const expect = { local: 'subagent', reviewer: 'subagent', 'qwen38-primary': 'primary' };
    for (const [name, mode] of Object.entries(expect)) {
      const v = a[name];
      if (!v) { console.error(name + ' fehlt in agent-models.jsonc'); process.exit(1); }
      if (v.mode !== mode) { console.error(name + ' mode ' + v.mode + ' != ' + mode); process.exit(1); }
      if (v.model !== 'llamacpp-local/Qwen3.6-35B-A3B-NVFP4') {
        console.error(name + ' model ' + v.model + ' != llamacpp-local/Qwen3.6-35B-A3B-NVFP4'); process.exit(1);
      }
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc provides a local primary with measured context (T002545/T016419/T900203)" {
  # T900203: der einzige lokale Primary ist qwen38-primary (Name historisch,
  # Modell aktuell Qwen3.6-35B-A3B-NVFP4). Sein Kontext ist der gemessene
  # served-KV-Wert 200000 — nicht das advertised max_model_len 262144.
  #
  # Die fruehere Loadout-Bindung (loadouts.json) ist entfallen: FreeToken
  # faehrt einen statischen 200k-KV-Pool, die Zahl steht als konkreter Eintrag
  # im Provider und wird hier exakt zugesichert (T014105-Prinzip).
  #
  # Warum <= und nicht ==: ein niedrigerer Wert ist konservativ und harmlos.
  # Schaden entsteht nur in der anderen Richtung: wenn die Config MEHR verspricht
  # als gemessen wurde — und genau das war der Ursprungsfall (262144 behauptet,
  # real verfuegbar weniger).
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    const prim = (o.agent || {})['qwen38-primary'];
    if (!prim) { console.error('qwen38-primary fehlt'); process.exit(1); }
    if (prim.mode !== 'primary') { console.error('qwen38-primary mode ' + prim.mode + ' != primary'); process.exit(1); }
    const model = prim.model;
    if (model !== 'llamacpp-local/Qwen3.6-35B-A3B-NVFP4') {
      console.error('qwen38-primary model ' + model + ' != llamacpp-local/Qwen3.6-35B-A3B-NVFP4'); process.exit(1);
    }
    const [prov, mid] = model.split('/');
    const entry = ((o.provider[prov] || {}).models || {})[mid];
    if (!entry) { console.error('model ' + model + ' fehlt im Provider ' + prov); process.exit(1); }
    const ctx = (entry.limit || {}).context;
    if (!Number.isInteger(ctx) || ctx <= 0) {
      console.error('ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
    }
    if (ctx === 262144) {
      console.error('ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
    }
    if (ctx > 200000) {
      console.error('ctx ' + ctx + ' uebersteigt die served 200k KV'); process.exit(1);
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "orchestrator may not dispatch gemma via a wildcard (T002298)" {
  # "gemma-4-12b-*": "allow" wuerde jeden neu hinzugefuegten gemma-4-12b-<n>
  # automatisch mitfreigeben und die Ein-Subagent-Grenze lautlos aufheben.
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const t = ((JSON.parse(j).agent || {}).orchestrator || {}).permission || {};
    const keys = Object.keys(t.task || {});
    const wild = keys.filter(k => k.startsWith('gemma') && k.includes('*'));
    if (wild.length) { console.error('wildcard gemma grants: ' + JSON.stringify(wild)); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T016419: dead checkpoint catalog entries are removed" {
  # T900203: der llamacpp-local-Katalog fuehrt seit der FreeToken-Konsolidierung
  # genau ein Modell (Qwen3.6-35B-A3B-NVFP4). Alle frueheren Checkpoint-Eintraege
  # — die toten GGUFs UND die ehemaligen Fallback-Eintraege (hauhau-qwen36,
  # gemma12-vision, qwen38-220k) — sind entfernt. Statisch geprueft — bewusst
  # KEIN Filesystem-Check gegen GGUF-Pfade (CI hat weder /mnt/c noch ~/models).
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};
    if (!('Qwen3.6-35B-A3B-NVFP4' in m)) {
      console.error('positive anchor failed: Qwen3.6-35B-A3B-NVFP4 fehlt im llamacpp-local-Katalog'); process.exit(1);
    }
    const dead = ['qwen38-220k','gptoss-context','gemma26-factory','gemma4','gemma26-throughput','gemma12-vision','hauhau-qwen36']
      .filter(k => k in m);
    if (dead.length) { console.error('dead catalog entries still declared: ' + dead.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900051: FreeToken smoke test verifies version model KV and concurrency" {
  local smoke="$REPO/.opencode/skills/freetoken-setup/scripts/smoke-test.sh"
  run bash -n "$smoke"
  [ "$status" -eq 0 ]
  run grep -qF 'engine version:' "$smoke"
  [ "$status" -eq 0 ]
  run grep -qF 'model mismatch:' "$smoke"
  [ "$status" -eq 0 ]
  run grep -qF 'usable KV capacity:' "$smoke"
  [ "$status" -eq 0 ]
  run grep -qF -- '--max-running-requests 1' "$smoke"
  [ "$status" -eq 0 ]
}

@test "T014105: opencode-sync-agents.sh distributes plugins to the global config" {
  run grep -qE 'plugin' "$REPO/scripts/opencode-sync-agents.sh"
  [ "$status" -eq 0 ]
}
