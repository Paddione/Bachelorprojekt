#!/usr/bin/env bats
# tests/spec/agent-skills/skill-path-references.bats
# SSOT: openspec/specs/agent-skills.md
#
# Guard gegen tote Pfadverweise in eigenen Skill-Dateien (T002613).
#
# Prüfmodus (T002448-M4): Dateisystem-Auflösung, nicht Quelltextmuster. Der geprüfte
# Gegenstand ist der Dateiinhalt der Skill-Dateien — ein Verweis lässt sich nur durch
# Lesen finden. Jeder extrahierte repo-relative Pfad wird mit `[ -e ]` gegen das
# Dateisystem aufgelöst, nicht gegen ein Muster im Quelltext verglichen.

setup() {
  # Diese Datei liegt in tests/spec/agent-skills/ — drei Ebenen bis zur Repo-Wurzel.
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

# ── Ausnahmeliste ─────────────────────────────────────────────────────
#
# Vendored Fremdskills, deren Verweise auf Upstream-Doku (fluxcd.io) bzw. auf
# Beispielpfade fremder Projekte zeigen. Ohne die Ausnahme stünden 23 Falschpositive
# gegen 3 echte Funde, und ein Guard in diesem Verhältnis würde abgeschaltet statt
# gepflegt.
#
# T002613-Scope-Erweiterung (2026-08-03): unsloth-buddy und ui-ux-pro-max sind dieselbe
# Kategorie — vendored Fremdskills mit Upstream-Beispielpfaden (scripts/*.py aus dem
# fremden Repo). Beide stehen in der Vendor-Liste von OVERVIEW.md. Ohne sie wären 69
# Falschpositive gegen die echten Funde — der Guard würde abgeschaltet statt gepflegt.
EXCLUDED_SKILLS=(gitops-repo-audit gitops-knowledge gitops-cluster-debug vitest unsloth-buddy ui-ux-pro-max)

# Extraktionsmuster: repo-relative Pfade mit Dateiendung unter den bekannten
# Wurzelpräfixen. Anhänge wie `:45`, `REQ-…` oder `)` werden beim Strippen entfernt.
PATH_PATTERN='\b(openspec|scripts|tests|docs|website|k3d|environments|flux)/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*'

# Alle zu prüfenden Skill-Dateien: `.md` unter `.claude/skills/` rekursiv (inkl.
# `references/`), außer `OVERVIEW.md` an der Wurzel und außer der Ausnahmeliste.
# Liefert absolute Pfade, damit `extract_paths` unabhängig vom Arbeitsverzeichnis greift.
skill_files() {
  local ex find_args=() dirs=()
  for ex in "${EXCLUDED_SKILLS[@]}"; do
    find_args+=(-not -path "*/$ex/*")
  done
  [ -d "$REPO/.claude/skills" ] && dirs+=("$REPO/.claude/skills")
  [ -d "$REPO/.agents/skills" ] && dirs+=("$REPO/.agents/skills")
  find "${dirs[@]}" -name '*.md' \
    -not -path "*/OVERVIEW.md" \
    "${find_args[@]}" \
    -print
}

# Extrahiert alle repo-relativen Pfadverweise aus einer Datei, strippt Anhänge
# (`:45`, `REQ-…`, `)`) und dedupliziert.
extract_paths() {
  grep -oE "$PATH_PATTERN" "$1" 2>/dev/null \
    | sed -E 's/:[0-9]+$//; s/REQ-[A-Za-z0-9-]+$//; s/\)$//' \
    | sort -u
}

@test "alle repo-relativen Pfadverweise in Skill-Dateien zeigen auf existierende Dateien" {
  local f p fail=0
  while read -r f; do
    [ -z "$f" ] && continue
    while read -r p; do
      [ -z "$p" ] && continue
      if [ ! -e "$REPO/$p" ]; then
        echo "toter Verweis in $f: $p"
        fail=1
      fi
    done < <(extract_paths "$f")
  done < <(skill_files)
  [ "$fail" -eq 0 ]
}

@test "Positiv-Anker: es wurden Pfadverweise geprüft (T002356-M1)" {
  local f count=0
  while read -r f; do
    [ -z "$f" ] && continue
    count=$((count + $(extract_paths "$f" | grep -c . || true)))
  done < <(skill_files)
  [ "$count" -gt 0 ]
}
