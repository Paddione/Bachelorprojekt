#!/usr/bin/env bats
# tests/spec/client-directory.bats
#
# Guards for T901026: client-directory (minimales Kundenverzeichnis mit
# Terminhistorie, Owner-only). Style: tests/spec/notify-reminders.bats.
# IDs T901026-1..5 and T901263-1 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.

LIB_TS="${BATS_TEST_DIRNAME}/../../components/website/src/lib/clients.ts"
LIST_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/pages/owner/kunden.astro"
DETAIL_ASTRO="${BATS_TEST_DIRNAME}/../../components/website/src/pages/owner/kunden/[id].astro"
KORRIGIEREN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/kunden/[id]/korrigieren.ts"
EXPORT_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/kunden/[id]/export.ts"
LOESCHEN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/kunden/[id]/loeschen.ts"
ZUSAMMEN_TS="${BATS_TEST_DIRNAME}/../../components/website/src/pages/api/owner/kunden/[id]/zusammenfuehren.ts"

# ── Case 1: every customer route is owner-guarded (fail-closed) ─────────────

@test "T901026-1: all kunden routes reference the owner guard (requireOwner)" {
  for f in "$LIST_ASTRO" "$DETAIL_ASTRO" "$KORRIGIEREN_TS" "$EXPORT_TS" "$LOESCHEN_TS" "$ZUSAMMEN_TS"; do
    [ -f "$f" ] || { echo "missing route file: $f"; return 1; }
    grep -q "owner-guard\|requireOwner\|isOwnerSession" "$f" || { echo "owner guard missing from $f"; return 1; }
  done
}

# ── Case 2: clients group by normalized email ──────────────────────────────

@test "T901026-2: clients.ts groups customers via normalizeClientEmail" {
  [ -f "$LIB_TS" ] || { echo "missing lib file: $LIB_TS"; return 1; }
  grep -q "normalizeClientEmail" "$LIB_TS" || { echo "normalizeClientEmail missing from clients.ts"; return 1; }
  def_line=$(grep -n "function normalizeClientEmail\|const normalizeClientEmail" "$LIB_TS" | head -1 | cut -d: -f1)
  use_line=$(grep -n "normalizeClientEmail(" "$LIB_TS" | grep -v "function normalizeClientEmail" | head -1 | cut -d: -f1)
  [ -n "$def_line" ] || { echo "normalizeClientEmail definition missing from clients.ts"; return 1; }
  [ -n "$use_line" ] || { echo "normalizeClientEmail call missing from the grouping path in clients.ts"; return 1; }
  [ "$def_line" -lt "$use_line" ] || { echo "normalizeClientEmail must be defined before its grouping-path call in clients.ts"; return 1; }
}

# ── Case 3: merges are never silent (explicit confirm + both ids) ──────────

@test "T901026-3: zusammenfuehren.ts requires confirm plus both ids before merging" {
  [ -f "$ZUSAMMEN_TS" ] || { echo "missing endpoint file: $ZUSAMMEN_TS"; return 1; }
  grep -q "confirm" "$ZUSAMMEN_TS" || { echo "confirm parameter missing from zusammenfuehren.ts"; return 1; }
  grep -q "dropId" "$ZUSAMMEN_TS" || { echo "dropId (source id) missing from zusammenfuehren.ts"; return 1; }
  grep -q "keepId" "$ZUSAMMEN_TS" || { echo "keepId (target id) missing from zusammenfuehren.ts"; return 1; }
  guard_line=$(grep -n "confirm" "$ZUSAMMEN_TS" | head -1 | cut -d: -f1)
  merge_line=$(grep -n "mergedFrom" "$ZUSAMMEN_TS" | head -1 | cut -d: -f1)
  [ -n "$guard_line" ] || { echo "confirm guard missing from zusammenfuehren.ts"; return 1; }
  [ -n "$merge_line" ] || { echo "merge persist marker (mergedFrom) missing from zusammenfuehren.ts"; return 1; }
  [ "$guard_line" -lt "$merge_line" ] || { echo "confirm guard must precede the merge persist in zusammenfuehren.ts"; return 1; }
}

# ── Case 4: CSV export format (contact + history sections) ─────────────────

@test "T901026-4: export.ts answers text/csv with Kontakt and Historie sections" {
  [ -f "$EXPORT_TS" ] || { echo "missing endpoint file: $EXPORT_TS"; return 1; }
  grep -q "text/csv" "$EXPORT_TS" || { echo "text/csv content type missing from export.ts"; return 1; }
  grep -q "Feld;Wert" "$EXPORT_TS" || { echo "Kontakt header (Feld;Wert) missing from export.ts"; return 1; }
  grep -q "Datum;Art;Zusammenfassung" "$EXPORT_TS" || { echo "Historie header (Datum;Art;Zusammenfassung) missing from export.ts"; return 1; }
}

# ── Case 5: deletion honours statutory retention (Steuerfristen) ────────────

@test "T901026-5: loeschen.ts warns about Aufbewahrung and guards deletion" {
  [ -f "$LOESCHEN_TS" ] || { echo "missing endpoint file: $LOESCHEN_TS"; return 1; }
  grep -qi "aufbewahrung" "$LOESCHEN_TS" || { echo "Aufbewahrungs-Hinweis missing from loeschen.ts"; return 1; }
  guard_line=$(grep -n "retentionBlocked" "$LOESCHEN_TS" | head -1 | cut -d: -f1)
  delete_line=$(grep -n "DELETE FROM inbox_items" "$LOESCHEN_TS" | head -1 | cut -d: -f1)
  [ -n "$guard_line" ] || { echo "retention guard (retentionBlocked) missing from loeschen.ts"; return 1; }
  [ -n "$delete_line" ] || { echo "DELETE statement missing from loeschen.ts"; return 1; }
  [ "$guard_line" -lt "$delete_line" ] || { echo "retention guard must precede the DELETE in loeschen.ts"; return 1; }
}

# ── Case 6 (T901263): relative lib imports resolve to real files ───────────

@test "T901263-1: relative lib imports in kunden routes resolve to existing files" {
  fail=0
  for f in "$LIST_ASTRO" "$DETAIL_ASTRO" "$KORRIGIEREN_TS" "$EXPORT_TS" "$LOESCHEN_TS" "$ZUSAMMEN_TS"; do
    [ -f "$f" ] || { echo "missing route file: $f"; fail=1; continue; }
    dir=$(dirname "$f")
    while IFS= read -r spec; do
      case "$spec" in
        ../*) ;;
        *) continue ;;
      esac
      if [ -f "$dir/$spec" ] || [ -f "$dir/$spec.ts" ]; then
        :
      else
        echo "unresolvable import '$spec' in $f"
        fail=1
      fi
    done < <(grep -oE "from '[^']+'" "$f" | sed -e "s/^from '//" -e "s/'$//")
  done
  [ "$fail" -eq 0 ]
}
