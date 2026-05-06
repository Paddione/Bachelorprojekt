// Meeting Knowledge Pipeline — PostgreSQL client.
// Writes meeting data, transcripts, and artifacts to the meetings DB.
// Uses the 'pg' npm package for direct database access.

import pg from 'pg';
import { resolve4 } from 'dns';
const { Pool } = pg;

const MEETINGS_DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';
// Use Node.js's built-in DNS resolver (dns.resolve4) instead of musl libc's
// getaddrinfo. musl opens a *connected* UDP socket to the ClusterIP, but after
// kube-proxy DNAT the CoreDNS response arrives from the pod IP — a connected
// socket filters it out and times out with EAI_AGAIN. Node's dns.resolve4 uses
// an unconnected socket and is not affected by this source-address mismatch.
function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

// pg's PoolConfig type doesn't declare `lookup`, but pg-pool passes it through
// to net.createConnection at runtime. Cast via unknown to satisfy tsc.
const poolConfig = { connectionString: MEETINGS_DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig;
export const pool = new Pool(poolConfig);

// ── Tracking DB (bachelorprojekt schema) ────────────────────────────────────

let trackingPool: import('pg').Pool | null = null;

function getTrackingPool(): import('pg').Pool {
  if (trackingPool) return trackingPool;
  const url = process.env.TRACKING_DB_URL
    || process.env.SESSIONS_DATABASE_URL
    || process.env.DATABASE_URL?.replace(/\/[^/?]+(\?|$)/, '/postgres$1');
  if (!url) throw new Error('TRACKING_DB_URL not set');
  trackingPool = new Pool({ connectionString: url, lookup: nodeLookup, max: 4 } as unknown as import('pg').PoolConfig);
  return trackingPool;
}

export type TimelineRow = {
  id: number;
  day: string;
  pr_number: number | null;
  title: string;
  description: string | null;
  category: string;
  scope: string | null;
  brand: string | null;
  requirement_id: string | null;
  requirement_name: string | null;
  bugs_fixed: number;
};

export async function listTimeline(opts: {
  limit?: number;
  offset?: number;
  category?: string;
  brand?: string;
} = {}): Promise<TimelineRow[]> {
  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const tPool = getTrackingPool();
  const where: string[] = [];
  const params: unknown[] = [];
  if (opts.category) { params.push(opts.category); where.push(`category = $${params.length}`); }
  if (opts.brand)    { params.push(opts.brand);    where.push(`(brand = $${params.length} OR brand IS NULL)`); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit, offset);

  const rows = (await tPool.query(
    `SELECT id, to_char(day,'YYYY-MM-DD') AS day, pr_number, title, description,
            category, scope, brand, requirement_id, requirement_name
       FROM bachelorprojekt.v_timeline
       ${whereSql}
      ORDER BY merged_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )).rows as Omit<TimelineRow, 'bugs_fixed'>[];

  const prNumbers = rows.map(r => r.pr_number).filter((n): n is number => n != null);
  const bugCounts = new Map<number, number>();
  if (prNumbers.length > 0) {
    const counts = (await pool.query(
      `SELECT fixed_in_pr AS pr, COUNT(*)::int AS n
         FROM bugs.bug_tickets
        WHERE fixed_in_pr = ANY($1::int[])
        GROUP BY fixed_in_pr`,
      [prNumbers],
    )).rows as { pr: number; n: number }[];
    for (const c of counts) bugCounts.set(c.pr, c.n);
  }

  return rows.map(r => ({ ...r, bugs_fixed: r.pr_number ? (bugCounts.get(r.pr_number) ?? 0) : 0 }));
}

// ── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email: string;
  customer_number?: string;
  admin_number?: string;
  is_admin?: boolean;
  phone?: string;
  company?: string;
}

export async function upsertCustomer(params: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  keycloakUserId?: string;
}): Promise<Customer> {
  const result = await pool.query(
    `INSERT INTO customers (name, email, phone, company, keycloak_user_id)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = COALESCE(EXCLUDED.phone, customers.phone),
       company = COALESCE(EXCLUDED.company, customers.company),
       keycloak_user_id = COALESCE(EXCLUDED.keycloak_user_id, customers.keycloak_user_id),
       enrollment_declined = false,
       updated_at = now()
     RETURNING id, name, email, customer_number`,
    [params.name, params.email, params.phone, params.company,
     params.keycloakUserId]
  );
  return result.rows[0];
}

export interface PendingEnrollment {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  created_at: string;
}

export async function listPendingEnrollments(): Promise<PendingEnrollment[]> {
  const result = await pool.query(
    `SELECT id, name, email, phone, company, created_at
     FROM customers
     WHERE keycloak_user_id IS NULL AND enrollment_declined = false
     ORDER BY created_at DESC`
  );
  return result.rows;
}

export async function declineEnrollment(id: string): Promise<void> {
  await pool.query(
    'UPDATE customers SET enrollment_declined = true WHERE id = $1',
    [id]
  );
}

export async function getCustomerFullById(id: string): Promise<{
  id: string; name: string; email: string; phone?: string; company?: string;
  customer_number?: string; admin_number?: string; is_admin?: boolean;
} | null> {
  const result = await pool.query(
    `SELECT id, name, email, phone, company, customer_number, admin_number, is_admin FROM customers WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function setCustomerNumber(
  customerId: string,
  customerNumber: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (customerNumber !== null && !/^M\d{4}$/.test(customerNumber)) {
    return { ok: false, error: 'Ungültiges Format. Erwartet: M0020–M9999' };
  }
  if (customerNumber !== null) {
    const dup = await pool.query(
      'SELECT id FROM customers WHERE customer_number = $1 AND id != $2',
      [customerNumber, customerId]
    );
    if (dup.rows.length > 0) {
      return { ok: false, error: `${customerNumber} ist bereits vergeben.` };
    }
  }
  await pool.query(
    'UPDATE customers SET customer_number = $1 WHERE id = $2',
    [customerNumber, customerId]
  );
  return { ok: true };
}

export async function setAdminNumber(
  customerId: string,
  adminNumber: string | null
): Promise<{ ok: boolean; error?: string }> {
  if (adminNumber !== null && !/^A\d{4}$/.test(adminNumber)) {
    return { ok: false, error: 'Ungültiges Format. Erwartet: A0001–A9999' };
  }
  if (adminNumber !== null) {
    const dup = await pool.query(
      'SELECT id FROM customers WHERE admin_number = $1 AND id != $2',
      [adminNumber, customerId]
    );
    if (dup.rows.length > 0) {
      return { ok: false, error: `${adminNumber} ist bereits vergeben.` };
    }
  }
  await pool.query(
    'UPDATE customers SET admin_number = $1 WHERE id = $2',
    [adminNumber, customerId]
  );
  return { ok: true };
}

export async function setIsAdmin(customerId: string, isAdmin: boolean): Promise<void> {
  await pool.query('UPDATE customers SET is_admin = $1 WHERE id = $2', [isAdmin, customerId]);
}

// ── Schema init ─────────────────────────────────────────────────────────────

export async function initMeetingsDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meetings (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      customer_id UUID NOT NULL REFERENCES customers(id),
      meeting_type TEXT NOT NULL,
      scheduled_at TIMESTAMPTZ,
      talk_room_token TEXT,
      status TEXT NOT NULL DEFAULT 'scheduled',
      started_at TIMESTAMPTZ,
      ended_at TIMESTAMPTZ,
      duration_seconds INTEGER,
      recording_path TEXT,
      released_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(
    'ALTER TABLE meetings ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ'
  );
}

async function initMeetingProjectLink(): Promise<void> {
  await initProjectTables(); // projects-Tabelle muss vor der FK-Spalte existieren
  await pool.query(`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_meetings_project ON meetings(project_id)
  `);
}

// ── Meeting ─────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  customerId: string;
  status: string;
  meetingType: string;
  scheduledAt: Date | null;
  createdAt: Date;
  released_at: Date | null;
  projectId: string | null;
  projectName: string | null;
}

export interface MeetingWithDetails {
  id: string;
  meetingType: string;
  status: string;
  scheduledAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationSeconds: number | null;
  releasedAt: Date | null;
  createdAt: Date;
  transcripts: Array<{
    id: string;
    fullText: string;
    language: string;
    durationSeconds: number | null;
  }>;
  insights: Array<{
    id: string;
    insightType: string;
    content: string;
    generatedBy: string;
  }>;
  artifacts: Array<{
    id: string;
    artifactType: string;
    name: string;
    contentText: string | null;
  }>;
}

export interface MeetingWithCustomer {
  id: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  meetingType: string;
  status: string;
  talkRoomToken: string | null;
}

export async function getMeetingByRoomToken(
  roomToken: string,
): Promise<MeetingWithCustomer | null> {
  const result = await pool.query(
    `SELECT m.id, m.customer_id AS "customerId",
            c.name AS "customerName", c.email AS "customerEmail",
            m.meeting_type AS "meetingType", m.status,
            m.talk_room_token AS "talkRoomToken"
     FROM meetings m
     JOIN customers c ON m.customer_id = c.id
     WHERE m.talk_room_token = $1
     ORDER BY m.created_at DESC
     LIMIT 1`,
    [roomToken],
  );
  return result.rows[0] ?? null;
}

export async function createMeeting(params: {
  customerId: string;
  meetingType: string;
  scheduledAt?: Date;
  talkRoomToken?: string;
  projectId?: string;
}): Promise<Meeting> {
  const result = await pool.query(
    `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, talk_room_token, status, project_id)
     VALUES ($1, $2, $3, $4, 'scheduled', $5)
     RETURNING id, customer_id as "customerId", status, released_at,
               project_id as "projectId", NULL::text as "projectName"`,
    [params.customerId, params.meetingType, params.scheduledAt,
     params.talkRoomToken, params.projectId ?? null]
  );
  return result.rows[0];
}

export async function updateMeetingStatus(meetingId: string, status: string, extra?: {
  startedAt?: Date;
  endedAt?: Date;
  durationSeconds?: number;
  recordingPath?: string;
}): Promise<void> {
  const sets = ['status = $2'];
  const values: unknown[] = [meetingId, status];
  let idx = 3;

  if (extra?.startedAt) { sets.push(`started_at = $${idx}`); values.push(extra.startedAt); idx++; }
  if (extra?.endedAt) { sets.push(`ended_at = $${idx}`); values.push(extra.endedAt); idx++; }
  if (extra?.durationSeconds) { sets.push(`duration_seconds = $${idx}`); values.push(extra.durationSeconds); idx++; }
  if (extra?.recordingPath) { sets.push(`recording_path = $${idx}`); values.push(extra.recordingPath); idx++; }

  await pool.query(`UPDATE meetings SET ${sets.join(', ')} WHERE id = $1`, values);
}

// ── Transcript ──────────────────────────────────────────────────────────────

export interface SavedTranscript {
  id: string;
  meetingId: string;
}

export async function saveTranscript(params: {
  meetingId: string;
  fullText: string;
  language?: string;
  whisperModel?: string;
  durationSeconds?: number;
  segments?: Array<{ start: number; end: number; text: string; speaker?: string }>;
}): Promise<SavedTranscript> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const transcriptResult = await client.query(
      `INSERT INTO transcripts (meeting_id, full_text, language, whisper_model, duration_seconds)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [params.meetingId, params.fullText, params.language || 'de',
       params.whisperModel || 'Systran/faster-whisper-medium', params.durationSeconds]
    );
    const transcriptId = transcriptResult.rows[0].id;

    if (params.segments && params.segments.length > 0) {
      for (let i = 0; i < params.segments.length; i++) {
        const seg = params.segments[i];
        await client.query(
          `INSERT INTO transcript_segments (transcript_id, segment_index, start_time, end_time, text, speaker)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [transcriptId, i, seg.start, seg.end, seg.text, seg.speaker]
        );
      }
    }

    await client.query('COMMIT');
    return { id: transcriptId, meetingId: params.meetingId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Artifacts ───────────────────────────────────────────────────────────────

export async function saveArtifact(params: {
  meetingId: string;
  artifactType: 'whiteboard' | 'document' | 'screenshot' | 'file';
  name: string;
  storagePath?: string;
  contentText?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO meeting_artifacts (meeting_id, artifact_type, name, storage_path, content_text, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [params.meetingId, params.artifactType, params.name,
     params.storagePath, params.contentText, JSON.stringify(params.metadata || {})]
  );
  return result.rows[0].id;
}

// ── Insights ────────────────────────────────────────────────────────────────

export async function saveInsight(params: {
  meetingId: string;
  insightType: 'summary' | 'action_items' | 'key_topics' | 'sentiment' | 'coaching_notes';
  content: string;
  generatedBy?: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO meeting_insights (meeting_id, insight_type, content, generated_by)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [params.meetingId, params.insightType, params.content, params.generatedBy || 'system']
  );
  return result.rows[0].id;
}

// ── Meeting History ──────────────────────────────────────────────────────────

export async function releaseMeeting(meetingId: string): Promise<void> {
  await pool.query(
    'UPDATE meetings SET released_at = NOW() WHERE id = $1',
    [meetingId]
  );
}

export async function getMeetingsForClient(
  clientEmail: string,
  onlyReleased = false
): Promise<Meeting[]> {
  await initMeetingProjectLink();
  const baseSelect = `
    SELECT m.id, m.customer_id as "customerId", m.status, m.released_at,
           m.meeting_type as "meetingType",
           m.scheduled_at as "scheduledAt",
           m.created_at   as "createdAt",
           m.project_id as "projectId", p.name as "projectName"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE c.email = $1`;

  const query = onlyReleased
    ? `${baseSelect} AND m.released_at IS NOT NULL ORDER BY m.created_at DESC`
    : `${baseSelect} ORDER BY m.created_at DESC`;

  const result = await pool.query(query, [clientEmail]);
  return result.rows;
}

// ── Admin: Meeting list ──────────────────────────────────────────────────────

export interface AdminMeeting {
  id: string;
  meetingType: string;
  status: string;
  talkRoomToken: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerId: string;
  projectName: string | null;
  projectId: string | null;
  hasTranscript: boolean;
  artifactCount: number;
}

export async function listAllMeetings(opts?: {
  unassignedOnly?: boolean;
  limit?: number;
}): Promise<AdminMeeting[]> {
  await initMeetingProjectLink();
  const where = opts?.unassignedOnly
    ? `WHERE c.name LIKE '%@unknown.local%' OR m.meeting_type = 'Talk-Session'`
    : '';
  const result = await pool.query(`
    SELECT m.id, m.meeting_type AS "meetingType", m.status,
           m.talk_room_token AS "talkRoomToken",
           m.started_at AS "startedAt", m.ended_at AS "endedAt",
           m.created_at AS "createdAt",
           c.name AS "customerName", c.email AS "customerEmail",
           c.id AS "customerId",
           p.name AS "projectName", p.id AS "projectId",
           EXISTS(SELECT 1 FROM transcripts t WHERE t.meeting_id = m.id) AS "hasTranscript",
           (SELECT COUNT(*) FROM meeting_artifacts a WHERE a.meeting_id = m.id)::int AS "artifactCount"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    ${where}
    ORDER BY m.created_at DESC
    LIMIT $1
  `, [opts?.limit ?? 200]);
  return result.rows;
}

export async function getMeetingDetail(meetingId: string): Promise<{
  id: string;
  meetingType: string;
  status: string;
  talkRoomToken: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
  customerName: string;
  customerEmail: string;
  customerId: string;
  projectName: string | null;
  projectId: string | null;
  transcript: { id: string; fullText: string } | null;
  artifacts: Array<{ id: string; artifactType: string; name: string; storagePath: string | null; contentText: string | null }>;
} | null> {
  await initMeetingProjectLink();
  const r = await pool.query(`
    SELECT m.id, m.meeting_type AS "meetingType", m.status,
           m.talk_room_token AS "talkRoomToken",
           m.started_at AS "startedAt", m.ended_at AS "endedAt",
           m.created_at AS "createdAt",
           c.name AS "customerName", c.email AS "customerEmail", c.id AS "customerId",
           p.name AS "projectName", p.id AS "projectId"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN projects p ON m.project_id = p.id
    WHERE m.id = $1
  `, [meetingId]);
  if (!r.rows[0]) return null;
  const m = r.rows[0];

  const [tRow, aRows] = await Promise.all([
    pool.query(`SELECT id, full_text AS "fullText" FROM transcripts WHERE meeting_id = $1 LIMIT 1`, [meetingId]),
    pool.query(`SELECT id, artifact_type AS "artifactType", name, storage_path AS "storagePath", content_text AS "contentText" FROM meeting_artifacts WHERE meeting_id = $1 ORDER BY created_at`, [meetingId]),
  ]);

  return {
    ...m,
    transcript: tRow.rows[0] ?? null,
    artifacts: aRows.rows,
  };
}

export async function assignMeeting(meetingId: string, params: {
  customerName?: string;
  customerEmail?: string;
  meetingType?: string;
  projectId?: string | null;
}): Promise<void> {
  if (params.customerName && params.customerEmail) {
    const c = await upsertCustomer({ name: params.customerName, email: params.customerEmail });
    await pool.query(`UPDATE meetings SET customer_id = $2, updated_at = now() WHERE id = $1`, [meetingId, c.id]);
  }
  if (params.meetingType !== undefined) {
    await pool.query(`UPDATE meetings SET meeting_type = $2, updated_at = now() WHERE id = $1`, [meetingId, params.meetingType]);
  }
  if (params.projectId !== undefined) {
    await pool.query(`UPDATE meetings SET project_id = $2, updated_at = now() WHERE id = $1`, [meetingId, params.projectId]);
  }
}

// ── Bug Tickets ──────────────────────────────────────────────────────────────

export async function insertBugTicket(params: {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url?: string;
  brand: string;
  screenshots?: string[];
}): Promise<number> {
  await initBugTicketsTable();
  const screenshotsJson = params.screenshots && params.screenshots.length > 0
    ? JSON.stringify(params.screenshots)
    : null;
  const result = await pool.query(
    `INSERT INTO bugs.bug_tickets (ticket_id, category, reporter_email, description, url, brand, screenshots_json)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [params.ticketId, params.category, params.reporterEmail,
     params.description, params.url ?? null, params.brand, screenshotsJson]
  );
  return result.rowCount ?? 0;
}

export async function resolveBugTicket(ticketId: string, resolutionNote: string): Promise<void> {
  await initBugTicketsTable();
  await pool.query(
    `UPDATE bugs.bug_tickets
     SET status = 'resolved', resolved_at = NOW(), resolution_note = $2
     WHERE ticket_id = $1 AND status = 'open'`,
    [ticketId, resolutionNote]
  );
  await pool.query(
    `UPDATE inbox_items
     SET status = 'actioned', actioned_at = NOW()
     WHERE bug_ticket_id = $1 AND status = 'pending'`,
    [ticketId]
  );
}

export async function archiveBugTicket(ticketId: string): Promise<void> {
  await initBugTicketsTable();
  await pool.query(
    `UPDATE bugs.bug_tickets SET status = 'archived' WHERE ticket_id = $1 AND status != 'archived'`,
    [ticketId]
  );
  await pool.query(
    `UPDATE inbox_items
     SET status = 'archived', actioned_at = NOW()
     WHERE bug_ticket_id = $1 AND status = 'pending'`,
    [ticketId]
  );
}

export interface BugTicketStatus {
  ticketId: string;
  status: 'open' | 'resolved' | 'archived';
  category: string;
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
}

export async function getBugTicketStatus(ticketId: string): Promise<BugTicketStatus | null> {
  await initBugTicketsTable();
  const result = await pool.query(
    `SELECT ticket_id as "ticketId", status, category,
            created_at as "createdAt", resolved_at as "resolvedAt",
            resolution_note as "resolutionNote",
            fixed_in_pr as "fixedInPr", fixed_at as "fixedAt"
     FROM bugs.bug_tickets WHERE ticket_id = $1`,
    [ticketId]
  );
  return result.rows[0] ?? null;
}

// ── Bug Tickets Table Init ────────────────────────────────────────────────────

export async function initBugTicketsTable(): Promise<void> {
  await pool.query(`CREATE SCHEMA IF NOT EXISTS bugs AUTHORIZATION website`);
  // One-time migration: move a pre-existing public.bug_tickets into bugs.
  await pool.query(`
    DO $mig$
    BEGIN
      IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bug_tickets')
         AND NOT EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'bugs' AND tablename = 'bug_tickets') THEN
        EXECUTE 'ALTER TABLE public.bug_tickets SET SCHEMA bugs';
      END IF;
    END $mig$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bugs.bug_tickets (
      ticket_id       TEXT PRIMARY KEY,
      category        TEXT NOT NULL,
      reporter_email  TEXT NOT NULL,
      description     TEXT NOT NULL,
      url             TEXT,
      brand           TEXT NOT NULL,
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ,
      resolution_note TEXT
    )
  `);
  await pool.query(`
    ALTER TABLE bugs.bug_tickets
      ADD COLUMN IF NOT EXISTS screenshots_json JSONB
  `);
  await pool.query(`
    ALTER TABLE bugs.bug_tickets
      ALTER COLUMN brand DROP DEFAULT
  `);
  await pool.query(
    `ALTER TABLE bugs.bug_tickets
       ADD COLUMN IF NOT EXISTS fixed_in_pr   INTEGER`
  );
  await pool.query(
    `ALTER TABLE bugs.bug_tickets
       ADD COLUMN IF NOT EXISTS fixed_at      TIMESTAMPTZ`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_bug_tickets_fixed_in_pr ON bugs.bug_tickets (fixed_in_pr)`
  );
  // Sync inbox_items whose bug_ticket was already resolved/archived outside the inbox flow
  await pool.query(`
    UPDATE inbox_items
    SET status = CASE WHEN bt.status = 'archived' THEN 'archived' ELSE 'actioned' END,
        actioned_at = NOW()
    FROM bugs.bug_tickets bt
    WHERE inbox_items.bug_ticket_id = bt.ticket_id
      AND inbox_items.status = 'pending'
      AND bt.status IN ('resolved', 'archived')
  `);
}

// ── Service Config (Angebote Overrides) ──────────────────────────────────────

export interface ServiceOverride {
  slug: string;
  title: string;
  description: string;
  icon: string;
  price: string;
  features: string[];
  hidden?: boolean;
  pageContent?: {
    headline?: string;
    intro?: string;
    forWhom?: string[];
    sections?: Array<{ title: string; items: string[] }>;
    pricing?: Array<{ label: string; price: string; unit?: string; highlight?: boolean }>;
    faq?: Array<{ question: string; answer: string }>;
  };
}

export interface LeistungServiceOverride {
  key: string;
  name?: string;
  price?: string;
  unit?: string;
  desc?: string;
  highlight?: boolean;
  stundensatz_cents?: number;
}

export interface LeistungCategoryOverride {
  id: string;
  title?: string;
  icon?: string;
  services?: LeistungServiceOverride[];
}

export async function initServiceConfigTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS service_config (
      brand        TEXT PRIMARY KEY,
      services_json JSONB NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function getServiceConfig(brand: string): Promise<ServiceOverride[] | null> {
  await initServiceConfigTable();
  const result = await pool.query(
    'SELECT services_json FROM service_config WHERE brand = $1',
    [brand]
  );
  if (!result.rows[0]) return null;
  return result.rows[0].services_json as ServiceOverride[];
}

export async function saveServiceConfig(brand: string, overrides: ServiceOverride[]): Promise<void> {
  await initServiceConfigTable();
  await pool.query(
    `INSERT INTO service_config (brand, services_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (brand) DO UPDATE SET services_json = $2, updated_at = now()`,
    [brand, JSON.stringify(overrides)]
  );
}

// ── Leistungen Config (Preistabelle Overrides) ───────────────────────────────

export async function initLeistungenConfigTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS leistungen_config (
      brand            TEXT PRIMARY KEY,
      categories_json  JSONB NOT NULL,
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function getLeistungenConfig(brand: string): Promise<LeistungCategoryOverride[] | null> {
  await initLeistungenConfigTable();
  const result = await pool.query(
    'SELECT categories_json FROM leistungen_config WHERE brand = $1',
    [brand]
  );
  if (!result.rows[0]) return null;
  return result.rows[0].categories_json as LeistungCategoryOverride[];
}

export async function saveLeistungenConfig(brand: string, categories: LeistungCategoryOverride[]): Promise<void> {
  await initLeistungenConfigTable();
  await pool.query(
    `INSERT INTO leistungen_config (brand, categories_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (brand) DO UPDATE SET categories_json = $2, updated_at = now()`,
    [brand, JSON.stringify(categories)]
  );
}

// ── Site Settings (key/value store per brand) ────────────────────────────────

export async function initSiteSettingsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_settings (
      brand      TEXT,
      key        TEXT,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, key)
    )
  `);
}

export async function getSiteSetting(brand: string, key: string): Promise<string | null> {
  await initSiteSettingsTable();
  const result = await pool.query(
    'SELECT value FROM site_settings WHERE brand = $1 AND key = $2',
    [brand, key]
  );
  return result.rows[0]?.value ?? null;
}

export async function setSiteSetting(brand: string, key: string, value: string): Promise<void> {
  await initSiteSettingsTable();
  await pool.query(
    `INSERT INTO site_settings (brand, key, value, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (brand, key) DO UPDATE SET value = $3, updated_at = now()`,
    [brand, key, value]
  );
}

// ── Vacation / Blackout Periods ───────────────────────────────────────────────

export interface VacationPeriod {
  id: string;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
}

export async function getVacationPeriods(brand: string): Promise<VacationPeriod[]> {
  const raw = await getSiteSetting(brand, 'vacation_periods');
  if (!raw) return [];
  try { return JSON.parse(raw) as VacationPeriod[]; } catch { return []; }
}

export async function saveVacationPeriods(brand: string, periods: VacationPeriod[]): Promise<void> {
  await setSiteSetting(brand, 'vacation_periods', JSON.stringify(periods));
}

// ── Legal Pages (admin-editable HTML content) ────────────────────────────────

export async function initLegalPagesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS legal_pages (
      brand        TEXT,
      page_key     TEXT,
      content_html TEXT NOT NULL,
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, page_key)
    )
  `);
}

export async function getLegalPage(brand: string, pageKey: string): Promise<string | null> {
  await initLegalPagesTable();
  const result = await pool.query(
    'SELECT content_html FROM legal_pages WHERE brand = $1 AND page_key = $2',
    [brand, pageKey]
  );
  return result.rows[0]?.content_html ?? null;
}

export async function saveLegalPage(brand: string, pageKey: string, contentHtml: string): Promise<void> {
  await initLegalPagesTable();
  await pool.query(
    `INSERT INTO legal_pages (brand, page_key, content_html, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (brand, page_key) DO UPDATE SET content_html = $3, updated_at = now()`,
    [brand, pageKey, contentHtml]
  );
}

// ── Referenzen Config ─────────────────────────────────────────────────────────

export interface ReferenzItem {
  id: string;
  name: string;
  url?: string;
  logoUrl?: string;
  description?: string;
}

export async function initReferenzenTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referenzen_config (
      brand      TEXT PRIMARY KEY,
      items_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function getReferenzen(brand: string): Promise<ReferenzItem[] | null> {
  await initReferenzenTable();
  const result = await pool.query(
    'SELECT items_json FROM referenzen_config WHERE brand = $1',
    [brand]
  );
  return result.rows[0]?.items_json ?? null;
}

export async function saveReferenzen(brand: string, items: ReferenzItem[]): Promise<void> {
  await initReferenzenTable();
  await pool.query(
    `INSERT INTO referenzen_config (brand, items_json, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (brand) DO UPDATE SET items_json = $2, updated_at = now()`,
    [brand, JSON.stringify(items)]
  );
}

// ── Project Management ──────────────────────────────────────────────────────

export type ProjectStatus = 'entwurf' | 'wartend' | 'geplant' | 'aktiv' | 'erledigt' | 'archiviert';
export type ProjectPriority = 'hoch' | 'mittel' | 'niedrig';

export interface Project {
  id: string;
  brand: string;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  subProjectCount: number;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubProject {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  taskCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectTask {
  id: string;
  projectId: string;
  subProjectId: string | null;
  name: string;
  description: string | null;
  notes: string | null;
  startDate: Date | null;
  dueDate: Date | null;
  status: ProjectStatus;
  priority: ProjectPriority;
  customerId: string | null;
  customerName: string | null;
  customerEmail: string | null;
  adminId: string | null;
  adminName: string | null;
  adminEmail: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let projectTablesReady = false;

async function initProjectTables(): Promise<void> {
  if (projectTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS projects (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      brand       TEXT        NOT NULL,
      name        TEXT        NOT NULL,
      description TEXT,
      notes       TEXT,
      start_date  DATE,
      due_date    DATE,
      status      TEXT        NOT NULL DEFAULT 'entwurf',
      priority    TEXT        NOT NULL DEFAULT 'mittel',
      customer_id UUID        REFERENCES customers(id) ON DELETE SET NULL,
      admin_id    UUID        REFERENCES customers(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sub_projects (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      name        TEXT        NOT NULL,
      description TEXT,
      notes       TEXT,
      start_date  DATE,
      due_date    DATE,
      status      TEXT        NOT NULL DEFAULT 'entwurf',
      priority    TEXT        NOT NULL DEFAULT 'mittel',
      customer_id UUID        REFERENCES customers(id) ON DELETE SET NULL,
      admin_id    UUID        REFERENCES customers(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_tasks (
      id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id     UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      sub_project_id UUID        REFERENCES sub_projects(id) ON DELETE CASCADE,
      name           TEXT        NOT NULL,
      description    TEXT,
      notes          TEXT,
      start_date     DATE,
      due_date       DATE,
      status         TEXT        NOT NULL DEFAULT 'entwurf',
      priority       TEXT        NOT NULL DEFAULT 'mittel',
      customer_id    UUID        REFERENCES customers(id) ON DELETE SET NULL,
      admin_id       UUID        REFERENCES customers(id) ON DELETE SET NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS project_attachments (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id  UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      filename    TEXT        NOT NULL,
      nc_path     TEXT        NOT NULL,
      mime_type   TEXT        NOT NULL DEFAULT 'application/octet-stream',
      file_size   BIGINT      NOT NULL DEFAULT 0,
      uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Migrations for existing deployments
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_number TEXT UNIQUE`);
  await pool.query(`ALTER TABLE projects ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES customers(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE sub_projects ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES customers(id) ON DELETE SET NULL`);
  await pool.query(`ALTER TABLE project_tasks ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES customers(id) ON DELETE SET NULL`);
  projectTablesReady = true;
}

const PROJECT_SELECT = `
  SELECT p.id, p.brand, p.name, p.description, p.notes,
         p.start_date   AS "startDate",  p.due_date   AS "dueDate",
         p.status,      p.priority,
         p.customer_id  AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         p.admin_id     AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         (SELECT COUNT(*)::int FROM sub_projects  sp WHERE sp.project_id = p.id) AS "subProjectCount",
         (SELECT COUNT(*)::int FROM project_tasks pt WHERE pt.project_id = p.id) AS "taskCount",
         p.created_at   AS "createdAt",  p.updated_at AS "updatedAt"
  FROM projects p
  LEFT JOIN customers c ON p.customer_id = c.id
  LEFT JOIN customers a ON p.admin_id    = a.id
`;

const PROJECT_ORDER = `
  ORDER BY
    CASE p.status WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
                  WHEN 'entwurf' THEN 3 WHEN 'erledigt' THEN 4 WHEN 'archiviert' THEN 5 ELSE 6 END,
    p.due_date ASC NULLS LAST, p.created_at DESC
`;

export async function listProjects(filters: {
  brand: string; status?: string; priority?: string; customerId?: string; q?: string;
}): Promise<Project[]> {
  await initProjectTables();
  const { brand, status, priority, customerId, q } = filters;
  const result = await pool.query(
    `${PROJECT_SELECT}
     WHERE p.brand = $1
       AND ($2::text IS NULL OR p.status    = $2)
       AND ($3::text IS NULL OR p.priority  = $3)
       AND ($4::uuid IS NULL OR p.customer_id = $4)
       AND ($5::text IS NULL OR p.name        ILIKE '%'||$5||'%'
                              OR p.description ILIKE '%'||$5||'%')
     ${PROJECT_ORDER}`,
    [brand, status ?? null, priority ?? null, customerId ?? null, q ?? null]
  );
  return result.rows;
}

export async function getProject(id: string): Promise<Project | null> {
  await initProjectTables();
  const result = await pool.query(`${PROJECT_SELECT} WHERE p.id = $1`, [id]);
  return result.rows[0] ?? null;
}

export async function createProject(params: {
  brand: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initProjectTables();
  const result = await pool.query(
    `INSERT INTO projects (brand, name, description, notes, start_date, due_date, status, priority, customer_id, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [params.brand, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE projects
     SET name=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
         status=$7, priority=$8, customer_id=$9, admin_id=$10, updated_at=now()
     WHERE id=$1`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
}

export async function deleteProject(id: string): Promise<void> {
  await pool.query('DELETE FROM projects WHERE id=$1', [id]);
}

// Sub-Projects ────────────────────────────────────────────────────────────────

const SUBPROJECT_SELECT = `
  SELECT sp.id, sp.project_id AS "projectId", sp.name, sp.description, sp.notes,
         sp.start_date AS "startDate", sp.due_date AS "dueDate",
         sp.status,    sp.priority,
         sp.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         sp.admin_id    AS "adminId",
         a.name         AS "adminName",   a.email AS "adminEmail",
         COUNT(pt.id)::int AS "taskCount",
         sp.created_at AS "createdAt", sp.updated_at AS "updatedAt"
  FROM sub_projects sp
  LEFT JOIN customers     c  ON sp.customer_id    = c.id
  LEFT JOIN customers     a  ON sp.admin_id       = a.id
  LEFT JOIN project_tasks pt ON pt.sub_project_id = sp.id
`;

const SUBPROJECT_ORDER = `
  ORDER BY
    CASE sp.status WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
                   WHEN 'entwurf' THEN 3 WHEN 'erledigt' THEN 4 WHEN 'archiviert' THEN 5 ELSE 6 END,
    sp.due_date ASC NULLS LAST
`;

export async function listSubProjects(projectId: string): Promise<SubProject[]> {
  await initProjectTables();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.project_id=$1
     GROUP BY sp.id, c.name, c.email, a.name, a.email
     ${SUBPROJECT_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function getSubProject(id: string): Promise<SubProject | null> {
  await initProjectTables();
  const result = await pool.query(
    `${SUBPROJECT_SELECT}
     WHERE sp.id=$1
     GROUP BY sp.id, c.name, c.email, a.name, a.email`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createSubProject(params: {
  projectId: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initProjectTables();
  const result = await pool.query(
    `INSERT INTO sub_projects
       (project_id, name, description, notes, start_date, due_date, status, priority, customer_id, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [params.projectId, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateSubProject(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE sub_projects
     SET name=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
         status=$7, priority=$8, customer_id=$9, admin_id=$10, updated_at=now()
     WHERE id=$1`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
}

export async function deleteSubProject(id: string): Promise<void> {
  await pool.query('DELETE FROM sub_projects WHERE id=$1', [id]);
}

// Project Tasks ───────────────────────────────────────────────────────────────

const TASK_SELECT = `
  SELECT pt.id, pt.project_id AS "projectId", pt.sub_project_id AS "subProjectId",
         pt.name, pt.description, pt.notes,
         pt.start_date AS "startDate", pt.due_date AS "dueDate",
         pt.status,    pt.priority,
         pt.customer_id AS "customerId",
         c.name         AS "customerName", c.email AS "customerEmail",
         pt.admin_id    AS "adminId",
         a.name         AS "adminName",    a.email AS "adminEmail",
         pt.created_at AS "createdAt", pt.updated_at AS "updatedAt"
  FROM project_tasks pt
  LEFT JOIN customers c ON pt.customer_id = c.id
  LEFT JOIN customers a ON pt.admin_id    = a.id
`;

const TASK_ORDER = `
  ORDER BY
    CASE pt.status WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
                   WHEN 'entwurf' THEN 3 WHEN 'erledigt' THEN 4 WHEN 'archiviert' THEN 5 ELSE 6 END,
    pt.due_date ASC NULLS LAST
`;

export async function listDirectTasks(projectId: string): Promise<ProjectTask[]> {
  await initProjectTables();
  const result = await pool.query(
    `${TASK_SELECT} WHERE pt.project_id=$1 AND pt.sub_project_id IS NULL ${TASK_ORDER}`,
    [projectId]
  );
  return result.rows;
}

export async function listSubProjectTasks(subProjectId: string): Promise<ProjectTask[]> {
  await initProjectTables();
  const result = await pool.query(
    `${TASK_SELECT} WHERE pt.sub_project_id=$1 ${TASK_ORDER}`,
    [subProjectId]
  );
  return result.rows;
}

export async function createProjectTask(params: {
  projectId: string; subProjectId?: string; name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<string> {
  await initProjectTables();
  const result = await pool.query(
    `INSERT INTO project_tasks
       (project_id, sub_project_id, name, description, notes, start_date, due_date, status, priority, customer_id, admin_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [params.projectId, params.subProjectId || null, params.name,
     params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
  return result.rows[0].id;
}

export async function updateProjectTask(id: string, params: {
  name: string; description?: string; notes?: string;
  startDate?: string; dueDate?: string; status: string; priority: string;
  customerId?: string; adminId?: string;
}): Promise<void> {
  await pool.query(
    `UPDATE project_tasks
     SET name=$2, description=$3, notes=$4, start_date=$5, due_date=$6,
         status=$7, priority=$8, customer_id=$9, admin_id=$10, updated_at=now()
     WHERE id=$1`,
    [id, params.name, params.description || null, params.notes || null,
     params.startDate || null, params.dueDate || null,
     params.status, params.priority, params.customerId || null, params.adminId || null]
  );
}

export async function deleteProjectTask(id: string): Promise<void> {
  await pool.query('DELETE FROM project_tasks WHERE id=$1', [id]);
}

// Project Attachments ─────────────────────────────────────────────────────────

export interface ProjectAttachment {
  id: string;
  projectId: string;
  filename: string;
  ncPath: string;
  mimeType: string;
  fileSize: number;
  uploadedAt: Date;
}

export async function listProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  await initProjectTables();
  const r = await pool.query(
    `SELECT id, project_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", file_size AS "fileSize", uploaded_at AS "uploadedAt"
     FROM project_attachments WHERE project_id=$1 ORDER BY uploaded_at DESC`,
    [projectId]
  );
  return r.rows;
}

export async function getProjectAttachment(id: string): Promise<ProjectAttachment | null> {
  await initProjectTables();
  const r = await pool.query(
    `SELECT id, project_id AS "projectId", filename, nc_path AS "ncPath",
            mime_type AS "mimeType", file_size AS "fileSize", uploaded_at AS "uploadedAt"
     FROM project_attachments WHERE id=$1`,
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createProjectAttachment(params: {
  projectId: string; filename: string; ncPath: string; mimeType: string; fileSize: number;
}): Promise<string> {
  await initProjectTables();
  const r = await pool.query(
    `INSERT INTO project_attachments (project_id, filename, nc_path, mime_type, file_size)
     VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [params.projectId, params.filename, params.ncPath, params.mimeType, params.fileSize]
  );
  return r.rows[0].id;
}

export async function deleteProjectAttachmentRecord(id: string): Promise<string | null> {
  await initProjectTables();
  const r = await pool.query(
    'DELETE FROM project_attachments WHERE id=$1 RETURNING nc_path',
    [id]
  );
  return r.rows[0]?.nc_path ?? null;
}

// ── Portal: user-scoped project access ───────────────────────────────────────

export interface PortalProject {
  id: string;
  name: string;
  description: string | null;
  status: string;
  dueDate: Date | null;
  tasks: PortalTask[];
}

export interface PortalTask {
  id: string;
  name: string;
  status: string;
  isUserTask: boolean;
}

export async function listProjectsForCustomer(keycloakUserId: string): Promise<PortalProject[]> {
  await initProjectTables();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return [];
  const customerId = cust.rows[0].id;

  const projects = await pool.query<{ id: string; name: string; description: string | null; status: string; due_date: Date | null }>(
    `SELECT id, name, description, status, due_date
     FROM projects
     WHERE customer_id = $1 AND status NOT IN ('archiviert')
     ORDER BY created_at DESC`,
    [customerId],
  );

  const result: PortalProject[] = [];
  for (const p of projects.rows) {
    const tasks = await pool.query<{ id: string; name: string; status: string; customer_id: string | null }>(
      `SELECT id, name, status, customer_id FROM project_tasks WHERE project_id = $1 ORDER BY created_at ASC`,
      [p.id],
    );
    result.push({
      id: p.id,
      name: p.name,
      description: p.description,
      status: p.status,
      dueDate: p.due_date,
      tasks: tasks.rows.map(t => ({
        id: t.id,
        name: t.name,
        status: t.status,
        isUserTask: t.customer_id === customerId,
      })),
    });
  }
  return result;
}

export async function togglePortalTaskDone(taskId: string, keycloakUserId: string): Promise<{ ok: boolean }> {
  await initProjectTables();

  const cust = await pool.query<{ id: string }>(
    `SELECT id FROM customers WHERE keycloak_user_id = $1 LIMIT 1`,
    [keycloakUserId],
  );
  if (!cust.rows[0]) return { ok: false };
  const customerId = cust.rows[0].id;

  const task = await pool.query<{ status: string }>(
    `SELECT status FROM project_tasks WHERE id = $1 AND customer_id = $2`,
    [taskId, customerId],
  );
  if (!task.rows[0]) return { ok: false };

  const newStatus = task.rows[0].status === 'erledigt' ? 'aktiv' : 'erledigt';
  await pool.query(
    `UPDATE project_tasks SET status = $1, updated_at = now() WHERE id = $2`,
    [newStatus, taskId],
  );
  return { ok: true };
}

// All customers for dropdowns ─────────────────────────────────────────────────

export async function listAllCustomers(): Promise<Customer[]> {
  const result = await pool.query(
    `SELECT id, name, email, customer_number, is_admin, admin_number
     FROM customers
     WHERE is_admin = false OR is_admin IS NULL
     ORDER BY name ASC`
  );
  return result.rows;
}

export async function listAdminUsers(): Promise<Customer[]> {
  const result = await pool.query(
    `SELECT id, name, email, admin_number, is_admin
     FROM customers
     WHERE is_admin = true
     ORDER BY name ASC`
  );
  return result.rows;
}

// CSV export ──────────────────────────────────────────────────────────────────

function pmDateDE(d: Date | string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export interface ProjectExportRow {
  typ: string; projekt: string; teilprojekt: string; name: string;
  status: string; prioritaet: string; kunde: string;
  erfasst: string; start: string; faelligkeit: string;
  beschreibung: string; notizen: string;
}

export async function exportProjectsFlat(brand: string): Promise<ProjectExportRow[]> {
  await initProjectTables();
  const rows: ProjectExportRow[] = [];
  const projects = await listProjects({ brand });

  for (const p of projects) {
    rows.push({
      typ: 'Projekt', projekt: p.name, teilprojekt: '', name: p.name,
      status: p.status, prioritaet: p.priority, kunde: p.customerName ?? '',
      erfasst: pmDateDE(p.createdAt), start: pmDateDE(p.startDate), faelligkeit: pmDateDE(p.dueDate),
      beschreibung: p.description ?? '', notizen: p.notes ?? '',
    });
    const sps = await listSubProjects(p.id);
    for (const sp of sps) {
      rows.push({
        typ: 'Teilprojekt', projekt: p.name, teilprojekt: sp.name, name: sp.name,
        status: sp.status, prioritaet: sp.priority, kunde: sp.customerName ?? '',
        erfasst: pmDateDE(sp.createdAt), start: pmDateDE(sp.startDate), faelligkeit: pmDateDE(sp.dueDate),
        beschreibung: sp.description ?? '', notizen: sp.notes ?? '',
      });
      const spTasks = await listSubProjectTasks(sp.id);
      for (const t of spTasks) {
        rows.push({
          typ: 'Aufgabe', projekt: p.name, teilprojekt: sp.name, name: t.name,
          status: t.status, prioritaet: t.priority, kunde: t.customerName ?? '',
          erfasst: pmDateDE(t.createdAt), start: pmDateDE(t.startDate), faelligkeit: pmDateDE(t.dueDate),
          beschreibung: t.description ?? '', notizen: t.notes ?? '',
        });
      }
    }
    const direct = await listDirectTasks(p.id);
    for (const t of direct) {
      rows.push({
        typ: 'Aufgabe', projekt: p.name, teilprojekt: '', name: t.name,
        status: t.status, prioritaet: t.priority, kunde: t.customerName ?? '',
        erfasst: pmDateDE(t.createdAt), start: pmDateDE(t.startDate), faelligkeit: pmDateDE(t.dueDate),
        beschreibung: t.description ?? '', notizen: t.notes ?? '',
      });
    }
  }
  return rows;
}

// ── Time Entries ──────────────────────────────────────────────────────────────

let timeEntriesReady = false;

export interface TimeEntry {
  id: string;
  projectId: string;
  projectName: string;
  taskId: string | null;
  taskName: string | null;
  description: string | null;
  minutes: number;
  billable: boolean;
  rateCents: number;
  leistungKey: string | null;
  stripeInvoiceId: string | null;
  entryDate: Date;
  createdAt: Date;
}

async function initTimeEntriesTable(): Promise<void> {
  if (timeEntriesReady) return;
  await initProjectTables();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS time_entries (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id        UUID        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      task_id           UUID        REFERENCES project_tasks(id) ON DELETE SET NULL,
      description       TEXT,
      minutes           INTEGER     NOT NULL CHECK (minutes > 0),
      billable          BOOLEAN     NOT NULL DEFAULT true,
      rate_cents        INTEGER     NOT NULL DEFAULT 0,
      stripe_invoice_id TEXT,
      entry_date        DATE        NOT NULL DEFAULT CURRENT_DATE,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS time_entries_project_id_idx ON time_entries(project_id)
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS rate_cents        INTEGER DEFAULT 0
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS stripe_invoice_id TEXT
  `);
  await pool.query(`
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
  timeEntriesReady = true;
}

export async function getLastTimeEntryRate(): Promise<number> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT rate_cents FROM time_entries ORDER BY created_at DESC LIMIT 1`
  );
  return result.rows[0]?.rate_cents ?? 0;
}

export async function createTimeEntry(params: {
  projectId: string;
  taskId?: string;
  description?: string;
  minutes: number;
  billable?: boolean;
  rateCents?: number;
  leistungKey?: string;
  entryDate?: string;
}): Promise<TimeEntry> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `INSERT INTO time_entries (project_id, task_id, description, minutes, billable, rate_cents, leistung_key, entry_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING
       id,
       project_id        AS "projectId",
       NULL::text        AS "projectName",
       task_id           AS "taskId",
       NULL::text        AS "taskName",
       description,
       minutes,
       billable,
       rate_cents        AS "rateCents",
       leistung_key      AS "leistungKey",
       stripe_invoice_id AS "stripeInvoiceId",
       entry_date        AS "entryDate",
       created_at        AS "createdAt"`,
    [
      params.projectId,
      params.taskId ?? null,
      params.description ?? null,
      params.minutes,
      params.billable ?? true,
      params.rateCents ?? 0,
      params.leistungKey ?? null,
      params.entryDate ?? null,
    ]
  );
  return result.rows[0] as TimeEntry;
}

export async function listTimeEntries(projectId: string): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.name               AS "projectName",
            te.task_id           AS "taskId",
            pt.name              AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents        AS "rateCents",
            te.stripe_invoice_id AS "stripeInvoiceId",
            te.leistung_key      AS "leistungKey",
            te.entry_date        AS "entryDate",
            te.created_at        AS "createdAt"
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     WHERE te.project_id = $1
     ORDER BY te.entry_date DESC`,
    [projectId]
  );
  return result.rows;
}

export async function listAllTimeEntries(params?: {
  billable?: boolean;
  since?: string;
}): Promise<TimeEntry[]> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.name               AS "projectName",
            te.task_id           AS "taskId",
            pt.name              AS "taskName",
            te.description,
            te.minutes,
            te.billable,
            te.rate_cents        AS "rateCents",
            te.stripe_invoice_id AS "stripeInvoiceId",
            te.leistung_key      AS "leistungKey",
            te.entry_date        AS "entryDate",
            te.created_at        AS "createdAt"
     FROM time_entries te
     JOIN projects      p  ON p.id  = te.project_id
     LEFT JOIN project_tasks pt ON pt.id = te.task_id
     WHERE ($1::boolean IS NULL OR te.billable = $1)
       AND ($2::date    IS NULL OR te.entry_date >= $2::date)
     ORDER BY te.entry_date DESC`,
    [params?.billable ?? null, params?.since ?? null]
  );
  return result.rows;
}

export async function setTimeEntryStripeInvoice(
  ids: string[],
  stripeInvoiceId: string | null
): Promise<void> {
  if (ids.length === 0) return;
  await initTimeEntriesTable();
  await pool.query(
    `UPDATE time_entries SET stripe_invoice_id = $1 WHERE id = ANY($2::uuid[])`,
    [stripeInvoiceId, ids]
  );
}

export async function getTimeEntryIdsByInvoice(stripeInvoiceId: string): Promise<string[]> {
  await initTimeEntriesTable();
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM time_entries WHERE stripe_invoice_id = $1`,
    [stripeInvoiceId]
  );
  return result.rows.map(r => r.id);
}

export interface UnbilledCustomerGroup {
  customerId: string;
  customerName: string;
  customerEmail: string;
  entries: Array<{
    id: string;
    projectId: string;
    projectName: string;
    description: string | null;
    minutes: number;
    rateCents: number;
    entryDate: Date;
  }>;
}

export async function getUnbilledBillableEntriesByCustomer(
  year: number,
  month: number  // 1-12
): Promise<UnbilledCustomerGroup[]> {
  await initTimeEntriesTable();
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate   = new Date(year, month, 0).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT te.id,
            te.project_id        AS "projectId",
            p.name               AS "projectName",
            te.description,
            te.minutes,
            te.rate_cents        AS "rateCents",
            te.entry_date        AS "entryDate",
            c.id                 AS "customerId",
            c.name               AS "customerName",
            c.email              AS "customerEmail"
     FROM time_entries te
     JOIN projects  p ON p.id = te.project_id
     JOIN customers c ON c.id = p.customer_id
     WHERE te.billable = true
       AND te.stripe_invoice_id IS NULL
       AND te.entry_date BETWEEN $1 AND $2
       AND p.customer_id IS NOT NULL`,
    [startDate, endDate]
  );

  const byCustomer = new Map<string, UnbilledCustomerGroup>();
  for (const row of result.rows) {
    if (!byCustomer.has(row.customerId)) {
      byCustomer.set(row.customerId, {
        customerId: row.customerId,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        entries: [],
      });
    }
    byCustomer.get(row.customerId)!.entries.push({
      id: row.id,
      projectId: row.projectId,
      projectName: row.projectName,
      description: row.description,
      minutes: row.minutes,
      rateCents: row.rateCents,
      entryDate: row.entryDate,
    });
  }
  return [...byCustomer.values()];
}

// ── Meeting-Projekt-Verknüpfung ───────────────────────────────────────────────

export async function listMeetingsForProject(
  projectId: string
): Promise<MeetingWithDetails[]> {
  await initMeetingProjectLink();
  const meetings = await pool.query(
    `SELECT id, meeting_type AS "meetingType", status,
            scheduled_at AS "scheduledAt", started_at AS "startedAt",
            ended_at AS "endedAt", duration_seconds AS "durationSeconds",
            released_at AS "releasedAt", created_at AS "createdAt"
     FROM meetings WHERE project_id = $1
     ORDER BY created_at DESC`,
    [projectId]
  );

  const result: MeetingWithDetails[] = [];
  // Per-meeting fan-out: 3 parallel queries × N meetings.
  // Acceptable for small project meeting counts; revisit if projects regularly exceed ~20 meetings.
  for (const m of meetings.rows) {
    const [tRes, iRes, aRes] = await Promise.all([
      pool.query(
        `SELECT id, full_text AS "fullText", language,
                duration_seconds AS "durationSeconds"
         FROM transcripts WHERE meeting_id = $1`,
        [m.id]
      ),
      pool.query(
        `SELECT id, insight_type AS "insightType", content,
                generated_by AS "generatedBy"
         FROM meeting_insights WHERE meeting_id = $1
         ORDER BY created_at ASC`,
        [m.id]
      ),
      pool.query(
        `SELECT id, artifact_type AS "artifactType", name,
                content_text AS "contentText"
         FROM meeting_artifacts WHERE meeting_id = $1`,
        [m.id]
      ),
    ]);
    result.push({
      ...m,
      transcripts: tRes.rows,
      insights: iRes.rows,
      artifacts: aRes.rows,
    });
  }
  return result;
}

export async function assignMeetingToProject(
  meetingId: string,
  projectId: string | null
): Promise<void> {
  await initMeetingProjectLink();
  await pool.query(
    `UPDATE meetings SET project_id = $2, updated_at = now() WHERE id = $1`,
    [meetingId, projectId]
  );
}

export async function findProjectByName(
  brand: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  await initProjectTables();
  const result = await pool.query(
    `SELECT id, name FROM projects
     WHERE brand = $1 AND name ILIKE $2
     ORDER BY CASE status
       WHEN 'aktiv' THEN 0 WHEN 'geplant' THEN 1 WHEN 'wartend' THEN 2
       ELSE 3 END
     LIMIT 1`,
    [brand, `%${name}%`]
  );
  return result.rows[0] ?? null;
}

export async function listUnassignedMeetingsForCustomer(
  customerId: string
): Promise<Array<{ id: string; meetingType: string; status: string; createdAt: Date }>> {
  await initMeetingProjectLink();
  const result = await pool.query(
    `SELECT id, meeting_type AS "meetingType", status, created_at AS "createdAt"
     FROM meetings
     WHERE customer_id = $1 AND project_id IS NULL
     ORDER BY created_at DESC`,
    [customerId]
  );
  return result.rows;
}

export async function getCustomerByEmail(
  email: string
): Promise<Customer | null> {
  const result = await pool.query(
    `SELECT id, name, email, customer_number, admin_number, is_admin, phone, company FROM customers WHERE email = $1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function deleteTimeEntry(id: string): Promise<void> {
  await initTimeEntriesTable();
  await pool.query('DELETE FROM time_entries WHERE id = $1', [id]);
}

export async function getProjectTotalMinutes(
  projectId: string
): Promise<{ total: number; billable: number }> {
  await initTimeEntriesTable();
  const result = await pool.query(
    `SELECT
       COALESCE(SUM(minutes), 0)::int                                          AS total,
       COALESCE(SUM(CASE WHEN billable THEN minutes ELSE 0 END), 0)::int       AS billable
     FROM time_entries
     WHERE project_id = $1`,
    [projectId]
  );
  return result.rows[0];
}

// ── Client Notes ──────────────────────────────────────────────────────────────

export interface ClientNote {
  id: string;
  keycloakUserId: string;
  content: string;
  createdAt: Date;
}

async function initClientNotesTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS client_notes (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT        NOT NULL,
      content           TEXT        NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS client_notes_keycloak_user_id_idx ON client_notes(keycloak_user_id)
  `);
}

export async function listClientNotes(keycloakUserId: string): Promise<ClientNote[]> {
  await initClientNotesTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            content,
            created_at       AS "createdAt"
     FROM client_notes
     WHERE keycloak_user_id = $1
     ORDER BY created_at DESC`,
    [keycloakUserId]
  );
  return result.rows;
}

export async function createClientNote(keycloakUserId: string, content: string): Promise<ClientNote> {
  await initClientNotesTable();
  const result = await pool.query(
    `INSERT INTO client_notes (keycloak_user_id, content)
     VALUES ($1, $2)
     RETURNING id,
               keycloak_user_id AS "keycloakUserId",
               content,
               created_at       AS "createdAt"`,
    [keycloakUserId, content]
  );
  return result.rows[0];
}

export async function deleteClientNote(id: string): Promise<void> {
  await pool.query('DELETE FROM client_notes WHERE id = $1', [id]);
}

// ── Onboarding-Checkliste ─────────────────────────────────────────────────────

export interface OnboardingItem {
  id: string;
  keycloakUserId: string;
  label: string;
  done: boolean;
  sortOrder: number;
}

const DEFAULT_ONBOARDING_ITEMS = [
  'Erstgespräch gebucht',
  'Vertrag unterzeichnet',
  'Nextcloud-Ordner erstellt',
  'Mattermost-Kanal eingerichtet',
  'Rechnungsadresse erfasst',
  'Zugangsdaten versendet',
];

async function initOnboardingTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS onboarding_items (
      id                UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT    NOT NULL,
      label             TEXT    NOT NULL,
      done              BOOLEAN NOT NULL DEFAULT false,
      sort_order        INTEGER NOT NULL DEFAULT 0
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS onboarding_items_keycloak_user_id_idx ON onboarding_items(keycloak_user_id)
  `);
}

export async function getOrCreateOnboardingChecklist(keycloakUserId: string): Promise<OnboardingItem[]> {
  await initOnboardingTable();
  const existing = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items
     WHERE keycloak_user_id = $1
     ORDER BY sort_order ASC`,
    [keycloakUserId]
  );
  if (existing.rows.length > 0) return existing.rows;

  // Seed defaults
  for (let i = 0; i < DEFAULT_ONBOARDING_ITEMS.length; i++) {
    await pool.query(
      `INSERT INTO onboarding_items (keycloak_user_id, label, sort_order)
       VALUES ($1, $2, $3)`,
      [keycloakUserId, DEFAULT_ONBOARDING_ITEMS[i], i]
    );
  }

  const seeded = await pool.query(
    `SELECT id, keycloak_user_id AS "keycloakUserId", label, done, sort_order AS "sortOrder"
     FROM onboarding_items
     WHERE keycloak_user_id = $1
     ORDER BY sort_order ASC`,
    [keycloakUserId]
  );
  return seeded.rows;
}

export async function toggleOnboardingItem(id: string, done: boolean): Promise<void> {
  await initOnboardingTable();
  await pool.query('UPDATE onboarding_items SET done = $2 WHERE id = $1', [id, done]);
}

export async function resetOnboardingChecklist(keycloakUserId: string): Promise<void> {
  await initOnboardingTable();
  await pool.query(
    'UPDATE onboarding_items SET done = false WHERE keycloak_user_id = $1',
    [keycloakUserId]
  );
}

// ── Follow-ups ────────────────────────────────────────────────────────────────

export interface FollowUp {
  id: string;
  keycloakUserId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  reason: string;
  dueDate: Date;
  done: boolean;
  createdAt: Date;
}

async function initFollowUpsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS follow_ups (
      id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      keycloak_user_id  TEXT,
      client_name       TEXT,
      client_email      TEXT,
      reason            TEXT        NOT NULL,
      due_date          DATE        NOT NULL,
      done              BOOLEAN     NOT NULL DEFAULT false,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function createFollowUp(params: {
  keycloakUserId?: string;
  clientName?: string;
  clientEmail?: string;
  reason: string;
  dueDate: string;
}): Promise<FollowUp> {
  await initFollowUpsTable();
  const result = await pool.query(
    `INSERT INTO follow_ups (keycloak_user_id, client_name, client_email, reason, due_date)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id,
               keycloak_user_id AS "keycloakUserId",
               client_name      AS "clientName",
               client_email     AS "clientEmail",
               reason,
               due_date         AS "dueDate",
               done,
               created_at       AS "createdAt"`,
    [
      params.keycloakUserId ?? null,
      params.clientName ?? null,
      params.clientEmail ?? null,
      params.reason,
      params.dueDate,
    ]
  );
  return result.rows[0];
}

export async function listFollowUps(showDone = false): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            client_name      AS "clientName",
            client_email     AS "clientEmail",
            reason,
            due_date         AS "dueDate",
            done,
            created_at       AS "createdAt"
     FROM follow_ups
     WHERE ($1 OR done = false)
     ORDER BY due_date ASC`,
    [showDone]
  );
  return result.rows;
}

export async function getDueFollowUps(): Promise<FollowUp[]> {
  await initFollowUpsTable();
  const result = await pool.query(
    `SELECT id,
            keycloak_user_id AS "keycloakUserId",
            client_name      AS "clientName",
            client_email     AS "clientEmail",
            reason,
            due_date         AS "dueDate",
            done,
            created_at       AS "createdAt"
     FROM follow_ups
     WHERE done = false AND due_date <= CURRENT_DATE
     ORDER BY due_date ASC`
  );
  return result.rows;
}

export async function updateFollowUp(id: string, params: {
  done?: boolean;
  dueDate?: string;
  reason?: string;
}): Promise<void> {
  const sets: string[] = [];
  const values: unknown[] = [id];
  let idx = 2;

  if (params.done !== undefined) { sets.push(`done = $${idx}`); values.push(params.done); idx++; }
  if (params.dueDate !== undefined) { sets.push(`due_date = $${idx}`); values.push(params.dueDate); idx++; }
  if (params.reason !== undefined) { sets.push(`reason = $${idx}`); values.push(params.reason); idx++; }

  if (sets.length === 0) return;
  await pool.query(`UPDATE follow_ups SET ${sets.join(', ')} WHERE id = $1`, values);
}

export async function deleteFollowUp(id: string): Promise<void> {
  await pool.query('DELETE FROM follow_ups WHERE id = $1', [id]);
}

// ── Task Calendar ─────────────────────────────────────────────────────────────

export interface CalendarTask {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  dueDate: Date;
  status: string;
  priority: string;
}

export async function listTasksInMonth(year: number, month: number): Promise<CalendarTask[]> {
  await initProjectTables();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query(
    `SELECT pt.id,
            pt.name,
            pt.project_id AS "projectId",
            p.name        AS "projectName",
            pt.due_date   AS "dueDate",
            pt.status,
            pt.priority
     FROM project_tasks pt
     JOIN projects p ON p.id = pt.project_id
     WHERE pt.due_date BETWEEN $1::date AND $2::date
     ORDER BY pt.due_date ASC, pt.priority DESC`,
    [firstDay, lastDay]
  );
  return result.rows;
}

export interface CalendarProject {
  id: string;
  name: string;
  status: string;
  priority: string;
  customerId: string | null;
  customerName: string | null;
  startDate: Date | null;
  dueDate: Date | null;
}

export async function listProjectsInMonth(year: number, month: number, brand?: string): Promise<CalendarProject[]> {
  await initProjectTables();
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const result = await pool.query<CalendarProject>(
    `SELECT p.id,
            p.name,
            p.status,
            p.priority,
            p.customer_id  AS "customerId",
            c.name         AS "customerName",
            p.start_date   AS "startDate",
            p.due_date     AS "dueDate"
     FROM projects p
     LEFT JOIN customers c ON c.id = p.customer_id
     WHERE p.status NOT IN ('archiviert', 'erledigt')
       AND ($1::text IS NULL OR p.brand = $1)
       AND (
         (p.start_date BETWEEN $2::date AND $3::date)
         OR (p.due_date BETWEEN $2::date AND $3::date)
       )
     ORDER BY COALESCE(p.start_date, p.due_date) ASC`,
    [brand ?? null, firstDay, lastDay]
  );
  return result.rows;
}

// ── Bug Ticket List ───────────────────────────────────────────────────────────

export interface BugTicketRow {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url: string | null;
  brand: string;
  status: 'open' | 'resolved' | 'archived';
  createdAt: Date;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  screenshots: string[] | null;
  fixedInPr?: number | null;
  fixedAt?: Date | null;
}

let bookingProjectLinksReady = false;
async function initBookingProjectLinks(): Promise<void> {
  if (bookingProjectLinksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_project_links (
      caldav_uid  TEXT    NOT NULL,
      brand       TEXT    NOT NULL,
      project_id  UUID    REFERENCES projects(id) ON DELETE SET NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    )
  `);
  await pool.query(`
    ALTER TABLE booking_project_links ADD COLUMN IF NOT EXISTS leistung_key TEXT
  `);
  bookingProjectLinksReady = true;
}

// ── Booking-Invoice Mapping ───────────────────────────────────────────────────

let bookingInvoiceLinksReady = false;
async function initBookingInvoiceLinksTable(): Promise<void> {
  if (bookingInvoiceLinksReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS booking_invoice_links (
      caldav_uid      TEXT        NOT NULL,
      brand           TEXT        NOT NULL,
      invoice_id      TEXT        NOT NULL,
      invoice_number  TEXT        NOT NULL,
      amount          NUMERIC(10,2) NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (caldav_uid, brand)
    )
  `);
  bookingInvoiceLinksReady = true;
}

export async function setBookingInvoice(
  caldavUid: string,
  brand: string,
  invoiceId: string,
  invoiceNumber: string,
  amount: number
): Promise<void> {
  await initBookingInvoiceLinksTable();
  await pool.query(
    `INSERT INTO booking_invoice_links (caldav_uid, brand, invoice_id, invoice_number, amount)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (caldav_uid, brand) DO UPDATE
       SET invoice_id = EXCLUDED.invoice_id,
           invoice_number = EXCLUDED.invoice_number,
           amount = EXCLUDED.amount`,
    [caldavUid, brand, invoiceId, invoiceNumber, amount]
  );
}

export interface BookingInvoiceInfo {
  invoiceId: string;
  invoiceNumber: string;
  amount: number;
}

export async function getBookingInvoices(caldavUids: string[], brand: string): Promise<Map<string, BookingInvoiceInfo>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingInvoiceLinksTable();
  const result = await pool.query(
    `SELECT caldav_uid, invoice_id, invoice_number, amount
     FROM booking_invoice_links
     WHERE caldav_uid = ANY($1) AND brand = $2`,
    [caldavUids, brand]
  );
  return new Map(
    result.rows.map((r: {
      caldav_uid: string;
      invoice_id: string;
      invoice_number: string;
      amount: string;
    }) => [
      r.caldav_uid,
      {
        invoiceId: r.invoice_id,
        invoiceNumber: r.invoice_number,
        amount: parseFloat(r.amount),
      },
    ])
  );
}

export async function getBookingProjects(caldavUids: string[], brand: string): Promise<Map<string, string>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingProjectLinks();
  const result = await pool.query(
    `SELECT caldav_uid, project_id FROM booking_project_links
     WHERE caldav_uid = ANY($1) AND brand = $2 AND project_id IS NOT NULL`,
    [caldavUids, brand]
  );
  return new Map(result.rows.map((r: { caldav_uid: string; project_id: string }) => [r.caldav_uid, r.project_id]));
}

export async function setBookingProject(
  caldavUid: string,
  projectId: string | null,
  brand: string,
  leistungKey?: string
): Promise<void> {
  await initBookingProjectLinks();
  if (!projectId) {
    await pool.query(
      `DELETE FROM booking_project_links WHERE caldav_uid = $1 AND brand = $2`,
      [caldavUid, brand]
    );
  } else {
    await pool.query(
      `INSERT INTO booking_project_links (caldav_uid, brand, project_id, leistung_key)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (caldav_uid, brand) DO UPDATE
         SET project_id  = EXCLUDED.project_id,
             leistung_key = EXCLUDED.leistung_key`,
      [caldavUid, brand, projectId, leistungKey ?? null]
    );
  }
}

export async function getBookingLeistungen(caldavUids: string[], brand: string): Promise<Map<string, string>> {
  if (caldavUids.length === 0) return new Map();
  await initBookingProjectLinks();
  const result = await pool.query(
    `SELECT caldav_uid, leistung_key FROM booking_project_links
     WHERE caldav_uid = ANY($1) AND brand = $2 AND leistung_key IS NOT NULL`,
    [caldavUids, brand]
  );
  return new Map(result.rows.map((r: { caldav_uid: string; leistung_key: string }) => [r.caldav_uid, r.leistung_key]));
}

// ── Slot Whitelist ────────────────────────────────────────────────────────────

export interface WhitelistedSlot {
  slotStart: Date;
  slotEnd: Date;
}

async function initSlotWhitelistTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS slot_whitelist (
      brand      TEXT        NOT NULL,
      slot_start TIMESTAMPTZ NOT NULL,
      slot_end   TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (brand, slot_start)
    )
  `);
}

export async function getWhitelistedSlots(brand: string): Promise<WhitelistedSlot[]> {
  await initSlotWhitelistTable();
  // Only return future slots for display — isSlotWhitelisted has no time filter
  // so booking validation works even for slots that just started.
  const result = await pool.query(
    `SELECT slot_start AS "slotStart", slot_end AS "slotEnd"
     FROM slot_whitelist
     WHERE brand = $1 AND slot_start > now()
     ORDER BY slot_start ASC`,
    [brand]
  );
  return result.rows;
}

export async function addSlotToWhitelist(brand: string, start: Date, end: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    `INSERT INTO slot_whitelist (brand, slot_start, slot_end)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, slot_start) DO UPDATE SET slot_end = $3`,
    [brand, start, end]
  );
}

export async function removeSlotFromWhitelist(brand: string, start: Date): Promise<void> {
  await initSlotWhitelistTable();
  await pool.query(
    'DELETE FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz',
    [brand, start]
  );
}

export async function isSlotWhitelisted(brand: string, start: Date): Promise<boolean> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    'SELECT 1 FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz',
    [brand, start]
  );
  return (result.rowCount ?? 0) > 0;
}

// Atomically removes the slot from the whitelist and returns true if it was
// available (i.e. not already claimed by another concurrent booking).
export async function claimSlot(brand: string, start: Date): Promise<boolean> {
  await initSlotWhitelistTable();
  const result = await pool.query(
    'DELETE FROM slot_whitelist WHERE brand = $1 AND slot_start = $2::timestamptz RETURNING 1',
    [brand, start]
  );
  return (result.rowCount ?? 0) > 0;
}

// ── Free Time Windows ────────────────────────────────────────────────────────

export interface FreeTimeWindow {
  id: string;
  date: string;     // YYYY-MM-DD
  winStart: string; // HH:MM
  winEnd: string;   // HH:MM
}

async function initFreeTimeWindowsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS free_time_windows (
      id         TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
      brand      TEXT        NOT NULL,
      date       DATE        NOT NULL,
      win_start  TIME        NOT NULL,
      win_end    TIME        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (id)
    )
  `);
}

export async function getFreeTimeWindows(brand: string, fromDate?: string, toDate?: string): Promise<FreeTimeWindow[]> {
  await initFreeTimeWindowsTable();
  const result = await pool.query(
    `SELECT id,
            to_char(date, 'YYYY-MM-DD')   AS date,
            to_char(win_start, 'HH24:MI') AS "winStart",
            to_char(win_end,   'HH24:MI') AS "winEnd"
     FROM free_time_windows
     WHERE brand = $1
       AND ($2::date IS NULL OR date >= $2::date)
       AND ($3::date IS NULL OR date <= $3::date)
     ORDER BY date ASC, win_start ASC`,
    [brand, fromDate ?? null, toDate ?? null]
  );
  return result.rows;
}

export async function addFreeTimeWindow(brand: string, date: string, winStart: string, winEnd: string): Promise<string> {
  await initFreeTimeWindowsTable();
  const result = await pool.query(
    `INSERT INTO free_time_windows (brand, date, win_start, win_end)
     VALUES ($1, $2::date, $3::time, $4::time)
     RETURNING id`,
    [brand, date, winStart, winEnd]
  );
  return result.rows[0].id as string;
}

export async function removeFreeTimeWindow(brand: string, id: string): Promise<void> {
  await initFreeTimeWindowsTable();
  await pool.query(
    'DELETE FROM free_time_windows WHERE id = $1 AND brand = $2',
    [id, brand]
  );
}

export async function isSlotInAnyWindow(brand: string, slotStart: Date, slotEnd: Date): Promise<boolean> {
  await initFreeTimeWindowsTable();
  const dateStr = slotStart.toISOString().split('T')[0];
  const sh = slotStart.getHours().toString().padStart(2, '0');
  const sm = slotStart.getMinutes().toString().padStart(2, '0');
  const eh = slotEnd.getHours().toString().padStart(2, '0');
  const em = slotEnd.getMinutes().toString().padStart(2, '0');
  const result = await pool.query(
    `SELECT 1 FROM free_time_windows
     WHERE brand = $1
       AND date = $2::date
       AND win_start <= $3::time
       AND win_end   >= $4::time`,
    [brand, dateStr, `${sh}:${sm}`, `${eh}:${em}`]
  );
  return (result.rowCount ?? 0) > 0;
}

export async function listBugTickets(filters: {
  status?: string;
  category?: string;
  brand?: string;
  q?: string;
  limit?: number;
}): Promise<BugTicketRow[]> {
  await initBugTicketsTable();
  const { status, category, brand, q, limit = 200 } = filters;
  const result = await pool.query(
    `SELECT ticket_id        AS "ticketId",
            category,
            reporter_email   AS "reporterEmail",
            description,
            url,
            brand,
            status,
            created_at       AS "createdAt",
            resolved_at      AS "resolvedAt",
            resolution_note  AS "resolutionNote",
            screenshots_json AS "screenshots",
            fixed_in_pr      AS "fixedInPr",
            fixed_at         AS "fixedAt"
     FROM bugs.bug_tickets
     WHERE ($1::text IS NULL OR brand = $1)
       AND ($2::text IS NULL OR status = $2)
       AND ($3::text IS NULL OR category = $3)
       AND ($4::text IS NULL OR ticket_id ILIKE '%' || $4 || '%'
                              OR reporter_email ILIKE '%' || $4 || '%')
     ORDER BY created_at DESC
     LIMIT $5`,
    [brand ?? null, status ?? null, category ?? null, q ?? null, limit]
  );
  return result.rows;
}

// ── Homepage Content (hero + startseite) ─────────────────────────────────────

export interface HomepageHero {
  title: string;
  subtitle: string;
  tagline: string;
}

export interface WhyMePoint {
  title: string;
  text: string;
  iconPath?: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface HomepageContent {
  hero: HomepageHero;
  stats: StatItem[];
  servicesHeadline: string;
  servicesSubheadline: string;
  whyMeHeadline: string;
  whyMeIntro: string;
  whyMePoints: WhyMePoint[];
  avatarType?: 'image' | 'initials';
  avatarSrc?: string;
  avatarInitials?: string;
  quote: string;
  quoteName: string;
}

export async function getHomepageContent(brand: string): Promise<HomepageContent | null> {
  const raw = await getSiteSetting(brand, 'homepage');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveHomepageContent(brand: string, data: HomepageContent): Promise<void> {
  await setSiteSetting(brand, 'homepage', JSON.stringify(data));
}

// ── Über mich Content ─────────────────────────────────────────────────────────

export interface UebermichSection {
  title: string;
  content: string;
}

export interface UebermichMilestone {
  year: string;
  title: string;
  desc: string;
}

export interface UebermichNotDoing {
  title: string;
  text: string;
}

export interface UebermichContent {
  pageHeadline: string;
  subheadline: string;
  introParagraphs: string[];
  sections: UebermichSection[];
  milestones: UebermichMilestone[];
  notDoing: UebermichNotDoing[];
  privateText: string;
}

export async function getUebermichContent(brand: string): Promise<UebermichContent | null> {
  const raw = await getSiteSetting(brand, 'uebermich');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveUebermichContent(brand: string, data: UebermichContent): Promise<void> {
  await setSiteSetting(brand, 'uebermich', JSON.stringify(data));
}

// ── FAQ Content ───────────────────────────────────────────────────────────────

export interface FaqItem {
  question: string;
  answer: string;
}

export async function getFaqContent(brand: string): Promise<FaqItem[] | null> {
  const raw = await getSiteSetting(brand, 'faq');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveFaqContent(brand: string, items: FaqItem[]): Promise<void> {
  await setSiteSetting(brand, 'faq', JSON.stringify(items));
}

// ── Kontakt Content ───────────────────────────────────────────────────────────

export interface KontaktContent {
  intro: string;
  sidebarTitle: string;
  sidebarText: string;
  sidebarCta: string;
  showPhone: boolean;
  footerEmail?: string;
  footerPhone?: string;
  footerCity?: string;
  footerTagline?: string;
}

export async function getKontaktContent(brand: string): Promise<KontaktContent | null> {
  const raw = await getSiteSetting(brand, 'kontakt');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

export async function saveKontaktContent(brand: string, data: KontaktContent): Promise<void> {
  await setSiteSetting(brand, 'kontakt', JSON.stringify(data));
}

// ── Admin Shortcuts ──────────────────────────────────────────────────────────

export interface AdminShortcut {
  id: string;
  url: string;
  label: string;
  sortOrder: number;
  createdAt: Date;
}

async function initAdminShortcutsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_shortcuts (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      url        TEXT NOT NULL,
      label      TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function listAdminShortcuts(): Promise<AdminShortcut[]> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `SELECT id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"
     FROM admin_shortcuts
     ORDER BY created_at ASC`
  );
  return result.rows;
}

export async function createAdminShortcut(url: string, label: string): Promise<AdminShortcut> {
  await initAdminShortcutsTable();
  const result = await pool.query(
    `INSERT INTO admin_shortcuts (url, label)
     VALUES ($1, $2)
     RETURNING id, url, label, sort_order AS "sortOrder", created_at AS "createdAt"`,
    [url, label]
  );
  return result.rows[0];
}

export async function deleteAdminShortcut(id: string): Promise<void> {
  await initAdminShortcutsTable();
  await pool.query('DELETE FROM admin_shortcuts WHERE id = $1', [id]);
}

// ── DSGVO Audit Log ──────────────────────────────────────────────────────────

async function initDsgvoAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dsgvo_audit_log (
      id         BIGSERIAL PRIMARY KEY,
      type       TEXT        NOT NULL,
      name       TEXT        NOT NULL,
      email      TEXT        NOT NULL,
      ip_address TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deadline   TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (created_at + INTERVAL '30 days') STORED
    )
  `);
}

export async function insertDsgvoRequest(params: {
  type: string;
  name: string;
  email: string;
  ipAddress?: string;
}): Promise<void> {
  await initDsgvoAuditTable();
  await pool.query(
    `INSERT INTO dsgvo_audit_log (type, name, email, ip_address)
     VALUES ($1, $2, $3, $4)`,
    [params.type, params.name, params.email, params.ipAddress ?? null]
  );
}

// ── Invoice Counter ────────────────────────────────────────────────────────────

let invoiceCountersReady = false;
async function initInvoiceCountersTable(): Promise<void> {
  if (invoiceCountersReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS invoice_counters (
      brand   TEXT NOT NULL,
      year    INT  NOT NULL,
      kind    TEXT NOT NULL DEFAULT 'invoice',
      counter INT  NOT NULL DEFAULT 0,
      PRIMARY KEY (brand, year, kind)
    )
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='invoice_counters' AND column_name='kind'
      ) THEN
        ALTER TABLE invoice_counters ADD COLUMN kind TEXT NOT NULL DEFAULT 'invoice';
        ALTER TABLE invoice_counters DROP CONSTRAINT invoice_counters_pkey;
        ALTER TABLE invoice_counters ADD PRIMARY KEY (brand, year, kind);
      END IF;
    END $$
  `);
  invoiceCountersReady = true;
}

export async function getNextInvoiceNumber(brand: string, kind: 'invoice' | 'gutschrift' = 'invoice'): Promise<string> {
  await initInvoiceCountersTable();
  const year = new Date().getFullYear();
  const result = await pool.query<{ counter: number }>(
    `INSERT INTO invoice_counters (brand, year, kind, counter)
     VALUES ($1, $2, $3, 1)
     ON CONFLICT (brand, year, kind)
     DO UPDATE SET counter = invoice_counters.counter + 1
     RETURNING counter`,
    [brand, year, kind]
  );
  const n = result.rows[0].counter;
  const prefix = kind === 'gutschrift' ? 'GS' : 'RE';
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

export async function seedInvoiceCounter(
  brand: string, year: number, value: number
): Promise<void> {
  await initInvoiceCountersTable();
  await pool.query(
    `INSERT INTO invoice_counters (brand, year, counter)
     VALUES ($1, $2, $3)
     ON CONFLICT (brand, year) DO NOTHING`,
    [brand, year, value]
  );
}

// ── Brett ────────────────────────────────────────────────────────────────────

// Atomically claim the right to post the brett link for a meeting exactly once.
// Returns true if this caller won the claim (and should post), false if already posted.
export async function claimBrettLinkPost(meetingId: string): Promise<boolean> {
  const result = await pool.query(
    `UPDATE meetings
        SET brett_link_posted_at = now()
      WHERE id = $1 AND brett_link_posted_at IS NULL
      RETURNING id`,
    [meetingId]
  );
  return result.rowCount === 1;
}

// ── Staleness Reports ────────────────────────────────────────────────────────

export interface StalenessReport {
  id: number;
  createdAt: string;
  reportJson: Record<string, unknown>;
  summary: string;
  issueCount: number;
}

export async function saveStalenessReport(params: {
  reportJson: unknown;
  summary: string;
  issueCount: number;
}): Promise<void> {
  await pool.query(
    `INSERT INTO staleness_reports (report_json, summary, issue_count) VALUES ($1, $2, $3)`,
    [JSON.stringify(params.reportJson), params.summary, params.issueCount]
  );
}

export async function getLatestStalenessReport(): Promise<StalenessReport | null> {
  const result = await pool.query(
    `SELECT id, created_at, report_json, summary, issue_count
       FROM staleness_reports ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    createdAt: row.created_at.toISOString(),
    reportJson: row.report_json,
    summary: row.summary,
    issueCount: row.issue_count,
  };
}

// ── Test Runs ────────────────────────────────────────────────────────────────

export interface TestRun {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'done' | 'error';
  pass: number | null;
  fail: number | null;
  skip: number | null;
  durationMs: number | null;
}

async function initTestRunsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_runs (
      id           TEXT PRIMARY KEY,
      tier         TEXT NOT NULL,
      test_ids     TEXT,
      cluster      TEXT NOT NULL,
      started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      finished_at  TIMESTAMPTZ,
      status       TEXT NOT NULL DEFAULT 'running',
      pass         INT,
      fail         INT,
      skip         INT,
      duration_ms  INT
    )
  `);
}

export async function saveTestRun(params: {
  id: string;
  tier: string;
  testIds: string | null;
  cluster: string;
}): Promise<void> {
  await initTestRunsTable();
  await pool.query(
    `INSERT INTO test_runs (id, tier, test_ids, cluster) VALUES ($1, $2, $3, $4)`,
    [params.id, params.tier, params.testIds, params.cluster]
  );
}

export async function updateTestRun(params: {
  id: string;
  status: 'done' | 'error';
  pass: number;
  fail: number;
  skip: number;
  durationMs: number;
}): Promise<void> {
  await pool.query(
    `UPDATE test_runs
     SET status = $2, finished_at = now(), pass = $3, fail = $4, skip = $5, duration_ms = $6
     WHERE id = $1`,
    [params.id, params.status, params.pass, params.fail, params.skip, params.durationMs]
  );
}

export async function listTestRuns(limit = 20): Promise<TestRun[]> {
  await initTestRunsTable();
  const result = await pool.query(
    `SELECT id, tier, test_ids AS "testIds", cluster,
            started_at AS "startedAt", finished_at AS "finishedAt",
            status, pass, fail, skip, duration_ms AS "durationMs"
     FROM test_runs ORDER BY started_at DESC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

// ── Playwright Reports ───────────────────────────────────────────────────────

export interface PlaywrightReport {
  id: number;
  createdAt: string;
  html: string;
}

async function initPlaywrightReportsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS playwright_reports (
      id         SERIAL PRIMARY KEY,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      html       TEXT NOT NULL
    )
  `);
}

export async function savePlaywrightReport(html: string): Promise<number> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `INSERT INTO playwright_reports (html) VALUES ($1) RETURNING id`,
    [html]
  );
  // Keep only last 5
  await pool.query(
    `DELETE FROM playwright_reports WHERE id NOT IN (
       SELECT id FROM playwright_reports ORDER BY created_at DESC LIMIT 5
     )`
  );
  return result.rows[0].id;
}

export async function getLatestPlaywrightReport(): Promise<PlaywrightReport | null> {
  await initPlaywrightReportsTable();
  const result = await pool.query(
    `SELECT id, created_at AS "createdAt", html
     FROM playwright_reports ORDER BY created_at DESC LIMIT 1`
  );
  if (result.rows.length === 0) return null;
  return {
    id: result.rows[0].id,
    createdAt: result.rows[0].createdAt.toISOString(),
    html: result.rows[0].html,
  };
}

// ── Custom Website Sections ────────────────────────────────────────────────

export interface CustomSectionField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'url';
  required: boolean;
}

export interface CustomSection {
  id: string;
  slug: string;
  title: string;
  sort_order: number;
  fields: CustomSectionField[];
  content: Record<string, string>;
  created_at: Date;
  updated_at: Date;
}

let customSectionsReady = false;
// NOTE: Custom sections are not brand-scoped (unlike other content tables).
// This is intentional for the current single-brand deployment. If multi-brand
// support is needed, add a brand TEXT column and filter all queries accordingly.
async function initCustomSectionsTable(): Promise<void> {
  if (customSectionsReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS website_custom_sections (
      id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
      slug        TEXT        UNIQUE NOT NULL,
      title       TEXT        NOT NULL,
      sort_order  INT         NOT NULL DEFAULT 0,
      fields      JSONB       NOT NULL DEFAULT '[]',
      content     JSONB       NOT NULL DEFAULT '{}',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  customSectionsReady = true;
}

export async function listCustomSections(): Promise<CustomSection[]> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections ORDER BY sort_order ASC, created_at ASC`
  );
  return r.rows;
}

export async function getCustomSection(slug: string): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `SELECT id, slug, title, sort_order, fields, content, created_at, updated_at
     FROM website_custom_sections WHERE slug = $1`,
    [slug]
  );
  return r.rows[0] ?? null;
}

export async function createCustomSection(params: {
  slug: string;
  title: string;
  fields: CustomSectionField[];
}): Promise<CustomSection> {
  await initCustomSectionsTable();
  const r = await pool.query<CustomSection>(
    `INSERT INTO website_custom_sections (slug, title, fields)
     VALUES ($1, $2, $3)
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    [params.slug, params.title, JSON.stringify(params.fields)]
  );
  return r.rows[0];
}

export async function updateCustomSection(slug: string, params: {
  title?: string;
  fields?: CustomSectionField[];
  content?: Record<string, string>;
  sort_order?: number;
}): Promise<CustomSection | null> {
  await initCustomSectionsTable();
  const sets: string[] = ['updated_at = now()'];
  const vals: unknown[] = [];
  if (params.title !== undefined) { vals.push(params.title); sets.push(`title = $${vals.length}`); }
  if (params.fields !== undefined) { vals.push(JSON.stringify(params.fields)); sets.push(`fields = $${vals.length}`); }
  if (params.content !== undefined) { vals.push(JSON.stringify(params.content)); sets.push(`content = $${vals.length}`); }
  if (params.sort_order !== undefined) { vals.push(params.sort_order); sets.push(`sort_order = $${vals.length}`); }
  if (vals.length === 0) return getCustomSection(slug);
  vals.push(slug);
  const r = await pool.query<CustomSection>(
    `UPDATE website_custom_sections SET ${sets.join(', ')}
     WHERE slug = $${vals.length}
     RETURNING id, slug, title, sort_order, fields, content, created_at, updated_at`,
    vals
  );
  return r.rows[0] ?? null;
}

export async function deleteCustomSection(slug: string): Promise<void> {
  await initCustomSectionsTable();
  await pool.query('DELETE FROM website_custom_sections WHERE slug = $1', [slug]);
}

// ── Billing Tables ───────────────────────────────────────────────────────────

async function initBillingAuditTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      invoice_id    TEXT NOT NULL REFERENCES billing_invoices(id),
      action        TEXT NOT NULL,
      actor_user_id TEXT,
      actor_email   TEXT,
      from_status   TEXT,
      to_status     TEXT,
      reason        TEXT,
      metadata      JSONB,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_audit_invoice ON billing_audit_log(invoice_id, created_at DESC)`);
}

async function installInvoiceImmutabilityTriggers(): Promise<void> {
  try {
    await installInvoiceImmutabilityTriggersInner();
  } catch (err) {
    // 42501 = insufficient_privilege. Triggers/functions exist from a prior
    // deploy under a different role (e.g. postgres superuser); current role
    // can't replace them but they enforce the same invariants. Leaving them
    // alone is correct — `initBillingTables` runs on every billing call so a
    // hard error here would break the entire billing API in production.
    if ((err as { code?: string } | null)?.code === '42501') return;
    throw err;
  }
}

async function installInvoiceImmutabilityTriggersInner(): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_immutable() RETURNS trigger AS $fn$
    BEGIN
      IF OLD.locked = true THEN
        IF NEW.net_amount   IS DISTINCT FROM OLD.net_amount   OR
           NEW.tax_rate     IS DISTINCT FROM OLD.tax_rate     OR
           NEW.tax_amount   IS DISTINCT FROM OLD.tax_amount   OR
           NEW.gross_amount IS DISTINCT FROM OLD.gross_amount OR
           NEW.tax_mode     IS DISTINCT FROM OLD.tax_mode     OR
           NEW.customer_id  IS DISTINCT FROM OLD.customer_id  OR
           NEW.issue_date   IS DISTINCT FROM OLD.issue_date   OR
           NEW.due_date     IS DISTINCT FROM OLD.due_date     OR
           NEW.number       IS DISTINCT FROM OLD.number       OR
           NEW.brand        IS DISTINCT FROM OLD.brand        OR
           (OLD.hash_sha256 IS NOT NULL AND NEW.hash_sha256 IS DISTINCT FROM OLD.hash_sha256)
        THEN
          RAISE EXCEPTION 'GoBD: locked invoice % cannot be modified', OLD.id;
        END IF;
      END IF;
      RETURN NEW;
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_invoices_no_delete() RETURNS trigger AS $fn$
    BEGIN
      IF OLD.locked = true THEN
        RAISE EXCEPTION 'GoBD: locked invoice % cannot be deleted', OLD.id;
      END IF;
      RETURN OLD;
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`
    CREATE OR REPLACE FUNCTION billing_lines_immutable() RETURNS trigger AS $fn$
    DECLARE inv_locked boolean;
    BEGIN
      SELECT locked INTO inv_locked FROM billing_invoices
        WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
      IF inv_locked = true THEN
        RAISE EXCEPTION 'GoBD: cannot modify lines of locked invoice %', COALESCE(NEW.invoice_id, OLD.invoice_id);
      END IF;
      RETURN COALESCE(NEW, OLD);
    END $fn$ LANGUAGE plpgsql;
  `);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_immutable_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_immutable_trg
    BEFORE UPDATE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_immutable()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_invoices_no_delete_trg ON billing_invoices`);
  await pool.query(`CREATE TRIGGER billing_invoices_no_delete_trg
    BEFORE DELETE ON billing_invoices
    FOR EACH ROW EXECUTE FUNCTION billing_invoices_no_delete()`);
  await pool.query(`DROP TRIGGER IF EXISTS billing_lines_immutable_trg ON billing_invoice_line_items`);
  await pool.query(`CREATE TRIGGER billing_lines_immutable_trg
    BEFORE INSERT OR UPDATE OR DELETE ON billing_invoice_line_items
    FOR EACH ROW EXECUTE FUNCTION billing_lines_immutable()`);
}

let billingTablesReady = false;
export async function initBillingTables(): Promise<void> {
  if (billingTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_customers (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT NOT NULL,
      company       TEXT,
      address_line1 TEXT,
      city          TEXT,
      postal_code   TEXT,
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
      vat_number    TEXT,
      sepa_iban     TEXT,
      sepa_bic      TEXT,
      sepa_mandate_ref  TEXT,
      sepa_mandate_date DATE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      typ           TEXT NOT NULL DEFAULT 'Kunde',
      CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ)
    )
  `);
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS default_leitweg_id TEXT`);
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name='billing_customers' AND column_name='country'
      ) THEN
        ALTER TABLE billing_customers RENAME COLUMN country TO land_iso;
      END IF;
    END $$
  `);
  await pool.query(`
    ALTER TABLE billing_customers
      ADD COLUMN IF NOT EXISTS typ TEXT NOT NULL DEFAULT 'Kunde'
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_typ_chk'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_typ_chk CHECK (typ IN ('Kunde'));
      END IF;
      IF EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_key'
      ) THEN
        ALTER TABLE billing_customers DROP CONSTRAINT billing_customers_brand_email_key;
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_customers_brand_email_typ_key'
      ) THEN
        ALTER TABLE billing_customers
          ADD CONSTRAINT billing_customers_brand_email_typ_key UNIQUE (brand, email, typ);
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoices (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES billing_customers(id),
      issue_date    DATE NOT NULL,
      due_date      DATE NOT NULL,
      service_period_start DATE,
      service_period_end   DATE,
      tax_mode      TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      tax_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      payment_reference TEXT,
      paid_at       TIMESTAMPTZ,
      paid_amount   NUMERIC(12,2),
      locked        BOOLEAN NOT NULL DEFAULT false,
      cancels_invoice_id TEXT REFERENCES billing_invoices(id),
      retain_until  DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '10 years'),
      pdf_path      TEXT,
      zugferd_xml   TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS leitweg_id TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS factur_x_xml TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS xrechnung_xml TEXT`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS pdf_a3_blob BYTEA`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validated_at TIMESTAMPTZ`);
  await pool.query(`ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS einvoice_validation_report JSONB`);
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'regular',
      ADD COLUMN IF NOT EXISTS parent_invoice_id TEXT REFERENCES billing_invoices(id),
      ADD COLUMN IF NOT EXISTS dunning_level SMALLINT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS last_dunning_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'EUR',
      ADD COLUMN IF NOT EXISTS currency_rate NUMERIC(12,6),
      ADD COLUMN IF NOT EXISTS net_amount_eur  NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS gross_amount_eur NUMERIC(12,2),
      ADD COLUMN IF NOT EXISTS supply_type     TEXT
  `);
  await pool.query(`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_invoices_kind_chk'
      ) THEN
        ALTER TABLE billing_invoices
          ADD CONSTRAINT billing_invoices_kind_chk
          CHECK (kind IN ('regular','prepayment','final','gutschrift'));
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname='billing_invoices_dunning_chk'
      ) THEN
        ALTER TABLE billing_invoices
          ADD CONSTRAINT billing_invoices_dunning_chk
          CHECK (dunning_level BETWEEN 0 AND 3);
      END IF;
    END $$
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_dunnings (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      invoice_id    TEXT NOT NULL REFERENCES billing_invoices(id),
      brand         TEXT NOT NULL,
      level         SMALLINT NOT NULL,
      generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      sent_at       TIMESTAMPTZ,
      sent_by       TEXT,
      fee_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      interest_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
      outstanding_at_generation NUMERIC(12,2) NOT NULL,
      pdf_path      TEXT,
      UNIQUE (invoice_id, level)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_line_items (
      id          BIGSERIAL PRIMARY KEY,
      invoice_id  TEXT NOT NULL REFERENCES billing_invoices(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      quantity    NUMERIC(10,2) NOT NULL DEFAULT 1,
      unit        TEXT,
      unit_price  NUMERIC(12,2) NOT NULL,
      net_amount  NUMERIC(12,2) NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_invoice_payments (
      id           BIGSERIAL PRIMARY KEY,
      invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
      brand        TEXT NOT NULL,
      paid_at      DATE NOT NULL,
      amount       NUMERIC(12,2) NOT NULL CHECK (amount <> 0),
      method       TEXT NOT NULL,
      reference    TEXT,
      recorded_by  TEXT NOT NULL,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_invoice_payments_invoice_idx
      ON billing_invoice_payments (invoice_id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_quotes (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      number        TEXT NOT NULL UNIQUE,
      status        TEXT NOT NULL DEFAULT 'draft',
      customer_id   TEXT NOT NULL REFERENCES billing_customers(id),
      issue_date    DATE NOT NULL,
      valid_until   DATE,
      net_amount    NUMERIC(12,2) NOT NULL,
      tax_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      notes         TEXT,
      converted_to_invoice_id TEXT REFERENCES billing_invoices(id),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE billing_invoices
      ADD COLUMN IF NOT EXISTS hash_sha256    TEXT,
      ADD COLUMN IF NOT EXISTS pdf_blob       BYTEA,
      ADD COLUMN IF NOT EXISTS pdf_mime       TEXT,
      ADD COLUMN IF NOT EXISTS pdf_size_bytes INTEGER,
      ADD COLUMN IF NOT EXISTS finalized_at   TIMESTAMPTZ
  `);
  await pool.query(`ALTER TABLE billing_customers ADD COLUMN IF NOT EXISTS leitweg_id VARCHAR(46)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_customers_leitweg ON billing_customers(leitweg_id) WHERE leitweg_id IS NOT NULL`);
  // Plan F: EU supply + export evidence
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_nachweis (
      id           BIGSERIAL PRIMARY KEY,
      invoice_id   TEXT NOT NULL REFERENCES billing_invoices(id),
      brand        TEXT NOT NULL,
      type         TEXT NOT NULL,
      received_at  DATE,
      document_ref TEXT,
      notes        TEXT,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Plan F: VAT ID validation log
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vat_id_validations (
      id                  BIGSERIAL PRIMARY KEY,
      customer_id         TEXT REFERENCES billing_customers(id),
      vat_id              TEXT NOT NULL,
      country_code        CHAR(2) NOT NULL,
      valid               BOOLEAN NOT NULL,
      vies_name           TEXT,
      vies_address        TEXT,
      request_identifier  TEXT,
      validated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS billing_suppliers (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      name          TEXT NOT NULL,
      email         TEXT,
      land_iso      CHAR(2) NOT NULL DEFAULT 'DE',
      ustidnr       TEXT,
      steuernummer  TEXT,
      iban          TEXT,
      bic           TEXT,
      bank_name     TEXT,
      address       TEXT,
      typ           TEXT DEFAULT 'Lieferant',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CONSTRAINT billing_suppliers_brand_name_key UNIQUE (brand, name)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS supplier_invoices (
      id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
      brand         TEXT NOT NULL,
      supplier_id   TEXT NOT NULL REFERENCES billing_suppliers(id),
      invoice_number TEXT,
      invoice_date  DATE NOT NULL,
      leistungsdatum DATE,
      net_amount    NUMERIC(12,2) NOT NULL,
      vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      gross_amount  NUMERIC(12,2) NOT NULL,
      vat_rate      NUMERIC(5,2)  NOT NULL DEFAULT 0,
      currency      CHAR(3) NOT NULL DEFAULT 'EUR',
      description   TEXT,
      pdf_path      TEXT,
      status        TEXT NOT NULL DEFAULT 'open',
      paid_at       DATE,
      locked        BOOLEAN NOT NULL DEFAULT false,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Plan F: indexes for new child tables
  await pool.query(`
    CREATE INDEX IF NOT EXISTS billing_nachweis_invoice_idx
      ON billing_nachweis (invoice_id)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS vat_id_validations_customer_idx
      ON vat_id_validations (customer_id)
      WHERE customer_id IS NOT NULL
  `);
  // Plan F: billing_invoice_payments — rate at payment time
  await pool.query(`
    ALTER TABLE billing_invoice_payments
      ADD COLUMN IF NOT EXISTS payment_currency_rate NUMERIC(12,6)
  `);
  await initBillingAuditTable();
  await installInvoiceImmutabilityTriggers();
  billingTablesReady = true;
}

let taxModeTableReady = false;
export async function initTaxMonitorTables(): Promise<void> {
  if (taxModeTableReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tax_mode_changes (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT NOT NULL,
      changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      from_mode     TEXT NOT NULL,
      to_mode       TEXT NOT NULL,
      trigger_invoice_id TEXT,
      year_revenue_at_change NUMERIC(12,2),
      notes         TEXT
    )
  `);
  taxModeTableReady = true;
}

let eurTablesReady = false;
export async function initEurTables(): Promise<void> {
  if (eurTablesReady) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS eur_bookings (
      id            BIGSERIAL PRIMARY KEY,
      brand         TEXT NOT NULL,
      booking_date  DATE NOT NULL,
      type          TEXT NOT NULL,
      category      TEXT NOT NULL,
      description   TEXT NOT NULL,
      net_amount    NUMERIC(12,2) NOT NULL,
      vat_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
      invoice_id    TEXT REFERENCES billing_invoices(id),
      receipt_path  TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await pool.query(`
    ALTER TABLE eur_bookings
      ADD COLUMN IF NOT EXISTS belegnummer TEXT,
      ADD COLUMN IF NOT EXISTS skr_konto   TEXT
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assets (
      id                   BIGSERIAL PRIMARY KEY,
      brand                TEXT NOT NULL,
      description          TEXT NOT NULL,
      purchase_date        DATE NOT NULL,
      net_purchase_price   NUMERIC(12,2) NOT NULL,
      vat_paid             NUMERIC(12,2) NOT NULL,
      useful_life_months   INT NOT NULL,
      correction_start_date DATE,
      is_gwg               BOOLEAN NOT NULL DEFAULT false,
      receipt_path         TEXT,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  eurTablesReady = true;
}
