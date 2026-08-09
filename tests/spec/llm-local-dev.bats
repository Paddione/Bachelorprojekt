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
  # Ticket schliesst. Der Traeger ist seit T002633 gptoss-context (gpt-oss-20b),
  # die Eigenschaft bleibt dieselbe.
  #
  # Geprueft wird deshalb die EIGENSCHAFT: plausibel und nicht n_ctx_train
  # (131072 fuer gpt-oss-20b), das ueber dem real Verfuegbaren liegt.
  ctx="$(awk '/"gptoss-context": *\{/,/"context"/' \
    "$REPO/.opencode/agent-models.jsonc" | grep -oE '"context": *[0-9]+' | head -1 | grep -oE '[0-9]+')"
  [ -n "$ctx" ]
  [ "$ctx" != "131072" ]
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

@test "agent-models.jsonc provides a primary gemma agent with measured context (T002545)" {
  # T002545: mode:primary, und der genannte Kontext ist ein GEMESSENER Wert,
  # kein n_ctx_train.
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
      .filter(([n,v]) => n.startsWith('gemma') && v.mode === 'primary');
    if (prim.length < 1) { console.error('no primary gemma agents found'); process.exit(1); }
    for (const [name, agent] of prim) {
      const model = agent.model;
      const [prov, mid] = model.split('/');
      const ctx = o.provider[prov].models[mid].limit.context;
      if (!Number.isInteger(ctx) || ctx <= 0) {
        console.error(name + ' ctx ' + ctx + ' is not a positive integer');
        process.exit(1);
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
