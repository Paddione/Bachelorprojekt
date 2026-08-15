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

// ─── Über-mich ────────────────────────────────────────────────────────────────

export interface UeberMichMilestone {
  year: string;
  title: string;
  desc: string;
}

export interface UeberMichSection {
  title: string;
  content: string;
}

export interface NotDoingItem {
  title: string;
  text: string;
}

export const ueberMich = {
  kicker: ['Über mich', 'Hamburg', 'DE'] as string[],
  headline: 'Von der Polizei Hamburg',
  headlineEmphasis: 'in die digitale Begleitung.',
  lede: 'Nach über 30 Jahren bei der Polizei Hamburg – davon viele Jahre in Führungspositionen – habe ich 2023 einen neuen Weg eingeschlagen. Was ich in all den Jahren gelernt habe? Menschen führen bedeutet vor allem: Menschen verstehen, Geduld haben, und Wissen so vermitteln, dass es ankommt.',
  milestones: [
    { year: '1980–2023', title: 'Polizei Hamburg', desc: 'Über 30 Jahre in Führungspositionen. Personalführung, Organisationsentwicklung, Strategie.' },
    { year: 'ca. 2016/17', title: 'KI-Pionier', desc: 'Erste deutsche Polizeibehörde mit KI/Gesichtserkennung. BOS-Digitalfunk bundesweit führend gemacht.' },
    { year: '2023', title: 'Digital Café', desc: '6 Monate Digital Café im Altenheim verantwortlich mitgestaltet. Über 50 Teilnehmer individuell begleitet.' },
    { year: 'Seit 2024', title: 'Selbstständig', desc: 'Coach und Digitaler Begleiter. Führungskräfte-Coaching und Unternehmensberatung.' },
  ] as UeberMichMilestone[],
  sections: [
    { title: 'Warum 65+ digital?', content: 'Als ich im Altenheim ein halbes Jahr lang ein Digital Café verantwortlich mitgestaltet habe, merkte ich: Hier kann ich genau diese Fähigkeiten einsetzen. Menschen der Generation 65+ stehen vor echten Herausforderungen in der digitalen Welt. Nicht weil sie "zu alt" sind – sondern weil niemand sich die Zeit nimmt, es in Ruhe und verständlich zu erklären.' },
    { title: 'Warum Führungskräfte-Coaching?', content: '30+ Jahre Führungserfahrung bedeutet auch: Ich kenne beide Seiten. Ich habe hunderte Führungskräfte eingestellt, entwickelt, befördert. Ich weiß, worauf es ankommt. Diese Erfahrung gebe ich heute weiter.' },
  ] as UeberMichSection[],
  notDoing: [
    { title: 'Keine technische Umsetzung', text: 'Ich berate, entwickle Strategien und begleite Change-Prozesse. Programmierung überlasse ich Spezialisten.' },
    { title: 'Keine Online-Kurse', text: 'Ich glaube an persönliche Begleitung statt standardisierte, skalierbare Produkte.' },
  ] as NotDoingItem[],
};

// ─── Leistungen ───────────────────────────────────────────────────────────────

// Hinweis: IconName-Import gehört an den Dateianfang von content.ts, nicht hier.
// Stattdessen inline-Union für Typsicherheit ohne zusätzlichen Import:

export interface LeistungPageContent {
  headline: string;
  intro: string;
  sections: Array<{ title: string; content: string }>;
  forWhom: string[];
  faq: Array<{ question: string; answer: string }>;
}

export interface LeistungService {
  slug: string;
  title: string;
  price: string;
  priceUnit: string;
  description: string;
  features: string[];
  icon: 'fuehrung' | 'digitalisierung' | 'team' | 'strategie' | 'kommunikation' | 'resilienz';
  pageContent: LeistungPageContent;
}

export interface LeistungKategorie {
  id: string;
  label: string;
  title: string;
  description: string;
  services: LeistungService[];
}

