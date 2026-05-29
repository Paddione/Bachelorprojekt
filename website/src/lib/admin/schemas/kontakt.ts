import type { SectionSchema } from '../schema-types';

export const kontaktSchema: SectionSchema = {
  contentKey: 'kontakt',
  title: 'Kontakt',
  fields: [
    { key: 'footerEmail', label: 'E-Mail', type: 'text', validation: { required: true, email: true } },
    { key: 'footerPhone', label: 'Telefon', type: 'text' },
    { key: 'footerCity', label: 'Stadt / Region', type: 'text', validation: { required: true } },
    { key: 'footerTagline', label: 'Tagline', type: 'text' },
    { key: 'footerCopyright', label: 'Copyright-Zeile', type: 'text' },
    { key: 'intro', label: 'Einleitung', type: 'textarea' },
    { key: 'sidebarTitle', label: 'Sidebar-Titel', type: 'text' },
    { key: 'sidebarText', label: 'Sidebar-Text', type: 'textarea' },
    { key: 'sidebarCta', label: 'Sidebar CTA-Text', type: 'text' },
    { key: 'showPhone', label: 'Telefon anzeigen', type: 'toggle' },
  ],
};
