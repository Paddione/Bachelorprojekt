import type { SectionSchema } from '../schema-types';

export const referenzenSchema: SectionSchema = {
  contentKey: 'referenzen',
  title: 'Referenzen',
  fields: [
    { key: 'heading', label: 'Überschrift', type: 'text' },
    { key: 'subheading', label: 'Unterüberschrift', type: 'text' },
    {
      key: 'groups',
      label: 'Gruppen',
      type: 'list',
      fields: [
        { key: 'label', label: 'Gruppenname', type: 'text' },
        {
          key: 'items',
          label: 'Einträge',
          type: 'list',
          fields: [
            { key: 'name', label: 'Name', type: 'text', validation: { required: true } },
            {
              key: 'type',
              label: 'Typ',
              type: 'select',
              options: [
                { value: 'person', label: 'Person' },
                { value: 'organization', label: 'Organisation' },
              ],
            },
            { key: 'url', label: 'Website-URL', type: 'text', validation: { url: true } },
            { key: 'logoUrl', label: 'Logo-URL', type: 'text', validation: { url: true } },
            { key: 'description', label: 'Beschreibung', type: 'textarea' },
          ],
        },
      ],
    },
  ],
};
