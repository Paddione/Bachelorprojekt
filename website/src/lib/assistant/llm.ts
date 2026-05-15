import Anthropic from '@anthropic-ai/sdk';
import type { AssistantProfile, AssistantChatResult, AssistantSource, Message } from './types';
import { searchHelp, formatHit, noMatchReply } from './search';
import { queryNearest } from '../knowledge-db';
import { resolveCoachingCollectionIds } from './coaching-collections';
import { pool } from '../website-db';

export interface AssistantChatInput {
  profile: AssistantProfile;
  userSub: string;
  messages: Array<Pick<Message, 'role' | 'content'>>;
  context: AssistantContext;
}

export interface AssistantContext {
  currentRoute: string;
  counts?: Record<string, number>;
  [k: string]: unknown;
}

const SYSTEM_PROMPT = `Du bist der interne Assistent von ${process.env.BRAND_NAME ?? 'Mentolder'}. Du hilfst dem Coach bei seiner Arbeit — Klientenvorbereitung, Terminplanung, Gesprächsreflexion und Wissensarbeit. Antworte präzise und auf Deutsch. Wenn du Buchpassagen erhältst, zitiere konkret und nenne Seite wenn vorhanden.`;

const CITATION_INSTRUCTIONS = `
Die folgenden Passagen stammen aus Fachbüchern des Coachs.
Prüfe zuerst ob eine der Passagen zur Frage relevant ist.
- Wenn ja: beantworte die Frage unter Nutzung der Passage(n) und zitiere inline mit [1], [2] etc. Beispiel: „Laut [1] gilt Vertrauen als..."
- Wenn nein: antworte aus deinem Allgemeinwissen und schreibe einen Satz wie „Die verfügbaren Buchstellen passen hier nicht direkt — aus meinem Wissen:..."

Zitiere nur wenn du wirklich aus einer Passage schöpfst, nicht bei jeder Aussage.`;

export async function assistantChat(input: AssistantChatInput): Promise<AssistantChatResult> {
  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
  if (!lastUser?.content.trim()) {
    return { reply: 'Frag mich etwas — ich bin für dich da.' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // Fallback: keyword search (dev without API key)
    const hit = searchHelp(lastUser.content, input.profile);
    if (!hit) return { reply: noMatchReply(input.profile) };
    return { reply: formatHit(hit) };
  }

  let sources: AssistantSource[] = [];
  let systemPrompt = SYSTEM_PROMPT;

  const useBooks = input.context.useBooks === true;
  if (useBooks) {
    try {
      const collectionIds = await resolveCoachingCollectionIds(pool);
      if (collectionIds.length > 0) {
        const chunks = await queryNearest({
          collectionIds,
          queryText: lastUser.content,
          limit: 4,
          threshold: 0.62,
        });
        if (chunks.length > 0) {
          sources = chunks.map((c, i) => ({
            index: i + 1,
            bookTitle: c.bookTitle ?? 'Unbekanntes Buch',
            slug: c.collectionName.startsWith('coaching-')
              ? c.collectionName.slice('coaching-'.length)
              : c.collectionName,
            page: c.page ?? null,
            excerpt: c.text.slice(0, 300),
            chunkId: c.id,
          }));

          const passages = chunks
            .map((c, i) => `[${i + 1}] ${c.text}`)
            .join('\n\n');
          systemPrompt += `\n\n${CITATION_INSTRUCTIONS}\n\n<Quellenpassagen>\n${passages}\n</Quellenpassagen>`;
        }
      }
    } catch (err) {
      console.error('[assistantChat] RAG lookup failed, proceeding without passages:', err);
    }
  }

  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: systemPrompt,
    messages: input.messages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
  });

  const reply = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  return { reply, sources: sources.length > 0 ? sources : undefined };
}
