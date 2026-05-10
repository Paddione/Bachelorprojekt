import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../../lib/auth';
import { addDocument, getCollection, recountChunks, upsertChunks } from '../../../../../../lib/knowledge-db';
import { embedBatch } from '../../../../../../lib/embeddings';
import { chunkText } from '../../../../../../lib/chunking';
import { createHash } from 'node:crypto';

// Hard cap for synchronous web uploads. Larger inputs (typically multi-hundred-page
// books) need the throttled CLI path because Voyage's free tier rate-limits would
// turn the request into a multi-minute hang. Caller gets 202 + clear instruction.
const SYNC_CHUNK_CAP = 200;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const POST: APIRoute = async ({ request, params }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  const collection = await getCollection(params.id!);
  if (!collection) return new Response(JSON.stringify({ error: 'collection not found' }), { status: 404 });
  if (collection.source !== 'custom') {
    return new Response(JSON.stringify({ error: 'inline document add only allowed on custom collections' }), { status: 403 });
  }

  let title: string;
  let rawText: string;
  let sourceUri: string;

  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('multipart/form-data')) {
    const fd = await request.formData();
    const file = fd.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return new Response(JSON.stringify({ error: 'Datei fehlt' }), { status: 400 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return new Response(JSON.stringify({
        error: `Datei zu groß (${Math.round(file.size / 1024 / 1024)} MB > ${MAX_FILE_BYTES / 1024 / 1024} MB).`,
      }), { status: 413 });
    }
    const lower = file.name.toLowerCase();
    if (!lower.endsWith('.pdf')) {
      return new Response(JSON.stringify({ error: 'Nur PDF-Uploads werden unterstützt' }), { status: 400 });
    }
    const buf = Buffer.from(await file.arrayBuffer());
    let extracted: string;
    try {
      const { default: pdfParse } = await import('pdf-parse/lib/pdf-parse.js');
      const data = await pdfParse(buf);
      extracted = data.text ?? '';
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return new Response(JSON.stringify({ error: `PDF-Extraktion fehlgeschlagen: ${msg}` }), { status: 422 });
    }
    if (!extracted.trim()) {
      return new Response(JSON.stringify({ error: 'Kein Text aus PDF extrahiert (eingescannte Seiten?)' }), { status: 422 });
    }
    rawText = extracted;
    const formTitle = fd.get('title');
    title = (typeof formTitle === 'string' && formTitle.trim()) ? formTitle.trim() : file.name.replace(/\.pdf$/i, '');
    sourceUri = `pdf:${file.name}`;
  } else {
    const body = await request.json() as { title?: string; sourceUri?: string | null; rawText?: string; };
    if (!body.title?.trim() || !body.rawText?.trim()) {
      return new Response(JSON.stringify({ error: 'title und rawText erforderlich' }), { status: 400 });
    }
    rawText = body.rawText;
    title = body.title.trim();
    const sha = createHash('sha256').update(rawText).digest('hex');
    sourceUri = body.sourceUri ?? `paste:${sha.slice(0, 12)}`;
  }

  const sha256 = createHash('sha256').update(rawText).digest('hex');
  const doc = await addDocument({
    collectionId: collection.id,
    title,
    sourceUri,
    rawText,
    sha256,
  });

  const isPdf = sourceUri.startsWith('pdf:');
  const chunks = chunkText(rawText, isPdf
    ? { mode: 'plain', targetTokens: 600, overlapTokens: 80 }
    : { mode: 'markdown' });
  if (chunks.length > SYNC_CHUNK_CAP) {
    return new Response(JSON.stringify({
      doc,
      scheduled: true,
      chunkCount: chunks.length,
      message: `Zu viele Chunks (${chunks.length}) für synchrones Embedding. Bitte CLI verwenden: task coaching:ingest -- <pfad> <slug>`,
    }), { status: 202 });
  }

  const { embeddings } = await embedBatch(chunks.map(c => c.text), {
    model: collection.embedding_model as 'bge-m3' | 'voyage-multilingual-2',
    purpose: 'index',
  });
  await upsertChunks(collection.id, doc.id, chunks.map((c, i) => ({
    position: c.position, text: c.text, embedding: embeddings[i],
  })));
  await recountChunks(collection.id);

  return new Response(JSON.stringify({ doc, chunkCount: chunks.length }), { status: 201 });
};
