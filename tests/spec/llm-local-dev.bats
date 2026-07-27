#!/usr/bin/env bats
# tests/spec/llm-local-dev.bats
# SSOT: openspec/specs/llm-local-dev.md
#
# Covers: Taskfile.openclaw.yml validity, required tasks, env.example config.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  TASKFILE="$REPO/Taskfile.openclaw.yml"
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
# Der Provider-Key `llamacpp-mtp` darf NUR in .opencode/agent-models.jsonc
# definiert sein. Diese Datei ist die Sync-Quelle (Taskfile.yml -> 
# scripts/opencode-sync-agents.sh -> ~/.config/opencode/opencode.jsonc).
# Eine zweite Definition in .opencode/opencode.jsonc ueberschreibt den
# gesyncten Wert projekt-lokal und driftet unbemerkt ab.

@test "opencode.jsonc defines no duplicate llamacpp-mtp provider" {
  # Semantische Pruefung statt Textsuche: erklaerende Kommentare duerfen den
  # Provider-Namen nennen, nur eine echte Definition im provider-Objekt ist verboten.
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/opencode.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    process.exit('llamacpp-mtp' in (o.provider || {}) ? 1 : 0);
  "
  [ "$status" -eq 0 ]
}

@test "no .opencode config points a baseURL at the Bonsai port 8093" {
  # Kommentarzeilen ausgenommen — der Bonsai-Port darf dokumentiert werden,
  # nur nicht als aktive baseURL gesetzt sein.
  run bash -c "grep -hE '\"baseURL\": *\"https?://[^\"]*:8093' \"$REPO\"/.opencode/*.jsonc | grep -vE '^\s*//'"
  [ -z "$output" ]
}

@test "agent-models.jsonc still defines the llamacpp-mtp provider" {
  run grep -q '"llamacpp-mtp"' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc points llamacpp-mtp at the Gemma port 8091" {
  run grep -qE '"baseURL": *"http://127\.0\.0\.1:8091/v1"' "$REPO/.opencode/agent-models.jsonc"
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc declares the full 262144 context for Gemma4 (T002298)" {
  # Muss dem -Ctx des Servers entsprechen. Steht hier weniger, laesst opencode
  # Kontext ungenutzt liegen; steht hier mehr, laeuft der Server im Betrieb in
  # einen Ueberlauf, den opencode nicht kommen sieht. Server-Profil seit
  # T002297: start-gemma-server.ps1 -Ctx 262144 -Slots 1 -KvType q8_0.
  # Extrahiert den ersten "context"-Wert nach dem Gemma-Modellschluessel.
  ctx="$(awk '/"gemma-4-12B-it-qat-UD-Q4_K_XL.gguf": *\{/,/"context"/' \
    "$REPO/.opencode/agent-models.jsonc" | grep -oE '"context": *[0-9]+' | head -1 | grep -oE '[0-9]+')"
  [ "$ctx" = "262144" ]
}

@test "agent-models.jsonc defines exactly ONE summonable gemma subagent (T002298)" {
  # Der Server auf :8091 hat einen einzigen Slot (-np 1) und die llm-proxy
  # serialisiert bei max_inflight=1. Mehrere gemma-Subagent-Namen erzeugen
  # deshalb nur den Anschein von Nebenlaeufigkeit und zerstoeren zusaetzlich
  # den Praefix-Reuse des Slots (T002286). Ein einziger Name ist die einzige
  # im Config-Schema durchsetzbare Obergrenze.
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const a = JSON.parse(j).agent || {};
    const sub = Object.entries(a)
      .filter(([n,v]) => n.startsWith('gemma') && v.mode === 'subagent')
      .map(([n]) => n);
    if (sub.length !== 1) { console.error('gemma subagents: ' + JSON.stringify(sub)); process.exit(1); }
    process.exit(0);
  "
  [ "$status" -eq 0 ]
}

@test "agent-models.jsonc provides a primary gemma agent with full context (T002298)" {
  # mode:primary heisst Tab-waehlbar und NICHT per task summonbar - er zaehlt
  # deshalb nicht gegen die Ein-Subagent-Grenze und kann sie nicht umgehen.
  run node -e "
    const s = require('fs').readFileSync('$REPO/.opencode/agent-models.jsonc','utf8');
    const j = s.replace(/^\s*\/\/.*\$/gm,'').replace(/\/\*[\s\S]*?\*\//g,'');
    const o = JSON.parse(j);
    const prim = Object.entries(o.agent || {})
      .filter(([n,v]) => n.startsWith('gemma') && v.mode === 'primary');
    if (prim.length !== 1) { console.error('primary gemma agents: ' + prim.length); process.exit(1); }
    const model = prim[0][1].model;
    const [prov, mid] = model.split('/');
    const ctx = o.provider[prov].models[mid].limit.context;
    if (ctx !== 262144) { console.error('primary gemma ctx: ' + ctx); process.exit(1); }
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
