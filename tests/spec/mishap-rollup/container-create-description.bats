#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T005031 — Die Create-Boilerplate des Rollup-Containers behauptet noch
# „Dieses Ticket bleibt dauerhaft offen." — das widerspricht dem ephemeren Modell
# (Container werden nach Verarbeitung `done/obsolete` geschlossen).
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation mit kubectl-Mock
# (repo-Idiom aus rollup-container-empty-list-selfheal.bats). Der Mock protokolliert
# das INSERT-SQL, das der Create-Pfad emittiert — die Beschreibung steht darin.
#
# Positiv-Anker (T002356-M1): erst belegen, dass der Create-Pfad ueberhaupt erreicht
# wird (INSERT vorhanden), dann die Negativ-Aussage zum Text pruefen.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T005031: Container-Create-Beschreibung behauptet keine dauerhafte Offenheit" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  { echo "ARGS: $*"; echo "STDIN: $input"; } >> "$CAP"
  if [[ "$*" == *"type = 'chore'"* ]]; then
    # Step 1 (Suche): keine Treffer — der Create-Pfad soll laufen.
    exit 0
  fi
  if [[ "$input" == *"INSERT INTO tickets.tickets"* ]]; then
    # Step 2 (Anlegen): ticket.sh create emittiert das INSERT.
    echo "T900777|fake-uuid-create-description"
    exit 0
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"

  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$REPO_ROOT/scripts/ticket.sh" rollup-container --brand mentolder

  # Positiv-Anker: Create-Pfad wurde erreicht und emittierte ein INSERT mit der
  # Beschreibung — ohne ihn waere die Text-Aussage vakuos.
  [ "$status" -eq 0 ]
  [ "$(grep -c "INSERT INTO tickets.tickets" "$cap")" -ge 1 ]
  [ "$(grep -c "Fortlaufende Sammlung" "$cap")" -ge 1 ]

  # Eigentliche Aussage: der neue Beschreibungstext darf keine Permanenz behaupten,
  # sondern muss die ephemeren Closure-Semantik nennen.
  [ "$(grep -c "bleibt dauerhaft offen" "$cap")" -eq 0 ]
  [ "$(grep -c "geschlossen" "$cap")" -ge 1 ]

  rm -rf "$mockdir"
}
