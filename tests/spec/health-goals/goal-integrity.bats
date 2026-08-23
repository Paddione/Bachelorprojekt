#!/usr/bin/env bats
# SSOT: openspec/specs/health-goals.md
# Ticket: T013916 — Ein Ziel, das nicht rot werden kann, steuert nichts. Diese
# Datei sichert die drei Wege, auf denen ein Health-Goal seine Aussagekraft
# verliert: kaputte Messung, unerreichbare Schwelle, nicht nachgezogenes Ratchet.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  CHECK="${REPO_ROOT}/scripts/health-goals-check.sh"
  GOALS="${REPO_ROOT}/.claude/lib/goals.md"
  WORKLIST="${REPO_ROOT}/scripts/brain-ingest-worklist.sh"
}

# ── Positiv-Anker ───────────────────────────────────────────────────────────

@test "Anker: die Ziel-Definitionen und das Messskript existieren" {
  [ -f "$GOALS" ]
  [ -f "$CHECK" ]
  grep -q 'G-BRAIN14' "$CHECK"
}

@test "Anker: die Worklist antwortet mit Zeilen" {
  run bash "$WORKLIST" --root "$REPO_ROOT"
  [ "$status" -eq 0 ]
  [ "${#lines[@]}" -gt 0 ]
}

# ── G-BRAIN14: misst Pending, nicht die Manifestgroesse ─────────────────────

@test "brain-ingest-worklist.sh kennt einen --pending-Modus" {
  run bash "$WORKLIST" --help
  [[ "$output" == *"--pending"* ]]
}

@test "--pending liefert eine Zahl, nicht die Zeilenliste" {
  run bash "$WORKLIST" --root "$REPO_ROOT" --pending
  [ "$status" -eq 0 ]
  [[ "$output" =~ ^[0-9]+$ ]]
}

@test "--pending faellt, sobald der State Chunks als bekannt fuehrt" {
  # Der Kern des Befunds: vorher meldete das Goal ALLE Quellen als Backlog,
  # unabhaengig von erledigter Arbeit.
  #
  # Der Test baut seinen State SELBST, statt den der Maschine zu benutzen. Ein
  # Vergleich gegen ~/.brain-ingest-state.json haette gemessen, ob auf diesem
  # Rechner schon ein Ingest lief — in CI existiert die Datei nicht, dort ist
  # alles pending, und die Aussage waere umgebungsabhaengig statt code-bezogen.
  # (Genau so ist dieser Fall beim ersten CI-Lauf rot geworden.)
  local empty_state seeded_state n_empty n_seeded
  empty_state="$BATS_TEST_TMPDIR/empty.json"
  seeded_state="$BATS_TEST_TMPDIR/seeded.json"
  echo '{}' > "$empty_state"

  n_empty=$(bash "$WORKLIST" --root "$REPO_ROOT" --pending --state "$empty_state")
  [ "$n_empty" -gt 0 ]   # Positiv-Anker: ohne State ist alles offen

  # Einen echten Chunk-Hash in den State schreiben — danach MUSS pending sinken.
  local src slug outdir cf idx h
  read -r src slug _ < <(bash "$WORKLIST" --root "$REPO_ROOT" | head -1)
  outdir="$BATS_TEST_TMPDIR/chunks"; mkdir -p "$outdir"
  read -r cf _ idx _ < <(bash "$REPO_ROOT/scripts/brain-chunk.sh" \
      --source "$REPO_ROOT/$src" --slug "$slug" --out-dir "$outdir" | head -1)
  h=$(sha256sum "$cf" | cut -d' ' -f1)
  jq -n --arg k "${src}#${idx}" --arg h "$h" '{($k): {hash: $h}}' > "$seeded_state"

  n_seeded=$(bash "$WORKLIST" --root "$REPO_ROOT" --pending --state "$seeded_state")
  [ "$n_seeded" -lt "$n_empty" ]
}

@test "G-BRAIN14 misst ueber den --pending-Modus" {
  run grep -A2 'G-BRAIN14' "$CHECK"
  [[ "$output" == *"--pending"* ]]
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

# ── Die Doku beschreibt die Messung, die stattfindet ─────────────────────────

@test "goals.md behauptet fuer G-BRAIN14 keinen Hash-Vergleich, den es nicht gibt" {
  # Die Zeile versprach '+ State-File-Hash-Vergleich', waehrend das Skript nur
  # die Manifestzeilen zaehlte. Nach dem Fix findet der Vergleich statt — die
  # Behauptung muss also durch den Messbefehl gedeckt sein.
  run grep 'G-BRAIN14' "$GOALS"
  [[ "$output" == *"--pending"* ]]
}