export const leistungenKategorien: LeistungKategorie[] = [
  {
    id: 'fuehrungskraefte',
    label: 'Coaching',
    title: 'Führungskräfte-Coaching',
    description: 'Für Entscheider in KMU und kommunalen Einrichtungen, die digitalen Wandel gestalten, Teams führen oder persönliche Entwicklungsthemen bearbeiten möchten.',
    services: [
      {
        slug: 'coaching',
        title: 'Coaching für Führungskräfte und Menschen in Verantwortung',
        price: 'nach Vereinbarung',
        priceUnit: '',
        description: 'Ihre Karriere strategisch gestalten. Ich unterstütze erfahrene Führungskräfte bei der beruflichen Neuorientierung.',
        features: ['Profil-Schärfung & Positionierung', 'Karriere-Strategie entwickeln', 'Gesprächsvorbereitung (Headhunter, Vorstellungsgespräche)', 'Sparring auf Augenhöhe'],
        icon: 'fuehrung',
        pageContent: {
          headline: 'Ihre Karriere strategisch gestalten.',
          intro: 'Sie möchten Ihre Karriere strategisch weiterentwickeln oder sich neu ausrichten? Ich begleite Sie dabei, Ihre Stärken zu schärfen und sich optimal zu positionieren.',
          sections: [
            { title: 'Profil-Schärfung', content: 'Stärken-Analyse und Positionierung. USPs herausarbeiten. CV-Optimierung. LinkedIn/XING-Profil strategisch aufbauen.' },
            { title: 'Karriere-Strategie', content: 'Zielpositionen definieren. Branchen und Unternehmen identifizieren. Netzwerk-Strategie entwickeln. Timing und Vorgehensweise planen.' },
            { title: 'Gesprächsvorbereitung', content: 'Headhunter-Gespräche vorbereiten. Vorstellungsgespräche trainieren. Gehaltsverhandlungen führen. Assessment Center bestehen.' },
          ],
          forWhom: [
            'Sie sind erfahrene Führungskraft oder neu in der Führungsrolle – und möchten Ihre Karriere gezielt ausrichten.',
            'Sie möchten sich auf wichtige Gespräche mit Headhuntern vorbereiten.',
            'Sie möchten Ihr Profil schärfen und Ihre USPs herausarbeiten.',
            'Sie suchen einen Sparring-Partner auf Augenhöhe.',
          ],
          faq: [
            { question: 'Wie lange dauert ein Coaching?', answer: 'Das hängt von Ihrer Situation ab. Manche brauchen nur 2-3 Sessions zur Vorbereitung auf ein Gespräch. Andere buchen ein 6er-Paket für eine komplette Neuausrichtung.' },
            { question: 'Ist das auch für Führungskräfte außerhalb Lüneburgs?', answer: 'Ja! Coaching läuft meist online via Video – das funktioniert hervorragend. Wenn Sie in der Nähe sind, können wir auch persönlich arbeiten.' },
            { question: 'Was unterscheidet Sie von anderen Coaches?', answer: 'Ich komme aus 30+ Jahren Führungspraxis. Ich kenne beide Seiten des Tisches. Und: Ich bin direkt und ehrlich – kein "Coaching-Sprech".' },
          ],
        },
      },
      {
        slug: 'fuehrung-persoenlichkeit',
        title: 'Führung & Persönlichkeit',
        price: 'nach Vereinbarung',
        priceUnit: '',
        description: 'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Für Führungskräfte, die verstehen wollen, wer sie als Führungsperson sind – und wer sie sein möchten.',
        features: ['Standortbestimmung als Führungsperson', 'Führungsstil entwickeln & stärken', 'Führen in Veränderungsprozessen', 'Frauen in Führung gezielt begleiten'],
        icon: 'kommunikation',
        pageContent: {
          headline: 'Führen aus der Mitte.',
          intro: 'Gute Führung beginnt nicht mit Methoden. Sie beginnt mit Haltung. Ich begleite Führungskräfte, die verstehen wollen, wer sie als Führungsperson sind – und wer sie sein möchten.',
          sections: [
            { title: 'Rolle & Identität', content: 'Wer bin ich als Führungsperson – und wer will ich sein?' },
            { title: 'Entscheidungen in Unsicherheit', content: 'Wie entscheide ich, wenn keine Antwort eindeutig ist?' },
            { title: 'Konflikte & Druck', content: 'Wie bleibe ich handlungsfähig, wenn es schwierig wird?' },
          ],
          forWhom: [
            'Frauen und Männer in Führung – seit Jahren in Verantwortung',
            'Frauen und Männer in Führung – gerade neu in der Rolle',
            'Menschen in Führung, die merken: Technik und Strategie allein reichen nicht.',
          ],
          faq: [],
        },
      },
    ],
  },
  {
    id: 'digital-50plus',
    label: '65+ digital',
    title: '65+ digital',
    description: 'Für Menschen ab 65, die digitale Alltagstools sicher nutzen und selbständig agieren möchten — ohne Druck, im eigenen Tempo.',
    services: [
      {
        slug: '50plus-digital',
        title: '65+ digital',
        price: 'nach Vereinbarung',
        priceUnit: '',
        description: 'Digitale Begleitung für Menschen 65+ in Lüneburg und Hamburg. Smartphone, WhatsApp, Online-Banking – Schritt für Schritt, ohne Fachchinesisch, in Ihrem Tempo.',
        features: ['Smartphone, Tablet & Computer Grundlagen', 'WhatsApp, Email & Videocalls', 'Online-Banking & Shopping sicher nutzen', 'Datenschutz & Sicherheit verstehen – inkl. ChatGPT, Claude, Perplexity'],
        icon: 'team',
        pageContent: {
          headline: 'Ihr sicherer Einstieg in die digitale Welt.',
          intro: 'Sie möchten WhatsApp nutzen, Online-Banking verstehen, oder einfach sicherer im Umgang mit Smartphone und Computer werden? Ich begleite Sie Schritt für Schritt – in Ihrem Tempo, ohne Fachchinesisch.',
          sections: [
            { title: 'Grundlagen', content: 'Smartphone & Tablet Bedienung, Apps installieren und nutzen, Fotos und Videos verwalten, Windows/Mac Grundlagen, Dateien organisieren, Cloud-Dienste verstehen.' },
            { title: 'Kommunikation', content: 'Email-Programme einrichten, WhatsApp sicher nutzen, Videocalls (Zoom, Skype), Sichere Passwörter erstellen, Betrugsmaschen erkennen, Privatsphäre schützen.' },
            { title: 'Online-Dienste', content: 'Online-Banking sicher nutzen, Sicher online einkaufen, Bezahldienste verstehen, Gesundheits-Apps einrichten, Online-Termine buchen, Elektronische Patientenakte.' },
          ],
          forWhom: [
            'Menschen, die sich mehr Unabhängigkeit im digitalen Alltag wünschen',
            'Menschen mit konkreten Fragen zu Smartphone, Tablet oder Computer',
            'Menschen, die sicher mit Email, WhatsApp und Online-Diensten umgehen möchten',
            'Menschen, die einen geduldigen Begleiter suchen, der ihre Fragen ernst nimmt',
          ],
          faq: [
            { question: 'Ich habe gar keine Vorkenntnisse – ist das ein Problem?', answer: 'Nein, überhaupt nicht! Wir fangen genau da an, wo Sie stehen. Viele meiner Teilnehmer*innen hatten vorher kaum Erfahrung – und haben es trotzdem gelernt.' },
            { question: 'Muss ich meine Geräte mitbringen?', answer: 'Ja, am besten schon! Wir arbeiten mit IHREN Geräten – dann können Sie das Gelernte sofort zuhause umsetzen.' },
            { question: 'Was kostet das?', answer: 'Ein Erstgespräch (30 Min.) ist kostenlos. Danach arbeiten wir stundenweise oder als Paket. Kleine Gruppen sind günstiger.' },
          ],
        },
      },
    ],
  },
  {
    id: 'beratung',
    label: 'Beratung',
    title: 'Unternehmensberatung',
    description: 'Für Unternehmenskunden ab 3 Personen erstelle ich gerne ein individuelles Angebot.',
    services: [
      {
        slug: 'beratung',
        title: 'Unternehmensberatung',
        price: 'nach Vereinbarung',
        priceUnit: '',
        description: 'Digitale Transformation & KI-Strategie für Mittelstand, Verwaltung und kritische Infrastrukturen – mit 40 Jahren Praxis. Lüneburg & Hamburg.',
        features: ['Analyse & digitale Strategie', 'Change Management & Teamschulungen', 'Umsetzungsbegleitung & Prozessoptimierung', 'Nachhaltige interne Kompetenz aufbauen'],
        icon: 'strategie',
        pageContent: {
          headline: 'Digitale Transformation mit Erfahrung.',
          intro: 'Ich begleite Organisationen bei der digitalen Transformation – nicht mit theoretischen Konzepten, sondern mit 40 Jahren Praxis aus komplexen IT- und Sicherheitsstrukturen.',
          sections: [
            { title: 'Analyse', content: 'Wo stehen Sie heute? Was sind die konkreten Bedarfe? Welche Ziele verfolgen Sie?' },
            { title: 'Strategie', content: 'Entwicklung einer klaren Roadmap. Prioritäten & Ressourcenplanung. Meilensteine definieren.' },
            { title: 'Change Management', content: 'Ihr Team mitnehmen. Schulungen & Kommunikation. Motivation – damit Veränderung gelebt wird.' },
            { title: 'Umsetzungsbegleitung', content: 'Implementation begleiten. Prozesse optimieren. Nachhaltigkeit sichern.' },
          ],
          forWhom: [
            'Mittelständische Unternehmen (50-500 Mitarbeiter)',
            'Öffentliche Verwaltung (Behörden & Verwaltung)',
            'Kritische Infrastrukturen (Energie, Kommunikation, Verkehr)',
          ],
          faq: [],
        },
      },
      {
        slug: 'ki-transition',
        title: 'KI-Transition Coaching',
        price: 'nach Vereinbarung',
        priceUnit: '',
        description: 'KI verändert Berufsbilder – ich begleite Sie dabei. Für IT-Fachkräfte, Führungspersönlichkeiten und Unternehmen in Lüneburg, Hamburg und online.',
        features: ['Standortbestimmung & Kompetenz-Analyse', 'Strukturierter Unlearning-Prozess', 'Neuorientierung & Strategie für die KI-Zukunft', 'Team-Workshops & Change-Begleitung'],
        icon: 'digitalisierung',
        pageContent: {
          headline: 'Wenn das Vertraute geht – und das Neue wartet.',
          intro: 'Mehr Software entsteht durch KI. Weniger durch Menschen. Das verändert Berufsbilder schneller als je zuvor – in der IT, im Management, in der Verwaltung. Ich begleite Sie und Ihr Team beim bewussten Loslassen und beim mutigen Schritt in die neue Arbeitswelt.',
          sections: [
            { title: 'Standortbestimmung', content: 'Analyse Ihrer aktuellen Fähigkeiten & Rolle. Welche Kompetenzen bleiben wertvoll? Wo liegen blinde Flecken? Persönliche KI-Readiness einschätzen.' },
            { title: 'Unlearning-Prozess', content: 'Alte Denk- und Arbeitsmuster erkennen. Bewusst loslassen – strukturiert & begleitet. Psychologische Widerstände verstehen. Raum schaffen für Neues.' },
            { title: 'Neuorientierung & Strategie', content: 'Neue Rollen & Kompetenzfelder identifizieren. Persönliche Lernstrategie entwickeln. KI als Werkzeug – nicht als Bedrohung. Konkrete nächste Schritte definieren.' },
            { title: 'Für Unternehmen', content: 'Team-Workshops: KI-Readiness. Change-Begleitung im Transformationsprozess. Führungskräfte-Sparring zum Thema KI. Nachhaltige Lernkultur aufbauen.' },
          ],
          forWhom: [
            'Sie in der IT arbeiten und merken, dass KI Ihre bisherigen Aufgaben übernimmt',
            'Sie als Führungskraft Ihr Team durch den KI-Wandel führen möchten',
            'Sie sich neu orientieren und nicht wissen, wo Sie anfangen sollen',
            'Ihr Unternehmen KI einführen will, aber die Mitarbeiter noch nicht mitgehen',
          ],
          faq: [],
        },
      },
    ],
  },
];

