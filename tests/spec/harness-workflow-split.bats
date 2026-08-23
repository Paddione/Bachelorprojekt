#!/usr/bin/env bats
# T001611 harness-workflow-split — one file per OpenSpec SSOT spec (harness-workflow-split).
# T013724: die Flow-Skills sind Directory-Symlinks auf die harness-neutralen
# dev-flow-* Shared Sources (openspec-*-Muster). T014086: beide Harnesses nutzen
# dieselben Namen dev-flow-{plan,execute,chore}; die alten opencode-flow-* Aliase
# sind entfernt. Nur opencode-git-workflow bleibt eine echte Datei. Prüfmodus:
# Source-Grep — dokumentierte Ausnahme von T002448-M4 (Doku-Konvention,
# manifestiert sich ausschließlich im Quelltext).
# Forbidden Claude-only tokens (see plan "Forbidden-token contract"):
FORBIDDEN='AskUserQuestion|TodoWrite|subagent_type|Task tool'
OPENSPEC_SKILLS='openspec-propose openspec-apply-change openspec-archive-change openspec-explore'
OC_FLOW_LINKS='dev-flow-plan dev-flow-execute dev-flow-chore'
OC_SKILLS="$OC_FLOW_LINKS opencode-git-workflow"

@test "HWS-1: flow entries are symlinks resolving to dev-flow sources; git-workflow stays native" {
  for s in $OC_FLOW_LINKS; do
    local p=".opencode/skills/$s"
    [ -L "$p" ]
    readlink "$p" | grep -qF '../../.claude/skills/dev-flow-'
    [ -f "$p/SKILL.md" ]
  done
  # Positiv-Anker zuerst (T002356-M1), dann Negativ-Aussage:
  # die alten opencode-flow-* Alias-Einträge dürfen nicht mehr existieren.
  [ -L ".opencode/skills/dev-flow-plan" ]
  leftover="$(find .opencode/skills -maxdepth 1 -name 'opencode-flow-*' 2>/dev/null || true)"
  [ -z "$leftover" ]
  [ -f ".opencode/skills/opencode-git-workflow/SKILL.md" ]
  [ ! -L ".opencode/skills/opencode-git-workflow" ]
}

@test "HWS-2: opencode skills carry no Claude-only tool syntax" {
  # Positiv-Anker: Ziele sind lesbar und nicht leer (HWS-1 sichert Existenz)
  for s in $OC_SKILLS; do
    [ -s ".opencode/skills/$s/SKILL.md" ]
    run grep -nE "$FORBIDDEN" ".opencode/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-3: shared sources reference both harness primitives (collectively)" {
  grep -qF 'background-agents.ts' .claude/skills/dev-flow-plan/SKILL.md
  grep -qF 'background-agents.ts' .claude/skills/dev-flow-execute/SKILL.md
  grep -rqF 'worktree.ts' .opencode/skills
}

@test "HWS-4: opencode-git-workflow uses the git-crypt-safe worktree wrapper" {
  grep -qF 'scripts/worktree-create.sh' .opencode/skills/opencode-git-workflow/SKILL.md
}

@test "HWS-5: flow-skill sources hand over to git-workflow" {
  grep -qF 'git-workflow' .claude/skills/dev-flow-execute/SKILL.md
  grep -qF 'git-workflow' .claude/skills/dev-flow-chore/SKILL.md
}

@test "HWS-6: shared openspec-* skills are free of Claude-only tool syntax" {
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-7: openspec-archive-change retains its delegation instruction" {
  grep -qF 'openspec-sync-specs' .claude/skills/openspec-archive-change/SKILL.md
}

@test "HWS-8: AGENTS.md Skill Dispatch Protocol is opencode-native" {
  # T002181: der Abschnitt hiess einmal '## Skill Dispatch Protocol'. Seit dem
  # AGENTS.md-Umbau auf Quick-Start liegen die Referenzteile in <details>-Blöcken
  # ("read on-demand, do not frontload") — die H2-Extraktion lief ins Leere und
  # prüfte damit einen leeren String. Inhalt und Anforderung sind unverändert.
  # Extrahiert wird jetzt vom <summary>-Marker bis zum schliessenden </details>.
  local awkp='/<summary>Skill Dispatch Protocol/{f=1;next} f&&/<\/details>/{f=0} f'

  # Guard gegen die alte Falle: ist der Abschnitt leer, hat der Test nichts
  # geprüft und muss rot werden statt still durchzulaufen.
  run bash -c "awk '$awkp' AGENTS.md | grep -c ."
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
  run bash -c "awk '$awkp' AGENTS.md | grep -nE '$FORBIDDEN'"
  [ "$status" -ne 0 ]   # no Claude-only tokens in the section
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'background-agents.ts'"
  [ "$status" -eq 0 ]
  run bash -c "awk '$awkp' AGENTS.md | grep -qF 'delegate'"
  [ "$status" -eq 0 ]
}

@test "HWS-9: tools.yaml has a harness field on every entry" {
  local ids harnesses
  ids="$(grep -cE '^- id:' docs/agent-guide/registry/tools.yaml)"
  harnesses="$(grep -cE '^  harness:' docs/agent-guide/registry/tools.yaml)"
  [ "$ids" -eq "$harnesses" ]
}

@test "HWS-10: tools.yaml carries at least one opencode-tagged entry" {
  grep -qE '^  harness:[[:space:]]*opencode' docs/agent-guide/registry/tools.yaml
}

@test "HWS-11: tools-map.md renders a Harness column" {
  grep -qF '| Harness |' docs/agent-guide/maps/tools-map.md
}

@test "HWS-12: agent-guide registry validates (harness schema included)" {
  run node scripts/agent-guide/validate.mjs
  [ "$status" -eq 0 ]
}

# ── Antigravity guard (home-dir state, skip-when-absent — mcp-tooling.bats pattern) ──
@test "HWS-13: Antigravity inherits the cleaned openspec-* skills (repo is the source)" {
  # Antigravity (~/.gemini/antigravity-cli/) is a Claude-Code instance that reads the repo
  # .claude/skills/ directly, so the cleanup applies to it automatically.
  for s in $OPENSPEC_SKILLS; do
    run grep -nE "$FORBIDDEN" ".claude/skills/$s/SKILL.md"
    [ "$status" -ne 0 ]
  done
}

@test "HWS-14: host antigravity-cli carries no shadowing dirty openspec-* copy" {
  local ag="$HOME/.gemini/antigravity-cli"
  [ -d "$ag" ] || skip "antigravity-cli not installed on this machine"
  run bash -c "find \"$ag\" -path '*openspec-*/SKILL.md' -exec grep -lE \"$FORBIDDEN\" {} + 2>/dev/null"
  [ -z "$output" ]
}
