#!/usr/bin/env bats
# tests/spec/repo-structure/website-moved.bats
# SSOT: openspec/specs/repo-structure.md
#
# Drift-Guard fuer den Move website/ -> components/website/ (T006999, Partial p4).
# Pruefmodus (T002448-M4-Ausnahme, dokumentiert): Querschnitts-Struktur-Guard —
# das Ergebnis manifestiert sich ausschliesslich im Quelltext (Taskfiles,
# Workflows), es gibt kein Laufzeit-Verhalten. Deshalb git-grep.
#
# Reihenfolge T002356-M1: erst der Positiv-Anker (components/website/package.json
# muss existieren — ohne den Move schlaegt er fehl), dann die Negativ-Aussagen.
# Ohne den Anker bestuenden die Negativ-Pruefungen ueber leere Listen vakuos.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T006999: components/website existiert (Positiv-Anker)" {
  [ -f "$REPO_ROOT/components/website/package.json" ] \
    || { echo "FEHLT: components/website/package.json — Move nicht ausgefuehrt"; return 1; }
}

@test "T006999: kein Top-Level-Verzeichnis website/ mehr" {
  [ ! -d "$REPO_ROOT/website" ] \
    || { echo "FEHLT: Top-Level-Ordner website/ existiert noch"; return 1; }
}

@test "T006999: keine stale website/-Referenzen in Querschnitts-Dateien" {
  # Zeilen mit dem neuen Praefix (components/website/) sind erlaubt und werden
  # gefiltert — gesucht sind nur noch bare website/-Literale ohne Praefix.
  local stale=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      *components/website/*) continue ;;
    esac
    echo "STALE: $line" >&2
    stale=1
  done < <(git -C "$REPO_ROOT" grep -F -n 'website/' -- \
    Taskfile.yml taskfiles .github/workflows || true)

  [ "$stale" -eq 0 ] || return 1
}

@test "T007909: keine stale website/-Referenzen in Config-Klassen (Positiv-Anker)" {
  # Positiv-Anker zuerst (T002356-M1): ohne den Move schlagen die Negativ-Aussagen
  # ueber leere Listen vakuos fehl. Der Anker ist der T006999-Test oben
  # (components/website existiert) — dieser Test ergaenzt die Klassen, die der
  # urspruengliche Sweep (Taskfile.yml/taskfiles/.github/workflows) NICHT abdeckte:
  # genau die Klassen, in denen T007855 nach dem Merge 17 Stale-Referenzen fand.
  [ -f "$REPO_ROOT/components/website/package.json" ] \
    || { echo "FEHLT: components/website/package.json — Move nicht ausgefuehrt"; return 1; }

  # Config-Klassen aus T007855-Befund (der Sweep verfehlte sie):
  #   .githooks/, .gitattributes, .dockerignore, renovate.json5,
  #   docs/code-quality/subsystems.yaml, docs/agent-guide/registry/,
  #   Root-MDs (bare Formen wie 'cd website' ohne Slash),
  #   environments/-READMEs, factory-eval-Fixtures.
  # Sweep-Muster no-slash-Formen (dokumentiert): `cd website`, `--prefix brett`,
  # `brett/` in Tabellen — alle werden von den -F-Literalen unten erfasst
  # (git grep -F findet Teilstrings; 'cd website' und 'website/' sind getrennte Muster).
  local stale=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    case "$line" in
      # neuer Praefix = erlaubt
      *components/website/*|*components/brett/*) continue ;;
      # Design-Kit-Ordner (ui_kits/website, ui_kits/brett in art-library/Uploads)
      # sind KEINE Repo-Pfade — der Sweep ist auf die T007855-Klassen begrenzt.
      *ui_kits/website/*|*ui_kits/brett/*) continue ;;
      # k8s-Namespace-Name `website` (schema.yaml), kein Dateisystem-Pfad
      *"namespace \`website\`"*) continue ;;
    esac
    echo "STALE: $line" >&2
    stale=1
  done < <(git -C "$REPO_ROOT" grep -F -n -e 'website/' -e 'brett/' \
    -e 'cd website' -e 'cd brett' -e '--prefix brett' -- \
    .githooks .gitattributes .dockerignore renovate.json5 \
    docs/code-quality/subsystems.yaml docs/agent-guide/registry \
    AGENTS.md README.md components/website/CLAUDE.md \
    environments tests/factory-eval/fixtures || true)

  [ "$stale" -eq 0 ] || return 1
}

