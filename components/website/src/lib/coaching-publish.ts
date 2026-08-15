import type { Pool } from 'pg';
import {
  getTemplate,
  markTemplatePublished,
  type Template,
} from './coaching-db';
import { createQTemplate } from './questionnaire-db';
import { ensureCollection, addDocument } from './knowledge-db';
import { validateQuoteLength } from './quote-validator';

export type PublishResult =
  | { ok: true; template: Template }
  | { ok: false; error: string };

export async function publishTemplate(
  pool: Pool,
  templateId: string,
  opts: { snippetBody: string },
): Promise<PublishResult> {
  const template = await getTemplate(pool, templateId);
  if (!template) return { ok: false, error: 'template not found' };
  if (template.status === 'published') return { ok: false, error: 'already published' };

  const candidate = extractCandidateText(template);
  const quote = validateQuoteLength({ source: opts.snippetBody, candidate });
  if (!quote.ok) {
    return {
      ok: false,
      error: `quote-length violation: ${quote.violation.matchedChars} chars verbatim ("${quote.violation.sample}")`,
    };
  }

  let surfaceRef: string | null = null;
  switch (template.targetSurface) {
    case 'questionnaire':
      surfaceRef = await cascadeQuestionnaire(template);
      break;
    case 'assistant':
      surfaceRef = await cascadeAssistant(template);
      break;
    case 'brett':
    case 'chatroom':
      surfaceRef = null;
      break;
  }

  const updated = await markTemplatePublished(pool, templateId, surfaceRef);
  return updated ? { ok: true, template: updated } : { ok: false, error: 'publish-step-failed' };
}

function extractCandidateText(t: Template): string {
  const p = t.payload as Record<string, unknown>;
  const parts: unknown[] = [];
  switch (t.targetSurface) {
    case 'questionnaire':
      parts.push(p.title, p.question, p.followup);
      break;
    case 'assistant':
      parts.push(p.title, p.body);
      break;
    case 'brett':
      parts.push(p.name, p.instructions);
      break;
    case 'chatroom':
      parts.push(p.title, p.script);
      break;
  }
  return parts.filter((v): v is string => typeof v === 'string').join(' ');
}

async function cascadeQuestionnaire(t: Template): Promise<string> {
  const p = t.payload as { title?: string; question?: string; followup?: string };
  const title = p.title ?? 'Untitled';
  const description = formatCitation(t);
  const instructions = [p.question, p.followup].filter(Boolean).join('\n\n');
  const created = await createQTemplate({ title, description, instructions });
  return created.id;
}

async function cascadeAssistant(t: Template): Promise<string> {
  const p = t.payload as { title?: string; body?: string; tags?: string[] };
  const collection = await ensureCollection({
    name: 'coaching-assistant',
    source: 'custom',
    brand: 'mentolder',
    description: 'Coaching-Assistant Wissensquelle (auto-managed by coaching publish)',
  });
  const doc = await addDocument({
    collectionId: collection.id,
    title: p.title ?? 'untitled',
    sourceUri: `coaching-template:${t.id}`,
    rawText: `${p.body ?? ''}\n\n${formatCitation(t)}`,
    metadata: { source_pointer: t.sourcePointer, tags: p.tags ?? [] },
  });
  return doc.id;
}

function formatCitation(t: Template): string {
  const sp = t.sourcePointer;
  const pagePart = sp.page !== null ? `, S. ${sp.page}` : '';
  return `Quelle: Coaching-Snippet${pagePart}`;
}
