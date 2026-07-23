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
# Usage: bash scripts/health-goals-update.sh [--dry-run] [--full] [--suggest-tickets] [--drift]
#   --dry-run          zeigt die Diffs, schreibt aber nicht in goals.md
#   --full             läuft ohne --fast (inkl. env:validate, Vitest-Coverage) — langsamer, mehr Abdeckung
#   --suggest-tickets  zeigt Ticket-Create-Befehle für offene Ziele (opt-in, NICHT der Default —
#                      s. AGENTS.md "Updating the Health Baseline": Ticket-Erstellung ist eine
#                      bewusste, manuelle Entscheidung, keine Automatik). Filtert Ziele heraus,
#                      für die bereits ein nicht-done Ticket mit der G-ID im Titel existiert.
#   --drift            Read-only Drift-Report: dokumentierte current-Werte (goals-data.generated.json)
#                      vs. frische Messung. Gruppenausgabe nach Priorität. Kein Schreiben.
set -euo pipefail

cd "$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "kein git-Repo" >&2; exit 2; }

DRY_RUN=0
SUGGEST_TICKETS=0
DRIFT_MODE=0
CHECK_ARGS=(--fast --quiet)
for a in "$@"; do case "$a" in
  --dry-run) DRY_RUN=1 ;;
  --full) CHECK_ARGS=(--quiet) ;;
  --suggest-tickets) SUGGEST_TICKETS=1 ;;
  --drift) DRIFT_MODE=1 ;;
  -h|--help) sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "unbekanntes Flag: $a" >&2; exit 2 ;;
esac; done

GOALS_FILE="${HG_GOALS_FILE:-.claude/lib/goals.md}"
GEN_JSON="${HG_GEN_JSON:-website/src/lib/goals-data.generated.json}"
CLEANUP_FILES=()
trap 'rm -f "${CLEANUP_FILES[@]}"' EXIT

# Testability seam: if the caller pre-supplies a non-empty HG_VALUES_FILE we
# reuse it verbatim (fixture/CI); otherwise mktemp + run the live check script.
if [ -n "${HG_VALUES_FILE:-}" ] && [ -s "${HG_VALUES_FILE:-}" ]; then
  VALUES_FILE="$HG_VALUES_FILE"
else
  VALUES_FILE="$(mktemp)"
  CLEANUP_FILES+=("$VALUES_FILE")
  HG_VALUES_FILE="$VALUES_FILE" bash scripts/health-goals-check.sh "${CHECK_ARGS[@]}" >/dev/null || true
fi

if [ ! -s "$VALUES_FILE" ]; then
  echo "keine Messwerte erhalten — abgebrochen" >&2
  exit 1
fi

# --drift mode (D2, T002107): Read-only Report, kein Schreiben.
if [ "$DRIFT_MODE" = "1" ]; then
  if [ ! -f "$GEN_JSON" ]; then
    echo "⚠ $GEN_JSON nicht gefunden — Drift-Report nicht möglich." >&2
    exit 0
  fi
  # Staleness guard: wenn JSON älter als goals.md → Warnung
  if [ "$GEN_JSON" -ot "$GOALS_FILE" ] 2>/dev/null; then
    echo "⚠ $GEN_JSON ist älter als $GOALS_FILE — ggf. veraltete Werte. Regeneriere mit 'task freshness:regenerate'." >&2
  fi
  python3 - "$GOALS_FILE" "$VALUES_FILE" "$GEN_JSON" <<'PY_DRIFT'
import json, sys

goals_file, values_file, gen_json_file = sys.argv[1], sys.argv[2], sys.argv[3]

values = {}
with open(values_file) as f:
    for line in f:
        parts = line.split()
        if len(parts) != 4: continue
        gid, actual, cmp_op, target = parts
        values[gid] = (actual, cmp_op, target)

with open(gen_json_file) as f:
    gen_data = json.load(f)

