/**
 * meetings-db.ts — Meeting Knowledge Pipeline DB-Schicht
 *
 * Extracted from website-db.ts (G-SIZE03 / T001293).
 * Manages meeting lifecycle, transcripts, artifacts and insights.
 * Note: assignMeeting stays in website-db.ts because it calls upsertCustomer.
 */

import { pool } from './db-pool';
import { initTicketsSchema } from './tickets-schema';

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

/** Exported so that website-db.ts can call it for meeting-project cross-domain functions. */
export async function initMeetingProjectLink(): Promise<void> {
  await initTicketsSchema(); // tickets.tickets must exist before the FK column
  await pool.query(`
    ALTER TABLE meetings
      ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES tickets.tickets(id) ON DELETE SET NULL
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
           m.project_id as "projectId", p.title as "projectName"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN tickets.tickets p ON m.project_id = p.id
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
           p.title AS "projectName", p.id AS "projectId",
           EXISTS(SELECT 1 FROM transcripts t WHERE t.meeting_id = m.id) AS "hasTranscript",
           (SELECT COUNT(*) FROM meeting_artifacts a WHERE a.meeting_id = m.id)::int AS "artifactCount"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN tickets.tickets p ON m.project_id = p.id
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
           p.title AS "projectName", p.id AS "projectId"
    FROM meetings m
    JOIN customers c ON m.customer_id = c.id
    LEFT JOIN tickets.tickets p ON m.project_id = p.id
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
