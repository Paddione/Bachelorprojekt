import type { BrandConfig } from '../types';

export const mentolderConfig: BrandConfig = {
  brand: 'mentolder',
  meta: {
    siteTitle: 'Mentolder',
    siteDescription: 'Digital Coaching & Führungskräfte-Beratung - Ihr Partner für digitale Kompetenz und persönliche Entwicklung',
  },
  contact: {
    name: 'Gerald Korczewski',
    email: 'info@mentolder.de',
    phone: '+49 151 508 32 601',
    city: 'Lüneburg',
  },
  legal: {
    street: '',
    zip: '',
    jobtitle: 'Coach und digitaler Begleiter',
    chamber: 'Entfallt',
    ustId: 'Kleinunternehmer gem. § 19 Abs. 1 UStG',
    website: 'mentolder.de',
    tagline: 'Digital Coaching & Führungskräfte-Beratung',
  },
  homepage: {
    stats: [
      { value: '30+', label: 'Jahre Führungserfahrung' },
      { value: '50+', label: 'Begleitete Teilnehmer' },
      { value: '40', label: 'Jahre Praxis in IT & Sicherheit' },
      { value: 'KI', label: 'Pionier der ersten Stunde' },
    ],
    servicesHeadline: 'Meine Angebote',
    servicesSubheadline: 'Sie suchen jemanden, der Menschen, Prozesse und Technik verbindet? Der Führungserfahrung mit Empathie vereint?',
    whyMeHeadline: 'Warum ich?',
    whyMeIntro: 'Ich kenne beide Welten: 40 Jahre etablierte Strukturen UND modernste KI-Tools. Ich weiß, wie Veränderung in komplexen Organisationen wirklich funktioniert.',
    whyMePoints: [
      {
        iconPath: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        title: 'Erste deutsche Polizeibehörde mit KI',
        text: 'Pionier, nicht Nachahmer. Gesichtserkennung, BOS-Digitalfunk, bundesweit führend.',
      },
      {
        iconPath: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
        title: 'Systemischer Coach',
        text: 'Nicht nur IT, sondern auch Menschen. Ich verbinde technologisches Verständnis mit Empathie.',
      },
      {
        iconPath: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
        title: 'Selbst Generation 50+',
        text: '65 Jahre. Ich kenne die Herausforderungen aus eigener Erfahrung und spreche Ihre Sprache.',
      },
    ],
    avatarType: 'image',
    avatarSrc: '/gerald.webp',
    quote: 'Ich stelle unbequeme Fragen – weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.',
    quoteName: 'Gerald Korczewski',
  },
  services: [
    {
      slug: 'digital-cafe',
      title: '50+ digital',
      description: 'Ihr sicherer Einstieg in die digitale Welt. Ich begleite Sie Schritt für Schritt – in Ihrem Tempo, ohne Fachchinesisch.',
      icon: '💻',
      features: [
        'Smartphone, Tablet & Computer Grundlagen',
        'WhatsApp, Email & Videocalls',
        'Online-Banking & Shopping sicher nutzen',
        'Datenschutz & Sicherheit verstehen',
      ],
      price: 'Ab 60 € / Stunde',
      stripeServiceKey: 'digital-cafe-einzel',
      pageContent: {
        headline: 'Ihr sicherer Einstieg in die digitale Welt',
        intro: 'Sie möchten WhatsApp nutzen, Online-Banking verstehen, oder einfach sicherer im Umgang mit Smartphone und Computer werden? Ich begleite Sie Schritt für Schritt – in Ihrem Tempo, ohne Fachchinesisch.',
        forWhom: [
          'Sich mehr Unabhängigkeit im digitalen Alltag wünschen',
          'Konkrete Fragen zu Smartphone, Tablet oder Computer haben',
          'Sicher mit Email, WhatsApp und Online-Diensten umgehen möchten',
          'Einen geduldigen Begleiter suchen, der Ihre Fragen ernst nimmt',
        ],
        sections: [
          {
            title: 'Grundlagen',
            items: [
              'Smartphone & Tablet Bedienung',
              'Apps installieren und nutzen',
              'Fotos und Videos verwalten',
              'Windows/Mac Grundlagen',
              'Dateien organisieren',
              'Cloud-Dienste verstehen',
            ],
          },
          {
            title: 'Kommunikation',
            items: [
              'Email-Programme einrichten',
              'WhatsApp sicher nutzen',
              'Videocalls (Zoom, Skype)',
              'Sichere Passwörter',
              'Betrugsmaschen erkennen',
              'Privatsphäre schützen',
            ],
          },
          {
            title: 'Dienste',
            items: [
              'Online-Banking sicher nutzen',
              'Sicher online einkaufen',
              'Bezahldienste verstehen',
              'Gesundheits-Apps',
              'Online-Termine buchen',
              'Elektronische Patientenakte',
            ],
          },
        ],
        pricing: [
          { label: 'Einzelbegleitung', price: '60 €', unit: 'pro Stunde' },
          { label: '5er-Paket', price: '270 €', unit: 'statt 300 €', highlight: true },
          { label: 'Kleine Gruppe', price: '40 €', unit: 'pro Person / Stunde' },
        ],
        faq: [
          { question: 'Ich habe gar keine Vorkenntnisse – ist das ein Problem?', answer: 'Nein, überhaupt nicht! Wir fangen genau da an, wo Sie stehen. Viele meiner Teilnehmer*innen hatten vorher kaum Erfahrung – und haben es trotzdem gelernt.' },
          { question: 'Muss ich meine Geräte mitbringen?', answer: 'Ja, am besten schon! Wir arbeiten mit IHREN Geräten – dann können Sie das Gelernte sofort zuhause umsetzen.' },
          { question: 'Wie lange dauert es, bis ich sicher bin?', answer: 'Das ist sehr individuell. Manche brauchen 3-4 Sessions, andere 10. Sie bestimmen das Tempo.' },
          { question: 'Was kostet das?', answer: 'Ein Erstgespräch (30 Min.) ist kostenlos. Danach arbeiten wir stundenweise (60 €) oder als Paket. Kleine Gruppen sind günstiger.' },
        ],
      },
    },
    {
      slug: 'coaching',
      title: 'Führungskräfte-Coaching',
      description: 'Ihre Karriere strategisch gestalten. Ich unterstütze erfahrene Führungskräfte bei der beruflichen Neuorientierung.',
      icon: '🎯',
      features: [
        'Profil-Schärfung & Positionierung',
        'Karriere-Strategie entwickeln',
        'Gesprächsvorbereitung (Headhunter, Vorstellungsgespräche)',
        'Sparring auf Augenhöhe',
      ],
      price: 'Ab 150 € / Session',
      stripeServiceKey: 'coaching-session',
      pageContent: {
        headline: 'Ihre Karriere strategisch gestalten',
        intro: 'Sie sind erfahrene Führungskraft und stehen vor einer beruflichen Neuorientierung? Ich begleite Sie dabei, Ihre Stärken zu schärfen und sich optimal zu positionieren.',
        forWhom: [
          'Als erfahrene Führungskraft Ihre Karriere neu ausrichten möchten',
          'Sich auf wichtige Gespräche mit Headhuntern vorbereiten',
          'Ihr Profil schärfen und Ihre USPs herausarbeiten wollen',
          'Einen Sparring-Partner auf Augenhöhe suchen',
        ],
        sections: [
          {
            title: 'Profil-Schärfung',
            items: [
              'Stärken-Analyse und Positionierung',
              'USPs herausarbeiten',
              'CV-Optimierung',
              'LinkedIn/XING-Profil strategisch aufbauen',
            ],
          },
          {
            title: 'Karriere-Strategie',
            items: [
              'Zielpositionen definieren',
              'Branchen und Unternehmen identifizieren',
              'Netzwerk-Strategie entwickeln',
              'Timing und Vorgehensweise planen',
            ],
          },
          {
            title: 'Gesprächsvorbereitung',
            items: [
              'Headhunter-Gespräche',
              'Vorstellungsgespräche',
              'Gehaltsverhandlungen',
              'Assessment Center',
            ],
          },
          {
            title: 'Markt-Positionierung',
            items: [
              'Marktanalyse',
              'Zielunternehmen recherchieren',
              'Anforderungsprofile verstehen',
              'Ihr Profil passgenau ausrichten',
            ],
          },
        ],
        pricing: [
          { label: 'Einzelsession (90 Min.)', price: '150 €' },
          { label: 'Paket 6 Sessions', price: '800 €', unit: 'statt 900 €', highlight: true },
          { label: 'Intensiv-Tag (6 Std.)', price: '500 €' },
        ],
        faq: [
          { question: 'Wie lange dauert ein Coaching?', answer: 'Das hängt von Ihrer Situation ab. Manche brauchen nur 2-3 Sessions zur Vorbereitung auf ein Gespräch. Andere buchen ein 6er-Paket für eine komplette Neuausrichtung.' },
          { question: 'Ist das auch für Führungskräfte außerhalb Lüneburgs?', answer: 'Ja! Coaching läuft meist online via Video – das funktioniert hervorragend. Wenn Sie in der Nähe sind, können wir auch persönlich arbeiten.' },
          { question: 'Was unterscheidet Sie von anderen Coaches?', answer: 'Ich komme aus 30+ Jahren Führungspraxis. Ich kenne beide Seiten des Tisches. Und: Ich bin direkt und ehrlich – kein "Coaching-Sprech".' },
        ],
      },
    },
    {
      slug: 'beratung',
      title: 'Unternehmensberatung',
      description: 'Digitale Transformation für Mittelstand, Verwaltung und kritische Infrastrukturen. 40 Jahre Praxis aus komplexen Strukturen.',
      icon: '🏢',
      features: [
        'Analyse & digitale Strategie',
        'Change Management & Teamschulungen',
        'Umsetzungsbegleitung & Prozessoptimierung',
        'Nachhaltige interne Kompetenz aufbauen',
      ],
      price: 'nach Vereinbarung',
      pageContent: {
        headline: 'Digitale Transformation mit Erfahrung',
        intro: 'Ich begleite Organisationen bei der digitalen Transformation – nicht mit theoretischen Konzepten, sondern mit 40 Jahren Praxis aus komplexen IT- und Sicherheitsstrukturen.',
        forWhom: [
          'Mittelständische Unternehmen (50-500 Mitarbeiter)',
          'Öffentliche Verwaltung (Behörden & Verwaltung)',
          'Kritische Infrastrukturen (Energie, Kommunikation, Verkehr)',
        ],
        sections: [
          {
            title: 'Analyse',
            items: ['Wo stehen Sie heute?', 'Was sind die konkreten Bedarfe?', 'Welche Ziele verfolgen Sie?'],
          },
          {
            title: 'Strategie',
            items: ['Entwicklung einer klaren Roadmap', 'Prioritäten & Ressourcenplanung', 'Meilensteine definieren'],
          },
          {
            title: 'Change Management',
            items: ['Ihr Team mitnehmen', 'Schulungen & Kommunikation', 'Motivation – damit Veränderung gelebt wird'],
          },
          {
            title: 'Umsetzungsbegleitung',
            items: ['Implementation begleiten', 'Prozesse optimieren', 'Nachhaltigkeit sichern'],
          },
        ],
        pricing: [
          { label: 'Tagessatz', price: 'nach Vereinbarung', unit: 'Projektumfang individuell, Dauer: 3–12 Monate', highlight: true },
        ],
        faq: [],
      },
    },
  ],
  leistungen: [
    {
      id: 'fuehrungskraefte',
      title: 'Führungskräfte-Coaching',
      icon: '🎯',
      description: 'Für Entscheider in KMU und kommunalen Einrichtungen, die digitalen Wandel gestalten, Teams führen oder persönliche Entwicklungsthemen bearbeiten möchten.',
      services: [
        { key: 'coaching-einzel', name: 'Einzelstunde (60 Min.)', price: '150 €', unit: '/ Stunde', desc: 'Intensive Einzelsession für Profilschärfung, Gesprächsvorbereitung oder Strategie.' },
        { key: 'coaching-paket-s', name: 'Paket S — 6 Sessions', price: '840 €', unit: '', desc: '6 Coaching-Sessions. Für gezielte Themen und strukturierte Entwicklung.', highlight: true },
        { key: 'coaching-paket-m', name: 'Paket M — 12 Sessions', price: '1.560 €', unit: '', desc: '12 Sessions für eine umfassende Neuausrichtung oder tiefergehende Begleitung.' },
      ],
    },
    {
      id: 'digital-50plus',
      title: '50+ Digital',
      icon: '💻',
      description: 'Für Menschen ab 50, die digitale Alltagstools sicher nutzen und selbstständig agieren möchten — ohne Druck, im eigenen Tempo.',
      services: [
        { key: 'digital-cafe-einzel', name: 'Einzelstunde (60 Min.)', price: '60 €', unit: '/ Stunde', desc: 'Individuelle 1:1 Begleitung bei Ihnen zuhause oder in ruhiger Umgebung.' },
        { key: 'digital-cafe-paket-s', name: 'Paket S — 6 Sessions', price: '330 €', unit: '', desc: '6 Stunden individuelle Begleitung. Flexibel planbar.', highlight: true },
        { key: 'digital-cafe-paket-m', name: 'Paket M — 12 Sessions', price: '600 €', unit: '', desc: '12 Stunden für langfristige digitale Begleitung und Sicherheit.' },
      ],
    },
    {
      id: 'beratung',
      title: 'Unternehmensberatung',
      icon: '🏢',
      description: 'Für Unternehmenskunden ab 3 Personen erstelle ich gerne ein individuelles Angebot.',
      services: [
        { key: 'beratung-individuell', name: 'Individuelles Angebot', price: 'nach Vereinbarung', unit: '', desc: 'Digitale Transformation, Change Management, Strategie. Projektumfang individuell.' },
      ],
    },
  ],
  leistungenPricingHighlight: [
    { label: 'Erstgespräch (30 Min.)', price: 'Kostenlos', note: 'Unverbindlich — kein Verkaufsgespräch', highlight: false },
    { label: 'Einzelstunde Führungskräfte', price: '150 €', note: 'Netto gem. §19 UStG', highlight: false },
    { label: 'Einzelstunde 50+ Digital', price: '60 €', note: 'Netto gem. §19 UStG', highlight: true },
  ],
  uebermich: {
    pageHeadline: 'Von der Polizei Hamburg in die digitale Begleitung',
    subheadline: 'Über mich',
    introParagraphs: [
      'Nach über 30 Jahren bei der Polizei Hamburg – davon viele Jahre in Führungspositionen – habe ich 2023 einen neuen Weg eingeschlagen.',
      'Was ich in all den Jahren gelernt habe? Menschen führen bedeutet vor allem: Menschen verstehen, Geduld haben, und Wissen so vermitteln, dass es ankommt.',
    ],
    sections: [
      {
        title: 'Warum 50+ digital?',
        content: 'Als ich im Altenheim ein halbes Jahr lang ein Digital Café leitete, merkte ich: Hier kann ich genau diese Fähigkeiten einsetzen. Menschen der Generation 50+ stehen vor echten Herausforderungen in der digitalen Welt. Nicht weil sie "zu alt" sind – sondern weil niemand sich die Zeit nimmt, es in Ruhe und verständlich zu erklären.',
      },
      {
        title: 'Warum Führungskräfte-Coaching?',
        content: '30+ Jahre Führungserfahrung bedeutet auch: Ich kenne beide Seiten. Ich habe hunderte Führungskräfte eingestellt, entwickelt, befördert. Ich weiß, worauf es ankommt. Diese Erfahrung gebe ich heute weiter.',
      },
    ],
    milestones: [
      { year: '1980-2023', title: 'Polizei Hamburg', desc: 'Über 30 Jahre in Führungspositionen. Personalführung, Organisationsentwicklung, Strategie.' },
      { year: 'Highlight', title: 'KI-Pionier', desc: 'Erste deutsche Polizeibehörde mit KI/Gesichtserkennung. BOS-Digitalfunk bundesweit führend gemacht.' },
      { year: '2023', title: 'Digital Café', desc: '6 Monate intensives Digital Café im Altenheim. Über 50 Teilnehmer individuell begleitet.' },
      { year: 'Seit 2024', title: 'Selbstständig', desc: 'Coach und Digitaler Begleiter. Führungskräfte-Coaching und Unternehmensberatung.' },
    ],
    notDoing: [
      { title: 'Keine technische Umsetzung', text: 'Ich berate, entwickle Strategien und begleite Change-Prozesse. Programmierung überlasse ich Spezialisten.' },
      { title: 'Keine Online-Kurse', text: 'Ich glaube an persönliche Begleitung statt standardisierte, skalierbare Produkte.' },
    ],
    privateText: 'Ich lebe in {city}, bin verheiratet, habe zwei erwachsene Kinder. In meiner Freizeit bin ich viel zu Fuß unterwegs – Bewegung ist für mich Meditation. Und ja, ich bin selbst Teil der Generation 50+ (65 Jahre) – ich weiß also aus eigener Erfahrung, wovon ich spreche.',
  },
  kontakt: {
    intro: 'Egal ob Frage, Erstgespräch oder Feedback – ich freue mich, von Ihnen zu hören.',
    sidebarTitle: 'Kostenloses Erstgespräch',
    sidebarText: 'In 30 Minuten klären wir: Wo stehen Sie? Was ist Ihre größte Herausforderung? Wie könnte eine Zusammenarbeit aussehen?',
    sidebarCta: 'Kein Verkaufsgespräch. Kein Druck. Nur Klarheit.',
    showPhone: true,
    showSteps: false,
  },
  faq: [
    {
      question: 'Für wen ist 50+ digital geeignet?',
      answer: 'Für alle Menschen 50+, die digital selbstständiger werden möchten. Keine Vorkenntnisse nötig – wir fangen genau da an, wo Sie stehen.',
    },
    {
      question: 'Wie läuft ein Coaching ab?',
      answer: 'Wir starten mit einem kostenlosen Erstgespräch (30-45 Min.), um Ihre Situation zu verstehen. Danach arbeiten wir in individuellen Sessions an Ihren Zielen – online oder vor Ort.',
    },
    {
      question: 'Arbeiten Sie auch online?',
      answer: 'Ja! Coaching und Beratung funktionieren hervorragend online per Video. 50+ digital biete ich bevorzugt vor Ort in {city} und Umgebung an.',
    },
    {
      question: 'Was kostet ein Erstgespräch?',
      answer: 'Nichts. Das Erstgespräch ist kostenlos und unverbindlich. Wir lernen uns kennen und klären, ob eine Zusammenarbeit passt.',
    },
    {
      question: 'Was unterscheidet Sie von anderen Coaches?',
      answer: 'Ich komme aus 30+ Jahren Führungspraxis bei der Polizei Hamburg. Ich kenne beide Seiten des Tisches, bin direkt und ehrlich – und verstehe die Herausforderungen der Generation 50+ aus eigener Erfahrung.',
    },
  ],
  leistungenCta: {
    href: '/termin',
    text: 'Termin buchen',
  },
  features: {
    hasBooking: true,
    hasRegistration: true,
    hasOIDC: true,
    hasBilling: true,
  },
};