# Build documented-current lookup
doc_current = {}  # gid -> {current, priority, title}
for entry in gen_data:
    gid = entry.get("id")
    if gid:
        doc_current[gid] = {
            "current": str(entry.get("current") or ""),
            "priority": entry.get("priority", "?"),
            "title": entry.get("title", ""),
        }

drifts = []  # (priority_sort_key, gid, documented, actual, title)
for gid, (actual, cmp_op, target) in values.items():
    dc = doc_current.get(gid)
    if dc is None:
        continue
    if str(dc["current"]) != actual:
        priority = dc["priority"]
        sort_key = {"A": 1, "B": 2, "C": 3}.get(priority, 9)
        drifts.append((sort_key, gid, dc["current"], actual, dc["title"]))

drifts.sort(key=lambda x: (x[0], x[1]))

if not drifts:
    print("✅ Kein Drift — alle dokumentierten Werte entsprechen der Messung.")
else:
    current_priority = None
    for sort_key, gid, documented, actual, title in drifts:
        prio_label = {1: "A", 2: "B", 3: "C"}.get(sort_key, "?")
        if prio_label != current_priority:
            current_priority = prio_label
            print(f"\n# Priorität {prio_label}")
        print(f"  {gid}: dokumentiert {documented} · gemessen {actual} [DRIFT]")

print("\n--drift: Read-only — keine Dateien geschrieben.")
PY_DRIFT
  exit 0
fi

# Dedup-Check nur bei explizitem --suggest-tickets: G-IDs, die bereits in einem
# nicht-done Ticket-Titel stehen, werden nicht erneut vorgeschlagen (verhindert den
# T001280→T001347-Stil-Churn: Ticket done ohne Messwert-Fix → nächster Lauf schlägt
# sofort ein neues Ticket für dasselbe Ziel vor).
EXISTING_GOAL_IDS_FILE=""
if [ "$SUGGEST_TICKETS" = "1" ]; then
  EXISTING_GOAL_IDS_FILE="$(mktemp)"
  CLEANUP_FILES+=("$EXISTING_GOAL_IDS_FILE")
  if ! bash scripts/ticket.sh list --limit 500 2>/dev/null \
      | python3 -c "
import json, re, sys
try:
    data = json.load(sys.stdin)
except Exception:
    data = []
for t in data:
    if (t.get('status') or '') == 'done':
        continue
    for m in re.findall(r'G-[A-Z0-9]+', t.get('title') or ''):
        print(m)
" > "$EXISTING_GOAL_IDS_FILE" 2>/dev/null; then
    echo "⚠ Ticket-Liste nicht verfügbar (Cluster/psql?) — Dedup-Check übersprungen, Vorschläge ungefiltert." >&2
    : > "$EXISTING_GOAL_IDS_FILE"
  fi
fi

python3 - "$GOALS_FILE" "$VALUES_FILE" "$DRY_RUN" "$SUGGEST_TICKETS" "$EXISTING_GOAL_IDS_FILE" <<'PY'
import re
import sys

goals_file, values_file, dry_run = sys.argv[1], sys.argv[2], sys.argv[3] == "1"
suggest_tickets = sys.argv[4] == "1"
existing_goal_ids_file = sys.argv[5]

existing_goal_ids = set()
if suggest_tickets and existing_goal_ids_file:
    try:
        with open(existing_goal_ids_file) as f:
            existing_goal_ids = {line.strip() for line in f if line.strip()}
    except OSError:
        pass

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

