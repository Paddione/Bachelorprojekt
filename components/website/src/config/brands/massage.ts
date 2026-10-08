import type { BrandConfig } from '../types';
import { massagePriceLabel } from '../../lib/massage-pricing';

const DISCLAIMER = 'Zur Entspannung und für das Wohlbefinden — keine Behandlung von Krankheiten.';

export const massageConfig: BrandConfig = {
  brand: 'massage',
  meta: {
    siteTitle: 'Massagepraxis Vögelsen',
    siteDescription: 'Massagepraxis Vögelsen — Auszeit für Rücken und Schultern. Termine auf Anfrage in Vögelsen bei Lüneburg. Entspannung und Wohlbefinden.',
  },
  contact: {
    name: process.env.CONTACT_NAME ?? '',
    email: process.env.CONTACT_EMAIL ?? '',
    phone: process.env.CONTACT_PHONE ?? '',
    city: process.env.CONTACT_CITY ?? 'Vögelsen bei Lüneburg',
  },
  legal: {
    street: process.env.LEGAL_STREET ?? '',
    zip: process.env.LEGAL_ZIP ?? '',
    jobtitle: process.env.LEGAL_JOBTITLE ?? '',
    chamber: process.env.LEGAL_CHAMBER ?? '',
    ustId: process.env.LEGAL_UST_ID ?? '',
    website: process.env.LEGAL_WEBSITE ?? '',
    tagline: 'Massagepraxis Vögelsen',
  },
  navigation: [
    { label: 'Leistungen',      href: '/leistungen' },
    { label: 'Über mich',       href: '/ueber-mich' },
    { label: 'Häufige Fragen',  href: '/faq' },
    { label: 'Kontakt',         href: '/kontakt' },
  ],
  navigationCta: 'Termin anfragen',
  footer: {
    copyright: `© ${new Date().getFullYear()} Massagepraxis Vögelsen — Alle Rechte vorbehalten`,
    columns: [
      {
        heading: 'Rechtliches',
        links: [
          { label: 'Impressum',   href: '/impressum' },
          { label: 'Datenschutz', href: '/datenschutz' },
        ],
      },
    ],
  },
  homepage: {
    stats: [
      { value: '30 Min.', label: 'Rückenmassage — kurze Auszeit' },
      { value: '60/90 Min.', label: 'Ganzkörpermassage — tief entspannen' },
      { value: '3 Schritte', label: 'Von der Anfrage bis zum Besuch' },
      { value: 'Mo–Fr', label: 'Kernzeiten plus flexible Slots' },
    ],
    servicesHeadline: 'Massage-Anwendungen im Überblick',
    servicesSubheadline: 'Zwei Anwendungen, drei Zeitformate — alle Termine auf Anfrage mit persönlicher Bestätigung durch die Inhaberin.',
    whyMeHeadline: 'Warum hier?',
    whyMeIntro: 'Eine kleine Praxis vor Ort: feste Hände, ruhige Atmosphäre und ein Ablauf in drei Schritten — Anfrage, Bestätigung, Besuch.',
    whyMePoints: [
      {
        iconPath: 'M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z',
        title: 'Praxis vor Ort',
        text: 'In Vögelsen bei Lüneburg — kurze Wege, bekannte Gesichter, keine anonyme Kette.',
      },
      {
        iconPath: 'M7 11.5V14m0-2.5v-6a1.5 1.5 0 013 0V11m0-5.5a1.5 1.5 0 013 0V11m0-2.5a1.5 1.5 0 013 0v6c0 3-2 5.5-5.5 5.5S7 17 5.5 14.5L4 11.5c-.6-1.5.8-2.6 2-1.5l1 1z',
        title: 'Feste Hände',
        text: 'Ruhige, erfahrene Griffe — abgestimmt auf Ihren Rücken, Ihre Schultern, Ihren Tag.',
      },
      {
        iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        title: 'Ruhige Atmosphäre',
        text: 'Gedämpftes Licht, warme Liege, Zeit ohne Hektik — vom ersten Moment an.',
      },
      {
        iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        title: 'Ablauf in drei Schritten',
        text: 'Anfrage stellen, Bestätigung erhalten, Besuch genießen — alles Weitere klären wir persönlich.',
      },
    ],
    avatarType: 'initials',
    avatarInitials: 'M',
    quote: 'Eine Auszeit für Rücken und Schultern — mitten in Vögelsen.',
    quoteName: 'Massagepraxis Vögelsen',
    timeline: false,
    identityImage: { src: 'slot:slot-portrait-inhaberin', alt: 'Porträt der Inhaberin (Foto folgt)' },
  },
  services: [
    {
      slug: 'rueckenmassage',
      title: 'Rückenmassage',
      description: '30 Minuten Auszeit für Rücken und Schultern — auf Anfrage in Vögelsen bei Lüneburg.',
      icon: '💆',
      features: [
        '30 Minuten, gezielt für Rücken und Schultern',
        'Termine auf Anfrage, Bestätigung durch die Inhaberin',
        'Zahlung vor Ort mit Rechnung',
      ],
      price: massagePriceLabel(30),
      pageContent: {
        headline: 'Rückenmassage in 30 Minuten',
        intro: 'Eine kurze, wohltuende Auszeit für Rücken und Schultern — ideal in der Mittagspause oder nach einem langen Tag.',
        forWhom: [
          'Viel sitzen und sich eine Pause für den Rücken wünschen',
          'Eine erste Anwendung in ruhiger Atmosphäre ausprobieren möchten',
          'Regelmäßig eine kurze Auszeit suchen',
        ],
        sections: [
          { title: 'Ablauf', items: ['Anfrage mit Wunschtermin', 'Persönliche Bestätigung durch die Inhaberin', 'Besuch in der Praxis in Vögelsen bei Lüneburg'] },
          { title: 'Gut zu wissen', items: ['Dauer: 30 Minuten', 'Zahlung vor Ort mit Rechnung', DISCLAIMER] },
        ],
        pricing: [
          { label: 'Rückenmassage (30 Min.)', price: massagePriceLabel(30), highlight: true },
        ],
        faq: [
          { question: 'Wie schnell bekomme ich einen Termin?', answer: 'Bitte fragen Sie möglichst am Vortag an. Ihr Termin ist erst nach meiner Bestätigung fix.' },
          { question: 'Wie kann ich zahlen?', answer: 'Bequem vor Ort — Sie erhalten eine Rechnung.' },
        ],
      },
    },
    {
      slug: 'ganzkoerpermassage',
      title: 'Ganzkörpermassage',
      description: '60 oder 90 Minuten tiefe Entspannung für den ganzen Körper — auf Anfrage in Vögelsen bei Lüneburg.',
      icon: '🌿',
      features: [
        '60 oder 90 Minuten, individuell abgestimmt',
        'Termine auf Anfrage, Bestätigung durch die Inhaberin',
        'Zahlung vor Ort mit Rechnung',
      ],
      price: massagePriceLabel(60),
      pageContent: {
        headline: 'Ganzkörpermassage in 60 oder 90 Minuten',
        intro: 'Zeit zum Abschalten: Eine Ganzkörpermassage in ruhiger Atmosphäre — wahlweise 60 oder 90 Minuten.',
        forWhom: [
          'Sich eine längere Auszeit vom Alltag wünschen',
          'Regelmäßige Entspannung suchen',
          'Einfach einmal nichts tun möchten',
        ],
        sections: [
          { title: 'Ablauf', items: ['Anfrage mit Wunschtermin und Dauer', 'Persönliche Bestätigung durch die Inhaberin', 'Besuch in der Praxis in Vögelsen bei Lüneburg'] },
          { title: 'Gut zu wissen', items: ['Dauer: 60 oder 90 Minuten', 'Zahlung vor Ort mit Rechnung', DISCLAIMER] },
        ],
        pricing: [
          { label: 'Ganzkörpermassage (60 Min.)', price: massagePriceLabel(60), highlight: true },
          { label: 'Ganzkörpermassage (90 Min.)', price: massagePriceLabel(90) },
        ],
        faq: [
          { question: 'Welche Dauer passt zu mir?', answer: '60 Minuten sind eine gute erste Auszeit; 90 Minuten lassen noch mehr Ruhe zu. Schreiben Sie Ihren Wunsch in die Anfrage.' },
          { question: 'Wie kann ich zahlen?', answer: 'Bequem vor Ort — Sie erhalten eine Rechnung.' },
        ],
      },
    },
  ],
  leistungen: [
    {
      id: 'massage-anwendungen',
      title: 'Massage-Anwendungen',
      icon: '💆',
      description: 'Drei Zeitformate zur Auswahl. Zur Entspannung und für das Wohlbefinden — keine Behandlung von Krankheiten.',
      services: [
        { key: 'ruecken-30', name: 'Rückenmassage', price: massagePriceLabel(30), unit: '30 Min.', desc: 'Kurze Auszeit für Rücken und Schultern.', durationMin: 30, multiplier: 1 },
        { key: 'ganzkoerper-60', name: 'Ganzkörpermassage', price: massagePriceLabel(60), unit: '60 Min.', desc: 'Tiefe Entspannung für den ganzen Körper.', highlight: true, durationMin: 60, multiplier: 1 },
        { key: 'ganzkoerper-90', name: 'Ganzkörpermassage', price: massagePriceLabel(90), unit: '90 Min.', desc: 'Die lange Auszeit — 90 Minuten Ruhe.', durationMin: 90, multiplier: 1 },
      ],
    },
  ],
  leistungenPricingHighlight: [
    { label: 'Ganzkörpermassage (60 Min.)', price: massagePriceLabel(60), note: 'Zahlung vor Ort mit Rechnung', highlight: true },
  ],
  uebermich: {
    pageHeadline: 'Über mich',
    subheadline: 'Massagepraxis Vögelsen',
    introParagraphs: [
      'Ich bin Birgit Korczewski und begrüße Sie in meiner Massagepraxis in Vögelsen bei Lüneburg.',
      'Meine Qualifikation: ausgebildete Masseurin.',
    ],
    sections: [],
    milestones: [
      { year: 'Heute', title: 'Praxis in Vögelsen bei Lüneburg', desc: 'Massagepraxis in Vögelsen bei Lüneburg — Termine auf Anfrage.' },
    ],
    notDoing: [
      { title: 'Keine Behandlung von Krankheiten', text: 'Massagen dienen der Entspannung und dem Wohlbefinden — sie ersetzen keine ärztliche Diagnose oder Behandlung.' },
    ],
    privateText: 'Meine Praxis liegt in Vögelsen bei Lüneburg. Die genaue Anfahrt erhalten Sie nach bestätigter Buchung — persönlich und unkompliziert.',
  },
  kontakt: {
    intro: 'Schreiben Sie mir Ihre Anfrage mit Wunschtermin — ich melde mich persönlich bei Ihnen und bestätige Ihren Termin.',
    sidebarTitle: 'Termin anfragen',
    sidebarText: 'Termine auf Anfrage: Sie schreiben, ich bestätige. So bleibt genug Zeit für jeden Besuch — ohne Wartezimmer-Hektik.',
    sidebarCta: 'Lieber anrufen? Rufen Sie gerne an — oder hinterlassen Sie eine Nachricht, ich rufe verlässlich zurück.',
    showPhone: false,
    footerCity: 'Vögelsen bei Lüneburg',
  },
  faq: [
    { question: 'Warum erst am Vortag anfragen?', answer: 'Bitte fragen Sie möglichst am Vortag an, damit ich Ihren Besuch in Ruhe einplanen kann. Kurzfristige Lücken vergebe ich, wann immer es passt.' },
    { question: 'Wann ist mein Termin fix?', answer: 'Ihr Termin ist erst nach meiner persönlichen Bestätigung fix. Auf jede Anfrage erhalten Sie eine Antwort.' },
    { question: 'Bieten Sie Hausbesuche an?', answer: 'Hausbesuche biete ich nur für bekannte Kunden an. Alle anderen begrüße ich gerne in der Praxis in Vögelsen bei Lüneburg.' },
    { question: 'Wie kann ich zahlen?', answer: 'Bequem vor Ort — Sie erhalten eine Rechnung.' },
    { question: 'Was passiert bei einer Absage?', answer: 'Bitte sagen Sie so früh wie möglich ab. Es gilt: Kostenfreier Storno bis 24 h vor Terminbeginn, danach 50 % des Preises.' },
  ],
  leistungenCta: {
    href: '/kontakt',
    text: 'Termin anfragen',
  },
  features: {
    hasBooking: false,
    hasRegistration: false,
    hasOIDC: false,
    hasBilling: false,
  },
};
