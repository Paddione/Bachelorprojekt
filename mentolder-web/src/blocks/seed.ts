import { SCHEMA_VERSION, type HomepageBlocksDocumentType } from './schema';

export const homepageSeed: HomepageBlocksDocumentType = {
  schemaVersion: SCHEMA_VERSION,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'Digital Coach & Führungskräfte-Mentor –',
        titleEmphasis: 'der Mensch und Technologie wieder verbindet.',
        subtitle:
          'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools. Ich weiß, wie Veränderung in komplexen Organisationen wirklich funktioniert.',
        tagline: 'Praxisnah. Strukturiert. Auf Augenhöhe.',
        avatarType: 'image',
        avatarSrc: '/gerald.jpg',
        personName: 'Gerald Korczewski',
        personRole: 'Digital Coach & Mentor',
      },
    },
    {
      id: 'stats',
      type: 'stats',
      props: {
        items: [
          { value: '30+', target: 30, label: 'Jahre Führungserfahrung' },
          { value: '65+', label: 'Begleitete Teilnehmer' },
          { value: '40', target: 40, label: 'Jahre Praxis in IT & Sicherheit' },
          { value: 'KI', label: 'Pionier der ersten Stunde' },
        ],
      },
    },
    {
      id: 'services',
      type: 'services',
      props: {
        headline: 'Meine Angebote',
        subheadline:
          'Sie suchen jemanden, der Menschen, Prozesse und Technik verbindet? Der Führungserfahrung mit Empathie vereint?',
        items: [
          {
            id: '50plus-digital',
            title: '65+ digital',
            description:
              'Digitale Begleitung für Menschen 65+ in Lüneburg und Hamburg. Smartphone, WhatsApp, Online-Banking – Schritt für Schritt, ohne Fachchinesisch, in Ihrem Tempo.',
            features: ['Smartphone, Tablet & Computer Grundlagen', 'WhatsApp, Email & Videocalls', 'Online-Banking & Shopping sicher nutzen', 'Datenschutz & Sicherheit verstehen – inkl. ChatGPT, Claude, Perplexity'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/50plus-digital',
            icon: 'team',
          },
          {
            id: 'coaching',
            title: 'Coaching für Führungskräfte und Menschen in Verantwortung',
            description:
              'Ihre Karriere strategisch gestalten. Ich unterstütze erfahrene Führungskräfte bei der beruflichen Neuorientierung.',
            features: ['Profil-Schärfung & Positionierung', 'Karriere-Strategie entwickeln', 'Gesprächsvorbereitung (Headhunter, Vorstellungsgespräche)', 'Sparring auf Augenhöhe'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/coaching',
            icon: 'fuehrung',
          },
          {
            id: 'fuehrung-persoenlichkeit',
            title: 'Führung & Persönlichkeit',
            description:
              'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Für Führungskräfte, die verstehen wollen, wer sie als Führungsperson sind – und wer sie sein möchten.',
            features: ['Standortbestimmung als Führungsperson', 'Führungsstil entwickeln & stärken', 'Führen in Veränderungsprozessen', 'Frauen in Führung gezielt begleiten'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/fuehrung-persoenlichkeit',
            icon: 'kommunikation',
          },
          {
            id: 'beratung',
            title: 'Unternehmensberatung',
            description:
              'Digitale Transformation & KI-Strategie für Mittelstand, Verwaltung und kritische Infrastrukturen – mit 40 Jahren Praxis. Lüneburg & Hamburg.',
            features: ['Analyse & digitale Strategie', 'Change Management & Teamschulungen', 'Umsetzungsbegleitung & Prozessoptimierung', 'Nachhaltige interne Kompetenz aufbauen'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/beratung',
            icon: 'strategie',
          },
          {
            id: 'ki-transition',
            title: 'KI-Transition Coaching',
            description:
              'KI verändert Berufsbilder – ich begleite Sie dabei. Für IT-Fachkräfte, Führungspersönlichkeiten und Unternehmen in Lüneburg, Hamburg und online.',
            features: ['Standortbestimmung & Kompetenz-Analyse', 'Strukturierter Unlearning-Prozess', 'Neuorientierung & Strategie für die KI-Zukunft', 'Team-Workshops & Change-Begleitung'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/ki-transition',
            icon: 'digitalisierung',
          },
        ],
      },
    },
    {
      id: 'whyMe',
      type: 'whyMe',
      props: {
        headline: 'Warum ich?',
        intro: {
          prefix: 'Ich kenne beide Welten: ',
          emphasis: '40 Jahre etablierte Strukturen',
          suffix: ' UND modernste KI-Tools. Ich weiß, wie Veränderung in komplexen Organisationen wirklich funktioniert.',
        },
        points: [
          {
            title: 'Erste deutsche Polizeibehörde mit KI',
            text: 'Pionier, nicht Nachahmer. Gesichtserkennung, BOS-Digitalfunk, bundesweit führend.',
          },
          {
            title: 'Systemischer Coach',
            text: 'Nicht nur IT, sondern auch Menschen. Ich verbinde technologisches Verständnis mit Empathie.',
          },
          {
            title: 'Generation 65+ digital aus eigener Erfahrung',
            text: '65 Jahre. Ich kenne die Herausforderungen aus eigener Erfahrung und spreche Ihre Sprache.',
          },
        ],
        quote:
          'Ich stelle unbequeme Fragen – weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.',
        quoteName: 'Gerald Korczewski',
        quoteRole: 'Coach und digitaler Begleiter',
      },
    },
    {
      id: 'process',
      type: 'process',
      props: {
        eyebrow: 'So arbeiten wir',
        headline: 'Vier ruhige Schritte.',
        steps: [
          {
            num: '01 — Erstgespräch',
            title: 'Kennenlernen',
            text: '30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung.',
          },
          {
            num: '02 — Klarheit',
            title: 'Zieldefinition',
            text: 'Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?',
          },
          {
            num: '03 — Begleitung',
            title: 'Arbeitsphase',
            text: 'Individuelle Sessions in Ihrem Tempo – online oder vor Ort in Lüneburg und Umgebung.',
          },
          {
            num: '04 — Transfer',
            title: 'Nachhaltigkeit',
            text: 'Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung.',
          },
        ],
      },
    },
    {
      id: 'faq',
      type: 'faq',
      props: {
        title: 'Häufig gestellte Fragen',
        items: [
          {
            question: 'Für wen ist 65+ digital geeignet?',
            answer:
              'Für alle Menschen 65+, die digital selbständiger werden möchten. Keine Vorkenntnisse nötig – wir fangen genau da an, wo Sie stehen.',
          },
          {
            question: 'Wie läuft ein Coaching ab?',
            answer:
              'Wir starten mit einem kostenlosen Erstgespräch (30-45 Min.), um Ihre Situation zu verstehen. Danach arbeiten wir in individuellen Sessions an Ihren Zielen – online oder vor Ort.',
          },
          {
            question: 'Arbeiten Sie auch online?',
            answer:
              'Ja! Coaching und Beratung funktionieren hervorragend online per Video. 65+ digital biete ich bevorzugt vor Ort in Hamburg an.',
          },
          {
            question: 'Was kostet ein Erstgespräch?',
            answer:
              'Nichts. Das Erstgespräch ist kostenlos und unverbindlich. Wir lernen uns kennen und klären, ob eine Zusammenarbeit passt.',
          },
          {
            question: 'Was unterscheidet Sie von anderen Coaches?',
            answer:
              'Ich komme aus 30+ Jahren Führungspraxis bei der Polizei Hamburg. Ich kenne beide Seiten des Tisches, bin direkt und ehrlich – und verstehe die Herausforderungen der Generation 65+ digital aus eigener Erfahrung.',
          },
        ],
      },
    },
    {
      id: 'cta',
      type: 'cta',
      props: {
        eyebrow: 'Kostenloses Erstgespräch',
        title: 'In 30 Minuten wissen wir,',
        titleEmphasis: 'ob es passt.',
        subtitle:
          'Kein Verkaufsgespräch. Kein Druck. Nur Klarheit. Wo stehen Sie – und wie könnte eine Zusammenarbeit konkret aussehen?',
        primaryText: 'Termin vorschlagen',
        primaryHref: '/kontakt',
        secondaryText: 'mail@mentolder.de',
        secondaryHref: 'mailto:mail@mentolder.de',
      },
    },
  ],
};
