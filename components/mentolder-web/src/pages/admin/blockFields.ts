// Schema-driven editable-field descriptors for the homepage block editor (v1).
// One descriptor list per block type, mirroring mentolder-web/src/blocks/schema.ts.
// The editor renders inputs from these; the server zod schema remains the
// source of truth on save. v1 edits FIELD VALUES only (no add/remove/reorder).

export type FieldKind = 'text' | 'textarea' | 'number' | 'stringList' | 'objectList';

export interface FieldDef {
  key: string; // path relative to a block's `props` (dot-separated for nested objects)
  label: string;
  kind: FieldKind;
  itemFields?: FieldDef[]; // for objectList: the fields of each item
}

const heroFields: FieldDef[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'titleEmphasis', label: 'Titel-Betonung', kind: 'text' },
  { key: 'subtitle', label: 'Untertitel', kind: 'textarea' },
  { key: 'tagline', label: 'Tagline', kind: 'text' },
  { key: 'personName', label: 'Name', kind: 'text' },
  { key: 'personRole', label: 'Rolle', kind: 'text' },
  { key: 'avatarInitials', label: 'Avatar-Initialen', kind: 'text' },
  { key: 'avatarSrc', label: 'Avatar-Bild (Pfad)', kind: 'text' },
];

const statsFields: FieldDef[] = [
  {
    key: 'items',
    label: 'Kennzahlen',
    kind: 'objectList',
    itemFields: [
      { key: 'value', label: 'Wert', kind: 'text' },
      { key: 'target', label: 'Zielzahl (optional)', kind: 'number' },
      { key: 'label', label: 'Beschriftung', kind: 'text' },
    ],
  },
];

const servicesFields: FieldDef[] = [
  { key: 'headline', label: 'Überschrift', kind: 'text' },
  { key: 'subheadline', label: 'Unterüberschrift', kind: 'textarea' },
  {
    key: 'items',
    label: 'Angebote',
    kind: 'objectList',
    itemFields: [
      { key: 'id', label: 'ID', kind: 'text' },
      { key: 'title', label: 'Titel', kind: 'text' },
      { key: 'description', label: 'Beschreibung', kind: 'textarea' },
      { key: 'features', label: 'Merkmale', kind: 'stringList' },
      { key: 'price', label: 'Preis', kind: 'text' },
      { key: 'priceUnit', label: 'Preiseinheit', kind: 'text' },
      { key: 'meta', label: 'Meta (optional)', kind: 'text' },
      { key: 'href', label: 'Link', kind: 'text' },
      { key: 'icon', label: 'Icon', kind: 'text' },
    ],
  },
];

const whyMeFields: FieldDef[] = [
  { key: 'headline', label: 'Überschrift', kind: 'text' },
  { key: 'intro.prefix', label: 'Intro – Anfang', kind: 'text' },
  { key: 'intro.emphasis', label: 'Intro – Betonung', kind: 'text' },
  { key: 'intro.suffix', label: 'Intro – Ende', kind: 'text' },
  {
    key: 'points',
    label: 'Punkte',
    kind: 'objectList',
    itemFields: [
      { key: 'title', label: 'Titel', kind: 'text' },
      { key: 'text', label: 'Text', kind: 'textarea' },
    ],
  },
  { key: 'quote', label: 'Zitat', kind: 'textarea' },
  { key: 'quoteName', label: 'Zitat-Name', kind: 'text' },
  { key: 'quoteRole', label: 'Zitat-Rolle', kind: 'text' },
];

const processFields: FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', kind: 'text' },
  { key: 'headline', label: 'Überschrift', kind: 'text' },
  {
    key: 'steps',
    label: 'Schritte',
    kind: 'objectList',
    itemFields: [
      { key: 'num', label: 'Nummer', kind: 'text' },
      { key: 'title', label: 'Titel', kind: 'text' },
      { key: 'text', label: 'Text', kind: 'textarea' },
    ],
  },
];

const faqFields: FieldDef[] = [
  { key: 'title', label: 'Titel', kind: 'text' },
  {
    key: 'items',
    label: 'Fragen',
    kind: 'objectList',
    itemFields: [
      { key: 'question', label: 'Frage', kind: 'text' },
      { key: 'answer', label: 'Antwort', kind: 'textarea' },
    ],
  },
];

const ctaFields: FieldDef[] = [
  { key: 'eyebrow', label: 'Eyebrow', kind: 'text' },
  { key: 'title', label: 'Titel', kind: 'text' },
  { key: 'titleEmphasis', label: 'Titel-Betonung', kind: 'text' },
  { key: 'subtitle', label: 'Untertitel', kind: 'textarea' },
  { key: 'primaryText', label: 'Primär-Button Text', kind: 'text' },
  { key: 'primaryHref', label: 'Primär-Button Link', kind: 'text' },
  { key: 'secondaryText', label: 'Sekundär-Button Text', kind: 'text' },
  { key: 'secondaryHref', label: 'Sekundär-Button Link', kind: 'text' },
];

const richTextFields: FieldDef[] = [{ key: 'html', label: 'HTML', kind: 'textarea' }];
const imageFields: FieldDef[] = [
  { key: 'src', label: 'Bild (Pfad)', kind: 'text' },
  { key: 'alt', label: 'Alt-Text', kind: 'text' },
];
const spacerFields: FieldDef[] = [{ key: 'size', label: 'Größe (px)', kind: 'number' }];

export const BLOCK_FIELDS: Record<string, FieldDef[]> = {
  hero: heroFields,
  stats: statsFields,
  services: servicesFields,
  whyMe: whyMeFields,
  process: processFields,
  faq: faqFields,
  cta: ctaFields,
  richText: richTextFields,
  image: imageFields,
  spacer: spacerFields,
};

export function fieldsForBlock(type: string): FieldDef[] {
  return BLOCK_FIELDS[type] ?? [];
}

export const BLOCK_LABELS: Record<string, string> = {
  hero: 'Hero',
  stats: 'Kennzahlen',
  services: 'Angebote',
  whyMe: 'Warum ich',
  process: 'Ablauf',
  faq: 'FAQ',
  cta: 'Call to Action',
  richText: 'Rich Text',
  image: 'Bild',
  spacer: 'Abstand',
};

type AnyObj = Record<string, any>;

/** Read a (possibly dotted) path from an object. */
export function getAtPath(obj: AnyObj, path: string): unknown {
  return path.split('.').reduce<any>((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

/** Immutably set a (possibly dotted) path on an object, cloning along the way. */
export function setAtPath(obj: AnyObj, path: string, value: unknown): AnyObj {
  const [head, ...rest] = path.split('.');
  if (rest.length === 0) {
    return { ...obj, [head]: value };
  }
  return { ...obj, [head]: setAtPath(obj[head] ?? {}, rest.join('.'), value) };
}
