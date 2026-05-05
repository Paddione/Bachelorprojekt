'use strict';

const { Pool } = require('pg');

function buildPool() {
  return new Pool({
    host: process.env.PGHOST || 'shared-db.workspace.svc.cluster.local',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'website',
    password: process.env.PGPASSWORD,
    database: process.env.PGDATABASE || 'website',
    max: 5,
    idleTimeoutMillis: 30000,
  });
}

async function initBugTicketCommentsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bugs.bug_ticket_comments (
      id          BIGSERIAL PRIMARY KEY,
      ticket_id   TEXT NOT NULL REFERENCES bugs.bug_tickets(ticket_id) ON DELETE CASCADE,
      author      TEXT NOT NULL,
      kind        TEXT NOT NULL DEFAULT 'comment'
                  CHECK (kind IN ('comment', 'status_change', 'system')),
      body        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS bug_ticket_comments_ticket_idx
      ON bugs.bug_ticket_comments(ticket_id, created_at)
  `);
}

async function listTickets(pool, { brand, status, category, q } = {}) {
  const params = [brand];
  const where = ['brand = $1'];
  if (status)   { params.push(status);            where.push(`status = $${params.length}`); }
  if (category) { params.push(category);          where.push(`category = $${params.length}`); }
  if (q)        { params.push(`%${q}%`);          where.push(`(description ILIKE $${params.length} OR ticket_id ILIKE $${params.length})`); }
  const sql = `
    SELECT ticket_id, category, reporter_email, description, url, brand, status,
           created_at, resolved_at, resolution_note
      FROM bugs.bug_tickets
      WHERE ${where.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT 500
  `;
  const r = await pool.query(sql, params);
  return r.rows;
}

async function getTicketWithComments(pool, ticketId) {
  const t = await pool.query(
    `SELECT ticket_id, category, reporter_email, description, url, brand, status,
            created_at, resolved_at, resolution_note
       FROM bugs.bug_tickets WHERE ticket_id = $1`,
    [ticketId]
  );
  if (t.rows.length === 0) return null;
  const c = await pool.query(
    `SELECT id, ticket_id, author, kind, body, created_at
       FROM bugs.bug_ticket_comments
       WHERE ticket_id = $1
       ORDER BY created_at ASC`,
    [ticketId]
  );
  return { ticket: t.rows[0], comments: c.rows };
}

async function appendComment(pool, { ticketId, author, body, kind = 'comment' }) {
  const r = await pool.query(
    `INSERT INTO bugs.bug_ticket_comments (ticket_id, author, kind, body)
     VALUES ($1, $2, $3, $4)
     RETURNING id, ticket_id, author, kind, body, created_at`,
    [ticketId, author, kind, body]
  );
  return r.rows[0];
}

async function withTx(pool, fn) {
  await pool.query('BEGIN');
  try {
    const result = await fn((sql, params) => pool.query(sql, params));
    await pool.query('COMMIT');
    return result;
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

async function resolveTicket(pool, { ticketId, author, note }) {
  return withTx(pool, async (q) => {
    const upd = await q(
      `UPDATE bugs.bug_tickets
         SET status = 'resolved', resolved_at = now(), resolution_note = $2
         WHERE ticket_id = $1 AND status = 'open'
         RETURNING ticket_id, status`,
      [ticketId, note]
    );
    if (upd.rowCount === 0) throw new Error(`ticket ${ticketId} not in 'open' state`);
    await q(
      `INSERT INTO bugs.bug_ticket_comments (ticket_id, author, kind, body)
       VALUES ($1, $2, 'status_change', $3) RETURNING id`,
      [ticketId, author, `resolved: ${note || ''}`.trim()]
    );
    return upd.rows[0];
  });
}

async function reopenTicket(pool, { ticketId, author, reason }) {
  return withTx(pool, async (q) => {
    const upd = await q(
      `UPDATE bugs.bug_tickets
         SET status = 'open', resolved_at = NULL, resolution_note = NULL
         WHERE ticket_id = $1 AND status IN ('resolved', 'archived')
         RETURNING ticket_id, status`,
      [ticketId]
    );
    if (upd.rowCount === 0) throw new Error(`ticket ${ticketId} not in 'resolved' or 'archived' state`);
    await q(
      `INSERT INTO bugs.bug_ticket_comments (ticket_id, author, kind, body)
       VALUES ($1, $2, 'status_change', $3) RETURNING id`,
      [ticketId, author, `reopened: ${reason || ''}`.trim()]
    );
    return upd.rows[0];
  });
}

async function archiveTicket(pool, { ticketId, author }) {
  return withTx(pool, async (q) => {
    const upd = await q(
      `UPDATE bugs.bug_tickets
         SET status = 'archived'
         WHERE ticket_id = $1 AND status != 'archived'
         RETURNING ticket_id, status`,
      [ticketId]
    );
    if (upd.rowCount === 0) throw new Error(`ticket ${ticketId} already archived or unknown`);
    await q(
      `INSERT INTO bugs.bug_ticket_comments (ticket_id, author, kind, body)
       VALUES ($1, $2, 'status_change', 'archived') RETURNING id`,
      [ticketId, author]
    );
    return upd.rows[0];
  });
}

module.exports = {
  buildPool,
  initBugTicketCommentsTable,
  listTickets,
  getTicketWithComments,
  appendComment,
  resolveTicket,
  reopenTicket,
  archiveTicket,
};
