import type { BrandConfig } from '../types';

export const korczewskiConfig: BrandConfig = {
  brand: 'korczewski',
  meta: {
    siteTitle: 'korczewski.de',
    siteDescription: 'Software Engineering & IT-Security-Beratung – KI-Integration, Kubernetes-Architektur, sichere Systeme',
  },
  contact: {
    name: process.env.CONTACT_NAME ?? '',
    email: process.env.CONTACT_EMAIL ?? '',
    phone: process.env.CONTACT_PHONE ?? '',
    city: process.env.CONTACT_CITY ?? '',
  },
  legal: {
    street: process.env.LEGAL_STREET ?? '',
    zip: process.env.LEGAL_ZIP ?? '',
    jobtitle: process.env.LEGAL_JOBTITLE ?? '',
    chamber: 'Entfällt',
    ustId: process.env.LEGAL_UST_ID ?? '',
    website: process.env.LEGAL_WEBSITE ?? '',
    tagline: 'Software Engineering & IT-Security-Beratung',
  },
  homepage: {
    stats: [
      { value: 'B.Sc.', label: 'IT-Sicherheit' },
      { value: '10+', label: 'Jahre IT-Erfahrung' },
      { value: 'KI', label: 'Seit Tag 1 dabei' },
      { value: 'K8s', label: 'Production-Grade' },
    ],
    servicesHeadline: 'Was ich für Sie tun kann',
    servicesSubheadline: 'Ich baue Systeme, die sicher laufen, skalieren und wartbar bleiben – und zeige Ihnen, wie KI dabei zum echten Hebel wird.',
    whyMeHeadline: 'Warum ich?',
    whyMeIntro: 'Ich komme nicht aus der Hochglanz-Beratung. Ich habe jahrelang reale IT-Systeme betrieben, bevor ich angefangen habe, sie zu bauen. Und seit dem ersten Tag von ChatGPT arbeite ich täglich mit KI – nicht als Spielerei, sondern als Produktivwerkzeug in echten Projekten.',
    whyMePoints: [
      {
        iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        title: 'Security first – immer',
        text: 'Bachelor in IT-Sicherheit. Ich denke Systeme von Anfang an sicher – nicht als nachträgliche Checkbox.',
      },
      {
        iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
        title: 'KI als echtes Werkzeug',
        text: 'Täglich mit Claude, Cursor und Co. – in Produktion, nicht im Demo-Modus. Ich weiß, was geht und was nicht.',
      },
      {
        iconPath: 'M5 12h14M12 5l7 7-7 7',
        title: 'Vom Konzept bis zum Cluster',
        text: 'Ich baue Architekturen, die ich hinterher selbst deploye und betreibe. Kein Abliefern und Verschwinden.',
      },
    ],
    avatarType: 'initials',
    avatarInitials: 'PK',
    quote: 'Gute Systeme entstehen nicht durch Tools allein – sondern durch das Verständnis, welches Problem man wirklich lösen will.',
    quoteName: 'Patrick Korczewski',
  },
  services: [
    {
      slug: 'ki-beratung',
      title: 'KI-Integration & Beratung',
      description: 'KI sinnvoll, sicher und messbar einsetzen – im eigenen Workflow oder im Unternehmen. Nicht als Hype, sondern als konkretes Werkzeug.',
      icon: '🧠',
      features: [
        'KI-Strategie und Tool-Auswahl',
        'Claude Code, Cursor, Copilot – was wirklich passt',
        'Datenschutzkonformer Einsatz im Unternehmen',
        'Automatisierung von Entwicklungs- und Geschäftsprozessen',
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'KI als echten Hebel einsetzen',
        intro: 'Es gibt einen großen Unterschied zwischen "mal ChatGPT ausprobiert" und KI systematisch in Arbeitsprozesse integriert. Ich zeige Ihnen den zweiten Weg – praxisnah, datenschutzkonform und ohne Vendor-Lock-in.',
        forWhom: [
          'KI gezielt in Entwicklung oder Geschäftsprozesse einbauen möchten',
          'Den richtigen Tool-Stack für ihr Team finden wollen',
          'Datenschutzkonformen KI-Einsatz im Unternehmen planen',
          'Den Überblick über Kosten, Risiken und Möglichkeiten behalten wollen',
        ],
        sections: [
          {
            title: 'Tool-Auswahl & Strategie',
            items: ['Claude Code, Cursor, Copilot, lokale Modelle – was passt wann?', 'Make-or-buy: Wann lohnt sich eigene Infrastruktur?'],
          },
          {
            title: 'KI in Entwicklungsprozessen',
            items: ['Code-Generierung, Review und Testing mit KI', 'Prompt Engineering für Entwickler und Teams'],
          },
          {
            title: 'Geschäftliche Automatisierung',
            items: ['Welche Prozesse lassen sich automatisieren?', 'Datenschutzkonformer Einsatz im Unternehmen (DSGVO)'],
          },
          {
            title: 'Kennenlerngespräch',
            items: ['Wir analysieren Ihre Situation', 'Ich zeige konkrete Ansätze – keine Verkaufsshow'],
          },
        ],
        pricing: [
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min' },
          { label: 'KI-Beratung & Strategie', price: '50 €', unit: '/ Stunde', highlight: true },
          { label: 'Workshop / Team-Session', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Für wen ist die KI-Beratung gedacht?', answer: 'Für Entwickler, die KI produktiv einsetzen wollen, und für Unternehmen, die KI sicher in Prozesse integrieren möchten. Technische Vorkenntnisse sind kein Muss.' },
          { question: 'Welche KI-Tools nutzen Sie selbst?', answer: 'Täglich: Claude Code als primäres Entwicklungstool, ergänzt durch Cursor und lokal laufende Modelle wo Datenschutz Priorität hat. Ich kenne die Stärken und Grenzen aus echtem Projekteinsatz.' },
        ],
      },
    },
    {
      slug: 'software-dev',
      title: 'Software-Entwicklung',
      description: 'Von der Architektur bis zum produktionsreifen Code. Mit solidem Security-Fundament und KI als Co-Pilot – nicht als Ersatz für Nachdenken.',
      icon: '💻',
      features: [
        'Architektur-Beratung und Code-Review',
        'TypeScript, Go, REST- und gRPC-APIs',
        'Security-first Entwicklung',
        'KI-gestützte Entwicklung richtig einsetzen',
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'Software, die funktioniert – und sicher bleibt',
        intro: 'Ich entwickle mit KI als Co-Pilot, nicht als Autopilot. Das bedeutet: schnellere Umsetzung, aber ohne die blinden Flecken zu ignorieren, die KI gerne übersieht – Security, Edge Cases, Wartbarkeit.',
        forWhom: [
          'Architekturentscheidungen richtig treffen wollen',
          'Bestehenden Code auf Qualität und Sicherheit reviewen lassen möchten',
          'Eine konkrete Software-Lösung umsetzen wollen',
          'KI-gestützte Entwicklung produktiv erlernen möchten',
        ],
        sections: [
          {
            title: 'Architektur-Beratung',
            items: ['Technologie-Stack, Struktur und Skalierbarkeit', 'Die richtigen Entscheidungen treffen, bevor Code geschrieben wird'],
          },
          {
            title: 'Code-Review & Security',
            items: ['Bestehenden Code auf Qualität, Sicherheit und Performance prüfen', 'OWASP-Top-10, Auth-Flows, sichere API-Designs'],
          },
          {
            title: 'Umsetzung',
            items: ['TypeScript (Node.js, Astro, Svelte) und Go', 'REST-APIs, Microservices, CLI-Tools'],
          },
          {
            title: 'Pair Programming',
            items: ['Gemeinsam entwickeln und dabei lernen', 'Wie man KI effektiv – und kritisch – als Co-Pilot einsetzt'],
          },
        ],
        pricing: [
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Welche Sprachen und Frameworks?', answer: 'Hauptsächlich TypeScript (Node.js, Astro, Svelte) und Go. Für Infrastruktur-nahe Aufgaben YAML, Bash und Kubernetes-Manifeste. Ich wähle nach Problem, nicht nach Hype.' },
          { question: 'Wie läuft ein Kennenlerngespräch ab?', answer: '45 Minuten, 20 Euro. Wir sprechen über Ihr Projekt oder Problem, ich stelle die richtigen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit sinnvoll ist.' },
        ],
      },
    },
    {
      slug: 'deployment',
      title: 'Kubernetes & Infrastruktur',
      description: 'Production-grade Kubernetes-Deployments, DSGVO-konforme Self-Hosted-Lösungen und GitOps-Workflows – von der ersten Konfiguration bis zum laufenden Betrieb.',
      icon: '☁️',
      features: [
        'Kubernetes-Architektur und -Deployment',
        'GitOps mit ArgoCD und GitHub Actions',
        'Self-Hosted Open-Source (Nextcloud, Mattermost, Keycloak)',
        'DSGVO-konforme Infrastruktur unter Ihrer Kontrolle',
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'Infrastruktur, die trägt',
        intro: 'Ich betreibe Kubernetes-Cluster in Produktion – multi-tenant, multi-cluster, mit GitOps-Workflows und Security-Härtung. Das ist kein Lernprojekt, sondern gelebte Praxis. Dieses Wissen gebe ich weiter.',
        forWhom: [
          'Kubernetes einrichten, migrieren oder absichern möchten',
          'Self-Hosted Open-Source-Lösungen aufsetzen wollen',
          'GitOps-Workflows und CI/CD einführen möchten',
          'DSGVO-konforme Infrastruktur ohne Cloud-Abhängigkeit aufbauen wollen',
        ],
        sections: [
          {
            title: 'Kubernetes-Deployment',
            items: ['k3s, k3d, multi-cluster mit ArgoCD', 'Ingress, TLS, NetworkPolicies, Monitoring – der vollständige Stack'],
          },
          {
            title: 'Self-Hosted Open-Source',
            items: ['Nextcloud, Mattermost, Keycloak SSO, Vaultwarden & mehr', 'DSGVO-konform, Ihre Daten, Ihre Kontrolle'],
          },
          {
            title: 'GitOps & CI/CD',
            items: ['ArgoCD für Multi-Cluster-Deployments', 'GitHub Actions, Kustomize, automatisierte Rollouts'],
          },
          {
            title: 'Wartung & Monitoring',
            items: ['Prometheus, Grafana, Alerting', 'Updates, Backups, Incident Response'],
          },
        ],
        pricing: [
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Warum Self-Hosted statt Cloud?', answer: 'Weil Sie damit Ihre Daten kontrollieren, Vendor-Lock-ins vermeiden und langfristig Kosten sparen. Und weil DSGVO-Compliance mit eigener Infrastruktur deutlich einfacher wird.' },
          { question: 'Arbeiten Sie remote oder vor Ort?', answer: 'Beides. Die meisten Infrastruktur-Projekte lassen sich vollständig remote umsetzen. Für intensivere Zusammenarbeit komme ich gerne nach Lüneburg und Umgebung.' },
        ],
      },
    },
  ],
  leistungen: [
    {
      id: 'ki-beratung',
      title: 'KI-Integration & Beratung',
      icon: '🧠',
      description: 'KI sinnvoll, sicher und messbar einsetzen – im eigenen Workflow oder im Unternehmen. Nicht als Hype, sondern als konkretes Werkzeug.',
      services: [
        { key: 'ki-kennenlern', name: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', desc: 'Wir analysieren Ihre Situation und finden heraus, wo KI Ihnen wirklich hilft. Keine Verkaufsshow.' },
        { key: 'ki-strategie', name: 'KI-Strategie & Tool-Auswahl', price: '50 €', unit: '/ Stunde', desc: 'Claude Code, Cursor, lokale Modelle – ich helfe Ihnen, den richtigen Stack für Ihre Situation zu finden.', highlight: true },
        { key: 'ki-integration', name: 'KI in Entwicklungsprozessen', price: '50 €', unit: '/ Stunde', desc: 'Code-Generierung, Review und Testing mit KI. Prompt Engineering für Entwickler und Teams.' },
        { key: 'ki-compliance', name: 'DSGVO-konformer KI-Einsatz', price: '50 €', unit: '/ Stunde', desc: 'Datenschutzkonforme KI-Integration im Unternehmen – welche Tools gehen, welche nicht.' },
      ],
    },
    {
      id: 'software-dev',
      title: 'Software-Entwicklung',
      icon: '💻',
      description: 'Von der Architektur bis zum produktionsreifen Code. Mit solidem Security-Fundament und KI als Co-Pilot.',
      services: [
        { key: 'sw-architektur', name: 'Architektur-Beratung', price: '50 €', unit: '/ Stunde', desc: 'Technologie-Stack, Struktur, Skalierbarkeit. Die richtigen Entscheidungen treffen, bevor Code geschrieben wird.' },
        { key: 'sw-review', name: 'Code-Review & Security', price: '50 €', unit: '/ Stunde', desc: 'Bestehenden Code auf Qualität, Sicherheit und Performance prüfen. OWASP, Auth-Flows, sichere API-Designs.' },
        { key: 'sw-umsetzung', name: 'Umsetzung', price: '50 €', unit: '/ Stunde', desc: 'TypeScript (Node.js, Astro, Svelte) und Go. REST-APIs, Microservices, CLI-Tools.' },
        { key: 'sw-pair', name: 'Pair Programming', price: '50 €', unit: '/ Stunde', desc: 'Gemeinsam entwickeln und lernen – wie man KI effektiv und kritisch als Co-Pilot einsetzt.' },
      ],
    },
    {
      id: 'deployment',
      title: 'Kubernetes & Infrastruktur',
      icon: '☁️',
      description: 'Production-grade Kubernetes, DSGVO-konforme Self-Hosted-Lösungen und GitOps-Workflows – gelebte Praxis, kein Lernprojekt.',
      services: [
        { key: 'dep-kubernetes', name: 'Kubernetes-Architektur', price: '50 €', unit: '/ Stunde', desc: 'k3s, multi-cluster mit ArgoCD, Ingress, TLS, NetworkPolicies, Monitoring – der vollständige Stack.' },
        { key: 'dep-opensource', name: 'Self-Hosted Open-Source', price: '50 €', unit: '/ Stunde', desc: 'Nextcloud, Mattermost, Keycloak SSO, Vaultwarden & mehr. DSGVO-konform, Ihre Daten, Ihre Kontrolle.' },
        { key: 'dep-gitops', name: 'GitOps & CI/CD', price: '50 €', unit: '/ Stunde', desc: 'ArgoCD für Multi-Cluster-Deployments, GitHub Actions, Kustomize, automatisierte Rollouts.' },
        { key: 'dep-wartung', name: 'Wartung & Monitoring', price: '50 €', unit: '/ Stunde', desc: 'Prometheus, Grafana, Alerting, Updates, Backups. Damit Sie ruhig schlafen können.' },
      ],
    },
  ],
  leistungenPricingHighlight: [
    { label: 'Kennenlerngespräch', price: '20 €', note: '45 Minuten · Situation erfassen & konkrete Ansätze besprechen' },
    { label: 'Stundensatz', price: '50 €', note: 'Alle Leistungen · Fair & transparent', highlight: true },
  ],
  uebermich: {
    pageHeadline: 'IT-Management, Security-Studium, KI seit Tag 1',
    subheadline: 'Über mich',
    introParagraphs: [
      'Manche Leute finden ihren Weg geradlinig. Ich habe meinen eher im Zickzack gefunden – und bin überzeugt, dass genau das der Grund ist, warum ich heute gute Beratung machen kann.',
      'Angefangen hat alles in der IT-Abteilung. Nicht in einem hippen Startup, sondern dort, wo Technik wirklich funktionieren muss: in Unternehmen, die darauf angewiesen sind, dass morgens um acht alles läuft. Ich habe ihre Server gewartet, ihre Netzwerke aufgebaut, ihre Mitarbeiter supportet – und dabei gelernt, dass die größte Herausforderung in der IT selten die Technik selbst ist.',
    ],
    sections: [
      {
        title: 'Security als Denkweise',
        content: 'Irgendwann wollte ich es genauer wissen und habe IT-Sicherheit im Bachelor studiert. Penetration Testing, Kryptographie, sichere Architekturen. Was hängengeblieben ist: ein tiefes Misstrauen gegenüber "das haben wir schon immer so gemacht" – und die Überzeugung, dass Security keine Checkbox ist, sondern eine Grundhaltung.',
      },
      {
        title: 'KI als Produktivwerkzeug – seit Tag 1',
        content: 'Als im November 2022 ChatGPT erschien, war mir sofort klar: Die Art, wie wir Software bauen, ändert sich grundlegend. Seitdem arbeite ich täglich mit KI – in echten Projekten, nicht in Demo-Umgebungen. Was als intuitives "Vibes-based Development" begann, habe ich systematisch in solides Architekturwissen verwandelt. Ich weiß, was KI kann, was sie übersieht – und wie man beides nutzt.',
      },
    ],
    milestones: [
      { year: 'Früher', title: 'IT-Management & Support', desc: 'Die IT großer und kleiner Unternehmen gemanaged. Server, Netzwerke, Helpdesk, Strategie – alles was dazugehört.' },
      { year: 'Studium', title: 'B.Sc. IT-Sicherheit', desc: 'Informatik mit Schwerpunkt IT-Sicherheit. Penetration Testing, Kryptographie, sichere Systeme.' },
      { year: 'Nov 2022', title: 'KI – der Wendepunkt', desc: 'ChatGPT erscheint. Ab diesem Tag: täglich KI in der Praxis. Aus Intuition wurde Architekturwissen.' },
      { year: 'Heute', title: 'Entwicklung & Beratung', desc: 'Kubernetes-Cluster in Produktion, KI-Integration, Security-Beratung. Und das Wissen weitergeben.' },
    ],
    notDoing: [
      { title: 'Kein Webdesign', text: 'Ich baue Infrastruktur, Architektur und Systeme. Für pixel-perfekte Designs gibt es bessere Leute.' },
      { title: 'Keine leeren Versprechen', text: '"KI löst alles" ist Unsinn. Ich sage Ihnen ehrlich, was geht und was nicht – auch wenn das bedeutet, dass Sie mich nicht buchen.' },
      { title: 'Keine 24/7-Erreichbarkeit', text: 'Gute Arbeit braucht Fokus. Ich arbeite gründlich, nicht hektisch.' },
    ],
    privateText: 'Ich lebe in Lüneburg. Wenn ich nicht gerade Kubernetes-Cluster debugge oder mit Claude über Architekturentscheidungen diskutiere, bin ich wahrscheinlich draußen unterwegs oder teste das nächste Open-Source-Tool, das mir über den Weg läuft.',
  },
  kontakt: {
    intro: 'Egal ob kurze Frage, Kennenlerngespräch oder konkretes Projekt – schreiben Sie mir. Ich antworte in der Regel innerhalb von 24 Stunden.',
    sidebarTitle: 'Kennenlerngespräch',
    sidebarText: '45 Minuten, 20 Euro. Wir sprechen über Ihre Situation, ich stelle die richtigen Fragen – und am Ende wissen wir beide, ob und wie ich Ihnen helfen kann.',
    sidebarCta: 'Kein Verkaufsgespräch. Nur Klarheit.',
    showPhone: false,
    showSteps: true,
  },
  faq: [
    {
      question: 'Für wen ist die Beratung gedacht?',
      answer: 'Für Entwickler und Teams, die KI produktiv einsetzen wollen, für Unternehmen die ihre Infrastruktur selbst kontrollieren möchten, und für alle die ein konkretes technisches Problem lösen müssen.',
    },
    {
      question: 'Brauche ich technische Vorkenntnisse?',
      answer: 'Für KI-Beratung und Strategie nicht zwingend. Für Kubernetes und Software-Entwicklung hilft technisches Grundverständnis – aber ich erkläre gerne, was ich tue und warum.',
    },
    {
      question: 'Wie läuft ein Kennenlerngespräch ab?',
      answer: '45 Minuten, 20 Euro. Wir sprechen über Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit sinnvoll ist – und wenn ja, wie.',
    },
    {
      question: 'Warum Self-Hosted statt Cloud?',
      answer: 'Weil Sie damit Ihre Daten kontrollieren, Vendor-Lock-ins vermeiden und langfristig günstiger fahren. Und weil DSGVO-Compliance mit eigener Infrastruktur deutlich einfacher wird.',
    },
    {
      question: 'Arbeiten Sie remote oder vor Ort?',
      answer: 'Beides. Die meisten Projekte lassen sich vollständig remote umsetzen. Für intensivere Zusammenarbeit komme ich gerne nach Lüneburg und Umgebung.',
    },
  ],
  leistungenCta: {
    href: '/kontakt',
    text: 'Anfragen',
  },
  features: {
    hasBooking: true,
    hasRegistration: true,
    hasOIDC: true,
    hasBilling: true,
  },
};
