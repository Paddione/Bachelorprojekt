#!/usr/bin/env bats
#
# SSOT: openspec/specs/mishap-rollup.md
# Ticket: T003068 — rollup-container kann sich nicht selbst heilen: pipefail +
# grep -v bricht vor dem Anlegen ab.
#
# PRUEFMODUS (T002448-M4): Command-Output-Verifikation. Der Test FUEHRT
# `scripts/ticket.sh rollup-container` AUS gegen einen gemockten `kubectl`
# (repo-Idiom, siehe tests/spec/feature-product-linking.bats) und prueft
# stdout/stderr + Exit-Code — er greppt NICHT die Quelldatei nach `|| true`.
#
# BEFUND: cmd_rollup_container laeuft unter `set -euo pipefail`
# (scripts/ticket.sh:22). Die Suchzeile
#     ext_id=$(_exec_sql ... | grep -v '^$' | head -1)
# liefert bei leerer Trefferliste ein `grep -v`-Exit-1, das unter pipefail die
# gesamte Pipeline auf 1 zieht und die Funktion unter `set -e` VOR Step 2
# (Anlegen eines neuen Containers) abbricht. Der Mock simuliert genau diesen
# Leerfall (Suchzeile liefert nichts) und der Test belegt, dass der Anlege-Pfad
# trotzdem erreicht wird.

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T003068: rollup-container erreicht den Anlege-Pfad bei leerer Trefferliste (pipefail-Regression)" {
  local mockdir cap
  mockdir="$(mktemp -d)"
  cap="$mockdir/captured.sql"
  cat > "$mockdir/kubectl" <<'MOCKEOF'
#!/usr/bin/env bash
if [[ "$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "$*" == *"exec"* ]]; then
  input="$(cat)"
  echo "$input" >> "$CAP"
  if [[ "$input" == *"type = 'chore'"* ]]; then
    # Step 1 (Suche): simuliert KEINEN offenen Rollup-Container — leere
    # Trefferliste, exakt die Bedingung, die T003068 ausloest.
    exit 0
  fi
  if [[ "$input" == *"INSERT INTO tickets.tickets"* ]]; then
    # Step 2 (Anlegen): der Anlege-Pfad selbst, ueber ticket.sh create.
    echo "T900555|fake-uuid-selfheal-create-path"
    exit 0
  fi
  exit 0
fi
exit 0
MOCKEOF
  chmod +x "$mockdir/kubectl"

  PATH="$mockdir:$PATH" CAP="$cap" \
    run bash "$REPO_ROOT/scripts/ticket.sh" rollup-container --brand mentolder

  # Positiv-Anker (T002356-M1): das Kommando lief ueberhaupt und lieferte
  # Ausgabe — ohne diesen Anker waere ein leerer $output (z.B. durch einen
  # stillen fruehen exit) nicht von einem echten Erfolg zu unterscheiden.
  [ -n "$output" ]

  # Eigentliche Aussage: bei leerer Trefferliste bricht die Funktion NICHT
  # unter pipefail ab, sondern erreicht Step 2 — der Anlege-Pfad wird
  # tatsaechlich ausgefuehrt und liefert die neu angelegte external_id.
  [ "$status" -eq 0 ]
  [[ "$output" == *"kein offener Container, lege neuen an"* ]]
  [[ "$output" == *"T900555"* ]]

  rm -rf "$mockdir"
}
