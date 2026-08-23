#!/usr/bin/env bash
# _seq-repair-sql.sh — emittiert das idempotente Repair-Statement für
# tickets.external_id_seq [T015011].
#
# Pure Output-Funktion: kein DB-Zugriff, nur stdout. Die Ausführung passiert in
# `ticket.sh seq-repair` über _exec_sql.
#
# Warum MAX über external_id statt max(id): tickets.id ist eine UUID
# (gen_random_uuid()), external_id ist TEXT ('T<seq>') und wird vom App-Code aus
# genau dieser Sequenz vergeben (kein column default). Nach Imports/Backfills mit
# expliziten T-IDs kann die Sequenz hinter dem Maximum zurückliegen — der nächste
# Create vergibt dann eine bereits genutzte Nummer wieder (Vorfall T015011,
# Ur-Vorfall T014936/T015005).

_seq_repair_sql() {
  cat <<'EOF'
SELECT setval(
  'tickets.external_id_seq',
  GREATEST(
    (SELECT last_value FROM tickets.external_id_seq),
    (
      SELECT COALESCE(MAX((substring(external_id FROM 2))::bigint), 0)
      FROM tickets.tickets
      WHERE external_id ~ '^T[0-9]+$'
    )
  )
) AS repaired_value;
EOF
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  _seq_repair_sql
fi
