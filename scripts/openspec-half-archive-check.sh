#!/usr/bin/env bash
# scripts/openspec-half-archive-check.sh — findet halb archivierte OpenSpec-Changes. [T002428]
#
# Warum es das braucht: `openspec.sh archive` fuehrt drei Teilschritte nacheinander aus —
# Delta in die SSOT mergen, Quelle nach changes/archive/<datum>-<slug> verschieben,
# Statusmap regenerieren. Es ist nicht atomar, und sein Ergebnis kann TEILWEISE committet
# werden. Genau das geschah mit pr-refresh-T002413: der Lauf fand in einem fremden Worktree
# statt (#3447/T002382), der Archivordner landete im Commit, der Delta-Merge in
# openspec/specs/ci-cd.md und das Entfernen der Quelle nicht. Auf main lag der Change
# danach gleichzeitig unter changes/ und im Archiv, waehrend die SSOT das Delta nicht kannte
# — und nichts bemerkte es, bis jemand zufaellig hinsah.
#
# Der Check ist bewusst rein struktureller Natur (Verzeichnisnamen, kein Parsen von
# Spec-Inhalten): der Halbzustand ist an der Doppelung eindeutig erkennbar, und ein
# inhaltlicher Vergleich waere gegenueber legitimen SSOT-Aenderungen falsch-positiv.
#
# Exit: 0 = kein Slug doppelt, 1 = mindestens einer liegt in changes/ UND im Archiv.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
OPENSPEC_ROOT="${OPENSPEC_ROOT:-$REPO/openspec}"

CHANGES="$OPENSPEC_ROOT/changes"
ARCHIVE="$CHANGES/archive"

[ -d "$CHANGES" ] || { echo "openspec-half-archive-check: kein changes/ unter $OPENSPEC_ROOT — nichts zu pruefen."; exit 0; }

# Offene Slugs: alle Verzeichnisse direkt unter changes/, ausser archive/ selbst.
offen=()
while IFS= read -r d; do
  [ -n "$d" ] || continue
  name="$(basename "$d")"
  [ "$name" = "archive" ] && continue
  offen+=("$name")
done < <(find "$CHANGES" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

if [ ! -d "$ARCHIVE" ] || [ "${#offen[@]}" -eq 0 ]; then
  echo "openspec-half-archive-check: ✓ kein halb archivierter Change."
  exit 0
fi

# Archivierte Slugs: Verzeichnisnamen der Form <YYYY-MM-DD>-<slug>; das Datumspraefix faellt
# weg. Ein Slug darf selbst Bindestriche enthalten, deshalb nur die ersten drei Segmente
# abschneiden statt am ersten Bindestrich zu trennen.
declare -A archiviert=()
while IFS= read -r d; do
  [ -n "$d" ] || continue
  base="$(basename "$d")"
  slug="$(printf '%s' "$base" | sed -E 's/^[0-9]{4}-[0-9]{2}-[0-9]{2}-//')"
  [ "$slug" = "$base" ] && continue   # kein Datumspraefix — kein regulaerer Archiveintrag
  archiviert["$slug"]="$base"
done < <(find "$ARCHIVE" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort)

treffer=0
for slug in "${offen[@]}"; do
  if [ -n "${archiviert[$slug]:-}" ]; then
    treffer=$((treffer + 1))
    echo "openspec-half-archive-check: HALB ARCHIVIERT: '$slug'" >&2
    echo "  offen:      openspec/changes/$slug/" >&2
    echo "  archiviert: openspec/changes/archive/${archiviert[$slug]}/" >&2
  fi
done

if [ "$treffer" -gt 0 ]; then
  cat >&2 <<'EOF'

Ein Slug darf nicht gleichzeitig offen und archiviert sein. Heilen:
  1. Pruefen, ob das Delta in der SSOT angekommen ist:
     grep '### Requirement:' openspec/changes/archive/<eintrag>/specs/<cap>.md
     und dieselben Namen in openspec/specs/<cap>.md suchen.
  2. Fehlt es, das Delta von Hand nachtragen (openspec.sh archive laeuft nicht erneut —
     das Archivziel existiert bereits und der Guard lehnt ab).
  3. Die offene Quelle unter openspec/changes/<slug>/ entfernen.
  4. bash scripts/openspec-status-map.sh
EOF
  exit 1
fi

echo "openspec-half-archive-check: ✓ kein halb archivierter Change (${#offen[@]} offen, ${#archiviert[@]} archiviert)."
exit 0
