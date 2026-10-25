import type { BrandConfig } from '../types';

export const presentationConfig: BrandConfig = {
  brand: 'presentation',
  meta: {
    siteTitle: 'Presentation',
    siteDescription: 'Presentation — Folien, die wirken. Termine auf Anfrage.',
  },
  contact: {
    name: process.env.CONTACT_NAME ?? '',
    email: process.env.CONTACT_EMAIL ?? '',
    phone: process.env.CONTACT_PHONE ?? '',
    city: process.env.CONTACT_CITY ?? 'Lüneburg und Umgebung',
  },
  legal: {
    street: process.env.LEGAL_STREET ?? '',
    zip: process.env.LEGAL_ZIP ?? '',
    jobtitle: process.env.LEGAL_JOBTITLE ?? '',
    chamber: process.env.LEGAL_CHAMBER ?? '',
    ustId: process.env.LEGAL_UST_ID ?? '',
    website: process.env.LEGAL_WEBSITE ?? '',
    tagline: 'Presentation',
  },
  navigation: [
    { label: 'Leistungen', href: '/leistungen' },
    { label: 'Über mich', href: '/ueber-mich' },
    { label: 'Häufige Fragen', href: '/faq' },
    { label: 'Kontakt', href: '/kontakt' },
  ],
  navigationCta: 'Anfrage stellen',
  footer: {
    copyright: `© ${new Date().getFullYear()} Presentation — Alle Rechte vorbehalten`,
    columns: [
      {
        heading: 'Rechtliches',
        links: [
          { label: 'Impressum', href: '/impressum' },
          { label: 'Datenschutz', href: '/datenschutz' },
        ],
      },
    ],
  },
  homepage: {
    stats: [
      { value: '16:9', label: 'Folienformat — Bühne frei' },
      { value: '3 Schritte', label: 'Von der Anfrage bis zum Auftritt' },
      { value: '1 Stil', label: 'Eine Handschrift, jede Folie' },
      { value: 'Mo–Fr', label: 'Kernzeiten plus flexible Slots' },
    ],
    servicesHeadline: 'Formate im Überblick',
    servicesSubheadline: 'Zwei Formate, ein Anspruch — jede Folie sitzt.',
    whyMeHeadline: 'Warum hier?',
    whyMeIntro: 'Wenige Folien, klare Botschaft, ruhiger Auftritt.',
    whyMePoints: [
      {
        iconPath: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
        title: 'Klare Struktur',
        text: 'Eine Botschaft pro Folie — kein Textfriedhof.',
      },
      {
        iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        title: 'Ruhige Optik',
        text: 'Großzügige Flächen, lesbare Typografie, ein Akzent.',
      },
    ],
    avatarType: 'initials',
    avatarInitials: 'P',
    quote: 'Weniger Folien. Mehr Wirkung.',
    quoteName: 'Presentation',
    timeline: false,
  },
  services: [
    {
      slug: 'folien-design',
      title: 'Folien-Design',
      description: 'Foliensätze mit klarer Struktur — auf Anfrage.',
      icon: '📊',
      iconSpriteId: 'prop-slide',
      features: ['Bis 20 Folien', 'Termine auf Anfrage', 'PDF + editierbare Datei'],
      price: 'auf Anfrage',
      pageContent: {
        headline: 'Foliensätze mit klarer Struktur',
        intro: 'Weniger Text, mehr Wirkung.',
        forWhom: ['Einen Vortrag ohne Textfriedhof halten möchten'],
        sections: [{ title: 'Ablauf', items: ['Anfrage', 'Bestätigung', 'Finale'] }],
        pricing: [{ label: 'Foliensatz (bis 20 Folien)', price: 'auf Anfrage', highlight: true }],
      },
    },
    {
      slug: 'pitch-deck',
      title: 'Pitch-Deck',
      description: 'Kompakte Decks für den entscheidenden Moment — auf Anfrage.',
      icon: '✨',
      iconSpriteId: 'prop-spark',
      features: ['Bis 12 Folien', 'Termine auf Anfrage', 'PDF + editierbare Datei'],
      price: 'auf Anfrage',
      pageContent: {
        headline: 'Pitch-Decks für den entscheidenden Moment',
        intro: 'Zwölf Folien, ein Ziel.',
        forWhom: ['Eine Idee überzeugend vorstellen möchten'],
        sections: [{ title: 'Ablauf', items: ['Anfrage', 'Bestätigung', 'Finale'] }],
        pricing: [{ label: 'Pitch-Deck (bis 12 Folien)', price: 'auf Anfrage', highlight: true }],
      },
    },
  ],
  leistungen: [
    {
      id: 'folien',
      title: 'Folien & Decks',
      icon: '📊',
      description: 'Zwei Formate zur Auswahl.',
      services: [
        { key: 'folien-20', name: 'Foliensatz', price: 'auf Anfrage', unit: 'bis 20 Folien', desc: 'Foliensätze mit klarer Struktur.', highlight: true, durationMin: 0, multiplier: 1 },
        { key: 'pitch-12', name: 'Pitch-Deck', price: 'auf Anfrage', unit: 'bis 12 Folien', desc: 'Kompakte Decks.', durationMin: 0, multiplier: 1 },
      ],
    },
  ],
  uebermich: {
    pageHeadline: 'Über mich',
    subheadline: 'Presentation',
    introParagraphs: ['Willkommen bei Presentation — Folien, die wirken.'],
    sections: [],
    milestones: [{ year: 'Heute', title: 'Presentation', desc: 'Folien-Design — Termine auf Anfrage.' }],
    notDoing: [],
    privateText: '',
  },
  kontakt: {
    intro: 'Schreiben Sie mir Ihre Anfrage — ich melde mich persönlich.',
    sidebarTitle: 'Anfrage stellen',
    sidebarText: 'Sie schreiben, ich bestätige.',
    sidebarCta: 'Lieber anrufen? Hinterlassen Sie eine Nachricht.',
    showPhone: false,
    footerCity: 'Lüneburg und Umgebung',
  },
  faq: [
    { question: 'Wann ist mein Slot fix?', answer: 'Erst nach meiner persönlichen Bestätigung.' },
  ],
  leistungenCta: {
    href: '/kontakt',
    text: 'Anfrage stellen',
  },
  features: {
    hasBooking: false,
    hasRegistration: false,
    hasOIDC: false,
    hasBilling: false,
  },
};
