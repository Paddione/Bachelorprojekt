import type { SectionSchema } from '../schema-types';

export const serviceSchema: SectionSchema = {
  contentKey: 'service',
  title: 'Service-Seite',
  fields: [
    { key: 'cardTitle', label: 'Karten-Titel', type: 'text' },
    { key: 'cardIcon', label: 'Karten-Icon', type: 'text' },
    { key: 'cardDescription', label: 'Karten-Beschreibung', type: 'textarea' },
    { key: 'cardPrice', label: 'Karten-Preis', type: 'text' },
    {
      key: 'cardFeatures',
      label: 'Karten-Features',
      type: 'list',
      fields: [{ key: 'item', label: 'Feature', type: 'text' }],
    },
    { key: 'subheadline', label: 'Subheadline (goldene Zeile)', type: 'text' },
    { key: 'headline', label: 'Überschrift (H1)', type: 'text' },
    { key: 'intro', label: 'Einleitung', type: 'textarea' },
    { key: 'introNote', label: 'Einleitungs-Hinweis', type: 'textarea' },
    {
      key: 'forWhom',
      label: 'Für wen',
      type: 'list',
      fields: [{ key: 'item', label: 'Zielgruppe', type: 'text' }],
    },
    {
      key: 'process',
      label: 'Prozess / Ablauf',
      type: 'list',
      fields: [
        { key: 'step', label: 'Schritt-Label', type: 'text' },
        { key: 'title', label: 'Titel', type: 'text' },
        { key: 'text', label: 'Beschreibung', type: 'textarea' },
      ],
    },
    {
      key: 'sections',
      label: 'Abschnitte',
      type: 'list',
      fields: [
        { key: 'title', label: 'Abschnitts-Titel', type: 'text' },
        {
          key: 'items',
          label: 'Punkte',
          type: 'list',
          fields: [{ key: 'item', label: 'Punkt', type: 'text' }],
        },
      ],
    },
    {
      key: 'prices',
      label: 'Preise',
      type: 'list',
      fields: [
        { key: 'label', label: 'Bezeichnung', type: 'text' },
        { key: 'price', label: 'Preis', type: 'text' },
        { key: 'unit', label: 'Einheit / Hinweis', type: 'text' },
      ],
    },
    { key: 'ctaText', label: 'CTA-Text', type: 'text' },
    { key: 'ctaHref', label: 'CTA-Link', type: 'text' },
    {
      key: 'faq',
      label: 'FAQ',
      type: 'list',
      fields: [
        { key: 'question', label: 'Frage', type: 'text' },
        { key: 'answer', label: 'Antwort', type: 'textarea' },
      ],
    },
  ],
};
