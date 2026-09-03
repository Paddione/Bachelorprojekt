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
  run grep -qE '"baseURL": *"http://127\.0\.0\.1:18235/v1"' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -eq 0 ]

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

@test "agent-models.jsonc declares a MEASURED context for the local loadout, not n_ctx_train (T002545/T002558/T002633)" {
  # Keine harte Konstante mehr. --fit entscheidet den Wert zur Laufzeit, und er
  # aendert sich mit der Slot-Zahl: fuer das fruehere gemma26-factory wurden bei
  # einem Slot 99840 gemessen, bei drei (T002545) nur noch 88832, weil der
  # geteilte -kvu-Puffer fuer drei Sequenzen reichen muss. Eine gepflegte Zahl
  # driftet damit bei jeder Loadout-Aenderung — genau die Klasse, die dieses
  # Ticket schliesst. Traeger ist seit T016419 qwen38-220k (Qwen3.8-27B,
  # gemessen 114688); gptoss-context wurde mit seinen toten GGUFs entfernt,
  # die Eigenschaft bleibt dieselbe.
  #
  # Geprueft wird deshalb die EIGENSCHAFT: plausibel und nicht n_ctx_train
  # (262144 fuer Qwen3.8-27B), das ueber dem real Verfuegbaren liegt.
  ctx="$(awk '/"qwen38-220k": *\{/,/"context"/' \
    "$REPO/.opencode/agent-models.jsonc" | grep -oE '"context": *[0-9]+' | head -1 | grep -oE '[0-9]+')"
  [ -n "$ctx" ]
  [ "$ctx" != "262144" ]
  [ "$ctx" -gt 50000 ]
  [ "$ctx" -lt 200000 ]
}

