import { extname } from 'node:path';
import { PDFParse } from 'pdf-parse';
import EPub from 'epub2';
import mammoth from 'mammoth';

/**
 * Extracts plain text from a PDF, EPUB, DOC, or DOCX file.
 * Returns { text, pageCount, pageMap?, format }.
 * pageMap is an array of { page, charStart } anchors when available (PDF only).
 */
export async function extractText(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf')  return extractPdf(filePath);
  if (ext === '.epub') return extractEpub(filePath);
  if (ext === '.docx') return extractDoc(filePath, 'docx');
  if (ext === '.doc')  return extractDoc(filePath, 'doc');
  throw new Error(`Unsupported extension: ${ext}`);
}

async function extractPdf(filePath) {
  const parser = new PDFParse({ url: filePath });
  const result = await parser.getText();

  // Build pageMap (charStart per page) from the per-page text array
  const pageMap = [];
  let cursor = 0;
  for (const p of result.pages) {
    pageMap.push({ page: p.num, charStart: cursor });
    cursor += p.text.length + 2; // +2 for '\n\n' separator added by getText()
  }

  return { text: result.text, pageCount: result.total, pageMap, format: 'pdf' };
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
  return { text: chapters.join('\n\n'), pageCount: chapters.length, pageMap: null, format: 'epub' };
}

async function extractDoc(filePath, format) {
  const result = await mammoth.extractRawText({ path: filePath });
  for (const msg of result.messages) {
    if (msg.type === 'warning') {
      console.warn(`[extract] ${format} warning in ${filePath}: ${msg.message}`);
    }
  }
  return { text: result.value, pageCount: null, pageMap: null, format };
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
