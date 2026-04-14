// Meeting Knowledge Pipeline — PostgreSQL client.
// Writes meeting data, transcripts, artifacts, and embeddings to the meetings DB.
// Uses the 'pg' npm package for direct database access.

import pg from 'pg';
const { Pool } = pg;

const MEETINGS_DB_URL = process.env.MEETINGS_DATABASE_URL
  || 'postgresql://meetings:devmeetingsdb@shared-db.workspace.svc.cluster.local:5432/meetings';
const EMBEDDING_URL = process.env.EMBEDDING_URL
  || 'http://embedding.workspace.svc.cluster.local:8080';

const pool = new Pool({ connectionString: MEETINGS_DB_URL });

// ── Customer ────────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  name: string;
  email: string;
}

export async function upsertCustomer(params: {
  name: string;
  email: string;
  phone?: string;
  company?: string;
  outlineCollectionId?: string;
  mattermostChannelId?: string;
  keycloakUserId?: string;
}): Promise<Customer> {
  const result = await pool.query(
    `INSERT INTO customers (name, email, phone, company, outline_collection_id, mattermost_channel_id, keycloak_user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       phone = COALESCE(EXCLUDED.phone, customers.phone),
       company = COALESCE(EXCLUDED.company, customers.company),
       outline_collection_id = COALESCE(EXCLUDED.outline_collection_id, customers.outline_collection_id),
       mattermost_channel_id = COALESCE(EXCLUDED.mattermost_channel_id, customers.mattermost_channel_id),
       keycloak_user_id = COALESCE(EXCLUDED.keycloak_user_id, customers.keycloak_user_id),
       updated_at = now()
     RETURNING id, name, email`,
    [params.name, params.email, params.phone, params.company,
     params.outlineCollectionId, params.mattermostChannelId, params.keycloakUserId]
  );
  return result.rows[0];
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

// ── Meeting ─────────────────────────────────────────────────────────────────

export interface Meeting {
  id: string;
  customerId: string;
  status: string;
  released_at: Date | null;
}

export async function createMeeting(params: {
  customerId: string;
  meetingType: string;
  scheduledAt?: Date;
  talkRoomToken?: string;
}): Promise<Meeting> {
  const result = await pool.query(
    `INSERT INTO meetings (customer_id, meeting_type, scheduled_at, talk_room_token, status)
     VALUES ($1, $2, $3, $4, 'scheduled')
     RETURNING id, customer_id as "customerId", status, released_at`,
    [params.customerId, params.meetingType, params.scheduledAt, params.talkRoomToken]
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
  outlineDocumentId?: string;
}): Promise<string> {
  const result = await pool.query(
    `INSERT INTO meeting_insights (meeting_id, insight_type, content, generated_by, outline_document_id)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [params.meetingId, params.insightType, params.content,
     params.generatedBy || 'system', params.outlineDocumentId]
  );
  return result.rows[0].id;
}

// ── Embeddings ──────────────────────────────────────────────────────────────

async function generateEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${EMBEDDING_URL}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: [text],
        model: 'BAAI/bge-base-en-v1.5',
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.data?.[0]?.embedding || null;
  } catch {
    return null;
  }
}

export async function generateMeetingEmbeddings(meetingId: string): Promise<number> {
  let count = 0;

  // Embed full transcript
  const transcripts = await pool.query(
    'SELECT id, full_text FROM transcripts WHERE meeting_id = $1', [meetingId]
  );
  for (const t of transcripts.rows) {
    const embedding = await generateEmbedding(t.full_text.substring(0, 8000));
    if (embedding) {
      await pool.query(
        `INSERT INTO meeting_embeddings (source_type, source_id, content_preview, embedding, model)
         VALUES ('transcript', $1, $2, $3::vector, 'BAAI/bge-base-en-v1.5')`,
        [t.id, t.full_text.substring(0, 200), JSON.stringify(embedding)]
      );
      count++;
    }
  }

  // Embed transcript segments (in chunks of ~5 segments for context)
  const segments = await pool.query(
    `SELECT ts.id, ts.text, ts.start_time FROM transcript_segments ts
     JOIN transcripts t ON ts.transcript_id = t.id
     WHERE t.meeting_id = $1 ORDER BY ts.segment_index`, [meetingId]
  );
  const segRows = segments.rows;
  for (let i = 0; i < segRows.length; i += 5) {
    const chunk = segRows.slice(i, i + 5);
    const chunkText = chunk.map((s: { text: string }) => s.text).join(' ');
    const embedding = await generateEmbedding(chunkText);
    if (embedding) {
      await pool.query(
        `INSERT INTO meeting_embeddings (source_type, source_id, content_preview, embedding, model)
         VALUES ('segment', $1, $2, $3::vector, 'BAAI/bge-base-en-v1.5')`,
        [chunk[0].id, chunkText.substring(0, 200), JSON.stringify(embedding)]
      );
      count++;
    }
  }

  // Embed artifacts with text content
  const artifacts = await pool.query(
    'SELECT id, content_text FROM meeting_artifacts WHERE meeting_id = $1 AND content_text IS NOT NULL',
    [meetingId]
  );
  for (const a of artifacts.rows) {
    const embedding = await generateEmbedding(a.content_text.substring(0, 8000));
    if (embedding) {
      await pool.query(
        `INSERT INTO meeting_embeddings (source_type, source_id, content_preview, embedding, model)
         VALUES ('artifact', $1, $2, $3::vector, 'BAAI/bge-base-en-v1.5')`,
        [a.id, a.content_text.substring(0, 200), JSON.stringify(embedding)]
      );
      count++;
    }
  }

  return count;
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
  const query = onlyReleased
    ? `SELECT m.id, m.customer_id as "customerId", m.status, m.released_at
       FROM meetings m
       JOIN customers c ON m.customer_id = c.id
       WHERE c.email = $1 AND m.released_at IS NOT NULL
       ORDER BY m.created_at DESC`
    : `SELECT m.id, m.customer_id as "customerId", m.status, m.released_at
       FROM meetings m
       JOIN customers c ON m.customer_id = c.id
       WHERE c.email = $1
       ORDER BY m.created_at DESC`;
  const result = await pool.query(query, [clientEmail]);
  return result.rows;
}

// ── Bug Tickets ──────────────────────────────────────────────────────────────

export async function insertBugTicket(params: {
  ticketId: string;
  category: string;
  reporterEmail: string;
  description: string;
  url?: string;
  brand: string;
}): Promise<void> {
  await initBugTicketsTable();
  await pool.query(
    `INSERT INTO bug_tickets (ticket_id, category, reporter_email, description, url, brand)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (ticket_id) DO NOTHING`,
    [params.ticketId, params.category, params.reporterEmail,
     params.description, params.url ?? null, params.brand]
  );
}

export async function resolveBugTicket(ticketId: string, resolutionNote: string): Promise<void> {
  await initBugTicketsTable();
  await pool.query(
    `UPDATE bug_tickets
     SET status = 'resolved', resolved_at = NOW(), resolution_note = $2
     WHERE ticket_id = $1`,
    [ticketId, resolutionNote]
  );
}

export async function archiveBugTicket(ticketId: string): Promise<void> {
  await initBugTicketsTable();
  await pool.query(
    `UPDATE bug_tickets SET status = 'archived' WHERE ticket_id = $1`,
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
  const result = await pool.query(
    `SELECT ticket_id as "ticketId", status, category,
            created_at as "createdAt", resolved_at as "resolvedAt",
            resolution_note as "resolutionNote"
     FROM bug_tickets WHERE ticket_id = $1`,
    [ticketId]
  );
  return result.rows[0] ?? null;
}

// ── Bug Tickets Table Init ────────────────────────────────────────────────────

export async function initBugTicketsTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bug_tickets (
      ticket_id       TEXT PRIMARY KEY,
      category        TEXT NOT NULL,
      reporter_email  TEXT NOT NULL,
      description     TEXT NOT NULL,
      url             TEXT,
      brand           TEXT NOT NULL DEFAULT 'mentolder',
      status          TEXT NOT NULL DEFAULT 'open',
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      resolved_at     TIMESTAMPTZ,
      resolution_note TEXT
    )
  `);
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
            resolution_note  AS "resolutionNote"
     FROM bug_tickets
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
