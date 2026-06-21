import { SCHEMA_VERSION, type HomepageBlocksDocumentType } from './schema';

export const homepageSeed: HomepageBlocksDocumentType = {
  schemaVersion: SCHEMA_VERSION,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'Menschen, Prozesse und Technik',
        titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
        subtitle:
          'Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe.',
        tagline: 'Digital Coach · Führungskräfte-Mentor',
        avatarType: 'initials',
        avatarInitials: 'GK',
        personName: 'Gerald Korczewski',
        personRole: 'Digital Coach & Mentor',
      },
    },
    {
      id: 'stats',
      type: 'stats',
      props: {
        items: [
          { value: '30+', target: 30, label: 'Jahre Führung' },
          { value: 'KI', label: 'Schwerpunkt' },
          { value: 'K8s', label: 'Cloud-Native' },
          { value: 'B.Sc.', label: 'Wirtschaftsinformatik' },
        ],
      },
    },
    {
      id: 'services',
      type: 'services',
      props: {
        headline: 'Drei Wege, mit mir zu arbeiten.',
        subheadline:
          'Vom Coaching über Transformation bis zum Workshop — wählen Sie das Format, das zu Ihrer Situation passt.',
        items: [
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
        ],
      },
    },
    {
      id: 'whyMe',
      type: 'whyMe',
      props: {
        headline: 'Warum mit mir?',
        intro: {
          prefix: 'Ich ',
          emphasis: 'verbinde',
          suffix: ' technische Tiefe mit menschlicher Klarheit.',
        },
        points: [
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
        ],
        quote:
          'Gerald hat es geschafft, technische Tiefe und menschliche Wärme in jeden Termin zu bringen. Selten so klar gefragt, so präzise geantwortet.',
        quoteName: 'Dr. M. Albers',
        quoteRole: 'CTO · mittelständisches SaaS-Unternehmen',
      },
    },
    {
      id: 'process',
      type: 'process',
      props: {
        eyebrow: "So geht's los",
        headline: 'In vier Schritten zu mehr Klarheit.',
        steps: [
          {
            num: '01',
            title: 'Kennenlernen',
            text: 'Kostenloses 30-Minuten-Erstgespräch, online oder vor Ort.',
          },
          {
            num: '02',
            title: 'Klärung',
            text: 'Wir definieren Ziele, Umfang und Zeitrahmen — schriftlich, transparent.',
          },
          {
            num: '03',
            title: 'Umsetzung',
            text: 'Sessions, Workshops oder Beratung — wie vereinbart.',
          },
          {
            num: '04',
            title: 'Transfer',
            text: 'Sie nehmen Werkzeuge mit, die wirklich in Ihren Alltag passen.',
          },
        ],
      },
    },
    {
      id: 'faq',
      type: 'faq',
      props: {
        title: 'Häufige Fragen',
        items: [
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
        ],
      },
    },
    {
      id: 'cta',
      type: 'cta',
      props: {
        eyebrow: 'Bereit?',
        title: 'Lassen Sie uns',
        titleEmphasis: 'herausfinden, ob es passt.',
        subtitle:
          '30 Minuten, kostenlos, unverbindlich. Antwort innerhalb von 48 Stunden.',
        primaryText: 'Termin vereinbaren',
        primaryHref: '/kontakt',
        secondaryText: 'mail@mentolder.de',
        secondaryHref: 'mailto:mail@mentolder.de',
      },
    },
  ],
};
