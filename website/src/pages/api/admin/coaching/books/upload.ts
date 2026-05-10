import type { APIRoute } from 'astro';
import { getSession, isAdmin } from '../../../../../lib/auth';
import { Pool } from 'pg';
import { writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import EPub from 'epub2';
import { chunkText } from '../../../../../lib/chunking';
import { embedBatch } from '../../../../../lib/embeddings';
import {
  ensureCollection,
  addDocument,
  upsertChunks,
  recountChunks,
} from '../../../../../lib/knowledge-db';

const pool = new Pool();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return json({ error: 'unauthorized' }, 401);

  let formData: FormData;
  try { formData = await request.formData(); } catch { return json({ error: 'invalid multipart' }, 400); }

  const file = formData.get('file') as File | null;
  const title = (formData.get('title') as string | null)?.trim() || '';
  const author = (formData.get('author') as string | null)?.trim() || null;
  const licenseNote = (formData.get('licenseNote') as string | null)?.trim() || null;

  if (!file || !file.name) return json({ error: 'missing file' }, 400);
  if (file.size > 50 * 1024 * 1024) return json({ error: 'Datei zu groß — max. 50 MB.' }, 413);
  if (!title) return json({ error: 'missing title' }, 400);

  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (ext !== 'pdf' && ext !== 'epub') return json({ error: 'unsupported format — only PDF or EPUB' }, 400);

  const tmpPath = join('/tmp', `book-upload-${randomUUID()}.${ext}`);
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(tmpPath, buf);

    // Extract text
    let text: string;
    let pageCount: number;
    if (ext === 'pdf') {
      const data = await pdfParse(buf);
      text = data.text;
      pageCount = data.numpages;
    } else {
      const epub = await (EPub as any).createAsync(tmpPath);
      const chapters: string[] = [];
      for (const item of epub.flow) {
        const html = await new Promise<string>((res, rej) =>
          epub.getChapter(item.id, (err: Error | null, txt: string) => (err ? rej(err) : res(txt))),
        );
        const clean = html
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean) chapters.push(clean);
      }
      text = chapters.join('\n\n');
      pageCount = chapters.length;
    }

    if (!text.trim()) return json({ error: 'no text could be extracted from the file' }, 422);

    // Slug from title
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Ensure collection
    const collection = await ensureCollection({
      name: `coaching-${slug}`,
      source: 'custom',
      brand: process.env.BRAND ?? 'mentolder',
      description: title,
    });

    // Chunk
    const chunks = chunkText(text, { mode: 'plain', targetTokens: 600, overlapTokens: 80 });

    // Embed
    const model = process.env.LLM_ENABLED === 'true' ? 'bge-m3' : 'voyage-multilingual-2';
    const { embeddings } = await embedBatch(chunks.map((c) => c.text), { model, purpose: 'index' });

    // Page approximation
    const totalChunks = chunks.length;
    const pageFor = (i: number): number | null =>
      pageCount < 1 ? null : Math.min(Math.floor((i * pageCount) / totalChunks) + 1, pageCount);

    // Store document + chunks
    const sha256 = createHash('sha256').update(text).digest('hex');
    const doc = await addDocument({
      collectionId: collection.id,
      title,
      sourceUri: `file://${file.name}`,
      rawText: text,
      sha256,
      metadata: { format: ext, pageCount },
    });

    await upsertChunks(
      collection.id,
      doc.id,
      chunks.map((c, i) => ({
        position: c.position,
        text: c.text,
        embedding: embeddings[i],
        metadata: { page: pageFor(i) },
      })),
    );

    await recountChunks(collection.id);

    // Upsert coaching.books row
    await pool.query(
      `INSERT INTO coaching.books (knowledge_collection_id, title, author, source_filename, license_note)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (knowledge_collection_id) DO UPDATE
         SET title = EXCLUDED.title,
             author = EXCLUDED.author,
             source_filename = EXCLUDED.source_filename,
             license_note = EXCLUDED.license_note`,
      [collection.id, title, author, file.name, licenseNote],
    );

    const bookRes = await pool.query(
      `SELECT b.*, c.chunk_count
         FROM coaching.books b
         JOIN knowledge.collections c ON c.id = b.knowledge_collection_id
        WHERE b.knowledge_collection_id = $1`,
      [collection.id],
    );

    return json({ book: bookRes.rows[0] });
  } catch (err) {
    console.error('[upload] book ingestion failed:', err);
    const msg = err instanceof Error ? err.message : 'internal error';
    if (msg.includes('voyage') && msg.includes('429')) {
      return json({ error: 'Embedding-Dienst überlastet — bitte in 60 Sekunden erneut versuchen.' }, 429);
    }
    return json({ error: msg }, 500);
  } finally {
    await unlink(tmpPath).catch(() => {});
  }
};