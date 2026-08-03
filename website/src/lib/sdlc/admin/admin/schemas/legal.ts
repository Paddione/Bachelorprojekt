import type { SectionSchema } from '../schema-types';

const legalKeys = ['datenschutz', 'agb', 'barrierefreiheit', 'impressum'] as const;

export const legalSchemas: Record<string, SectionSchema> = Object.fromEntries(
  legalKeys.map((key) => [
    `legal:${key}`,
    {
      contentKey: `legal:${key}`,
      title: key.charAt(0).toUpperCase() + key.slice(1),
      fields: [{ key: 'content_html', label: 'Inhalt (HTML)', type: 'html' as const, tokens: true }],
    },
  ])
);
