#!/usr/bin/env bats
# SSOT: openspec/specs/health-goals.md
# Ticket: T013916 — Ein Ziel, das nicht rot werden kann, steuert nichts. Diese
# Datei sichert die drei Wege, auf denen ein Health-Goal seine Aussagekraft
# verliert: kaputte Messung, unerreichbare Schwelle, nicht nachgezogenes Ratchet.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/health-goals-check.sh"
  GOALS="${REPO_ROOT}/.claude/lib/goals.md"
}

# ── Positiv-Anker ───────────────────────────────────────────────────────────

@test "Anker: die Ziel-Definitionen und das Messskript existieren" {
  [ -f "$GOALS" ]
  [ -f "$CHECK" ]
}

# ── Ziele, die per Konstruktion nicht rot werden koennen ─────────────────────

@test "G-DORA01 vergleicht gegen eine zum Messfenster passende Schwelle" {
  # goals.md dokumentiert ">= 5/Wo"; gemessen werden 4 Wochen. Eine Schwelle
  # von 5 waere damit um Faktor 4 zu niedrig — und bei Ist ~1900 ohnehin
  # bedeutungslos. Entweder passt die Schwelle zum Fenster, oder das Ziel ist
  # entfernt; beides ist zulaessig, ein Vergleich gegen 5 nicht.
  if grep -q 'G-DORA01' "$CHECK"; then
    run grep 'G-DORA01' "$CHECK"
    [[ "$output" != *" ge 5 "* ]]
  fi
}

@test "G-SIZE03 misst kein God-File mehr, das keines ist" {
  # website-db.ts hat 311 Zeilen bei Ziel <=3000. Entweder ist das Ziel
  # entfernt oder seine Schwelle passt zur Realitaet.
  if grep -q 'G-SIZE03' "$CHECK"; then
    run grep 'G-SIZE03' "$CHECK"
    [[ "$output" != *" le 3000 "* ]]
  fi
}

# ── Ratchets, die nach geloestem Problem nachgezogen sind ────────────────────

@test "G-SPEC03 erlaubt keine 41 Regressionen mehr" {
  run grep 'G-SPEC03' "$CHECK"
  [[ "$output" != *" le 41 "* ]]
}

@test "G-CQ02 erlaubt keine 280 any-Verwendungen mehr" {
  run grep 'G-CQ02' "$CHECK"
  [[ "$output" != *" le 280 "* ]]
}

@test "G-CQ09 erlaubt keine 10 hartkodierten Hostnames mehr" {
  run grep 'G-CQ09' "$CHECK"
  [[ "$output" != *" le 10 "* ]]
}

@test "G-RH01 erlaubt keine 30 Gate-Violations mehr" {
  run grep 'G-RH01' "$CHECK"
  [[ "$output" != *" le 30 "* ]]
}