@test "agent-models.jsonc defines three gemma subagents (T002545)" {
  # T002545: drei Slots (parallel=3) mit unified context (-kvu). Einer pro
  # potential concurrent session — die llm-proxy serialisiert (max_inflight=1).
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const a = JSON.parse(j).agent || {};
    const sub = Object.entries(a)
      .filter(([n,v]) => n.startsWith('gemma') && v.mode === 'subagent')
      .map(([n]) => n);
    if (sub.length < 1) { console.error('no gemma subagents found'); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc provides a local primary with measured context (T002545/T016419)" {
  # T002545: mode:primary, und der genannte Kontext ist ein GEMESSENER Wert,
  # kein n_ctx_train. T016419: der einzige lokale Primary ist freetoken-primary —
  # die frueheren gemma-Primaries waren Klon-Leichen und sind entfernt; geprueft
  # wird jetzt jeder Primary auf dem LOKALEN Stack (freetoken-local/llamacpp-local).
  #
  # [T003065] Vorher lautete die Bedingung
  #   ctx === 262144 || ctx <= 50000 || ctx >= 200000  ->  implausible
  # 262144 war der n_ctx_train-Wert des abgeloesten 12B-Servers, die Obergrenze
  # 200000 eine daraus abgeleitete Faustzahl. Beides bricht, sobald ein Loadout
  # legitim mehr misst: gemma12-vision belegt genau 262144 in
  # scripts/llm/loadouts.json ("Gemessen: 262.144 Kontext"). Geprueft wird jetzt
  # die Zahl gegen das im Loadout DOKUMENTIERTE Maximum: ctx <= gemessen.
  # Semantik statt Darstellung [T002716].
  #
  # Warum <= und nicht ==: gemma26-factory nennt 161024 (gemessen bei fitt 128),
  # loadouts.json fuer dasselbe Loadout 166.912 (andere Messgelegenheit). Beide
  # Zahlen sind echt. Ein niedrigerer Wert ist konservativ und harmlos — etwa
  # weil np=3 mit -kvu einen GETEILTEN Pool fahren. Schaden entsteht nur in der
  # anderen Richtung: wenn die Config MEHR verspricht als gemessen wurde, und
  # genau das war der Ursprungsfall (262144 behauptet, 99840 gemessen).
  run node -e "
    const fs = require('fs');
    const s = fs.readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    const ld = JSON.parse(fs.readFileSync('$REPO/scripts/llm/loadouts.json','utf8'));
    // Messwerte stehen im notes-Feld des Loadouts, mit deutschem Tausenderpunkt
    // und in wechselnder Formulierung ('Gemessen: 262.144 Kontext',
    // 'gemessen 118.016 ctx'). Das groesste genannte Maximum gilt.
    const measuredFor = (slug) => {
      const l = (ld.loadouts || []).find((x) => x.slug === slug);
      const notes = (l && l.notes) || '';
      const ms = [...notes.matchAll(/([0-9][0-9.]*)\s*(?:Kontext|ctx)/gi)]
        .map((m) => parseInt(m[1].replace(/\./g, ''), 10))
        .filter((n) => Number.isInteger(n) && n > 0);
      return ms.length ? Math.max(...ms) : null;
    };
    const prim = Object.entries(o.agent || {})
      .filter(([n,v]) => v.mode === 'primary' && /^(freetoken-local|llamacpp-local)\//.test(v.model || ''));
    if (prim.length < 1) { console.error('no local-stack primary agent found'); process.exit(1); }
    // T014105: FreeToken-Agenten sind NICHT an loadouts.json gebunden — ihre
    // gemessenen Limits (KV-Pages, nicht advertised max_model_len) stehen als
    // konkrete Eintraege im Provider und werden von den T014105-Guards exakt
    // zugersichert. Die Loadout-Bindung unten gilt nur fuer llama.cpp-Modelle.
    const ftModels = ((o.provider['freetoken-local'] || {}).models || {});
    const ftLimits = new Set(Object.values(ftModels).map((m) => m.limit.context));
    for (const [name, agent] of prim) {
      const model = agent.model;
      const [prov, mid] = model.split('/');
      const entry = ((o.provider[prov] || {}).models || {})[mid];
      if (!entry) {
        console.error(name + ': model ' + model + ' fehlt im Provider ' + prov);
        process.exit(1);
      }
      const ctx = entry.limit.context;
      if (!Number.isInteger(ctx) || ctx <= 0) {
        console.error(name + ' ctx ' + ctx + ' is not a positive integer');
        process.exit(1);
      }
      if (prov === 'freetoken-local') {
        if (!ftLimits.has(ctx)) {
          console.error(name + ' ctx ' + ctx + ' ist kein gemessener FreeToken-Limit-Wert');
          process.exit(1);
        }
        continue;
      }
      const max = measuredFor(mid);
      if (max === null) {
        console.error(name + ': loadout ' + mid + ' dokumentiert keinen gemessenen Kontext in loadouts.json');
        process.exit(1);
      }
      // Kleiner als gemessen ist zulaessig (konservativ, z.B. geteilter -kvu-Pool).
      // Schaden entsteht nur, wenn die Config MEHR verspricht als gemessen wurde.
      if (ctx > max) {
        console.error(name + ' ctx ' + ctx + ' > gemessenes Maximum ' + max + ' des Loadouts ' + mid);
        process.exit(1);
      }
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

# ── FreeToken provider in the opencode SSOT (T014105) ────────────────────
# SSOT: openspec/specs/llm-local-dev.md — "Single Definition Site for the
# opencode freetoken-local Provider" und Folge-Requirements. FreeToken laeuft
# Windows-nativ auf :1919 (ein Modell resident, Wechsel ueber Daemon :1900);
# der Server ignoriert das model-Feld von Anfragen, deshalb zeigen alle
# lokalen Agenten auf den Alias "active". Die Kontext-Limits sind GEMESSEN
# (2026-08-23, pk-desktop): der Server advertiert max_model_len=262144,
# nutzbar sind aber nur die KV-Pages der Serve-Konfiguration. AUSNAHME seit
# T016416: Qwen3.6-35B deklariert die KV-Ladder-Decke (200000) statt des
# kalibrierten Werts — der Operator wächst den KV-Pool budgetkonform bis
# dorthin (`ft ctl cache --kv`), das Plugin advertisiert höchstens
# SDLC_CONTEXT_CEILING und nur bei laufender Engine mit Headroom >= 100000.

@test "T014105: agent-models.jsonc declares the freetoken-local provider on :1919" {
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const p = (d.provider || {})['freetoken-local'];
    if (!p) { console.error('freetoken-local provider missing'); process.exit(1); }
    if (p.options.baseURL !== 'http://127.0.0.1:1919/v1') { console.error('baseURL=' + p.options.baseURL); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T014105: freetoken-local carries three measured checkpoints with measured limits" {
  # Gemessen 2026-08-23: Qwen 131072 KV-Reserve, gpt-oss 65536, Gemma 32768.
  # Seit T016416 deklariert Qwen statt des kalibrierten Werts die Ladder-Decke
  # 200000 (limit.context == LADDER_CEILING); gpt-oss/Gemma behalten ihre
  # kalibrierten Limits. Der advertised max_model_len=262144 ist hier bewusst
  # FALSCH — deklariert wird die nutzbare KV-Pages-Zahl, weil opencode bei 95%
  # davon kompaktiert.
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const m = ((d.provider || {})['freetoken-local'] || {}).models || {};
    const want = { 'Qwen3.6-35B-A3B-NVFP4': 200000, 'gpt-oss-20b': 65536, 'Gemma-4-26B-A4B-NVFP4': 32768 };
    for (const [id, ctx] of Object.entries(want)) {
      const e = m[id];
      if (!e) { console.error('model missing: ' + id); process.exit(1); }
      if (e.limit.context !== ctx) { console.error(id + ' context=' + e.limit.context + ', expected ' + ctx); process.exit(1); }
    }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T014105: all local-family agents reference the model-agnostic active alias" {
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const agents = d.agent || {};
    const local = ['gptoss','devstral','gemma','gemma12','qwen38','freetoken-primary'];
    const bad = local.filter(n => !agents[n] || agents[n].model !== 'freetoken-local/active');
    if (bad.length) { console.error('not on alias: ' + bad.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T900005: FreeToken thinking and fast aliases carry explicit budgets" {
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const models = d.provider['freetoken-local'].models;
    if (models['active-thinking'].limit.context !== 200000) process.exit(1);
    if (models['active-fast'].limit.context !== 85000) process.exit(1);
  "
  [ "$status" -eq 0 ]
}

@test "T900005: thinking and three fast workers join the selectable dispatch pool" {
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const a = d.agent;
    if (a['freetoken-thinking'].mode !== 'all' || a['freetoken-thinking'].model !== 'freetoken-local/active-thinking') process.exit(1);
    for (let i = 1; i <= 3; i++) {
      const worker = a['freetoken-fast-' + i];
      if (!worker || worker.mode !== 'all' || worker.model !== 'freetoken-local/active-fast') process.exit(1);
      if (a.orchestrator.permission.task['freetoken-fast-' + i] !== 'allow') process.exit(1);
    }
    if (a.orchestrator.permission.task['freetoken-thinking'] !== 'allow') process.exit(1);
  "
  [ "$status" -eq 0 ]
}

@test "T900005: plugin injects enable_thinking from the selected alias" {
  local plugin="$REPO/.opencode/plugin/freetoken-active.ts"
  run grep -qF 'enable_thinking: body.model === THINKING_MODEL' "$plugin"
  [ "$status" -eq 0 ]
  run grep -qF 'body.model === THINKING_MODEL || body.model === FAST_MODEL' "$plugin"
  [ "$status" -eq 0 ]
}

@test "T016419: retired clone primaries are gone" {
  # Die sieben Klon-Primaries (seit T014105 byte-identisch mit freetoken-primary)
  # sind entfernt; ihre Namen referenzierten retired Loadouts.
  # Positiv-Anker zuerst [T002356-M1]: der verbleibende lokale Primary muss
  # existieren und auf dem Alias liegen, sonst laeuft der Negativ-Assert vakuos.
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const agents = d.agent || {};
    if (!agents['freetoken-primary'] || agents['freetoken-primary'].model !== 'freetoken-local/active') {
      console.error('positive anchor failed: freetoken-primary on ' + ((agents['freetoken-primary'] || {}).model || 'nothing'));
      process.exit(1);
    }
    const clones = ['gemma26-primary','gemma26-vision','gptoss-primary','devstral-primary',
      'gemma12-primary','gemma26-throughput-primary','qwen38-primary'];
    const alive = clones.filter(n => agents[n] && agents[n].mode === 'primary');
    if (alive.length) { console.error('retired clone primaries still present: ' + alive.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T016419: dead checkpoint catalog entries are removed" {
  # GGUF-Verzeichnisse zu gptoss-context/gemma26-factory/gemma4/gemma26-throughput
  # existieren nicht mehr auf Disk; der llamacpp-local-Katalog darf sie nicht
  # mehr deklarieren. Statisch geprueft — bewusst KEIN Filesystem-Check gegen
  # GGUF-Pfade (CI hat weder /mnt/c noch ~/models).
  run node -e "
    const j5 = require('json5');
    const d = j5.parse(require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8'));
    const m = ((d.provider || {})['llamacpp-local'] || {}).models || {};
    const keep = ['hauhau-qwen36','gemma12-vision','qwen38-220k'].filter(k => k in m);
    if (!keep.length) { console.error('positive anchor failed: no surviving llamacpp-local entry'); process.exit(1); }
    const dead = ['gptoss-context','gemma26-factory','gemma4','gemma26-throughput']
      .filter(k => k in m);
    if (dead.length) { console.error('dead catalog entries still declared: ' + dead.join(',')); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "T014105: the freetoken-active plugin ships in the repo and queries the daemon" {
  local plugin="$REPO/.opencode/plugin/freetoken-active.ts"
  [ -f "$plugin" ]
  run grep -qF '1900/engine/status' "$plugin"
  [ "$status" -eq 0 ]
}

@test "T900051: freetoken-active falls back to serving endpoint telemetry" {
  local plugin="$REPO/.opencode/plugin/freetoken-active.ts"
  run grep -qF 'const SERVER_MODELS = "http://127.0.0.1:1919/v1/models"' "$plugin"
  [ "$status" -eq 0 ]
  run grep -qF 'const SERVER_STATS = "http://127.0.0.1:1919/v1/stats"' "$plugin"
  [ "$status" -eq 0 ]
  run grep -qF 'const SERVER_CACHE = "http://127.0.0.1:1919/v1/cache/status"' "$plugin"
  [ "$status" -eq 0 ]
  run grep -qF 'const runtime = await discoverRuntime()' "$plugin"
  [ "$status" -eq 0 ]
  run grep -qF 'Math.min(ref.limit.context, runtime.kvTokens)' "$plugin"
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
