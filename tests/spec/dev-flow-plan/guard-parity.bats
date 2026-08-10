# Pruefmodus: Grep auf Quelltext — dokumentierte Ausnahme von T002448-M4:
# Pruefobjekt ist eine Doku-Konvention (Guard-Praesenz in Skill-Prosa),
# die sich ausschliesslich im Quelltext manifestiert.
#
# Iteriert docs/agent-guide/registry/plan-guards.yaml und prueft JEDEN
# Guard-Anker in JEDER applies_to-Datei. Zusaetzlich: Stale-Modell-Check
# gegen loadouts.json / agent-models.jsonc.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  REGISTRY="$REPO_ROOT/docs/agent-guide/registry/plan-guards.yaml"
}

@test "jeder Guard-Anker kommt in jeder applies_to-Datei vor" {
  command -v yq >/dev/null 2>&1 || skip "yq not installed"
  [ -f "$REGISTRY" ] || skip "plan-guards.yaml not found"

  local guard_count
  guard_count=$(yq -r '.guards | length' "$REGISTRY")
  [ "$guard_count" -gt 0 ] || skip "no guards in registry"

  local tested=0
  while IFS=$'\t' read -r gid anchor files_str; do
    IFS=',' read -ra files <<<"$files_str"
    for f in "${files[@]}"; do
      f="$(echo "$f" | tr -d ' ')"
      [ -z "$f" ] && continue
      tested=$((tested + 1))
      if ! grep -qF -- "$anchor" "$REPO_ROOT/$f" 2>/dev/null; then
        echo "Guard '$gid': anchor '$anchor' NOT found in $f" >&2
        return 1
      fi
    done
  done < <(yq -r '.guards[] | [.id, .anchor, (.applies_to|join(","))] | @tsv' "$REGISTRY")

  # Positiv-Anker: mindestens 1 (anchor, datei)-Paar geprueft
  [ "$tested" -gt 0 ]
}

@test "keine stalen Modell-Slugs in den Flow-Skills" {
  local candidates=""
  for skill_file in \
    "$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md" \
    "$REPO_ROOT/.opencode/skills/opencode-flow-plan/SKILL.md"; do
    [ -f "$skill_file" ] && candidates+="$(grep -hoE 'gemma[0-9a-z-]*-factory|gemma[0-9]+-[a-z]+|gptoss-[a-z]+|devstral-[a-z]+|qwen[0-9a-z-]+' "$skill_file" || true)"$'\n'
  done

  # Positiv-Anker: Kandidatenliste ist nicht leer
  [ -n "$candidates" ]

  local slug
  for slug in $(echo "$candidates" | sort -u); do
    [ -z "$slug" ] && continue
    if grep -qF "$slug" "$REPO_ROOT/scripts/llm/loadouts.json" 2>/dev/null; then
      continue
    fi
    if grep -qF "$slug" "$REPO_ROOT/.opencode/agent-models.jsonc" 2>/dev/null; then
      continue
    fi
    echo "stale model slug '$slug' found in skill but not in loadouts.json or agent-models.jsonc" >&2
    return 1
  done
}
