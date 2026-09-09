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
EXCLUDED_SKILLS=(gitops-repo-audit gitops-knowledge gitops-cluster-debug vitest unsloth-buddy ui-ux-pro-max freetoken-setup huggingface-community-evals huggingface-llm-trainer huggingface-paper-publisher huggingface-trackio huggingface-vision-trainer train-sentence-transformers transformers-js)

# Extraktionsmuster: repo-relative Pfade mit Dateiendung unter den bekannten
# Wurzelpräfixen. Anhänge wie `:45`, `REQ-…` oder `)` werden beim Strippen entfernt.
# Seit T006999 (website/ -> components/website/) steht `components/website` vor dem
# bare-`website` in der Alternation: GNU grep (POSIX-ERE) wählt leftmost-longest,
# so extrahiert ein Verweis auf components/website/src/... den Endzustands-Pfad
# und nicht den Substring website/src/... (der nicht mehr existiert).
PATH_PATTERN='\b((components/website)|(openspec|scripts|tests|docs|website|k3d|environments|flux))/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*'

# Zweites Muster (T014027, T900070, T900078): Verweise auf Pfade unter
# .claude/skills/ UND .opencode/skills/ — v. a. die Referenz-Links der Form
# `](.claude/skills/references/…)`. Kein \b-Präfix nötig: die Präfixe sind
# eindeutig, und \b matcht vor einem führenden Punkt nie.
SKILL_PATH_PATTERN='(\.claude|\.opencode)/skills/[A-Za-z0-9_./-]+\.(md|bats|sh|ts|tsx|js|json|yaml|yml|py|go|spec\.ts)[A-Za-z0-9_./:-]*'

# Alle zu prüfenden Skill-Dateien: `.md` unter `.opencode/skills/` und
# `.claude/skills/` rekursiv (inkl. `references/`), außer `OVERVIEW.md` an der
# Wurzel und außer der Ausnahmeliste. Liefert absolute Pfade, damit `extract_paths`
# unabhängig vom Arbeitsverzeichnis greift.
skill_files() {
  local ex find_args=() dirs=()
  for ex in "${EXCLUDED_SKILLS[@]}"; do
    find_args+=(-not -path "*/$ex/*")
  done
  [ -d "$REPO/.opencode/skills" ] && dirs+=("$REPO/.opencode/skills")
  [ -d "$REPO/.claude/skills" ] && dirs+=("$REPO/.claude/skills")
  find "${dirs[@]}" -name '*.md' \
    -not -path "*/OVERVIEW.md" \
    "${find_args[@]}" \
    -print
}

# Extrahiert alle repo-relativen Pfadverweise aus einer Datei, strippt Anhänge
# (`:45`, `REQ-…`, `)`) und dedupliziert.
extract_paths() {
  { grep -oE "$PATH_PATTERN" "$1" 2>/dev/null
    grep -oE "$SKILL_PATH_PATTERN" "$1" 2>/dev/null
  } | sed -E 's/:[0-9]+$//; s/REQ-[A-Za-z0-9-]+$//; s/\)$//' \
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

@test "Positiv-Anker: es wurden Pfadverweise gepruift (T002356-M1)" {
  local f count=0
  while read -r f; do
    [ -z "$f" ] && continue
    count=$((count + $(extract_paths "$f" | grep -c . || true)))
  done < <(skill_files)
  [ "$count" -gt 0 ]
}

@test "shim-coverage: .claude/skills Shims verweisen auf .opencode/skills Ziele" {
  # `fail` MUSS initialisiert sein: bats laeuft den Body unter `set -e`, und ein
  # uninitialisiertes `fail` liesse die Schlussbedingung als `[ : -eq 0 ]` mit
  # "integer expected" abbrechen — der Test faellt dann aus, statt zu urteilen.
  local shim target fail=0
  [ -d "$REPO/.claude/skills" ]   # Positiv-Anker: ohne Shim-Verzeichnis waere die Aussage vakuos
  while read -r shim; do
    [ -z "$shim" ] && continue
    # Shims sind keine echten Skills — sie tragen einen Verweis auf das opencode-Ziel
    if grep -qE '\.opencode/skills/' "$shim" 2>/dev/null; then
      target="$(grep -oE '\.opencode/skills/[A-Za-z0-9_./-]+' "$shim" | head -1)"
      # Bewusst if statt einer &&-Kette: eine Kette, die zu false auswertet, ist die
      # letzte Anweisung des Schleifenkoerpers und beendet unter `set -e` den Test.
      if [ -n "$target" ] && [ ! -e "$REPO/$target" ]; then
        echo "Shim $shim verweist auf nicht existierendes Ziel $target" >&2
        fail=1
      fi
    fi
  done < <(find "$REPO/.claude/skills" -name 'SKILL.md' 2>/dev/null)
  [ "$fail" -eq 0 ]
}

@test "shim-coverage: .opencode/skills Ziele haben .claude/skills Shim" {
  # Bewusst opencode-only — kein Claude-Code-Shim erwartet. Die Liste ist der Zweck
  # des Tests: neue Luecken fallen auf, der erklaerte Bestand nicht. Stand 2026-09-09
  # sind das 22 von 48 Skills, gemessen mit:
  #   find .opencode/skills -name SKILL.md | while read -r s; do n="${s#*.opencode/skills/}";
  #     n="${n%/SKILL.md}"; [ -e ".claude/skills/$n" ] || echo "$n"; done | sort
  local opencode_only=(
    # Vendored Hugging-Face-Skills und ihr Umfeld — Upstream-Bezug, kein Claude-Pendant
    hf-mem huggingface-best huggingface-community-evals huggingface-datasets
    huggingface-llm-trainer huggingface-local-models huggingface-lora-space-builder
    huggingface-paper-publisher huggingface-papers huggingface-tool-builder
    huggingface-trackio huggingface-vision-trainer huggingface-zerogpu
    train-sentence-transformers transformers-js trl-training
    # Skill-Werkzeuge und opencode-spezifische Runbooks
    find-skills skill-craft skill-creator
    freetoken-setup opencode-git-workflow sdlc-autopilot
  )
  local skill name shim_dir allowed fail=0
  [ -d "$REPO/.opencode/skills" ]   # Positiv-Anker: ohne SSOT-Verzeichnis waere die Aussage vakuos
  while read -r skill; do
    [ -z "$skill" ] && continue
    # `$` in der sed-Ersetzung braucht einen LEEREN Ersatz (`$||`), nicht `$//` —
    # letzteres laesst den s-Ausdruck unbeendet ("unterminated `s' command").
    name="$(echo "$skill" | sed "s|$REPO/.opencode/skills/||; s|/SKILL.md$||")"
    shim_dir="$REPO/.claude/skills/$name"
    # Shims koennen als Verzeichnis-Symlink, Datei-Symlink oder Pointer-Datei existieren
    if [ -e "$shim_dir" ]; then
      continue
    fi
    allowed=0
    for a in "${opencode_only[@]}"; do
      [ "$a" = "$name" ] && { allowed=1; break; }
    done
    [ "$allowed" -eq 1 ] && continue
    echo "opencode-Skill '$name' hat kein .claude/skills-Shim und steht nicht in opencode_only" >&2
    fail=1
  done < <(find "$REPO/.opencode/skills" -name 'SKILL.md' -not -path "*/OVERVIEW.md" 2>/dev/null)
  [ "$fail" -eq 0 ]
}
