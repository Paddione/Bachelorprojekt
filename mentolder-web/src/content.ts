import type { Stat } from '@/components/WhyMeStats';
import type { Service } from '@/components/ServiceRow';
import type { FAQItem } from '@/components/FAQ';

export const SITE = {
  brand: 'mentolder',
  url: 'https://mentolder.de',
  email: 'mail@mentolder.de',
  city: 'Lüneburg',
  person: {
    name: 'Gerald Korczewski',
    role: 'Digital Coach & Mentor',
    initials: 'GK',
  },
  ogImage: 'https://mentolder.de/og-default.png',
} as const;

export const heroContent = {
  title: 'Menschen, Prozesse und Technik',
  titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
  subtitle:
    'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
  tagline: 'Digital Coach · Führungskräfte-Mentor',
};

export const stats: Stat[] = [
  { value: '30+', target: 30, label: 'Jahre Führung' },
  { value: 'KI', label: 'Schwerpunkt' },
  { value: 'K8s', label: 'Cloud-Native' },
  { value: 'B.Sc.', label: 'Wirtschaftsinformatik' },
];

export const services: Service[] = [
  {
    id: 'fuehrungs-coaching',
    title: 'Führungs-Coaching',
    description:
      'Vom Manager zur empathischen Führungskraft. Klarheit, Präsenz und Werkzeuge für wirksames Leadership.',
    features: ['1:1-Sessions', 'Zwischenstand nach 6 Wochen', 'Vertraulich'],
    price: 'ab 240',
    priceUnit: 'EUR / 60 min',
    href: '/angebote/fuehrung',
    icon: 'fuehrung',
  },
  {
    id: 'digitale-transformation',
    title: 'Digitale Transformation',
    description:
      'Vom Pilot zum Produktiv-System. Cloud, KI, DevOps — pragmatisch, ohne Hype und mit klaren Meilensteinen.',
    features: ['Cloud / K8s', 'KI-Enablement', 'Architektur-Reviews'],
    price: 'ab 1.200',
    priceUnit: 'EUR / Tag',
    href: '/angebote/digitalisierung',
    icon: 'digitalisierung',
  },
  {
    id: 'team-readiness',
    title: 'Team-Readiness',
    description:
      'Teams befähigen, moderne Tools sicher zu nutzen. Workshops, die verbinden statt belehren — mit Fokus auf Wirkung.',
    features: ['Halbtages-Workshop', 'Vor-Ort oder Remote', 'Follow-up-Email'],
    price: 'ab 980',
    priceUnit: 'EUR / Workshop',
    href: '/angebote/team',
    icon: 'team',
  },
];

export const whyMePoints = [
  {
    title: '30+ Jahre Führungserfahrung',
    text: 'Vom Teamlead bis zur Geschäftsführung. Ich kenne die Grautöne zwischen Folie und Werkbank.',
  },
  {
    title: 'Technik trifft Empathie',
    text: 'Cloud, KI, DevOps — aber immer im Dienst der Menschen, die sie nutzen.',
  },
  {
    title: 'Pragmatismus statt Hype',
    text: 'Wir bauen, was wirklich nützt. Keine Vendor-Pitches, keine Modeerscheinungen.',
  },
  {
    title: 'Diskretion ist selbstverständlich',
    text: 'Was im Coaching besprochen wird, bleibt im Coaching. Punkt.',
  },
];

export const whyMeHeadline = 'Warum mit mir?';
export const whyMeIntro =
  'Ich *verbinde* technische Tiefe mit menschlicher Klarheit — und arbeite mit Menschen, die Verantwortung tragen.';

export const faqItems: FAQItem[] = [
  {
    question: 'Wie läuft ein Erstgespräch ab?',
    answer:
      '30 Minuten, kostenlos und unverbindlich. Wir klären Ihre Situation, Ihre Ziele und ob eine Zusammenarbeit sinnvoll ist. Kein Verkaufsdruck.',
  },
  {
    question: 'Arbeiten Sie remote oder vor Ort?',
    answer:
      'Beides. Coaching und Beratung funktionieren remote oft besser (keine Anreise, mehr Fokus). Workshops und Vorträge mache ich bevorzugt vor Ort in Lüneburg und Umgebung, deutschlandweit auf Anfrage.',
  },
  {
    question: 'Was kostet eine Coaching-Stunde?',
    answer:
      'Führungs-Coaching 240 EUR / 60 min, Strategie-Session 320 EUR / 90 min. Pakete mit verbindlichem Kontingent auf Anfrage.',
  },
  {
    question: 'Vertraulichkeit?',
    answer:
      'Alle Inhalte sind streng vertraulich. Auf Wunsch unterzeichne ich eine NDA, bevor wir starten.',
  },
  {
    question: 'Wie schnell können Sie starten?',
    answer:
      'In der Regel innerhalb von 7 Tagen. Für Workshops plane ich 3–4 Wochen Vorlauf, damit die Agenda wirklich passt.',
  },
];

export const processSteps = [
  { num: '01', title: 'Kennenlernen', text: 'Kostenloses 30-Minuten-Erstgespräch, online oder vor Ort.' },
  { num: '02', title: 'Klärung', text: 'Wir definieren Ziele, Umfang und Zeitrahmen — schriftlich, transparent.' },
  { num: '03', title: 'Umsetzung', text: 'Sessions, Workshops oder Beratung — wie vereinbart.' },
  { num: '04', title: 'Transfer', text: 'Sie nehmen Werkzeuge mit, die wirklich in Ihren Alltag passen.' },
];
