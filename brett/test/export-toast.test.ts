// brett/test/export-toast.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

function makeFakeDoc() {
  const elements: any[] = [];
  const styles: any[] = [];
  const fakeDoc: any = {
    getElementById: (id: string) => elements.find((e: any) => e.id === id) ?? null,
    createElement: (tag: string) => {
      const el: any = {
        id: '',
        className: '',
        textContent: '',
        style: {} as any,
        children: [] as any[],
        appendChild(child: any) { this.children.push(child); },
        remove() {
          const idx = elements.indexOf(this);
          if (idx >= 0) elements.splice(idx, 1);
        },
      };
      elements.push(el);
      return el;
    },
    head: { appendChild: (el: any) => { styles.push(el); } },
    body: { appendChild: (el: any) => {} },
  };
  return { doc: fakeDoc, elements, styles };
}

test('showExportToast creates toast element in container', async () => {
  const { showExportToast } = await import('../src/client/ui/export-toast');
  const { doc, elements } = makeFakeDoc();
  showExportToast('Export done', 'success', doc);
  const toast = elements.find((e: any) => e.className?.includes('brett-export-toast--success'));
  assert.ok(toast, 'toast element with success class should exist');
  assert.equal(toast.textContent, 'Export done');
});

test('showExportToast error variant sets error class', async () => {
  const { showExportToast } = await import('../src/client/ui/export-toast');
  const { doc, elements } = makeFakeDoc();
  showExportToast('Failed', 'error', doc);
  const toast = elements.find((e: any) => e.className?.includes('brett-export-toast--error'));
  assert.ok(toast, 'toast element with error class should exist');
});

test('module is importable without DOM errors', async () => {
  const mod = await import('../src/client/ui/export-toast');
  assert.strictEqual(typeof mod.showExportToast, 'function');
  assert.strictEqual(typeof mod.initExportToast, 'function');
});
