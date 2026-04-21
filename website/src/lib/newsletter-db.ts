// website/src/lib/newsletter-db.ts
import pg from 'pg';
import { resolve4 } from 'dns';

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new pg.Pool(
  { connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig
);

let tablesReady = false;
async function ensureTables(): Promise<void> {
  if (tablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      confirm_token TEXT,
      token_expires_at TIMESTAMPTZ,
      unsubscribe_token TEXT UNIQUE NOT NULL,
      source TEXT NOT NULL DEFAULT 'website',
      confirmed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_campaigns (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      subject TEXT NOT NULL,
      html_body TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      sent_at TIMESTAMPTZ,
      recipient_count INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS newsletter_send_log (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      campaign_id UUID NOT NULL REFERENCES newsletter_campaigns(id),
      subscriber_id UUID NOT NULL REFERENCES newsletter_subscribers(id),
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      status TEXT NOT NULL
    )
  `);
  tablesReady = true;
}

export interface NewsletterSubscriber {
  id: string;
  email: string;
  status: 'pending' | 'confirmed' | 'unsubscribed';
  source: 'website' | 'admin';
  confirmed_at: Date | null;
  created_at: Date;
}

export interface NewsletterCampaign {
  id: string;
  subject: string;
  html_body: string;
  status: 'draft' | 'sent';
  sent_at: Date | null;
  recipient_count: number | null;
  created_at: Date;
  updated_at: Date;
}

// ── Subscribers ───────────────────────────────────────────────────────────────

export async function listSubscribers(filter?: { status?: string }): Promise<NewsletterSubscriber[]> {
  await ensureTables();
  const values: unknown[] = [];
  let where = '';
  if (filter?.status) {
    values.push(filter.status);
    where = `WHERE status = $1`;
  }
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at
     FROM newsletter_subscribers ${where} ORDER BY created_at DESC`,
    values
  );
  return result.rows;
}

export async function getSubscriberByEmail(email: string): Promise<
  (NewsletterSubscriber & { confirm_token: string | null; token_expires_at: Date | null; unsubscribe_token: string }) | null
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at,
            confirm_token, token_expires_at, unsubscribe_token
     FROM newsletter_subscribers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function getSubscriberByConfirmToken(token: string): Promise<
  (NewsletterSubscriber & { token_expires_at: Date | null }) | null
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at, token_expires_at
     FROM newsletter_subscribers WHERE confirm_token = $1`,
    [token]
  );
  return result.rows[0] ?? null;
}

export async function createSubscriber(params: {
  email: string;
  status: 'pending' | 'confirmed';
  source: 'website' | 'admin';
  confirmToken?: string;
  tokenExpiresAt?: Date;
  unsubscribeToken: string;
}): Promise<NewsletterSubscriber> {
  await ensureTables();
  const result = await pool.query(
    `INSERT INTO newsletter_subscribers
       (email, status, source, confirm_token, token_expires_at, unsubscribe_token)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, email, status, source, confirmed_at, created_at`,
    [params.email, params.status, params.source,
     params.confirmToken ?? null, params.tokenExpiresAt ?? null, params.unsubscribeToken]
  );
  return result.rows[0];
}

export async function updateSubscriberToken(id: string, token: string, expiresAt: Date): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_subscribers SET confirm_token = $1, token_expires_at = $2 WHERE id = $3`,
    [token, expiresAt, id]
  );
}

export async function confirmSubscriber(id: string): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_subscribers
     SET status = 'confirmed', confirmed_at = now(), confirm_token = null, token_expires_at = null
     WHERE id = $1`,
    [id]
  );
}

export async function unsubscribeByToken(token: string): Promise<boolean> {
  await ensureTables();
  const result = await pool.query(
    `UPDATE newsletter_subscribers SET status = 'unsubscribed'
     WHERE unsubscribe_token = $1 AND status = 'confirmed'
     RETURNING id`,
    [token]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function deleteSubscriber(id: string): Promise<void> {
  await ensureTables();
  await pool.query(`DELETE FROM newsletter_subscribers WHERE id = $1`, [id]);
}

export async function getConfirmedSubscribers(): Promise<
  (NewsletterSubscriber & { unsubscribe_token: string })[]
> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, email, status, source, confirmed_at, created_at, unsubscribe_token
     FROM newsletter_subscribers WHERE status = 'confirmed' ORDER BY confirmed_at ASC`
  );
  return result.rows;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

export async function listCampaigns(): Promise<NewsletterCampaign[]> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at
     FROM newsletter_campaigns ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function getCampaign(id: string): Promise<NewsletterCampaign | null> {
  await ensureTables();
  const result = await pool.query(
    `SELECT id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at
     FROM newsletter_campaigns WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createCampaign(params: { subject: string; html_body: string }): Promise<NewsletterCampaign> {
  await ensureTables();
  const result = await pool.query(
    `INSERT INTO newsletter_campaigns (subject, html_body)
     VALUES ($1, $2)
     RETURNING id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at`,
    [params.subject, params.html_body]
  );
  return result.rows[0];
}

export async function updateCampaign(
  id: string,
  params: { subject?: string; html_body?: string }
): Promise<NewsletterCampaign | null> {
  if (params.subject === undefined && params.html_body === undefined) return getCampaign(id);
  await ensureTables();
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [];
  if (params.subject !== undefined) {
    values.push(params.subject);
    sets.push(`subject = $${values.length}`);
  }
  if (params.html_body !== undefined) {
    values.push(params.html_body);
    sets.push(`html_body = $${values.length}`);
  }
  values.push(id);
  const result = await pool.query(
    `UPDATE newsletter_campaigns SET ${sets.join(', ')}
     WHERE id = $${values.length} AND status = 'draft'
     RETURNING id, subject, html_body, status, sent_at, recipient_count, created_at, updated_at`,
    values
  );
  return result.rows[0] ?? null;
}

export async function markCampaignSent(id: string, recipientCount: number): Promise<void> {
  await ensureTables();
  await pool.query(
    `UPDATE newsletter_campaigns
     SET status = 'sent', sent_at = now(), recipient_count = $1, updated_at = now()
     WHERE id = $2`,
    [recipientCount, id]
  );
}

export async function countSentCampaigns(): Promise<number> {
  await ensureTables();
  const result = await pool.query(
    `SELECT COUNT(*)::int FROM newsletter_campaigns WHERE status = 'sent'`
  );
  return result.rows[0]?.count ?? 0;
}

// ── Send log ──────────────────────────────────────────────────────────────────

export async function createSendLog(params: {
  campaignId: string;
  subscriberId: string;
  status: 'sent' | 'failed';
}): Promise<void> {
  await ensureTables();
  await pool.query(
    `INSERT INTO newsletter_send_log (campaign_id, subscriber_id, status)
     VALUES ($1, $2, $3)`,
    [params.campaignId, params.subscriberId, params.status]
  );
}
