#!/usr/bin/env bats
# tests/spec/agent-skills/skill-symlink-targets.bats [T900236]
#
# PRUEFMODUS: Dateisystem-Aufloesung (kein Source-Grep). Geprueft wird das
# tatsaechliche Resultat — loest der Symlink auf eine existierende Datei auf? —
# nicht der Text des Link-Ziels. Ein Guard auf den Ziel-String wuerde die
# Schreibweise festschreiben statt die Semantik (tests/CLAUDE.md, T002716).
#
# HINTERGRUND (T900236): PR #5749 (015d44199, T900070) stellte .claude/skills/*
# auf Symlinks nach .opencode/skills/* um. Alle 11 Ziele waren um eine Ebene zu
# kurz — '../.opencode/skills/<name>' loest von .claude/skills/ aus nach
# '.claude/.opencode/skills/<name>' auf, was nicht existiert. Folge: jeder Guard,
# der .claude/skills/<name>/SKILL.md liest, brach mit 'No such file or directory'
# ab; die CI auf main war drei Laeufe lang rot, und der Skill-Loader von Claude
# Code fand keine Skills mehr.
#
# WARUM ES DURCHKAM: tests/spec/agent-skills/skill-path-references.bats prueft
# Pfadverweise INNERHALB von Skill-Dateien, nicht die Aufloesbarkeit der
# Symlinks selbst. Diese Luecke schliesst dieser Guard.
#
# POSITIV-ANKER [T002356-M1]: Erst wird geprueft, dass .claude/skills/ existiert
# und ueberhaupt Symlinks enthaelt. Ohne den Anker wuerde ein geloeschtes oder
# leeres Verzeichnis die Aussage "kein Symlink ist kaputt" trivial bestehen.
#
# HARTUNG (T900238): Drei Schwachstellen des Guards wurden geschlossen.
# (1) Test 3 uebersprang Nicht-Verzeichnis-Ziele pauschal ('[ -d "$link" ] ||
# continue') — ein geloeschter oder auf eine Datei zeigender Skill wurde
# toleriert. Einzig OVERVIEW.md darf ein Nicht-Verzeichnis-Ziel sein.
# (2) Test 1 pruefte nur Existenz + Anzahl — das Loeschen ALLER Symlinks waere
# gruen geblieben. Jetzt Soll-Ist-Abgleich gegen die getrackten
# .opencode/skills/*/SKILL.md-Verzeichnisse (git ls-files) plus OVERVIEW.md.
# (3) Bei core.symlinks=false (Windows) materialisiert git checkout keine
# Symlinks; die Assertions werden dann in setup() uebersprungen statt rot zu
# faerben.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL_DIR="$REPO_ROOT/.claude/skills"
  # T900238 (F4): Bei core.symlinks=false materialisiert git checkout keine
  # Symlinks — die Assertions waeren strukturell unerfuellbar. Unset gilt als
  # symlink-faehig (git-Default true). skip in setup() ist unter Bats 1.13.0
  # verifiziert (alle Tests der Datei werden uebersprungen, Exit 0).
  if [ "$(git -C "$REPO_ROOT" config --bool core.symlinks 2>/dev/null)" = "false" ]; then
    skip "core.symlinks=false — Symlink-Assertions uebersprungen"
  fi
}

# Alle Symlinks direkt unter .claude/skills — ein Pfad pro Zeile.
_symlinks() {
  find "$SKILL_DIR" -maxdepth 1 -type l | sort
}

# Skills mit claude_code-Exklusion im Registry (T900151: native OpenCode
# Vendor-Skills erhalten explizite Exklusionen, keine Claude-Shims) — ein
# Skill-Name pro Zeile.
_excluded_from_claude() {
  awk '
    /^  - id: / {
      if (id != "" && excl) print id
      id = $3; excl = 0; in_excl = 0; next
    }
    /^    exclusions:$/ { in_excl = 1; next }
    /^    [a-z]/ { in_excl = 0 }
    in_excl && /^      claude_code:/ { excl = 1 }
    END { if (id != "" && excl) print id }
  ' "$REPO_ROOT/docs/agent-guide/registry/skills.yaml"
}

# Soll-Menge (T900238/F2): getrackte .opencode/skills/*/SKILL.md-Verzeichnisse
# plus OVERVIEW.md — abgeleitet aus git ls-files, nicht aus dem Dateisystem —
# MINUS Registry-Exklusionen (T900151/T900347): Ein exkludierter Skill darf
# keinen .claude/skills-Symlink tragen, sonst waere die Exklusion wirkungslos.
_expected_symlink_names() {
  {
    git -C "$REPO_ROOT" ls-files -- .opencode/skills \
      | grep '/SKILL\.md$' \
      | sed 's#^\.opencode/skills/##; s#/SKILL\.md$##'
    printf '%s\n' 'OVERVIEW.md'
  } | sort | comm -23 - <(_excluded_from_claude | sort -u)
}

# Ist-Menge: Basenamen der Symlinks direkt unter .claude/skills.
_symlink_names() {
  _symlinks | sed 's#^.*/##' | sort
}

@test "T900236: .claude/skills-Symlinks entsprechen den getrackten Skills" {
  # Positiv-Anker [T002356-M1]: Verzeichnis existiert und enthaelt Symlinks.
  [ -d "$SKILL_DIR" ]
  count="$(_symlinks | wc -l)"
  [ "$count" -gt 0 ]
  # Soll-Ist-Abgleich: fehlende UND ueberzaehlige Symlinks faerben rot.
  diff <(printf '%s\n' "$(_expected_symlink_names)") \
       <(printf '%s\n' "$(_symlink_names)")
}

@test "T900236: jeder .claude/skills-Symlink loest auf ein existierendes Ziel auf" {
  [ -d "$SKILL_DIR" ]
  links="$(_symlinks)"
  [ -n "$links" ]
  # Keine nackte '!'-Pipeline (tests/CLAUDE.md) — Defekte einsammeln, dann leer pruefen.
  broken=""
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    if [ ! -e "$link" ]; then
      broken="${broken}${link} -> $(readlink "$link")"$'\n'
    fi
  done <<<"$links"
  [ -z "$broken" ] || {
    echo "Kaputte Symlinks:"; echo "$broken"
    false
  }
}

@test "T900236: jeder verlinkte Skill traegt eine lesbare SKILL.md" {
  [ -d "$SKILL_DIR" ]
  links="$(_symlinks)"
  [ -n "$links" ]
  missing=""
  non_dir=""
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    if [ ! -d "$link" ]; then
      # T900238 (F1): Einzig OVERVIEW.md darf ein Nicht-Verzeichnis-Ziel sein.
      if [ "$(basename "$link")" = "OVERVIEW.md" ]; then
        continue
      fi
      non_dir="${non_dir}${link} -> $(readlink "$link")"$'\n'
      continue
    fi
    if [ ! -r "$link/SKILL.md" ]; then
      missing="${missing}${link}/SKILL.md"$'\n'
    fi
  done <<<"$links"
  [ -z "$non_dir" ] || {
    echo "Symlinks auf Nicht-Verzeichnis-Ziele:"; echo "$non_dir"
    false
  }
  [ -z "$missing" ] || {
    echo "Fehlende SKILL.md:"; echo "$missing"
    false
  }
}
