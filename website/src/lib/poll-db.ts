import pg from 'pg';
import { resolve4 } from 'dns';
const { Pool } = pg;

const DB_URL = process.env.SESSIONS_DATABASE_URL
  || 'postgresql://website:devwebsitedb@shared-db.workspace.svc.cluster.local:5432/website';

function nodeLookup(
  hostname: string,
  _opts: unknown,
  cb: (err: Error | null, addr: string, family: number) => void,
) {
  resolve4(hostname, (err, addrs) => cb(err ?? null, addrs?.[0] ?? '', 4));
}

const pool = new Pool({ connectionString: DB_URL, lookup: nodeLookup } as unknown as import('pg').PoolConfig);

// ── Types ─────────────────────────────────────────────────────────────────────

export type PollKind = 'multiple_choice' | 'text';
export type PollStatus = 'open' | 'locked';

export interface Poll {
  id: string;
  question: string;
  kind: PollKind;
  options: string[] | null;
  status: PollStatus;
  room_tokens: string[];
  created_at: Date;
  locked_at: Date | null;
}

export interface PollTemplate {
  label: string;
  question: string;
  kind: PollKind;
  options: string[] | null;
}

export interface AnswerCount {
  answer: string;
  count: number;
}

export interface PollResults {
  poll: Poll;
  total: number;
  counts: AnswerCount[];
}

// ── Templates (source of truth for the admin UI) ──────────────────────────────

export const POLL_TEMPLATES: PollTemplate[] = [
  {
    label: 'Wie fühlen Sie sich gerade?',
    question: 'Wie fühlen Sie sich gerade?',
    kind: 'multiple_choice',
    options: ['\u{1F60A} Gut', '\u{1F610} Mittel', '\u{1F614} Nicht so gut'],
  },
  {
    label: 'Stimmen Sie zu?',
    question: 'Stimmen Sie zu?',
    kind: 'multiple_choice',
    options: ['Ja', 'Nein', 'Enthaltung'],
  },
  {
    label: 'Wie hilfreich war diese Session?',
    question: 'Wie hilfreich war diese Session?',
    kind: 'multiple_choice',
    options: ['Sehr hilfreich', 'Hilfreich', 'Wenig hilfreich', 'Nicht hilfreich'],
  },
  {
    label: 'Bereit für den nächsten Schritt?',
    question: 'Bereit für den nächsten Schritt?',
    kind: 'multiple_choice',
    options: ['Ja', 'Noch nicht', 'Brauche mehr Info'],
  },
  {
    label: 'Was nehmen Sie mit?',
    question: 'Was nehmen Sie mit?',
    kind: 'text',
    options: null,
  },
];

// ── DB Helpers ─────────────────────────────────────────────────────────────────

export async function createPoll(
  question: string,
  kind: PollKind,
  options: string[] | null,
  roomTokens: string[],
): Promise<Poll> {
  const { rows } = await pool.query<Poll>(
    `INSERT INTO polls (question, kind, options, room_tokens)
     VALUES ($1, $2, $3, $4)
     RETURNING id, question, kind, options, status, room_tokens, created_at, locked_at`,
    [question, kind, options, roomTokens],
  );
  return rows[0];
}

export async function getActivePoll(): Promise<Poll | null> {
  const { rows } = await pool.query<Poll>(
    `SELECT id, question, kind, options, status, room_tokens, created_at, locked_at
       FROM polls WHERE status = 'open'
       ORDER BY created_at DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

export async function getPoll(id: string): Promise<Poll | null> {
  const { rows } = await pool.query<Poll>(
    `SELECT id, question, kind, options, status, room_tokens, created_at, locked_at
       FROM polls WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

export async function submitAnswer(pollId: string, answer: string): Promise<void> {
  await pool.query(
    'INSERT INTO poll_answers (poll_id, answer) VALUES ($1, $2)',
    [pollId, answer],
  );
}

export async function getResults(pollId: string): Promise<PollResults | null> {
  const poll = await getPoll(pollId);
  if (!poll) return null;

  const { rows } = await pool.query<{ answer: string; count: string }>(
    `SELECT answer, COUNT(*)::text AS count
       FROM poll_answers WHERE poll_id = $1
       GROUP BY answer ORDER BY count DESC, answer ASC`,
    [pollId],
  );

  const rawCounts: AnswerCount[] = rows.map(r => ({
    answer: r.answer,
    count: parseInt(r.count, 10),
  }));
  const total = rawCounts.reduce((s, r) => s + r.count, 0);

  // MC polls: preserve option order and include zero-count options
  const counts: AnswerCount[] =
    poll.kind === 'multiple_choice' && poll.options
      ? poll.options.map(opt => ({
          answer: opt,
          count: rawCounts.find(r => r.answer === opt)?.count ?? 0,
        }))
      : rawCounts;

  return { poll, total, counts };
}

export async function lockPoll(id: string): Promise<Poll | null> {
  const { rows } = await pool.query<Poll>(
    `UPDATE polls SET status = 'locked', locked_at = now()
       WHERE id = $1 AND status = 'open'
       RETURNING id, question, kind, options, status, room_tokens, created_at, locked_at`,
    [id],
  );
  return rows[0] ?? null;
}

// ── Pure Helpers ───────────────────────────────────────────────────────────────

export function buildResultsBotMessage(results: PollResults, resultsUrl: string): string {
  const { poll, total, counts } = results;
  if (poll.kind === 'multiple_choice') {
    const breakdown = counts.map(c => `${c.answer}: ${c.count}`).join(' | ');
    return `\u{1F4CA} Umfrageergebnis: „${poll.question}"\n${breakdown}\n→ ${resultsUrl}`;
  }
  return `\u{1F4CA} Umfrageergebnis: „${poll.question}"\n${total} Antworten · Details: ${resultsUrl}`;
}
