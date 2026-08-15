import { describe, it, expect } from 'vitest';
import { mergeContentEntries } from '../../../lib/content-db-merge';
import type { QTemplate } from '../../../lib/questionnaire-db/types';
import type { Template } from '../../../lib/coaching-db';
import type { DocumentTemplate } from '../../../lib/documents-db';

describe('mergeContentEntries', () => {
  it('merges entries from all three sources with correct type badges', () => {
    const questionnaires: Pick<QTemplate, 'id' | 'title' | 'dimension_count' | 'created_at'>[] = [
      { id: 'q1', title: 'Fragebogen A', dimension_count: 3, created_at: '2025-01-01' },
    ];

    const vorlagen: Template[] = [
      {
        id: 'v1',
        snippetId: 'snippet-1',
        targetSurface: 'questionnaire',
        version: 2,
        status: 'published',
        surfaceRef: 'Meine Vorlage',
        createdAt: new Date('2025-01-02'),
      } as Template,
    ];

    const contracts: DocumentTemplate[] = [
      { id: 'c1', title: 'Vertrag A', created_at: '2025-01-03' } as DocumentTemplate,
    ];

    const result = mergeContentEntries(
      questionnaires as QTemplate[],
      vorlagen,
      contracts,
    );

    expect(result).toHaveLength(3);

    const qEntry = result.find(e => e.type === 'questionnaire')!;
    expect(qEntry.title).toBe('Fragebogen A');
    expect(qEntry.meta).toBe('3 Dimensionen');
    expect(qEntry.detailHref).toBe('/admin/coaching/sessions');

    const vEntry = result.find(e => e.type === 'vorlage')!;
    expect(vEntry.title).toBe('Meine Vorlage');
    expect(vEntry.status).toBe('published');
    expect(vEntry.meta).toBe('v2/questionnaire');
    expect(vEntry.detailHref).toBe('/admin/knowledge/templates');

    const cEntry = result.find(e => e.type === 'vertrag')!;
    expect(cEntry.title).toBe('Vertrag A');
    expect(cEntry.detailHref).toBe('/admin/dokumente');
  });

  it('falls back to snippetId when surfaceRef is null for vorlagen', () => {
    const vorlagen: Template[] = [
      {
        id: 'v2',
        snippetId: 'fallback-snippet',
        targetSurface: 'brett',
        version: 1,
        status: 'draft',
        surfaceRef: null,
        createdAt: new Date(),
      } as Template,
    ];

    const result = mergeContentEntries([], vorlagen, []);
    expect(result[0].title).toBe('fallback-snippet');
  });

  it('handles empty inputs', () => {
    const result = mergeContentEntries([], [], []);
    expect(result).toEqual([]);
  });
});