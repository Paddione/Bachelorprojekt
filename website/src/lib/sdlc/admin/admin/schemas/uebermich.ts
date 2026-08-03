import type { SectionSchema } from '../schema-types';

export const uebermichSchema: SectionSchema = {
  contentKey: 'uebermich',
  title: 'Über mich',
  fields: [
    { key: 'subheadline', label: 'Subheadline (goldene Zeile)', type: 'text' },
    { key: 'pageHeadline', label: 'Seitenüberschrift (H1)', type: 'text' },
    {
      key: 'introParagraphs',
      label: 'Einleitungsabsätze',
      type: 'list',
      fields: [{ key: 'item', label: 'Absatz', type: 'textarea' }],
    },
    {
      key: 'sections',
      label: 'Abschnitte',
      type: 'list',
      fields: [
        { key: 'title', label: 'Titel', type: 'text' },
        { key: 'content', label: 'Inhalt', type: 'textarea' },
      ],
    },
    {
      key: 'milestones',
      label: 'Meilensteine',
      type: 'list',
      fields: [
        { key: 'year', label: 'Jahr', type: 'text' },
        { key: 'title', label: 'Titel', type: 'text' },
        { key: 'desc', label: 'Beschreibung', type: 'textarea' },
      ],
    },
    {
      key: 'namedAfter',
      label: 'Namensgeber',
      type: 'list',
      fields: [
        { key: 'title', label: 'Titel', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
      ],
    },
    { key: 'privateText', label: 'Privater Text', type: 'textarea' },
    {
      key: 'warumdieserName',
      label: 'Warum dieser Name',
      type: 'group',
      fields: [
        { key: 'title', label: 'Überschrift', type: 'text' },
        { key: 'text', label: 'Text', type: 'textarea' },
      ],
    },
  ],
};
