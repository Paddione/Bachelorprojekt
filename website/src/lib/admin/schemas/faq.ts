import type { SectionSchema } from '../schema-types';

export const faqSchema: SectionSchema = {
  contentKey: 'faq',
  title: 'FAQ',
  fields: [
    {
      key: 'items',
      label: 'FAQ-Einträge',
      type: 'list',
      fields: [
        { key: 'question', label: 'Frage', type: 'text', validation: { required: true } },
        { key: 'answer', label: 'Antwort', type: 'textarea', validation: { required: true } },
      ],
    },
  ],
};
