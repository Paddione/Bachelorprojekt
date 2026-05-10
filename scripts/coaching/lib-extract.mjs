import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
// Import the inner module directly — pdf-parse's index.js triggers a debug-mode
// fixture read when `module.parent` is undefined (which is always the case under ESM).
// Types live in scripts/coaching/types.d.ts.
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import EPub from 'epub2';

/**
 * Extracts plain text from a PDF or EPUB file.
 * Returns { text, pageCount, pageMap?, format }.
 * pageMap is an array of { page, charStart } anchors when available (PDF only).
 */
export async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf') return extractPdf(filePath);
  if (ext === '.epub') return extractEpub(filePath);
  throw new Error(`Unsupported extension: ${ext}`);
}

async function extractPdf(filePath) {
  const buf = await readFile(filePath);
  const pageMap = [];
  let cursor = 0;
  const data = await pdfParse(buf, {
    pagerender: (pageData) => pageData.getTextContent().then((tc) => {
      const pageText = tc.items.map((it) => it.str).join(' ');
      pageMap.push({ page: pageData.pageNumber, charStart: cursor });
      cursor += pageText.length + 1;
      return pageText;
    }),
  });
  return {
    text: data.text,
    pageCount: data.numpages,
    pageMap,
    format: 'pdf',
  };
}

async function extractEpub(filePath) {
  const epub = await EPub.createAsync(filePath);
  const chapters = [];
  for (const item of epub.flow) {
    const html = await new Promise((res, rej) =>
      epub.getChapter(item.id, (err, txt) => (err ? rej(err) : res(txt))),
    );
    const text = stripHtml(html);
    if (text.trim()) chapters.push(text);
  }
  return {
    text: chapters.join('\n\n'),
    pageCount: chapters.length,
    pageMap: null,
    format: 'epub',
  };
}

function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}
