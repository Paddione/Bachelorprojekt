#!/usr/bin/env bats
# Guard für ticket.sh seq-repair / external_id_seq-Backfill [T015011].
#
# Prüfmodus: Output-Verifikation. Der SQL-Emitter ist eine pure Funktion und
# wird als Command-Output geprüft (T002448-M4); die Wiring-Zusicherung
# (Dispatch-Eintrag in ticket.sh) manifestiert sich ausschließlich im Quelltext
# und ist als struktureller Check dokumentiert.
#
# Hintergrund: Nach manuellen Imports mit expliziten T-IDs lag die Sequenz
# hinter dem vergebenen Maximum; das nächste Create reusete die Nummer eines
# gelöschten Tickets (T014936 → Folge-Incident T015005). Wichtig: tickets.id ist
# eine UUID — der Repair muss gegen den numerischen Teil von external_id laufen.
#
# Run: tests/unit/lib/bats-core/bin/bats tests/spec/ticket-seq-integrity/

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  EMITTER="${REPO_ROOT}/scripts/vda/ticket/_seq-repair-sql.sh"
  TICKET="${REPO_ROOT}/scripts/ticket.sh"
}

@test "T015011: emitter produces setval against max numeric external_id" {
  local sql
  sql="$(bash "$EMITTER")"
  [ -n "$sql" ] || { echo "Emitter leer" >&2; return 1; }
  [[ "$sql" == *"setval("* ]] || { echo "kein setval" >&2; return 1; }
  [[ "$sql" == *"last_value"* ]] || { echo "last_value fehlt" >&2; return 1; }
  [[ "$sql" == *"substring(external_id FROM 2)"* ]] || { echo "external_id-Numeric-Teil fehlt" >&2; return 1; }
  [[ "$sql" == *"'^T[0-9]+\$'"* ]] || { echo "Format-Anker auf T-Zahlen fehlt" >&2; return 1; }
}

@test "T015011: emitter does NOT reference the uuid id column as sequence source" {
  # Negativ-Aussage mit Positiv-Anker: Der korrekte external_id-Pfad ist oben
  # verifiziert; hier darf der UUID-Pfad nicht auftauchen.
  local sql
  sql="$(bash "$EMITTER")"
  [ -n "$sql" ] || return 1
  if [[ "$sql" == *"MAX(id)"* ]]; then
    echo "MAX(id) ist falsch — id ist eine UUID, nicht die Sequenzquelle" >&2
    return 1
  fi
}

@test "T015011: emitter output is a single statement terminated by semicolon" {
  local sql
  sql="$(bash "$EMITTER")"
  [[ "$sql" == *";" ]] || { echo "kein Statement-Abschluss" >&2; return 1; }
  [ "$(printf '%s\n' "$sql" | grep -c ';')" -le 1 ] || { echo "mehrere Statements" >&2; return 1; }
}

@test "T015011: ticket.sh wires seq-repair into its dispatch table (structural)" {
  grep -q 'seq-repair)        cmd_seq_repair' "$TICKET" \
    || { echo "seq-repair fehlt im Dispatch" >&2; return 1; }
}

@test "T015011: both scripts are syntactically valid bash" {
  run bash -n "$EMITTER"
  [ "$status" -eq 0 ] || { echo "emitter: $output" >&2; return 1; }
  run bash -n "$TICKET"
  [ "$status" -eq 0 ] || { echo "ticket.sh: $output" >&2; return 1; }
}