# Format-whitelist (D1, T002107): geordnete Liste; erster Treffer gewinnt.
# Jeder Eintrag: (name, regex, format_name_for_rewrite)
FMT_MATCHERS = [
    ("bare",    re.compile(r'^\s*([+-]?\d+)\s*(?:[✓⚠])?\s*$'),                   "bare"),
    ("percent", re.compile(r'^\s*([+-]?\d+)\s*%\s*(?:[✓⚠])?\s*$'),               "percent"),
    ("exit",    re.compile(r'^\s*Exit\s+([+-]?\d+)\s*(?:[✓⚠])?\s*$'),            "exit"),
    ("unit",    re.compile(r'^\s*~?\s*([+-]?\d+)\s+([A-Za-zÄÖÜäöü]+)\s*(?:[✓⚠])?\s*$'), "unit"),
    ("frac",    re.compile(r'^\s*([+-]?\d+)\s*/\s*([+-]?\d+)\s*(?:[✓⚠])?\s*$'),  "frac"),
    ("na",      re.compile(r'^\s*n/a\s*(?:[✓⚠])?\s*$'),                          "na"),
]

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

    old_val = None
    suffix = None
    fmt_key = None
    cm = None
    for fmt_key, fmt_re, _ in FMT_MATCHERS:
        cm = fmt_re.match(aktuell_cell)
        if cm:
            if fmt_key == "na":
                old_val = None
            else:
                old_val = cm.group(1)
            if fmt_key in ("unit", "frac"):
                suffix = cm.group(2)
            break

    if cm is None:
        skipped_format.append(gid)
        continue

    ok = {
        "le": int(actual) <= int(target),
        "ge": int(actual) >= int(target),
        "eq": int(actual) == int(target),
    }.get(cmp_op, False)
    marker = "✓" if ok else "⚠"
    if not ok:
        open_goals.append((gid, ziel_cell.strip(), actual, cmp_op, target))

    # n/a: old_val is None → immer schreiben
    if old_val is not None and old_val == actual:
        continue

    if fmt_key == "bare":
        rewrite = f"{actual} {marker}"
    elif fmt_key == "percent":
        rewrite = f"{actual} % {marker}"
    elif fmt_key == "exit":
        rewrite = f"Exit {actual} {marker}"
    elif fmt_key == "unit":
        rewrite = f"{actual} {suffix} {marker}"
    elif fmt_key == "frac":
        rewrite = f"{actual}/{suffix} {marker}"
    elif fmt_key == "na":
        rewrite = f"{actual} {marker}"

    lines[i] = f"| **{gid}** |{ziel_cell}| {rewrite} |{target_cell}|{rest_cell}|\n"
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
    skipped_dup = []
    for gid, ziel_text, actual, cmp_op, target in sorted(open_goals):
        sym = CMP_SYMBOL.get(cmp_op, cmp_op)
        print(f"  ⚠ {gid} — {ziel_text}: {actual} (Target: {sym} {target})")
        if not suggest_tickets:
            continue
        if gid in existing_goal_ids:
            skipped_dup.append(gid)
            continue
        title = _sh_escape(f"Health-Goal: {gid} — {ziel_text}")
        desc = _sh_escape(
            f"Aktuell: {actual}, Target: {sym} {target}. Siehe .claude/lib/goals.md#{gid}"
        )
        print("    scripts/ticket.sh create --type task \\")
        print(f'      --title "{title}" \\')
        print(f'      --description "{desc}" \\')
        print("      --priority mittel")
    if not suggest_tickets:
        print(
            "\n  Ticket-Vorschläge sind standardmäßig deaktiviert (bewusste, manuelle Entscheidung —\n"
            "  siehe AGENTS.md \"Updating the Health Baseline\"). Mit --suggest-tickets ansehen\n"
            "  (dedupliziert gegen bereits offene Tickets für dieselbe G-ID)."
        )
    elif skipped_dup:
        print("\n  Übersprungen (bereits als nicht-done Ticket erfasst, kein erneuter Vorschlag):")
        for gid in skipped_dup:
            print(f"    {gid}")

if changed and not dry_run:
    with open(goals_file, "w") as f:
        f.writelines(lines)
    print(f"\n{goals_file} geschrieben — Narrative (Sprint-Highlights, Baseline-Update) bleibt manuell.")
elif changed and dry_run:
    print("\n--dry-run: Datei nicht geschrieben.")
PY
