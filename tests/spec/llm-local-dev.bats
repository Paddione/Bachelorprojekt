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
  # T900365: der llamacpp-local-Katalog fuehrt genau ein Modell:
  # Muse-Glimmer-30B (llama.cpp :1919, scripts/llm/glimmer.service).
  # limit.context 131072 ist die served KV (n_ctx in /props) und zugleich
  # max_position_embeddings von Glimmer. Frueher (Qwen, T900348) lag n_ctx_train
  # mit 262144 ueber dem real Verfuegbaren — daher die 262144-Sperre unten.
  #
  # Geprueft wird deshalb die EIGENSCHAFT: positive ganze Zahl, ungleich 262144
  # (frueheres n_ctx_train) und nicht groesser als 131072 (served KV).
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    const m = ((o.provider || {})['llamacpp-local'] || {}).models || {};
    const entry = m['Muse-Glimmer-30B'];
    if (!entry) { console.error('Muse-Glimmer-30B fehlt im llamacpp-local-Katalog'); process.exit(1); }
    const ctx = (entry.limit || {}).context;
    if (!Number.isInteger(ctx) || ctx <= 0) {
      console.error('ctx ' + ctx + ' ist keine positive ganze Zahl'); process.exit(1);
    }
    if (ctx === 262144) {
      console.error('ctx ' + ctx + ' ist das advertised max_model_len, nicht die served KV'); process.exit(1);
    }
    if (ctx > 131072) {
      console.error('ctx ' + ctx + ' uebersteigt die served 131072 KV'); process.exit(1);
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc defines the local family on Muse Glimmer (T002545/T900203/T900365)" {
  # T900203: die fuenf Familien-Handles (gptoss/devstral/gemma/gemma12/qwen38)
  # sind 2026-09-16 zu einem `local` kollabiert (T900164) — kein gemma-Subagent
  # mehr. Die lokale Familie ist: local + reviewer als Subagenten und
  # glimmer-primary als Primary, alle drei seit T900365 auf
  # llamacpp-local/Muse-Glimmer-30B.
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const a = JSON.parse(j).agent || {};
    const expect = { local: 'subagent', reviewer: 'subagent', 'glimmer-primary': 'primary' };
    for (const [name, mode] of Object.entries(expect)) {
      const v = a[name];
      if (!v) { console.error(name + ' fehlt in agent-models.jsonc'); process.exit(1); }
      if (v.mode !== mode) { console.error(name + ' mode ' + v.mode + ' != ' + mode); process.exit(1); }
      if (v.model !== 'llamacpp-local/Muse-Glimmer-30B') {
        console.error(name + ' model ' + v.model + ' != llamacpp-local/Muse-Glimmer-30B'); process.exit(1);
      }
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc provides a local primary with measured context (T002545/T016419/T900203)" {
  # T900203/T900365: der einzige lokale Primary ist glimmer-primary, Modell
  # Muse-Glimmer-30B. Sein Kontext ist der served-KV-Wert 131072. Die Zahl steht als konkreter Eintrag im Provider
  # (T014105-Prinzip); ihre Kopplung an -c der Unit prueft der Test unten.
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
    const prim = (o.agent || {})['glimmer-primary'];
    if (!prim) { console.error('glimmer-primary fehlt'); process.exit(1); }
    if (prim.mode !== 'primary') { console.error('glimmer-primary mode ' + prim.mode + ' != primary'); process.exit(1); }
    const model = prim.model;
    if (model !== 'llamacpp-local/Muse-Glimmer-30B') {
      console.error('glimmer-primary model ' + model + ' != llamacpp-local/Muse-Glimmer-30B'); process.exit(1);
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
    if (ctx > 131072) {
      console.error('ctx ' + ctx + ' uebersteigt die served 131072 KV'); process.exit(1);
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
  # T900203/T900365: der llamacpp-local-Katalog fuehrt genau ein Modell
  # (Muse-Glimmer-30B). Alle frueheren Checkpoint-Eintraege
  # — die toten GGUFs UND die ehemaligen Fallback-Eintraege (hauhau-qwen36,
  # gemma12-vision, qwen38-220k) — sind entfernt. Statisch geprueft — bewusst
  # KEIN Filesystem-Check gegen GGUF-Pfade (CI hat weder /mnt/c noch ~/models).
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};
    if (!('Muse-Glimmer-30B' in m)) {
      console.error('positive anchor failed: Muse-Glimmer-30B fehlt im llamacpp-local-Katalog'); process.exit(1);
    }
    const dead = ['Qwen3.8-27B-gsq','Qwen3.6-35B-A3B-NVFP4','qwen38-220k','gptoss-context','gemma26-factory','gemma4','gemma26-throughput','gemma12-vision','hauhau-qwen36']
      .filter(k => k in m);
    if (dead.length) { console.error('dead catalog entries still declared: ' + dead.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900348/T900365: catalog context matches -c and port of the llama.cpp unit" {
  # Die served KV entsteht aus -c in scripts/llm/glimmer.service. Weicht
  # limit.context davon ab, verspricht opencode mehr (oder weniger) Kontext als
  # der Server hat. Der Port muss der baseURL des Providers entsprechen.
  local unit="$REPO/scripts/llm/glimmer.service"
  run bash -c "grep -oE -- '-c [0-9]+' '$unit' | awk '{print \$2}'"
  [ "$status" -eq 0 ]
  [ "$output" = "131072" ]
  run bash -c "grep -oE -- '--port [0-9]+' '$unit' | awk '{print \$2}'"
  [ "$output" = "1919" ]
  run node -e "
    const d = require('json5').parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const e = (((d.provider || {})['llamacpp-local'] || {}).models || {})['Muse-Glimmer-30B'];
    console.log(e ? e.limit.context : 'missing');
  "
  [ "$output" = "131072" ]
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
