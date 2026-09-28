#!/usr/bin/env bats
# SSOT: docs/superpowers/specs/devflow-selection-archive-hardening.md
# Tickets: T002255, T002256 — Mishap-Bundles aus dem T002251-Zyklus.
#
# Zwei Wurzelursachen:
#   A) Generierte Artefakte (linguist-generated in .gitattributes) sind in der
#      Diff-Selektion von echten Quelltext-Aenderungen nicht unterscheidbar.
#      Folge: test:changed startet Playwright und devflow-post-merge-deploy.sh
#      baut Images fuer Changes ohne jeden Website-Bezug.
#   B) plan-archive-steps.md beschreibt einen Archiv-Ablauf, der am
#      Branch-Naming-Guard bzw. am Squash-Merge reproduzierbar scheitert.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  FILTER="$REPO_ROOT/scripts/filter-generated.sh"
  TASKFILE_TEST="$REPO_ROOT/taskfiles/Taskfile.test.yml"
  TASKFILE_QUALITY="$REPO_ROOT/taskfiles/Taskfile.quality.yml"
  POST_MERGE="$REPO_ROOT/scripts/devflow-post-merge-deploy.sh"
  ARCHIVE_REF="$REPO_ROOT/.claude/skills/references/plan-archive-steps.md"
  MCP_GUIDE="$REPO_ROOT/.claude/skills/references/mcp-tool-guide.md"
  DEPLOY_ROUTING="$REPO_ROOT/.claude/skills/references/deploy-routing.md"
}

# ─────────────────────────────────────────────────────────────────────────────
# A1 — scripts/filter-generated.sh
# ─────────────────────────────────────────────────────────────────────────────

@test "T002255-A1: filter-generated.sh existiert und ist ausfuehrbar" {
  [ -f "$FILTER" ]
  [ -x "$FILTER" ]
}

@test "T002255-A1: filter entfernt generierte Pfade, behaelt Quelltext" {
  run bash -c "cd '$REPO_ROOT' && printf 'components/website/src/data/test-inventory.json\nscripts/foo.sh\ncomponents/website/src/pages/index.astro\n' | bash '$FILTER'"
  [ "$status" -eq 0 ]
  [[ "$output" != *"test-inventory.json"* ]]
  [[ "$output" == *"scripts/foo.sh"* ]]
  [[ "$output" == *"components/website/src/pages/index.astro"* ]]
}

@test "T002255-A1: filter gibt Pfade unveraendert aus (kein check-attr-Suffix)" {
  run bash -c "cd '$REPO_ROOT' && printf 'scripts/foo.sh\n' | bash '$FILTER'"
  [ "$status" -eq 0 ]
  [ "$output" = "scripts/foo.sh" ]
}

