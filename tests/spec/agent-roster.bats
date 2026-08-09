#!/usr/bin/env bats
# tests/spec/agent-roster.bats — Drift-Gates für die Agenten-Registry
#
# Prüft sechs Zusicherungen:
#   1. roles ↔ .claude/agents/*.md  (beidseitig)
#   2. runtimes ↔ .opencode/agent-models.jsonc  (beidseitig)
#   3. runtimes.model ↔ .opencode/agent-models.jsonc agent.model (Modell-Zuordnung)
#   4. Agentennamen in CLAUDE.md ↔ Registry
#   5. agents-map.md ist aktuell (task agent-guide:maps erzeugt keinen Diff)
#   6. Keine .tmp-Reste aus abgebrochenen Emitter-Läufen (T002308)

setup_file() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "P4.2: roles ↔ .claude/agents/ (bidirectional)" {
  cd "$REPO_ROOT"

  # Registry -> Dateien: jeder roles-Schlüssel hat eine .claude/agents/<name>.md
  local missing=""
  for role in $(node -e "
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
    Object.keys(d.roles || {}).forEach(k => console.log(k));
  "); do
    [ -f ".claude/agents/${role}.md" ] || missing="${missing}${role} "
  done
  [ -z "$missing" ] || { echo "roles ohne .claude/agents/*.md: $missing"; return 1; }

  # Dateien -> Registry: jede .claude/agents/*.md hat einen roles-Eintrag
  local extra=""
  for agent in .claude/agents/bachelorprojekt-*.md; do
    name="$(basename "$agent" .md)"
    node -e "
      const y = require('yaml');
      const fs = require('fs');
      const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
      process.exit(d.roles && d.roles['${name}'] ? 0 : 1);
    " || extra="${extra}${name} "
  done
  [ -z "$extra" ] || { echo ".claude/agents/*.md ohne roles-Eintrag: $extra"; return 1; }
}

@test "P4.3: runtimes ↔ .opencode/agent-models.jsonc (bidirectional)" {
  cd "$REPO_ROOT"

  # Registry -> JSONC: jeder runtime-Schlüssel hat einen agent-Eintrag in agent-models.jsonc
  local missing=""
  for rt in $(node -e "
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
    Object.keys(d.runtimes || {}).forEach(k => console.log(k));
  "); do
    local found
    found=$(node -e "
      const fs = require('fs');
      const j5 = require('json5');
      const src = fs.readFileSync('.opencode/agent-models.jsonc','utf8');
      const d = j5.parse(src);
      console.log(d.agent && d.agent['${rt}'] ? 'yes' : 'no');
    ")
    [ "$found" = "yes" ] || missing="${missing}${rt} "
  done
  [ -z "$missing" ] || { echo "runtimes ohne agent-models.jsonc-Eintrag: $missing"; return 1; }

  # JSONC -> Registry: jeder agent-Eintrag in agent-models.jsonc hat einen runtime-Eintrag
  local extra=""
  for key in $(node -e "
    const fs = require('fs');
    const j5 = require('json5');
    const src = fs.readFileSync('.opencode/agent-models.jsonc','utf8');
    const d = j5.parse(src);
    Object.keys(d.agent || {}).forEach(k => console.log(k));
  "); do
    node -e "
      const y = require('yaml');
      const fs = require('fs');
      const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
      process.exit(d.runtimes && d.runtimes['${key}'] ? 0 : 1);
    " || extra="${extra}${key} "
  done
  [ -z "$extra" ] || { echo "agent-models.jsonc-Einträge ohne runtime: $extra"; return 1; }
}

@test "P4.3b: runtimes.model ↔ agent-models.jsonc agent.model (Modell-Zuordnung synchron)" {
  cd "$REPO_ROOT"

  # .opencode/agent-models.jsonc ist die SSOT für die Modell-Zuordnung. Jede
  # runtime in agents.yaml muss denselben Modell-String tragen — Namens-Gleichheit
  # allein (P4.3) hat den Drift nicht gefangen (gemma zeigte auf gemma4,
  # gemma26-primary/-vision auf gptoss-context statt gemma26-factory, T002851).
  local drift=""
  while IFS='|' read -r rt reg_model; do
    local json_model
    json_model=$(node -e "
      const fs = require('fs');
      const j5 = require('json5');
      const d = j5.parse(fs.readFileSync('.opencode/agent-models.jsonc','utf8'));
      const m = d.agent && d.agent['${rt}'] && d.agent['${rt}'].model;
      console.log(m || '');
    ")
    if [ -z "$json_model" ]; then
      drift="${drift}${rt} (agent-models.jsonc ohne model) "
    elif [ "$json_model" != "$reg_model" ]; then
      drift="${drift}${rt} (registry=${reg_model}, jsonc=${json_model}) "
    fi
  done < <(node -e "
    const y = require('yaml');
    const fs = require('fs');
    const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
    for (const [k, v] of Object.entries(d.runtimes || {})) {
      if (v.model) console.log(k + '|' + v.model);
    }
  ")
  [ -z "$drift" ] || { echo "Modell-Drift registry vs. agent-models.jsonc: $drift"; return 1; }
}

@test "P4.4: CLAUDE.md nennt nur Agenten aus der Registry" {
  cd "$REPO_ROOT"

  # Sammle alle Agenten/Bezeichner, die in CLAUDE.md als Agent referenziert werden.
  # Binde an bachelorprojekt-*-Präfix und bekannte Runtime-Schlüssel.
  local bad=""
  while IFS= read -r word; do
    # Nur Wörter interessieren, die wie Agentennamen aussehen
    case "$word" in
      bachelorprojekt-*|gemma-4-12b*|deepseek-helper|orchestrator)
        node -e "
          const y = require('yaml');
          const fs = require('fs');
          const d = y.parse(fs.readFileSync('docs/agent-guide/registry/agents.yaml','utf8'));
          const inRoles = d.roles && d.roles['${word}'] !== undefined;
          const inRuntimes = d.runtimes && d.runtimes['${word}'] !== undefined;
          process.exit(inRoles || inRuntimes ? 0 : 1);
        " || bad="${bad}${word} "
        ;;
    esac
  done < <(grep -oE 'bachelorprojekt-[a-z]+|gemma-4-12b(-primary)?|deepseek-helper|orchestrator' CLAUDE.md | sort -u)
  [ -z "$bad" ] || { echo "CLAUDE.md nennt Agenten nicht in der Registry: $bad"; return 1; }
}

@test "P4.5: agents-map.md ist aktuell (kein Diff nach task agent-guide:maps)" {
  cd "$REPO_ROOT"
  local tmp_out
  tmp_out=$(mktemp -d)
  # Emit into a tempdir instead of the tracked docs/agent-guide/maps/ path, so this
  # freshness assertion never mutates the working tree (T002834).
  AGENT_GUIDE_MAPS_OUT_DIR="$tmp_out" node scripts/agent-guide/emit-maps.mjs >/dev/null 2>&1
  diff -u docs/agent-guide/maps/agents-map.md "$tmp_out/agents-map.md" \
    || { echo "agents-map.md nicht aktuell — task agent-guide:maps erzeugt Diff"; rm -rf "$tmp_out"; return 1; }
  rm -rf "$tmp_out"
}

@test "P4.6: keine .tmp-Reste aus abgebrochenen Emitter-Läufen (T002308)" {
  cd "$REPO_ROOT"
  local leftovers
  leftovers=$(ls docs/agent-guide/maps/*.tmp 2>/dev/null || true)
  [ -z "$leftovers" ] || { echo "tmp-Reste gefunden: $leftovers"; return 1; }
}
