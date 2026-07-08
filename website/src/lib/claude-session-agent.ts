import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, ToolResultBlockParam } from '@anthropic-ai/sdk/resources/messages';
import type { SessionAgent, GenerateOptions, GenerateResult } from './session-agent';
import {
  SESSION_TOOLS,
  getSessionStepTool,
  searchCoachingKnowledgeTool,
  draftSessionReportTool,
} from './session-tools';

const MAX_TOOL_ROUNDS = 3;

// Letzter Fallback, wenn weder kiConfig.modelName noch COACHING_SESSION_MODEL gesetzt sind.
// Eine Stelle statt drei (T001672) — auch von complete.ts konsumiert.
export const DEFAULT_CLAUDE_SESSION_MODEL = 'claude-haiku-4-5-20251001';

export class ClaudeSessionAgent implements SessionAgent {
  private buildClient(kiConfig: GenerateOptions['kiConfig']): Anthropic {
    const apiKey = kiConfig.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
    const opts: ConstructorParameters<typeof Anthropic>[0] = { apiKey };
    if (kiConfig.apiEndpoint) opts.baseURL = kiConfig.apiEndpoint;
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
    const client = this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? DEFAULT_CLAUDE_SESSION_MODEL;
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
    const client = this.buildClient(kiConfig);
    const model = kiConfig.modelName ?? DEFAULT_CLAUDE_SESSION_MODEL;

    const messages: MessageParam[] = [
      ...history.map(t => ({ role: t.role, content: t.content } as MessageParam)),
      { role: 'user', content: assembledUserPrompt },
    ];

    const stream = await client.messages.stream({
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
