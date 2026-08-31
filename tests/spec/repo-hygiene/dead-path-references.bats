#!/usr/bin/env bats
# tests/spec/repo-hygiene/dead-path-references.bats
# SSOT: openspec/specs/agent-skills.md
#
# Guard gegen tote Pfad-Referenzen (T002688, Vorgang A). Prüfmodus:
# Kommando-Ergebnis-Verifikation — jede Prüfung extrahiert Kandidaten aus der
# realen Datei und wertet `test -e` aus, kein `grep` auf Implementierungsquelle.
#
# Drei Driftquellen, drei Blöcke. Jeder Block belegt ZUERST, dass die
# Kandidatenliste nicht leer ist (Positiv-Anker), und prüft DANN die
# Negativ-Aussage — sonst bestünde die Prüfung über leeren Listen vakuos.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
}

@test "T002688: .dockerignore deklariert keine fehlenden Literale" {
  local missing=0 offenders="" candidates=0
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # Scope-Ausschluss: Kommentar, Negation, Glob-Zeichen, runtime-Marker
    case "$line" in
      '#'*) continue ;;
      '!'*) continue ;;
      *'*'*|*'?'*|*'['*) continue ;;
      *'# runtime'*) continue ;;
    esac
    # Scope-Ausschluss: gitignorierte Pfade [T002701]. Ein gitignorierter Eintrag
    # kann in einem frischen Klon nie existieren — seine Abwesenheit sagt nichts
    # ueber tote Referenzen aus, sondern nur darueber, ob jemand hier gebaut hat.
    # Ohne diese Zeile war der Block umgebungsabhaengig: lokal gruen (weil
    # components/website/node_modules existierte), auf jedem CI-Runner rot. Der "# runtime"-
    # Marker allein reicht nicht, weil er pro Eintrag von Hand gesetzt werden muss
    # und genau dann vergessen wird, wenn der Pfad lokal zufaellig existiert.
    if git -C "$REPO_ROOT" check-ignore -q "$line" 2>/dev/null; then
      continue
    fi
    candidates=$((candidates + 1))
    if [ ! -e "$REPO_ROOT/$line" ]; then
      missing=1
      offenders="$offenders$line "
    fi
  done < "$REPO_ROOT/.dockerignore"

  # Positiv-Anker: die Kandidatenliste ist nicht leer. Ohne ihn bestuende der
  # Block vakuos, sobald die Extraktion nichts mehr findet [T002356-M1].
  [ "$candidates" -gt 0 ] \
    || { echo "FATAL: keine pruefbaren Literale aus .dockerignore extrahiert — Extraktion defekt"; return 1; }

  [ "$missing" -eq 0 ] || { echo "FEHLT: .dockerignore verweist auf: $offenders"; return 1; }
}

@test "T002688: Registry-Schluessel zeigen auf existierende Manifeste" {
  local keys missing=0 offenders=""
  keys="$(grep -oE '\[k3d/[^]]+\]=' "$REPO_ROOT/scripts/factory/service-registry.sh" | tr -d '[]=')"

  # Positiv-Anker: mindestens ein Schlüssel wurde extrahiert
  [ -n "$keys" ] || { echo "FATAL: keine Registry-Schluessel in service-registry.sh gefunden"; return 1; }

  while IFS= read -r p; do
    [ -e "$REPO_ROOT/$p" ] || { missing=1; offenders="$offenders$p "; }
  done <<< "$keys"

  [ "$missing" -eq 0 ] || { echo "FEHLT: Registry-Schluessel ohne Manifest: $offenders"; return 1; }
}

# Helper: normalize relative path segments (e.g. "a/b/../c" -> "a/c", "./a" -> "a")
_normalize_repo_relpath() {
  local input="$1"
  local -a parts=()
  local IFS="/"
  local segs
  read -ra segs <<< "$input"
  for seg in "${segs[@]}"; do
    if [ -z "$seg" ] || [ "$seg" = "." ]; then
      continue
    elif [ "$seg" = ".." ]; then
      if [ ${#parts[@]} -gt 0 ]; then
        unset 'parts[${#parts[@]}-1]'
        parts=("${parts[@]}")
      fi
    else
      parts+=("$seg")
    fi
  done
  local res
  res=$(IFS="/"; echo "${parts[*]}")
  echo "$res"
}

@test "T002688: kein getrackter Symlink haengt in der Luft" {
  # [T900021] Plattformunabhaengige Pruefung ueber den Git-Tree statt Arbeitsbaum.
  # Auf Checkouts mit core.symlinks=false (Windows) ist ein Symlink im FS eine
  # regulaere Textdatei, weshalb test -e das Ziel nie pruefen konnte und der Test
  # per Skip deaktiviert war.
  # Die Tree-basierte Pruefung liest den Blob-Inhalt des Symlinks (Git Mode 120000)
  # via git cat-file, prueft auf einzeilige Zielpfade (faengt versehentlich
  # ueberschriebene PEM-Zertifikate ab) und validiert die Existenz des Ziels
  # im Git-Tree via git cat-file -e "HEAD:<ziel>".

  local links missing=0 offenders="" candidates=0

  # Positiv-Anker: das Repo hat getrackte Symlinks (z.B. .agents/agents)
  links="$(git -C "$REPO_ROOT" ls-files -s | awk '$1 == "120000" { print $2, $4 }')"
  [ -n "$links" ] || { echo "FATAL: kein getrackter Symlink gefunden — Extraktion defekt"; return 1; }

  while read -r sha p; do
    [ -n "$sha" ] && [ -n "$p" ] || continue
    candidates=$((candidates + 1))

    local target
    target="$(git -C "$REPO_ROOT" cat-file -p "$sha" 2>/dev/null || true)"
    [ -n "$target" ] || { missing=1; offenders="$offenders$p(unreadable-blob) "; continue; }

    # Ein gueltiger Symlink enthaelt genau eine Zeile (faengt PEM-in-Symlink ab)
    local line_count
    line_count="$(printf '%s\n' "$target" | wc -l)"
    if [ "$line_count" -gt 1 ]; then
      missing=1
      offenders="$offenders$p(multiline-content) "
      continue
    fi

    # Zielpfad relativ zum Verzeichnis des Symlinks aufloesen
    local dir combined resolved
    dir="$(dirname "$p")"
    if [ "$dir" = "." ]; then
      combined="$target"
    else
      combined="$dir/$target"
    fi
    resolved="$(_normalize_repo_relpath "$combined")"

    if ! git -C "$REPO_ROOT" cat-file -e "HEAD:$resolved" 2>/dev/null; then
      missing=1
      offenders="$offenders$p->$target "
    fi
  done <<< "$links"

  [ "$candidates" -gt 0 ] \
    || { echo "FATAL: keine getrackten Symlinks verarbeitet — Extraktion defekt"; return 1; }

  [ "$missing" -eq 0 ] || { echo "FEHLT: Symlink haengt in der Luft: $offenders"; return 1; }
}
