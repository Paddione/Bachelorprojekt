import type { SectionSchema } from '../schema-types';

export const stammdatenSchema: SectionSchema = {
  contentKey: 'stammdaten',
  title: 'Stammdaten',
  fields: [
    { key: 'name', label: 'Vollständiger Name', type: 'text', validation: { required: true } },
    { key: 'role', label: 'Berufsbezeichnung / Rolle', type: 'text' },
    { key: 'email', label: 'E-Mail', type: 'text', validation: { required: true, email: true } },
    { key: 'phone', label: 'Telefon', type: 'text' },
    { key: 'street', label: 'Straße + Hausnummer', type: 'text' },
    { key: 'zip', label: 'PLZ', type: 'text' },
    { key: 'city', label: 'Stadt / Region', type: 'text', validation: { required: true } },
    { key: 'ustId', label: 'Umsatzsteuer-ID', type: 'text' },
    { key: 'website', label: 'Website', type: 'text', validation: { url: true } },
    { key: 'avatarInitials', label: 'Avatar-Initialen', type: 'text' },
  ],
};
