import { SCHEMA_VERSION, type HomepageBlocksDocumentType } from './schema';

export const homepageSeed: HomepageBlocksDocumentType = {
  schemaVersion: SCHEMA_VERSION,
  blocks: [
    {
      id: 'hero',
      type: 'hero',
      props: {
        title: 'Digital Coach & Führungskräfte-Mentor –',
        titleEmphasis: 'praxisnah. Strukturiert. Auf Augenhöhe.',
        subtitle:
          'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools. Ich weiß, wie Veränderung in komplexen Organisationen wirklich funktioniert.',
        tagline: 'Coaching · Digitale Begleitung · KI-Transition',
        avatarType: 'initials',
        avatarInitials: 'GK',
        personName: 'Gerald Korczewski',
        personRole: 'Coach und digitaler Begleiter',
      },
    },
    {
      id: 'stats',
      type: 'stats',
      props: {
        items: [
          { value: '30+', target: 30, label: 'Jahre Führungserfahrung' },
          { value: '50+', label: 'Begleitete Teilnehmer' },
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
              'Digitale Begleitung für Menschen 65+ in Lüneburg und Hamburg. Smartphone, WhatsApp, Online-Banking – Schritt für Schritt, ohne Fachchinesisch.',
            features: ['Smartphone & Tablet Grundlagen', 'WhatsApp & Videocalls', 'Online-Banking & Shopping sicher nutzen'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/50plus-digital',
            icon: 'team',
          },
          {
            id: 'coaching',
            title: 'Coaching für Führungskräfte',
            description:
              'Ihre Karriere strategisch gestalten. Ich unterstütze erfahrene Führungskräfte bei der beruflichen Neuorientierung.',
            features: ['Profil-Schärfung & Positionierung', 'Karriere-Strategie', 'Sparring auf Augenhöhe'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/coaching',
            icon: 'fuehrung',
          },
          {
            id: 'fuehrung-persoenlichkeit',
            title: 'Führung & Persönlichkeit',
            description:
              'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Für Führungskräfte, die ihren eigenen Stil stärken wollen.',
            features: ['Standortbestimmung als Führungsperson', 'Führungsstil entwickeln', 'Authentizität stärken'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/fuehrung-persoenlichkeit',
            icon: 'kommunikation',
          },
          {
            id: 'beratung',
            title: 'Unternehmensberatung',
            description:
              'Digitale Transformation & KI-Strategie für Mittelstand, Verwaltung und kritische Infrastrukturen – mit 40 Jahren Praxis.',
            features: ['Analyse & digitale Strategie', 'Change Management', 'Umsetzungsbegleitung'],
            price: 'nach Vereinbarung',
            priceUnit: '',
            href: '/leistungen/beratung',
            icon: 'strategie',
          },
          {
            id: 'ki-transition',
            title: 'KI-Transition Coaching',
            description:
              'KI verändert Berufsbilder – ich begleite Sie dabei. Für IT-Fachkräfte, Führungspersönlichkeiten und Unternehmen.',
            features: ['Standortbestimmung & Kompetenz-Analyse', 'Unlearning-Prozess', 'Neuorientierung & Strategie'],
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
          suffix: ' UND modernste KI-Tools.',
        },
        points: [
          {
            title: 'Erste deutsche Polizeibehörde mit KI',
            text: 'Pionier, nicht Nachahmer. Gesichtserkennung, BOS-Digitalfunk, bundesweit führend.',
          },
          {
            title: 'Systemischer Coach',
            text: 'Nicht nur IT, sondern auch Menschen. Ich verbinde technologisches Verständnis mit Empathie – geprägt durch den Brückenschlag zwischen Polizei, Verwaltung und Bürgern.',
          },
          {
            title: 'Generation 65+ aus eigener Erfahrung',
            text: '65 Jahre. Ich kenne die Herausforderungen aus eigener Erfahrung und spreche Ihre Sprache.',
          },
          {
            title: 'Wie ich arbeite',
            text: 'Ich verbinde analytische Präzision mit echter Beziehungsarbeit. Menschen erleben bei mir zuerst Verständnis und Sicherheit — dadurch entsteht Vertrauen für die Veränderung.',
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
            num: '01',
            title: 'Kennenlernen',
            text: 'Kostenloses 30-Minuten-Erstgespräch. Wir klären: Wo stehen Sie? Was ist Ihre größte Herausforderung?',
          },
          {
            num: '02',
            title: 'Ziele definieren',
            text: 'Wir definieren gemeinsam klare Ziele, den Rahmen der Zusammenarbeit und den ersten Schritt.',
          },
          {
            num: '03',
            title: 'Gemeinsam arbeiten',
            text: 'Sessions, Workshops oder Beratung — wie vereinbart, in Ihrem Tempo.',
          },
          {
            num: '04',
            title: 'Nachhaltigkeit',
            text: 'Was wir erarbeiten, gehört Ihnen. Kein Dauermandat — ich ziele auf Ihre Selbstständigkeit.',
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
              'Wir starten mit einem kostenlosen Erstgespräch (30–45 Min.), um Ihre Situation zu verstehen. Danach arbeiten wir in individuellen Sessions an Ihren Zielen – online oder vor Ort.',
          },
          {
            question: 'Arbeiten Sie auch online?',
            answer:
              'Ja! Coaching und Beratung funktionieren hervorragend online per Video. 65+ digital biete ich bevorzugt vor Ort in Lüneburg und Hamburg an.',
          },
          {
            question: 'Was kostet ein Erstgespräch?',
            answer:
              'Nichts. Das Erstgespräch ist kostenlos und unverbindlich. Wir lernen uns kennen und klären, ob eine Zusammenarbeit passt.',
          },
          {
            question: 'Was unterscheidet Sie von anderen Coaches?',
            answer:
              'Ich komme aus 30+ Jahren Führungspraxis bei der Polizei Hamburg. Ich kenne beide Seiten des Tisches, bin direkt und ehrlich – und verstehe die Herausforderungen der Generation 65+ aus eigener Erfahrung.',
          },
        ],
      },
    },
    {
      id: 'cta',
      type: 'cta',
      props: {
        eyebrow: 'Bereit?',
        title: 'Kostenloses Erstgespräch',
        titleEmphasis: 'jetzt buchen.',
        subtitle:
          '30 Minuten, kostenlos und unverbindlich. Wir klären, ob und wie eine Zusammenarbeit passt.',
        primaryText: 'Termin vereinbaren',
        primaryHref: '/kontakt',
        secondaryText: 'info@mentolder.de',
        secondaryHref: 'mailto:info@mentolder.de',
      },
    },
  ],
};
