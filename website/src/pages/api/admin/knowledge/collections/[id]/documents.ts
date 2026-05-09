import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { addDocument, getCollection, recountChunks, upsertChunks } from '../../../../../../lib/knowledge-db';
import { embedBatch } from '../../../../../../lib/embeddings';
import { chunkText } from '../../../../../../lib/chunking';
import { createHash } from 'node:crypto';

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const collection = await getCollection(params.id!);
  if (!collection) return new Response(JSON.stringify({ error: 'collection not found' }), { status: 404 });
  if (collection.source !== 'custom') {
    return new Response(JSON.stringify({ error: 'inline document add only allowed on custom collections' }), { status: 403 });
  }

  const body = await request.json() as { title?: string; sourceUri?: string | null; rawText?: string; };
  if (!body.title?.trim() || !body.rawText?.trim()) {
    return new Response(JSON.stringify({ error: 'title und rawText erforderlich' }), { status: 400 });
  }

  const sha256 = createHash('sha256').update(body.rawText).digest('hex');
  const doc = await addDocument({
    collectionId: collection.id,
    title: body.title.trim(),
    sourceUri: body.sourceUri ?? `paste:${sha256.slice(0, 12)}`,
    rawText: body.rawText,
    sha256,
  });

  const chunkTexts = chunkText(body.rawText, { mode: 'markdown' });
  if (chunkTexts.length > 50) {
    return new Response(JSON.stringify({ doc, scheduled: true, chunkCount: chunkTexts.length }), { status: 202 });
  }

  const { embeddings } = await embedBatch(chunkTexts.map(c => c.text));
  await upsertChunks(collection.id, doc.id, chunkTexts.map((c, i) => ({
    position: c.position, text: c.text, embedding: embeddings[i],
  })));
  await recountChunks(collection.id);

  return new Response(JSON.stringify({ doc, chunkCount: chunkTexts.length }), { status: 201 });
};
