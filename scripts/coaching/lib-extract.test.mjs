import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractText } from './lib-extract.mjs';

test('extractText rejects unknown extension', async () => {
  await assert.rejects(
    () => extractText('/tmp/nope.docx'),
    /Unsupported extension/,
  );
});

test('extractText reads a tiny PDF', async () => {
  // Skip if test fixture not present; CI provides it via `task test:coaching:fixtures`
  const fixture = process.env.PDF_FIXTURE ?? new URL('./fixtures/sample.pdf', import.meta.url).pathname;
  try {
    const { text, pageCount } = await extractText(fixture);
    assert.ok(text.length > 0, 'should return non-empty text');
    assert.ok(pageCount >= 1, 'should report page count');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('skipping PDF fixture test — sample.pdf not present');
      return;
    }
    throw err;
  }
});
