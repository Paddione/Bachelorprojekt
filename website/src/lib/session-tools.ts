import type { Pool } from 'pg';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';
import { pool as defaultPool } from './website-db';
import { queryNearest } from './knowledge-db';
import type { BeatState } from './coaching-session-beats-db';
import { deserializeBeats } from './coaching-session-beats-db';

let _pool: Pool | null = null;
export function __setPoolForTests(p: Pool): void { _pool = p; }
function p(): Pool { return _pool ?? defaultPool; }

export async function getSessionStepTool(
  sessionId: string,
  stepNumber: number,
): Promise<{ found: boolean; stepName?: string; beats?: BeatState[]; aiResponse?: string; status?: string }> {
  const r = await p().query(
    `SELECT step_name, coach_inputs, status
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number = $2`,
    [sessionId, stepNumber],
  );
  if (!r.rows[0]) return { found: false };
  const row = r.rows[0];
  const beats = deserializeBeats(row.coach_inputs);
  const lastAi = [...beats].reverse().find((b) => b.aiResponse)?.aiResponse;
  return {
    found: true,
    stepName: row.step_name as string,
    beats,
    aiResponse: lastAi ?? undefined,
    status: row.status as string,
  };
}

export async function searchCoachingKnowledgeTool(
  query: string,
  limit = 4,
): Promise<{ title: string | null; body: string; source: string }[]> {
  try {
    const colsRes = await p().query(
      `SELECT knowledge_collection_id FROM coaching.books WHERE knowledge_collection_id IS NOT NULL`,
    );
    const collectionIds: string[] = colsRes.rows.map((r: { knowledge_collection_id: string }) => r.knowledge_collection_id);
    if (collectionIds.length === 0) return [];

    const chunks = await queryNearest({ collectionIds, queryText: query, limit });
    return chunks.map(c => ({
      title: c.bookTitle,
      body: c.text,
      source: `${c.collectionName}${c.page ? ` S.${c.page}` : ''}`,
    }));
  } catch {
    return [];
  }
}

export async function draftSessionReportTool(
  sessionId: string,
  _format: 'markdown' | 'structured',
): Promise<{ stepsText: string; error?: string }> {
  const r = await p().query(
    `SELECT step_number, step_name, coach_inputs
       FROM coaching.session_steps
      WHERE session_id = $1 AND step_number > 0 AND status IN ('accepted', 'skipped')
      ORDER BY step_number`,
    [sessionId],
  );
  if (r.rows.length === 0) {
    return { stepsText: '', error: 'Keine abgeschlossenen Schritte gefunden' };
  }
  const stepsText = r.rows
    .map((s: { step_number: number; step_name: string; coach_inputs: unknown }) => {
      const beats = deserializeBeats(s.coach_inputs);
      const captured = beats.map((b) => b.captured).filter(Boolean).join('; ');
      const aiParts = beats.map((b) => b.aiResponse).filter(Boolean).join('; ');
      return `## Schritt ${s.step_number}: ${s.step_name}\n**Eingaben:** ${captured || '—'}\n**KI:** ${aiParts || '—'}`;
    })
    .join('\n\n');
  return { stepsText };
}

export const SESSION_TOOLS: Tool[] = [
  {
    name: 'get_session_step',
    description: 'Retrieve the content of a specific prior coaching step by number. Use this to reference what was said or decided in an earlier step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step_number: { type: 'number', description: 'The step number (1–10) to retrieve.' },
      },
      required: ['step_number'],
    },
  },
  {
    name: 'search_coaching_knowledge',
    description: 'Search the coaching knowledge base for techniques, frameworks, or intervention examples relevant to the current step.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'The topic or question to search for.' },
        limit: { type: 'number', description: 'Max results to return (default 4).' },
      },
      required: ['query'],
    },
  },
  {
    name: 'draft_session_report',
    description: 'Generate the Abschlussbericht (closing report) for the session. Call this only during step 10 after all prior steps are accepted or skipped.',
    input_schema: {
      type: 'object' as const,
      properties: {
        format: { type: 'string', enum: ['markdown', 'structured'], description: 'Output format.' },
      },
      required: ['format'],
    },
  },
];
