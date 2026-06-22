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
  kicker: ['Über mich', 'Lüneburg', 'DE'] as string[],
  headline: '30 Jahre Erfahrung —',
  headlineEmphasis: 'Mensch zuerst.',
  lede: 'Ich begleite Führungskräfte und Teams beim Wandel — mit technischer Tiefe und menschlicher Klarheit. Praxisnah, empathisch, ohne Hype.',
  milestones: [
    { year: '1993', title: 'Einstieg in die IT', desc: 'Erste professionelle Erfahrungen in Softwareentwicklung und Systemadministration.' },
    { year: '2000', title: 'Erste Führungsverantwortung', desc: 'Teamlead in einem mittelständischen IT-Unternehmen — Lernen durch Tun.' },
    { year: '2008', title: 'Cloud-Pionier', desc: 'Aufbau der ersten Cloud-Infrastruktur für ein 500-Personen-Unternehmen.' },
    { year: '2015', title: 'Digitale Transformation', desc: 'Leitung unternehmensweiter Digitalisierungsprojekte — von der Strategie bis zum Rollout.' },
    { year: '2018', title: 'KI-Fokus', desc: 'Spezialisierung auf KI-gestützte Transformationsprojekte und Führungskräfte-Enablement.' },
    { year: '2020', title: 'Selbstständig', desc: 'Gründung als Digital Coach und Mentor in Lüneburg.' },
    { year: 'Heute', title: 'Coach & Mentor', desc: 'Begleitung von Führungskräften und Organisationen im digitalen Wandel — mit 30+ Jahren Erfahrung.' },
  ] as UeberMichMilestone[],
  sections: [
    { title: 'Führung mit Haltung', content: 'Ich glaube, dass gute Führung Empathie und Klarheit vereint. Nach 30 Jahren in der IT — vom Entwickler bis zur Geschäftsführung — weiß ich: Technik ist selten das eigentliche Problem.' },
    { title: 'Technik im Dienst des Menschen', content: 'Cloud, KI, DevOps — aber immer mit dem Ziel, Menschen zu entlasten, nicht zu ersetzen. Ich übersetze komplexe Technologie in klare Entscheidungen.' },
    { title: 'Pragmatismus statt Hype', content: 'Keine Modeerscheinungen, keine Vendor-Abhängigkeiten. Was wir gemeinsam erarbeiten, muss in Ihren Alltag passen — und dort bleiben.' },
  ] as UeberMichSection[],
  notDoing: [
    { title: 'Motivationsreden', text: 'Ich halte keine inspirierten Vorträge ohne praktischen Nutzen. Wirkung entsteht im konkreten Tun.' },
    { title: 'Vendor-Pitches', text: 'Ich empfehle keine Produkte, an denen ich verdiene. Meine Empfehlungen sind unabhängig.' },
    { title: 'Dauermandate', text: 'Ich ziele auf Ihre Selbstständigkeit, nicht auf meine Unentbehrlichkeit. Ein gutes Coaching endet.' },
    { title: 'Universallösungen', text: 'Jede Organisation ist anders. Ich arbeite keine Standardprogramme ab, sondern höre zuerst zu.' },
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
    id: 'coaching',
    label: 'Coaching',
    title: 'Coaching & Mentoring',
    description: 'Individuelle Begleitung für Führungskräfte, Professionals und Gründer.',
    services: [
      {
        slug: 'fuehrung',
        title: 'Führungs-Coaching',
        price: 'ab 240',
        priceUnit: 'EUR / 60 min',
        description: 'Vom Manager zur empathischen Führungskraft. Klarheit, Präsenz und Werkzeuge für wirksames Leadership.',
        features: ['1:1-Sessions', 'Zwischenstand nach 6 Wochen', 'Vertraulich'],
        icon: 'fuehrung',
        pageContent: {
          headline: 'Führung neu denken.',
          intro: 'Führungserfolg hängt selten von Fachwissen ab — er entsteht im Umgang mit Menschen, in der Klarheit der eigenen Haltung und in der Fähigkeit, andere zu befähigen.',
          sections: [
            { title: 'Was wir erarbeiten', content: 'Klarheit über Ihre Führungsrolle, Kommunikationsmuster und blinde Flecken. Wir arbeiten mit konkreten Situationen aus Ihrem Alltag — keine abstrakten Modelle.' },
            { title: 'Format', content: '60-Minuten-Sessions, bi-wöchentlich, remote oder vor Ort in Lüneburg. Zwischen den Sessions: kurze schriftliche Reflexionen auf Wunsch.' },
            { title: 'Ergebnis', content: 'Mehr Präsenz im Umgang mit Ihrem Team, klarere Entscheidungen, weniger Erschöpfung durch Konflikte, die nie ausgesprochen wurden.' },
          ],
          forWhom: [
            'Neue Führungskräfte in den ersten 12 Monaten',
            'Erfahrene Manager in neuen Rollen oder nach Reorganisationen',
            'Professionals mit Führungsaspirationen',
          ],
          faq: [
            { question: 'Wie viele Sessions brauche ich?', answer: 'Ein Mindest-Paket sind 6 Sessions über 12 Wochen. Der Großteil meiner Klienten verlängert nach dem ersten Paket — weil sich etwas verändert hat und sie weitermachen wollen.' },
            { question: 'Ist das auch remote möglich?', answer: 'Ja, vollständig remote per Video. Ich arbeite mit Klienten in ganz Deutschland und im deutschsprachigen Ausland.' },
          ],
        },
      },
      {
        slug: 'strategie',
        title: 'Strategie-Session',
        price: 'ab 320',
        priceUnit: 'EUR / 90 min',
        description: 'Fokussierte Einzelsitzung für strategische Entscheidungen, Positionierung oder Zukunftsplanung.',
        features: ['Einmalig buchbar', 'Vorbereitung inklusive', 'Schriftliche Zusammenfassung'],
        icon: 'strategie',
        pageContent: {
          headline: 'Eine Stunde Klarheit.',
          intro: 'Manchmal braucht es keine laufende Begleitung, sondern einen fokussierten Blick von außen auf eine konkrete Frage.',
          sections: [
            { title: 'Was passiert in 90 Minuten', content: 'Wir klären Ihre Ausgangssituation, beleuchten Optionen und entwickeln eine klare Handlungsempfehlung. Mit schriftlicher Zusammenfassung zum Nachschlagen.' },
            { title: 'Vorbereitung', content: 'Vor dem Termin erhalten Sie einen kurzen Fragebogen (ca. 10 Minuten). Damit nutzen wir die 90 Minuten maximal.' },
          ],
          forWhom: [
            'Entscheidungsträger vor einem Strategiewechsel',
            'Selbstständige bei der Neupositionierung',
            'Führungskräfte vor schwierigen Gesprächen oder Verhandlungen',
          ],
          faq: [
            { question: 'Kann ich mehrere Sessions buchen?', answer: 'Ja, als Einzeltermine oder im Paket. Ab 3 Sessions gibt es einen Paketpreis auf Anfrage.' },
          ],
        },
      },
    ],
  },
  {
    id: 'beratung',
    label: 'Beratung',
    title: 'Digitale Transformation',
    description: 'Von der Vision zum produktiven System — pragmatisch und ohne Hype.',
    services: [
      {
        slug: 'digitalisierung',
        title: 'Digitale Transformation',
        price: 'ab 1.200',
        priceUnit: 'EUR / Tag',
        description: 'Vom Pilot zum Produktiv-System. Cloud, KI, DevOps — pragmatisch, ohne Hype und mit klaren Meilensteinen.',
        features: ['Cloud / K8s', 'KI-Enablement', 'Architektur-Reviews'],
        icon: 'digitalisierung',
        pageContent: {
          headline: 'Digitalisierung, die wirklich funktioniert.',
          intro: 'Cloud, KI, DevOps — aber immer im Dienst der Menschen, die sie nutzen. Kein Großprojekt-Denken, keine endlosen Workshops. Kleine Schritte mit messbarem Ergebnis.',
          sections: [
            { title: 'Ansatz', content: 'Ich starte mit einer Bestandsaufnahme: Was existiert, was funktioniert, wo sind die echten Engpässe. Dann entwickeln wir gemeinsam einen pragmatischen Fahrplan — ohne Hype, ohne Vendor-Lock-in.' },
            { title: 'Technologien', content: 'Kubernetes, CI/CD-Pipelines, KI-APIs (OpenAI, Anthropic, lokale Modelle), Monitoring, Infrastruktur-as-Code. Jeweils nur was wirklich gebraucht wird.' },
            { title: 'Zusammenarbeit', content: 'Tagesweise oder in Blöcken buchbar. Ich arbeite eng mit Ihrem Team — kein Blackbox-Consulting, das nach Projektende niemand versteht.' },
          ],
          forWhom: [
            'CTOs und IT-Leiter im Mittelstand',
            'Startups in der Skalierungsphase',
            'Unternehmen mit Legacy-Altlasten und Modernisierungsdruck',
          ],
          faq: [
            { question: 'Arbeiten Sie remote?', answer: 'Ja, vollständig remote. Vor-Ort-Workshops deutschlandweit auf Anfrage.' },
            { question: 'Übernehmen Sie auch Umsetzungsarbeiten?', answer: 'Ja, auf Anfrage. Mein Fokus liegt auf Beratung und Enablement — aber für konkrete Umsetzungsphasen bin ich auch direkt buchbar.' },
          ],
        },
      },
      {
        slug: 'team',
        title: 'Team-Readiness',
        price: 'ab 980',
        priceUnit: 'EUR / Workshop',
        description: 'Teams befähigen, moderne Tools sicher zu nutzen. Workshops, die verbinden statt belehren — mit Fokus auf Wirkung.',
        features: ['Halbtages-Workshop', 'Vor-Ort oder Remote', 'Follow-up-E-Mail'],
        icon: 'team',
        pageContent: {
          headline: 'Ihr Team. Zukunftsfähig.',
          intro: 'Neue Tools scheitern nicht an der Technik, sondern an der fehlenden Adoption. Meine Workshops bauen Brücken — zwischen dem, was das Tool kann, und dem, was Ihr Team wirklich braucht.',
          sections: [
            { title: 'Format', content: 'Halbtages-Workshop (3,5 Stunden) mit konkreten Ergebnissen und direktem Bezug zu Ihrer Arbeitssituation. Vor-Ort oder remote.' },
            { title: 'Typische Inhalte', content: 'KI-Tools im Arbeitsalltag (ChatGPT, Copilot, Perplexity), Kollaborationsplattformen (Nextcloud, Notion, Confluence), digitale Kommunikation ohne Overhead.' },
            { title: 'Nachbereitung', content: 'Schriftliche Zusammenfassung der Ergebnisse und individuell angepasste Tool-Empfehlungen per E-Mail innerhalb von 48 Stunden.' },
          ],
          forWhom: [
            'Teams nach Einführung neuer Tools ohne ausreichendes Onboarding',
            'HR und L&D-Verantwortliche mit Weiterbildungsauftrag',
            'Abteilungen mit generationengemischten Teams',
          ],
          faq: [
            { question: 'Wie viele Teilnehmer?', answer: 'Ideal 6–15 Personen. Kleinere Gruppen (ab 3) und größere Gruppen (bis 30) auf Anfrage.' },
            { question: 'Kann der Workshop individuell angepasst werden?', answer: 'Ja, immer. Vorab gibt es einen kurzen Abstimmungstermin ohne Kosten.' },
          ],
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
  subheading: 'Unternehmen und Menschen, die mir ihr Vertrauen geschenkt haben.',
  types: [
    { id: 'kooperationen', label: 'Kooperationen' },
    { id: 'kunden', label: 'Kunden & Projekte' },
  ] as ReferenzType[],
  items: [
    { name: 'Brückenschlag e.V.', url: 'https://brueckenschlag.de', description: 'Digitalisierungsberatung für gemeinnützige Organisationen in Hamburg.', type: 'kooperationen' },
    { name: 'Digital Café Hamburg', description: 'Workshop-Reihe für digitale Grundkompetenzen — quartalsweise, kostenfrei.', type: 'kooperationen' },
    { name: 'Polizei Hamburg', description: 'KI-Führungskräfte-Workshop im Rahmen der Digitalisierungsinitiative.', type: 'kunden' },
  ] as ReferenzItem[],
};

