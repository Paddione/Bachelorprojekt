#!/usr/bin/env bats
# FA-QS-07 / FA-QS-08: qa-dal Unit-Tests (benötigt postgres MCP)
# Offline-skip wenn DB nicht erreichbar.

setup() {
  if ! psql "$DATABASE_URL" -c "SELECT 1" >/dev/null 2>&1; then
    skip "keine DB verfügbar (offline)"
  fi
  TICKET_ID=$(psql "$DATABASE_URL" -t -A -c "
    INSERT INTO tickets.tickets (title, status, is_test_data)
    VALUES ('QS-DAL-Test', 'qa_review', true)
    RETURNING id
  ")
}

teardown() {
  [ -n "$TICKET_ID" ] && psql "$DATABASE_URL" -c "
    DELETE FROM tickets.tickets WHERE id = '$TICKET_ID'
  " >/dev/null 2>&1 || true
}

@test "FA-QS-07 approve setzt status=done und done_at" {
  node -e "
    const { createQaReview } = require('./website/src/lib/qa-dal');
    createQaReview({
      ticketId: '$TICKET_ID',
      criteria: [{key:'spec_match',passed:true},{key:'no_regression',passed:true},{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}],
      verdict: 'approved'
    }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
  "
  row=$(psql "$DATABASE_URL" -t -A -c "SELECT status, done_at IS NOT NULL FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$row" = "done|t" ]
}

@test "FA-QS-08 reject setzt status=in_progress und legt factory_injection an" {
  node -e "
    const { createQaReview } = require('./website/src/lib/qa-dal');
    createQaReview({
      ticketId: '$TICKET_ID',
      criteria: [{key:'spec_match',passed:false},{key:'no_regression',passed:true},{key:'responsive',passed:true},{key:'performance',passed:true},{key:'copy',passed:true}],
      notes: 'Spec nicht erfüllt',
      verdict: 'rejected',
      re_entry_phase: 'implement'
    }).then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); })
  "
  status=$(psql "$DATABASE_URL" -t -A -c "SELECT status FROM tickets.tickets WHERE id='$TICKET_ID'")
  [ "$status" = "in_progress" ]
  injection=$(psql "$DATABASE_URL" -t -A -c "SELECT COUNT(*) FROM tickets.ticket_injections WHERE ticket_id='$TICKET_ID' AND kind='note'")
  [ "$injection" = "1" ]
}
