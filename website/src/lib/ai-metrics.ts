import { Pool } from 'pg';
import { logger } from './logger';

export type AiWorkflow =
  | 'coaching_chat'
  | 'rag_search'
  | 'embedding'
  | 'grilling'
  | 'plan_qa';

export interface AiCallMeta {
  workflow: AiWorkflow;
  model?: string;
  userSub?: string;
  metadata?: Record<string, unknown>;
}

export interface AiCallRecord extends AiCallMeta {
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  error?: string;
}

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) pool = new Pool({ connectionString: process.env.DATABASE_URL });
  return pool;
}

export async function logAiCall(rec: AiCallRecord): Promise<void> {
  try {
    await getPool().query(
      `INSERT INTO ai_call_log
         (workflow, model, prompt_tokens, completion_tokens, latency_ms, error, user_sub, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [
        rec.workflow,
        rec.model ?? null,
        rec.promptTokens ?? null,
        rec.completionTokens ?? null,
        rec.latencyMs,
        rec.error ?? null,
        rec.userSub ?? null,
        JSON.stringify(rec.metadata ?? null),
      ],
    );
  } catch (err) {
    logger.error({ err }, '[ai-metrics] logAiCall insert failed');
  }
}

export async function withAiMetrics<T>(
  fn: () => Promise<T & { usage?: { input_tokens?: number; output_tokens?: number } }>,
  meta: AiCallMeta,
): Promise<T> {
  const start = Date.now();
  try {
    const result = await fn();
    void logAiCall({
      ...meta,
      latencyMs: Date.now() - start,
      promptTokens: result?.usage?.input_tokens,
      completionTokens: result?.usage?.output_tokens,
    });
    return result;
  } catch (err) {
    void logAiCall({ ...meta, latencyMs: Date.now() - start, error: String(err) });
    throw err;
  }
}
