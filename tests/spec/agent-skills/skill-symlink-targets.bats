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

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL_DIR="$REPO_ROOT/.claude/skills"
}

# Alle Symlinks direkt unter .claude/skills — ein Pfad pro Zeile.
_symlinks() {
  find "$SKILL_DIR" -maxdepth 1 -type l | sort
}

@test "T900236: .claude/skills existiert und enthaelt Symlinks" {
  # Positiv-Anker fuer alle folgenden Negativ-Aussagen.
  [ -d "$SKILL_DIR" ]
  count="$(_symlinks | wc -l)"
  [ "$count" -gt 0 ]
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
  while IFS= read -r link; do
    [ -n "$link" ] || continue
    [ -d "$link" ] || continue
    if [ ! -r "$link/SKILL.md" ]; then
      missing="${missing}${link}/SKILL.md"$'\n'
    fi
  done <<<"$links"
  [ -z "$missing" ] || {
    echo "Fehlende SKILL.md:"; echo "$missing"
    false
  }
}
