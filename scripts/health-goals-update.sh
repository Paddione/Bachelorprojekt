#!/usr/bin/env bash
# health-goals-update.sh — schreibt frisch gemessene Werte in die "Aktuell"-Spalte der
# Prio-C-Tabelle (Green Gates) in .claude/lib/goals.md.
#
# Bewusst eingeschränkter Scope: nur die maschinenlesbare Markdown-Tabelle wird angefasst.
# Die freitextigen Prio-A/B-Abschnitte (Policy-Begründungen, "war X"-Historie, Ticket-Status)
# bleiben menschlicher Redaktion vorbehalten — dort steckt Kontext, den kein Regex sicher
# fortschreiben kann. Zellen, die kein einfaches Integer-Format haben (Brüche wie "0/30",
# "Exit 0", Freitext wie "Elite"), werden übersprungen und zur manuellen Prüfung aufgelistet.
#
# Usage: bash scripts/health-goals-update.sh [--dry-run] [--full]
#   --dry-run  zeigt die Diffs, schreibt aber nicht in goals.md
#   --full     läuft ohne --fast (inkl. env:validate, Vitest-Coverage) — langsamer, mehr Abdeckung
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "kein git-Repo" >&2; exit 2; }

DRY_RUN=0
CHECK_ARGS=(--fast --quiet)
for a in "$@"; do case "$a" in
  --dry-run) DRY_RUN=1 ;;
  --full) CHECK_ARGS=(--quiet) ;;
  -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unbekanntes Flag: $a" >&2; exit 2 ;;
esac; done

GOALS_FILE="${HG_GOALS_FILE:-.claude/lib/goals.md}"

# Testability seam: if the caller pre-supplies a non-empty HG_VALUES_FILE we
# reuse it verbatim (fixture/CI); otherwise mktemp + run the live check script.
if [ -n "${HG_VALUES_FILE:-}" ] && [ -s "${HG_VALUES_FILE:-}" ]; then
  VALUES_FILE="$HG_VALUES_FILE"
else
  VALUES_FILE="$(mktemp)"
  trap 'rm -f "$VALUES_FILE"' EXIT
  HG_VALUES_FILE="$VALUES_FILE" bash scripts/health-goals-check.sh "${CHECK_ARGS[@]}" >/dev/null || true
fi

if [ ! -s "$VALUES_FILE" ]; then
  echo "keine Messwerte erhalten — abgebrochen" >&2
  exit 1
fi

python3 - "$GOALS_FILE" "$VALUES_FILE" "$DRY_RUN" <<'PY'
import re
import sys

goals_file, values_file, dry_run = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

values = {}
with open(values_file) as f:
    for line in f:
        parts = line.split()
        if len(parts) != 4:
            continue
        gid, actual, cmp_op, target = parts
        values[gid] = (actual, cmp_op, target)

with open(goals_file) as f:
    lines = f.readlines()

# Prio-C-Tabellenzeile: "| **ID** | Ziel | Aktuell | Target | Basis-Messung |"
row_re = re.compile(r'^\|\s*\*\*(G-[A-Z0-9]+)\*\*\s*\|([^|]*)\|([^|]*)\|([^|]*)\|(.*)\|\s*$')
bare_int_re = re.compile(r'^\s*([+-]?\d+)\s*(?:✓|⚠)?\s*$')

# Bekannte ID-Kollisionen: dieselbe ID misst in health-goals-check.sh (Skript) etwas anderes
# als in der goals.md-Tabelle beschrieben. Aktuell keine offenen Fälle (T001369 hat die
# G-FE03/G-FE04-Kollision aufgelöst) — Set bleibt als Sicherheitsnetz für künftige Drifts.
EXCLUDE_IDS = set()

changed = []
skipped_format = []
excluded = []
open_goals = []
for i, line in enumerate(lines):
    m = row_re.match(line.rstrip("\n"))
    if not m:
        continue
    gid = m.group(1)
    if gid not in values:
        continue
    if gid in EXCLUDE_IDS:
        excluded.append(gid)
        continue
    actual, cmp_op, target = values[gid]
    ziel_cell, aktuell_cell, target_cell, rest_cell = m.group(2), m.group(3), m.group(4), m.group(5)
    cm = bare_int_re.match(aktuell_cell)
    if not cm:
        skipped_format.append(gid)
        continue
    old_val = cm.group(1)
    ok = {
        "le": int(actual) <= int(target),
        "ge": int(actual) >= int(target),
        "eq": int(actual) == int(target),
    }.get(cmp_op, False)
    marker = "✓" if ok else "⚠"
    if not ok:
        open_goals.append((gid, ziel_cell.strip(), actual, cmp_op, target))
    if old_val == actual:
        continue
    lines[i] = f"| **{gid}** |{ziel_cell}| {actual} {marker} |{target_cell}|{rest_cell}|\n"
    changed.append((gid, old_val, actual, ok))

if changed:
    print("Aktualisiert:")
    for gid, old, new, ok in changed:
        note = "" if ok else "  ⚠ verletzt jetzt Target — Sektion ggf. manuell nach Prio B verschieben"
        print(f"  {gid}: {old} -> {new}{note}")
else:
    print("Keine Änderungen — alle Werte bereits aktuell.")

if skipped_format:
    print("\nÜbersprungen (kein einfaches Integer-Format in der Aktuell-Spalte, manuell prüfen):")
    for gid in skipped_format:
        print(f"  {gid}")

if excluded:
    print("\nAusgeschlossen (bekannte ID-Kollision Skript vs. Tabelle, siehe EXCLUDE_IDS):")
    for gid in excluded:
        print(f"  {gid}")

CMP_SYMBOL = {"le": "<=", "ge": ">=", "eq": "=="}

def _sh_escape(text):
    return (
        text.replace("\\", "\\\\")
        .replace('"', '\\"')
        .replace("`", "\\`")
        .replace("$", "\\$")
    )

print("\nOffene Ziele (Target verfehlt):")
if not open_goals:
    print("  keine — alle Prio-C-Gates grün.")
else:
    for gid, ziel_text, actual, cmp_op, target in sorted(open_goals):
        sym = CMP_SYMBOL.get(cmp_op, cmp_op)
        title = _sh_escape(f"Health-Goal: {gid} — {ziel_text}")
        desc = _sh_escape(
            f"Aktuell: {actual}, Target: {sym} {target}. Siehe .claude/lib/goals.md#{gid}"
        )
        print(f"  ⚠ {gid} — {ziel_text}: {actual} (Target: {sym} {target})")
        print("    scripts/ticket.sh create --type task \\")
        print(f'      --title "{title}" \\')
        print(f'      --description "{desc}" \\')
        print("      --priority mittel")

if changed and not dry_run:
    with open(goals_file, "w") as f:
        f.writelines(lines)
    print(f"\n{goals_file} geschrieben — Narrative (Sprint-Highlights, Baseline-Update) bleibt manuell.")
elif changed and dry_run:
    print("\n--dry-run: Datei nicht geschrieben.")
PY
