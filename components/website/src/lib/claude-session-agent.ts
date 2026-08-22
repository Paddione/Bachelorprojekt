import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent.ts';
import {
  SESSION_TOOLS,
  getSessionStepTool,
  searchCoachingKnowledgeTool,
  draftSessionReportTool,
} from './session-tools.ts';
import { getProviderByName } from './provider-config.ts';
import { pool } from './website-db.ts';
import { logger } from './logger.ts';

const MAX_TOOL_ROUNDS = 3;

// Letzter Rückfall (T013302): nur erreichbar, wenn die globale Default-Zeile
// nicht gelesen werden kann. Eine Stelle statt drei (T001672) — auch von
// complete.ts konsumiert.
export const DEFAULT_CLAUDE_SESSION_MODEL = 'claude-haiku-4-5-20251001';

/**
 * Session-Modell folgt dem globalen Factory-Default (provider_config
 * source='*'). Ändert sich der Default, wechseln die Sessions mit — ohne
 * eigene sessionseitige Konfiguration. Nur wenn gar kein Wert zu holen ist
 * (DB-Fehler oder keine aktive '*'-Zeile), greift DEFAULT_CLAUDE_SESSION_MODEL,
 * und dieser Fall wird protokolliert, damit er nicht unbemerkt zur Regel wird.
 */
export async function resolveSessionModel(): Promise<string> {
  try {
    const { rows } = await pool.query(
      `SELECT model_id FROM tickets.provider_config
        WHERE source = '*' AND enabled = true
        ORDER BY priority ASC LIMIT 1`,
    );
    const modelId = (rows[0] as { model_id?: unknown } | undefined)?.model_id;
    if (typeof modelId === 'string' && modelId) return modelId;
    logger.warn(
      '[claude-session-agent] keine aktive Factory-Default-Zeile (source=\'*\') — Fallback auf DEFAULT_CLAUDE_SESSION_MODEL',
    );
  } catch (err) {
    logger.warn(
      { err },
      '[claude-session-agent] Factory-Default nicht lesbar — Fallback auf DEFAULT_CLAUDE_SESSION_MODEL',
    );
  }
  return DEFAULT_CLAUDE_SESSION_MODEL;
}

export class ClaudeSessionAgent implements SessionAgent {
  private async buildClient(kiConfig: GenerateOptions['kiConfig']): Promise<Anthropic> {
    const cfg = await getProviderByName(kiConfig.provider);
    const apiKey = kiConfig.apiKey ?? cfg.apiKey;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    const baseURL = kiConfig.apiEndpoint ?? cfg.baseUrl;
    if (baseURL) opts.baseURL = baseURL;
    return new Anthropic(opts);
  }

  private async executeTool(
    name: string,
    input: Record<string, unknown>,
    sessionId: string,
  ): Promise<string> {
    if (name === 'get_session_step') {
      const result = await getSessionStepTool(sessionId, input.step_number as number);
      return JSON.stringify(result);
    }
    if (name === 'search_coaching_knowledge') {
      const result = await searchCoachingKnowledgeTool(input.query as string, input.limit as number | undefined);
      return JSON.stringify(result);
    }
    if (name === 'draft_session_report') {
      const result = await draftSessionReportTool(sessionId, input.format as 'markdown' | 'structured');
      return JSON.stringify(result);
    }
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt, sessionId } = options;
    const client = await this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? (await resolveSessionModel());
    const startMs = Date.now();

    const messages: MessageParam[] = [
      ...history.map(t => ({ role: t.role, content: t.content } as MessageParam)),
      { role: 'user', content: assembledUserPrompt },
    ];

    let aiResponse = '';
    let rounds = 0;

    while (rounds <= MAX_TOOL_ROUNDS) {
      const msg = await client.messages.create({
        model,
        max_tokens: kiConfig.maxTokens ?? 600,
        system: effectiveSystemPrompt,
        temperature: kiConfig.temperature ?? undefined,
        top_p: kiConfig.topP ?? undefined,
        top_k: kiConfig.topK ?? undefined,
        tools: SESSION_TOOLS,
        messages,
      });

      const textBlocks = msg.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
      if (textBlocks.length > 0) {
        aiResponse = textBlocks.map(b => b.text).join('');
        break;
      }

      if (msg.stop_reason !== 'tool_use' || rounds >= MAX_TOOL_ROUNDS) break;

      const toolUseBlocks = msg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      messages.push({ role: 'assistant', content: msg.content });

      const toolResults: ToolResultBlockParam[] = await Promise.all(
        toolUseBlocks.map(async b => ({
          type: 'tool_result' as const,
          tool_use_id: b.id,
          content: await this.executeTool(b.name, b.input as Record<string, unknown>, sessionId),
        })),
      );
      messages.push({ role: 'user', content: toolResults });
      rounds++;
    }

    return { aiResponse, provider: 'claude', model, durationMs: Date.now() - startMs };
  }

  async *stream(options: GenerateOptions): AsyncIterable<string> {
    const { kiConfig, history, effectiveSystemPrompt, assembledUserPrompt } = options;
    const client = await this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? (await resolveSessionModel());

    const messages: MessageParam[] = [
      ...history.map(t => ({ role: t.role, content: t.content } as MessageParam)),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = client.messages.stream({
      model,
      max_tokens: kiConfig.maxTokens ?? 600,
      system: effectiveSystemPrompt,
      temperature: kiConfig.temperature ?? undefined,
      top_p: kiConfig.topP ?? undefined,
      top_k: kiConfig.topK ?? undefined,
      tools: SESSION_TOOLS,
      messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        yield event.delta.text;
      }
    }
  }
}