// ─── Referenzen ───────────────────────────────────────────────────────────────

export interface ReferenzItem {
  name: string;
  url?: string;
  logoUrl?: string;
  description?: string;
  type?: string;
}

export interface ReferenzType {
  id: string;
  label: string;
}

export const referenzenConfig = {
  heading: 'Referenzen',
  subheading: 'Unternehmen und Personen, die mir ihr Vertrauen geschenkt haben.',
  types: [
    { id: 'ausbildung', label: 'Ausbildung & Qualifikation' },
    { id: 'projekte', label: 'Projekte' },
    { id: 'laufbahn', label: 'Berufliche Stationen' },
  ] as ReferenzType[],
  items: [
    { name: 'Brückenschlag e.V., Lüneburg', url: 'https://www.bs-lg.de', description: 'Systemische Coach-Ausbildung', type: 'ausbildung' },
    { name: 'Digital Café', description: '6-monatiges Projekt in einem Hamburger Seniorenheim (2023), 60+ Teilnehmer/innen – verantwortlich mitgestaltet', type: 'projekte' },
    { name: 'Polizei Hamburg', description: 'KI-gestützte Gesichtserkennung + BOS-Digitalfunk – Referenz aus der beruflichen Laufbahn mit ~30 Jahren Führungserfahrung', type: 'laufbahn' },
  ] as ReferenzItem[],
};

