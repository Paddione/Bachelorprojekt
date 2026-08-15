import type { SectionSchema } from '../schema-types';

export const seoSchema: SectionSchema = {
  contentKey: 'seo',
  title: 'SEO',
  fields: [
    { key: 'title', label: 'Seitentitel', type: 'text', validation: { required: true } },
    { key: 'description', label: 'Beschreibung', type: 'textarea' },
    { key: 'keywords', label: 'Keywords', type: 'text' },
    { key: 'ogImage', label: 'OG-Bild', type: 'image' },
  ],
};
