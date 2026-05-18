import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from './lib-extract.mjs';

test('extractText rejects unknown extension', async () => {
  await assert.rejects(
    () => extractText('/tmp/nope.xyz'),
    /Unsupported extension/,
  );
});

test('extractText reads a tiny PDF', async () => {
  const fixture = process.env.PDF_FIXTURE ?? new URL('./fixtures/sample.pdf', import.meta.url).pathname;
  try {
    const { text, pageCount } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.ok(pageCount >= 1, 'should report page count');
  } catch (err) {
    if (err.code === 'ENOENT' || err.missing === true) {
      console.warn('skipping PDF fixture test — sample.pdf not present');
      return;
    }
    throw err;
  }
});

test('extractText reads a DOCX file', async () => {
  const fixture = process.env.DOCX_FIXTURE ?? new URL('./fixtures/sample.docx', import.meta.url).pathname;
  try {
    const { text, pageCount, format } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.strictEqual(pageCount, null, 'DOC pageCount should be null');
    assert.strictEqual(format, 'docx');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('skipping DOCX fixture test — sample.docx not present');
      return;
    }
    throw err;
  }
});