@test "T002255-A1: filter toleriert leere Eingabe (exit 0, keine Ausgabe)" {
  run bash -c "cd '$REPO_ROOT' && printf '' | bash '$FILTER'"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# Kritischer Edge-Case: ein Diff, der AUSSCHLIESSLICH generierte Dateien
# enthaelt (genau der Fall bei freshness-regen.yml-Bot-Commits). Ein naives
# `grep -v` liefert hier Exit 1 und reisst unter `set -o pipefail` den
# aufrufenden Task mit.
@test "T002255-A1: filter exit 0 wenn ALLE Eingabepfade generiert sind" {
  run bash -c "cd '$REPO_ROOT' && printf 'components/website/src/data/test-inventory.json\ncomponents/website/src/data/route-manifest.json\n' | bash '$FILTER'"
  [ "$status" -eq 0 ]
  [ -z "$output" ]
}

# ─────────────────────────────────────────────────────────────────────────────
# A2 — Verdrahtung in den beiden Konsumenten
# ─────────────────────────────────────────────────────────────────────────────

@test "T002255-A2: test:changed pipet CHANGED durch filter-generated.sh" {
  run grep -n "filter-generated.sh" "$TASKFILE_TEST"
  [ "$status" -eq 0 ]
}

@test "T002255-A2: freshness:check bleibt ungefiltert (Pfade sind dort Pruefgegenstand)" {
  # Die Artefaktliste in freshness:check darf NICHT durch den Filter laufen —
  # sonst prueft das Gate sich selbst weg.
  run bash -c "sed -n '/^  freshness:check:/,/^  [a-z]/p' '$TASKFILE_QUALITY' | grep -c 'filter-generated.sh'"
  [ "$output" = "0" ]
}

@test "T002255-A2: devflow-post-merge-deploy.sh pipet CHANGED durch filter-generated.sh" {
  run grep -n "filter-generated.sh" "$POST_MERGE"
  [ "$status" -eq 0 ]
}

@test "T002255-A2: post-merge-deploy baut keine Container-Images mehr" {
  run grep -nE '^\s*task (feature:website|feature:brett|docs:deploy)' "$POST_MERGE"
  [ "$status" -ne 0 ]
}

@test "T002255-A2: post-merge-deploy nennt stattdessen den zustaendigen CI-Workflow" {
  run grep -nE 'build-website\.yml|build-brett\.yml' "$POST_MERGE"
  [ "$status" -eq 0 ]
}

@test "T002255-A2: post-merge-deploy behaelt feature:deploy als Break-Glass" {
  run grep -nE 'task feature:deploy' "$POST_MERGE"
  [ "$status" -eq 0 ]
}

# Regression gegen T002242-M3: die Exit-Code-Sammlung darf nicht mit
# entfernt werden.
@test "T002255-A2: fail-closed-Meldung aus T002242-M3 bleibt erhalten" {
  run grep -nE 'FAILED_TASKS|deploy blocked' "$POST_MERGE"
  [ "$status" -eq 0 ]
}

@test "T002255-A2: deploy-routing.md dokumentiert generierte Pfade als Nicht-Trigger" {
  run grep -niE 'linguist-generated|generierte? (Pfade|Artefakte)' "$DEPLOY_ROUTING"
  [ "$status" -eq 0 ]
}

# ─────────────────────────────────────────────────────────────────────────────
# B — plan-archive-steps.md
# ─────────────────────────────────────────────────────────────────────────────







@test "T002256-B2: kein checkout -b vom Fix-Branch mehr" {
  run grep -nE 'git checkout -b "\$ARCHIVE_BRANCH"\s*$' "$ARCHIVE_REF"
  [ "$status" -ne 0 ]
}



@test "T002256-B3: mcp-tool-guide dokumentiert die Worktree-Einschraenkung" {
  run grep -niE 'worktree' "$MCP_GUIDE"
  [ "$status" -eq 0 ]
}

@test "T002256-B3: Worktree-Hinweis nennt BEIDE Tools (stage_plan und archive_plan)" {
  block=$(grep -niE -A4 -B4 'worktree' "$MCP_GUIDE" || true)
  [[ "$block" == *"stage_plan"* ]]
  [[ "$block" == *"archive_plan"* ]]
}

# plan-archive-steps.md nennt heute BEIDE Wege (MCP-first Zeile 15,
# ticket.sh-Fallback Zeile 18). Der Fix kehrt die Reihenfolge um.
@test "T002256-B3: plan-archive-steps empfiehlt archive_plan nicht mehr als MCP-first" {
  # Geprueft wird die EMPFEHLUNG, nicht die Erwaehnung: eine Begruendung
  # ("Warum nicht MCP-first ...") gehoert in die Datei und steht per Konvention
  # im Warn-Blockquote. Verboten ist "MCP-first" im Fliesstext, wo es als
  # Handlungsanweisung gelesen wird.
  run bash -c "grep -nE '^[^>]*MCP-first' '$ARCHIVE_REF'"
  [ "$status" -ne 0 ]
}

@test "T002256-B3: plan-archive-steps nennt ticket.sh archive-plan als Primaerweg" {
  # Der Skript-Aufruf muss vor jeder MCP-Erwaehnung von archive_plan stehen.
  script_line=$(grep -n 'ticket\.sh archive-plan' "$ARCHIVE_REF" | head -1 | cut -d: -f1)
  mcp_line=$(grep -n 'mcp__ticket-mcp__archive_plan' "$ARCHIVE_REF" | head -1 | cut -d: -f1)
  [ -n "$script_line" ]
  [ -z "$mcp_line" ] || [ "$script_line" -lt "$mcp_line" ]
}
