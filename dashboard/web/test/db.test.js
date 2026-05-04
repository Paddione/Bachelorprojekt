// dashboard/web/test/db.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  initBugTicketCommentsTable,
  listTickets,
  getTicketWithComments,
  appendComment,
  resolveTicket,
  reopenTicket,
  archiveTicket,
} = require('../lib/db');

function mockPool() {
  return {
    calls: [],
    queryResults: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      const r = this.queryResults.shift();
      if (!r) throw new Error('mockPool: no canned result for ' + sql.slice(0, 40));
      if (r.throw) throw r.throw;
      return r;
    },
  };
}

test('initBugTicketCommentsTable issues CREATE TABLE and CREATE INDEX', async () => {
  const p = mockPool();
  p.queryResults = [{ rows: [] }, { rows: [] }];
  await initBugTicketCommentsTable(p);
  assert.match(p.calls[0].sql, /CREATE TABLE IF NOT EXISTS bugs\.bug_ticket_comments/);
  assert.match(p.calls[1].sql, /CREATE INDEX IF NOT EXISTS bug_ticket_comments_ticket_idx/);
});

test('listTickets passes brand and optional filters', async () => {
  const p = mockPool();
  p.queryResults = [{ rows: [{ ticket_id: 'BR-1' }] }];
  const rows = await listTickets(p, { brand: 'mentolder', status: 'open' });
  assert.equal(rows.length, 1);
  assert.match(p.calls[0].sql, /FROM bugs\.bug_tickets/);
  assert.deepEqual(p.calls[0].params, ['mentolder', 'open']);
});

test('appendComment inserts comment and returns the row', async () => {
  const p = mockPool();
  p.queryResults = [{ rows: [{ id: 42 }] }];
  const row = await appendComment(p, { ticketId: 'BR-1', author: 'alice', body: 'hi' });
  assert.equal(row.id, 42);
  assert.match(p.calls[0].sql, /INSERT INTO bugs\.bug_ticket_comments/);
  assert.deepEqual(p.calls[0].params, ['BR-1', 'alice', 'comment', 'hi']);
});

test('resolveTicket updates ticket and writes status_change comment in a transaction', async () => {
  const p = mockPool();
  p.queryResults = [
    { rows: [] },
    { rows: [{ ticket_id: 'BR-1', status: 'resolved' }], rowCount: 1 },
    { rows: [{ id: 99 }] },
    { rows: [] },
  ];
  const r = await resolveTicket(p, { ticketId: 'BR-1', author: 'alice', note: 'fixed' });
  assert.equal(r.status, 'resolved');
  assert.equal(p.calls[0].sql.trim(), 'BEGIN');
  assert.match(p.calls[1].sql, /UPDATE bugs\.bug_tickets/);
  assert.match(p.calls[2].sql, /INSERT INTO bugs\.bug_ticket_comments/);
  assert.equal(p.calls[3].sql.trim(), 'COMMIT');
});

test('resolveTicket rolls back on update miss', async () => {
  const p = mockPool();
  p.queryResults = [
    { rows: [] },
    { rows: [], rowCount: 0 },
    { rows: [] },
  ];
  await assert.rejects(resolveTicket(p, { ticketId: 'BR-NOPE', author: 'a', note: '' }), /not.*open/i);
  assert.equal(p.calls.at(-1).sql.trim(), 'ROLLBACK');
});

test('reopenTicket clears resolution_note and resolved_at', async () => {
  const p = mockPool();
  p.queryResults = [
    { rows: [] },
    { rows: [{ ticket_id: 'BR-1', status: 'open' }], rowCount: 1 },
    { rows: [{ id: 100 }] },
    { rows: [] },
  ];
  const r = await reopenTicket(p, { ticketId: 'BR-1', author: 'alice', reason: 'still broken' });
  assert.equal(r.status, 'open');
  assert.match(p.calls[1].sql, /resolution_note\s*=\s*NULL/);
  assert.match(p.calls[1].sql, /resolved_at\s*=\s*NULL/);
});

test('archiveTicket writes status_change comment', async () => {
  const p = mockPool();
  p.queryResults = [
    { rows: [] },
    { rows: [{ ticket_id: 'BR-1', status: 'archived' }], rowCount: 1 },
    { rows: [{ id: 101 }] },
    { rows: [] },
  ];
  const r = await archiveTicket(p, { ticketId: 'BR-1', author: 'alice' });
  assert.equal(r.status, 'archived');
});

test('getTicketWithComments returns ticket plus ordered comments', async () => {
  const p = mockPool();
  p.queryResults = [
    { rows: [{ ticket_id: 'BR-1', status: 'open' }] },
    { rows: [{ id: 1 }, { id: 2 }] },
  ];
  const out = await getTicketWithComments(p, 'BR-1');
  assert.equal(out.ticket.ticket_id, 'BR-1');
  assert.equal(out.comments.length, 2);
  assert.match(p.calls[1].sql, /ORDER BY created_at ASC/);
});
