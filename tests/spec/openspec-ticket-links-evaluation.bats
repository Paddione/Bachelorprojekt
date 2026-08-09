#!/usr/bin/env bats
# tests/spec/openspec-ticket-links-evaluation.bats
# SSOT: openspec/changes/openspec-ticket-links-evaluation/evaluation.md (T002573)
#
# Covers: deterministisches Bewertungsverfahren fuer .ticket-lose OpenSpec-Changes.
# Kein .ticket-loser Change darf ohne begruendeten Vermerk in evaluation.md verbleiben.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  EVAL="$REPO/openspec/changes/openspec-ticket-links-evaluation/evaluation.md"
  BACKLOG="$BATS_TEST_DIRNAME/openspec-workflow/t002573-backlog-slugs.txt"
}

# ── Test 1: kein .ticket-loser Altbestand ohne evaluation.md-Vermerk ────────

@test "jeder .ticket-lose Altbestands-Change ist in evaluation.md als offen/duplikat-entfernt vermerkt" {
  [ -f "$EVAL" ] || skip "evaluation.md fehlt — Bewertungsverfahren noch nicht ausgefuehrt"
  [ -f "$BACKLOG" ]

  local missing=0 checked=0
  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    local dir="$REPO/openspec/changes/$slug"
    [ -d "$dir" ] || continue   # archiviert → kein Eintrag noetig

    checked=$(( checked + 1 ))
    if [ ! -f "$dir/.ticket" ]; then
      # Muss in evaluation.md als offen (inkl. Rest-Vermerk) ODER duplikat-entfernt vermerkt sein.
      if ! grep -qE "^\| [0-9]+ \| ${slug} \| (offen|duplikat-entfernt)( \(Rest-Vermerk\))? \|" "$EVAL"; then
        echo "FEHLT: .ticket-loser Change '$slug' ohne offen/duplikat-entfernt-Vermerk in evaluation.md" >&3
        missing=1
      fi
    fi
  done < "$BACKLOG"

  echo "Anker: geprueft=$checked fehlend=$missing" >&3
  [ "$checked" -gt 0 ]
  [ "$missing" -eq 0 ]
}

# ── Test 2: evaluation.md deckt alle 42 Altbestands-Slugs ab ──────────────

@test "evaluation.md listet alle Altbestands-Slugs aus t002573-backlog-slugs.txt" {
  [ -f "$EVAL" ] || skip "evaluation.md fehlt"
  [ -f "$BACKLOG" ]

  local missing=0 checked=0
  while IFS= read -r slug; do
    [ -z "$slug" ] && continue
    checked=$(( checked + 1 ))
    if ! grep -qE "^\| [0-9]+ \| ${slug} \|" "$EVAL"; then
      echo "FEHLT: Change '$slug' nicht in evaluation.md" >&3
      missing=1
    fi
  done < "$BACKLOG"

  echo "Anker: geprueft=$checked fehlend=$missing" >&3
  [ "$checked" -gt 0 ]
  [ "$missing" -eq 0 ]
}

# ── Test 3: openspec.sh validate ist gruen ────────────────────────────

@test "openspec.sh validate liefert Exit 0" {
  run bash "$REPO/scripts/openspec.sh" validate
  [ "$status" -eq 0 ]
}
