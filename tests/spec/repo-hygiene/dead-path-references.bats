#!/usr/bin/env bats
# tests/spec/repo-hygiene/dead-path-references.bats
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

# T900399: entfernt. Der Test las die `[k3d/…]=`-Schluessel aus
# `scripts/factory/service-registry.sh` — mit dem Factory-Teardown existiert
# diese Shell-Registry nicht mehr, und die verbleibenden SSOT-Registries
# (`docs/agent-guide/registry/*.yaml`) fuehren keine Pfad-zu-Datei-Tabelle
# dieses Formats mehr. Der Container-Registry-Key ist inzwischen
# `k3d/configmap-domains.yaml`; ein Ersatztest gehoert in eine eigene Datei
# unter `tests/spec/k3d/`, sobald der Pfadverweis-Vertrag dort festgeschrieben ist.

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

# Loest Zwischen-Symlinks in einem repo-relativen Pfad ueber den Git-Tree auf (T900836).
# `git cat-file -e HEAD:a/b/c` folgt keinem Symlink in `a` oder `a/b`: liegt das Ziel
# hinter einem getrackten Symlink (`.agents/skills` -> `../.opencode/skills`), meldet git
# es als fehlend, obwohl es in jedem Checkout existiert. Die Aufloesung bleibt im Tree —
# ein nur lokal vorhandenes Ziel gilt weiterhin als haengend.
_resolve_tracked_symlinks() {
  local path="$1" hops=0
  while [ "$hops" -lt 16 ]; do
    local prefix="" seg rest="" replaced=0
    local -a segs=()
    IFS="/" read -ra segs <<< "$path"
    local i n="${#segs[@]}"
    for ((i = 0; i < n - 1; i++)); do
      seg="${segs[$i]}"
      prefix="${prefix:+$prefix/}$seg"
      if [ "$(git -C "$REPO_ROOT" ls-tree HEAD -- "$prefix" 2>/dev/null | awk '{print $1}')" = "120000" ]; then
        local link_target dir
        link_target="$(git -C "$REPO_ROOT" cat-file -p "HEAD:$prefix" 2>/dev/null || true)"
        [ -n "$link_target" ] || break
        rest="$(IFS="/"; echo "${segs[*]:$((i + 1))}")"
        dir="$(dirname "$prefix")"
        [ "$dir" = "." ] && dir=""
        path="$(_normalize_repo_relpath "${dir:+$dir/}$link_target/$rest")"
        replaced=1
        break
      fi
    done
    [ "$replaced" -eq 1 ] || break
    hops=$((hops + 1))
  done
  echo "$path"
}

@test "T900836: Zwischen-Symlinks werden ueber den Git-Tree aufgeloest" {
  # Positiv-Anker: der Zwischen-Symlink, an dem der Guard scheiterte, ist getrackt.
  [ "$(git -C "$REPO_ROOT" ls-tree HEAD -- .agents/skills | awk '{print $1}')" = "120000" ]

  # Ein Ziel hinter dem Symlink wird auf seinen echten, getrackten Pfad abgebildet.
  run _resolve_tracked_symlinks ".agents/skills/repo-hygiene/SKILL.md"
  [ "$status" -eq 0 ]
  git -C "$REPO_ROOT" cat-file -e "HEAD:$output"

  # Ein Pfad ohne Zwischen-Symlink bleibt unveraendert.
  run _resolve_tracked_symlinks "tests/spec/repo-hygiene/dead-path-references.bats"
  [ "$output" = "tests/spec/repo-hygiene/dead-path-references.bats" ]

  # Negativ: ein fehlendes Ziel hinter dem Symlink bleibt fehlend — die Aufloesung darf
  # haengende Symlinks nicht gruen machen.
  run _resolve_tracked_symlinks ".agents/skills/gibt-es-nicht-T900836"
  [ "$status" -eq 0 ]
  run git -C "$REPO_ROOT" cat-file -e "HEAD:$output"
  [ "$status" -ne 0 ]
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
    resolved="$(_resolve_tracked_symlinks "$(_normalize_repo_relpath "$combined")")"

    if ! git -C "$REPO_ROOT" cat-file -e "HEAD:$resolved" 2>/dev/null; then
      missing=1
      offenders="$offenders$p->$target "
    fi
  done <<< "$links"

  [ "$candidates" -gt 0 ] \
    || { echo "FATAL: keine getrackten Symlinks verarbeitet — Extraktion defekt"; return 1; }

  [ "$missing" -eq 0 ] || { echo "FEHLT: Symlink haengt in der Luft: $offenders"; return 1; }
}
