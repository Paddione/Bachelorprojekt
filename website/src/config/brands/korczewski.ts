import type { BrandConfig } from '../types';

export const korczewskiConfig: BrandConfig = {
  brand: 'korczewski',
  meta: {
    siteTitle: 'korczewski.de',
    siteDescription: 'Software Engineering & IT-Security-Beratung – KI-Beratung, Software-Entwicklung, Kubernetes-Deployment',
  },
  contact: {
    name: 'Patrick Korczewski',
    email: 'info@korczewski.de',
    phone: '',
    city: 'Luneburg',
  },
  legal: {
    street: 'In der Twiet 4',
    zip: '21360',
    jobtitle: 'Software Engineer, IT-Security-Berater',
    chamber: 'Entfallt',
    ustId: 'Kleinunternehmer gem. § 19 Abs. 1 UStG',
    website: 'korczewski.de',
    tagline: 'Software Engineering & IT-Security-Beratung',
  },
  homepage: {
    stats: [
      { value: 'B.Sc.', label: 'IT-Sicherheit' },
      { value: '10+', label: 'Jahre IT-Management' },
      { value: 'KI', label: 'Seit Tag 1 dabei' },
      { value: 'K8s', label: 'Kubernetes & Open Source' },
    ],
<<<<<<< HEAD
    servicesHeadline: 'Was ich fur Sie tun kann',
=======
    servicesHeadline: 'Was ich für Sie tun kann',
>>>>>>> origin/main
    servicesSubheadline: 'Technologie soll Ihnen das Leben leichter machen – nicht komplizierter. Ich sorge dafur, dass es so bleibt.',
    whyMeHeadline: 'Warum ich?',
    whyMeIntro: 'Ich komme nicht aus der Theorie. Ich habe jahrelang die IT von Unternehmen gemanaged, bevor ich angefangen habe, selbst zu entwickeln. Und seit GPT-3 auf dem Markt ist, habe ich jeden Tag damit verbracht, aus meiner Intuition solides Architekturwissen zu machen.',
    whyMePoints: [
      {
        iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
        title: 'IT-Sicherheit im Blut',
        text: 'Bachelor in IT-Sicherheit. Ich denke Security-first, nicht als Afterthought.',
      },
      {
        iconPath: 'M13 10V3L4 14h7v7l9-11h-7z',
        title: 'KI-Native seit der ersten Stunde',
        text: 'Seit dem Launch von ChatGPT 3 arbeite ich taglich mit KI. Nicht als Spielerei – als Werkzeug.',
      },
      {
        iconPath: 'M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z',
        title: 'Praxis schlagt Theorie',
<<<<<<< HEAD
        text: 'Jahre in der IT grosser und kleiner Unternehmen. Ich kenne die echten Probleme, nicht nur die Lehrbuch-Probleme.',
=======
        text: 'Jahre in der IT großer und kleiner Unternehmen. Ich kenne die echten Probleme, nicht nur die Lehrbuch-Probleme.',
>>>>>>> origin/main
      },
    ],
    avatarType: 'initials',
    avatarInitials: 'PK',
    quote: 'Ich habe meine Vibes in Architekturwissen verwandelt – und jetzt helfe ich Ihnen, dasselbe zu tun. Nur schneller, weil ich die Sackgassen schon kenne.',
    quoteName: 'Patrick Korczewski',
  },
  services: [
    {
      slug: 'ki-beratung',
      title: 'KI-Beratung',
      description: 'KI sicher, sinnvoll und kosteneffizient einsetzen – privat oder geschaftlich. Kein Hype, sondern das, was wirklich funktioniert.',
      icon: '🧠',
      features: [
        'ChatGPT, Claude & Co. produktiv nutzen',
        'Datenschutzkonformer KI-Einsatz im Unternehmen',
        'Automatisierung von Routineaufgaben',
        'Kosten-Nutzen-Analyse verschiedener KI-Tools',
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'KI sicher und produktiv einsetzen',
        intro: 'KI ist kein Hexenwerk. Aber es gibt einen grossen Unterschied zwischen "mal ChatGPT ausprobiert" und "KI systematisch und sicher einsetzen". Ich zeige Ihnen den Unterschied.',
        forWhom: [
<<<<<<< HEAD
          'KI fur den personlichen Alltag nutzen mochten',
          'KI datenschutzkonform im Unternehmen einfuhren wollen',
          'Routineaufgaben automatisieren mochten',
          'Den Uberblick uber Tools und Kosten behalten wollen',
        ],
        sections: [
          {
            title: 'KI-Einfuhrung Privat',
            items: ['ChatGPT, Claude, lokale Modelle – was gibt es, was kostet es, was ist sicher?', 'Praxisnahe Einfuhrung fur den Alltag'],
=======
          'KI für den persönlichen Alltag nutzen möchten',
          'KI datenschutzkonform im Unternehmen einfuhren wollen',
          'Routineaufgaben automatisieren möchten',
          'Den Überblick über Tools und Kosten behalten wollen',
        ],
        sections: [
          {
            title: 'KI-Einführung Privat',
            items: ['ChatGPT, Claude, lokale Modelle – was gibt es, was kostet es, was ist sicher?', 'Praxisnahe Einführung für den Alltag'],
>>>>>>> origin/main
          },
          {
            title: 'KI-Strategie Geschaftlich',
            items: ['Welche Prozesse lassen sich automatisieren?', 'Wo lohnt sich KI, wo nicht?', 'Datenschutzkonformer Einsatz im Unternehmen'],
          },
          {
            title: 'Prompt Engineering',
<<<<<<< HEAD
            items: ['Die Kunst, KI die richtigen Fragen zu stellen', 'Fur Teams oder Einzelpersonen'],
          },
          {
            title: 'Kennenlerngesprach',
            items: ['Wir sprechen uber Ihre Situation', 'Ich finde heraus, wo KI Ihnen wirklich helfen kann', 'Keine Verkaufsshow'],
          },
        ],
        pricing: [
          { label: 'Kennenlerngesprach', price: '20 €', unit: '/ 45 Min' },
          { label: 'KI-Einfuhrung Privat', price: '50 €', unit: '/ Stunde' },
=======
            items: ['Die Kunst, KI die richtigen Fragen zu stellen', 'Für Teams oder Einzelpersonen'],
          },
          {
            title: 'Kennenlerngespräch',
            items: ['Wir sprechen über Ihre Situation', 'Ich finde heraus, wo KI Ihnen wirklich helfen kann', 'Keine Verkaufsshow'],
          },
        ],
        pricing: [
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min' },
          { label: 'KI-Einführung Privat', price: '50 €', unit: '/ Stunde' },
>>>>>>> origin/main
          { label: 'KI-Strategie Geschaftlich', price: '50 €', unit: '/ Stunde', highlight: true },
          { label: 'Prompt Engineering Workshop', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
<<<<<<< HEAD
          { question: 'Fur wen ist die KI-Beratung gedacht?', answer: 'Fur alle, die KI sinnvoll nutzen wollen – ob Privatperson, Selbstandiger oder Unternehmen. Ich hole Sie dort ab, wo Sie stehen, und zeige Ihnen, was heute schon funktioniert.' },
          { question: 'Brauche ich Programmierkenntnisse fur die KI-Beratung?', answer: 'Nein. Fur die KI-Beratung und grundlegende Automatisierung brauchen Sie null Vorkenntnisse.' },
=======
          { question: 'Für wen ist die KI-Beratung gedacht?', answer: 'Für alle, die KI sinnvoll nutzen wollen – ob Privatperson, Selbständiger oder Unternehmen. Ich hole Sie dort ab, wo Sie stehen, und zeige Ihnen, was heute schon funktioniert.' },
          { question: 'Brauche ich Programmierkenntnisse für die KI-Beratung?', answer: 'Nein. Für die KI-Beratung und grundlegende Automatisierung brauchen Sie null Vorkenntnisse.' },
>>>>>>> origin/main
        ],
      },
    },
    {
      slug: 'software-dev',
      title: 'Software-Entwicklung mit KI',
<<<<<<< HEAD
      description: 'Vom ersten Prompt bis zum fertigen Produkt. Ich zeige Ihnen, wie KI-gestutzte Entwicklung funktioniert – auch wenn Sie kein Informatiker sind.',
      icon: '💻',
      features: [
        'Einfuhrung in KI-gestutzte Entwicklung',
=======
      description: 'Vom ersten Prompt bis zum fertigen Produkt. Ich zeige Ihnen, wie KI-gestützte Entwicklung funktioniert – auch wenn Sie kein Informatiker sind.',
      icon: '💻',
      features: [
        'Einführung in KI-gestützte Entwicklung',
>>>>>>> origin/main
        'Architekturentscheidungen mit KI treffen',
        'Code-Qualitat und Testing mit KI',
        'Von der Idee zum produktionsreifen Code',
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'Software entwickeln – mit KI als Co-Pilot',
        intro: 'Sie mussen kein Informatiker sein, um mit KI Software zu bauen. Aber es hilft, jemanden an der Seite zu haben, der die Fallstricke kennt.',
        forWhom: [
          'Von der Idee zu einem funktionierenden Prototyp kommen wollen',
<<<<<<< HEAD
          'KI-gestutzte Entwicklung erlernen mochten',
          'Architekturentscheidungen richtig treffen wollen',
          'Bestehenden Code verbessern mochten',
=======
          'KI-gestützte Entwicklung erlernen möchten',
          'Architekturentscheidungen richtig treffen wollen',
          'Bestehenden Code verbessern möchten',
>>>>>>> origin/main
        ],
        sections: [
          {
            title: 'Einstieg in KI-Entwicklung',
            items: ['Wie man mit Claude Code, Cursor oder Copilot startet', 'Von der Idee zum funktionierenden Prototyp'],
          },
          {
            title: 'Architektur-Beratung',
            items: ['Die richtigen Entscheidungen treffen, bevor man Code schreibt', 'Technologie-Stack, Struktur, Skalierbarkeit'],
          },
          {
            title: 'Code-Review & Qualitat',
            items: ['Bestehenden Code gemeinsam durchgehen', 'Testing, Security, Performance – die Dinge, die KI gerne ubersieht'],
          },
          {
            title: 'Pair Programming mit KI',
            items: ['Wir entwickeln gemeinsam', 'Sie lernen, wie man KI als Co-Pilot effektiv einsetzt'],
          },
        ],
        pricing: [
<<<<<<< HEAD
          { label: 'Kennenlerngesprach', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Brauche ich Programmierkenntnisse?', answer: 'Fur Software-Entwicklung mit KI starten wir bei den Basics – KI ubernimmt den Grossteil der schweren Arbeit.' },
          { question: 'Wie lauft ein Kennenlerngesprach ab?', answer: '45 Minuten, 20 Euro. Wir sprechen uber Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit Sinn macht.' },
=======
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Brauche ich Programmierkenntnisse?', answer: 'Für Software-Entwicklung mit KI starten wir bei den Basics – KI übernimmt den Großteil der schweren Arbeit.' },
          { question: 'Wie läuft ein Kennenlerngespräch ab?', answer: '45 Minuten, 20 Euro. Wir sprechen über Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit Sinn macht.' },
>>>>>>> origin/main
        ],
      },
    },
    {
      slug: 'deployment',
      title: 'Deployment & Infrastruktur',
<<<<<<< HEAD
      description: 'Kubernetes, Open-Source-Losungen, Wartung – ich bringe Ihre Software sicher in Produktion und halte sie am Laufen.',
=======
      description: 'Kubernetes, Open-Source-Lösungen, Wartung – ich bringe Ihre Software sicher in Produktion und halte sie am Laufen.',
>>>>>>> origin/main
      icon: '☁️',
      features: [
        'Kubernetes-Deployment von A bis Z',
        'Open-Source-Alternativen zu teurer Software',
        'Monitoring, Wartung & Updates',
<<<<<<< HEAD
        'DSGVO-konforme Self-Hosted-Losungen',
=======
        'DSGVO-konforme Self-Hosted-Lösungen',
>>>>>>> origin/main
      ],
      price: '50 € / Stunde',
      pageContent: {
        headline: 'Ihre Software sicher in Produktion bringen',
        intro: 'Code schreiben ist die halbe Miete. Ihn zuverlassig in Produktion zu bringen und dort zu halten – das ist die andere Halfte.',
        forWhom: [
<<<<<<< HEAD
          'Kubernetes neu einrichten oder migrieren mochten',
          'Self-Hosted Open-Source-Losungen aufsetzen wollen',
          'Monitoring und Wartung outsourcen mochten',
          'Daten sicher migrieren mochten',
=======
          'Kubernetes neu einrichten oder migrieren möchten',
          'Self-Hosted Open-Source-Lösungen aufsetzen wollen',
          'Monitoring und Wartung outsourcen möchten',
          'Daten sicher migrieren möchten',
>>>>>>> origin/main
        ],
        sections: [
          {
            title: 'Kubernetes-Deployment',
            items: ['Von Docker-Compose zu Kubernetes', 'Manifeste, Ingress, TLS, Monitoring – der ganze Stack'],
          },
          {
            title: 'Open-Source-Setup',
            items: ['Nextcloud, Mattermost, Vaultwarden, Keycloak & mehr', 'Self-hosted, DSGVO-konform, unter Ihrer Kontrolle'],
          },
          {
            title: 'Wartung & Monitoring',
<<<<<<< HEAD
            items: ['Updates, Backups, Alerting', 'Damit Sie ruhig schlafen konnen, wahrend Ihre Infrastruktur lauft'],
=======
            items: ['Updates, Backups, Alerting', 'Damit Sie ruhig schlafen können, wahrend Ihre Infrastruktur läuft'],
>>>>>>> origin/main
          },
          {
            title: 'Migration & Umzug',
            items: ['Von der Cloud zum eigenen Server oder umgekehrt', 'Daten sicher migrieren, Downtime minimieren'],
          },
        ],
        pricing: [
<<<<<<< HEAD
          { label: 'Kennenlerngesprach', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Warum Open Source statt Standardsoftware?', answer: 'Weil Sie damit unabhangig bleiben: keine Vendor-Lock-ins, keine steigenden Lizenzkosten, volle Kontrolle uber Ihre Daten. Und oft ist die Open-Source-Losung auch die bessere.' },
          { question: 'Arbeiten Sie remote oder vor Ort?', answer: 'Beides. Die meisten Projekte lassen sich hervorragend remote umsetzen. Fur intensivere Zusammenarbeit komme ich auch gerne nach Luneburg und Umgebung.' },
=======
          { label: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', highlight: true },
          { label: 'Stundensatz', price: '50 €', unit: '/ Stunde' },
        ],
        faq: [
          { question: 'Warum Open Source statt Standardsoftware?', answer: 'Weil Sie damit unabhängig bleiben: keine Vendor-Lock-ins, keine steigenden Lizenzkosten, volle Kontrolle über Ihre Daten. Und oft ist die Open-Source-Lösung auch die bessere.' },
          { question: 'Arbeiten Sie remote oder vor Ort?', answer: 'Beides. Die meisten Projekte lassen sich hervorragend remote umsetzen. Für intensivere Zusammenarbeit komme ich auch gerne nach Luneburg und Umgebung.' },
>>>>>>> origin/main
        ],
      },
    },
  ],
  leistungen: [
    {
      id: 'ki-beratung',
      title: 'KI-Beratung',
      icon: '🧠',
      description: 'KI ist kein Hexenwerk. Aber es gibt einen grossen Unterschied zwischen "mal ChatGPT ausprobiert" und "KI systematisch und sicher einsetzen". Ich zeige Ihnen den Unterschied.',
      services: [
<<<<<<< HEAD
        { key: 'ki-kennenlern', name: 'Kennenlerngesprach', price: '20 €', unit: '/ 45 Min', desc: 'Wir sprechen uber Ihre Situation und finden heraus, wo KI Ihnen wirklich helfen kann. Keine Verkaufsshow.' },
        { key: 'ki-privat', name: 'KI-Einfuhrung Privat', price: '50 €', unit: '/ Stunde', desc: 'ChatGPT, Claude, lokale Modelle – was gibt es, was kostet es, was ist sicher? Praxisnahe Einfuhrung fur den Alltag.' },
        { key: 'ki-geschaeft', name: 'KI-Strategie Geschaftlich', price: '50 €', unit: '/ Stunde', desc: 'Welche Prozesse lassen sich automatisieren? Wo lohnt sich KI, wo nicht? Datenschutzkonformer Einsatz im Unternehmen.', highlight: true },
        { key: 'ki-prompt', name: 'Prompt Engineering Workshop', price: '50 €', unit: '/ Stunde', desc: 'Die Kunst, KI die richtigen Fragen zu stellen. Fur Teams oder Einzelpersonen.' },
=======
        { key: 'ki-kennenlern', name: 'Kennenlerngespräch', price: '20 €', unit: '/ 45 Min', desc: 'Wir sprechen über Ihre Situation und finden heraus, wo KI Ihnen wirklich helfen kann. Keine Verkaufsshow.' },
        { key: 'ki-privat', name: 'KI-Einführung Privat', price: '50 €', unit: '/ Stunde', desc: 'ChatGPT, Claude, lokale Modelle – was gibt es, was kostet es, was ist sicher? Praxisnahe Einführung für den Alltag.' },
        { key: 'ki-geschaeft', name: 'KI-Strategie Geschaftlich', price: '50 €', unit: '/ Stunde', desc: 'Welche Prozesse lassen sich automatisieren? Wo lohnt sich KI, wo nicht? Datenschutzkonformer Einsatz im Unternehmen.', highlight: true },
        { key: 'ki-prompt', name: 'Prompt Engineering Workshop', price: '50 €', unit: '/ Stunde', desc: 'Die Kunst, KI die richtigen Fragen zu stellen. Für Teams oder Einzelpersonen.' },
>>>>>>> origin/main
      ],
    },
    {
      id: 'software-dev',
      title: 'Software-Entwicklung mit KI',
      icon: '💻',
      description: 'Sie mussen kein Informatiker sein, um mit KI Software zu bauen. Aber es hilft, jemanden an der Seite zu haben, der die Fallstricke kennt.',
      services: [
<<<<<<< HEAD
        { key: 'sw-einstieg', name: 'Einstieg in KI-gestutzte Entwicklung', price: '50 €', unit: '/ Stunde', desc: 'Wie man mit Claude Code, Cursor oder Copilot von der Idee zum funktionierenden Prototyp kommt.' },
=======
        { key: 'sw-einstieg', name: 'Einstieg in KI-gestützte Entwicklung', price: '50 €', unit: '/ Stunde', desc: 'Wie man mit Claude Code, Cursor oder Copilot von der Idee zum funktionierenden Prototyp kommt.' },
>>>>>>> origin/main
        { key: 'sw-architektur', name: 'Architektur-Beratung', price: '50 €', unit: '/ Stunde', desc: 'Die richtigen Entscheidungen treffen, bevor man Code schreibt. Technologie-Stack, Struktur, Skalierbarkeit.' },
        { key: 'sw-review', name: 'Code-Review & Qualitat', price: '50 €', unit: '/ Stunde', desc: 'Bestehenden Code gemeinsam durchgehen. Testing, Security, Performance – die Dinge, die KI gerne ubersieht.' },
        { key: 'sw-pair', name: 'Pair Programming mit KI', price: '50 €', unit: '/ Stunde', desc: 'Wir entwickeln gemeinsam. Sie lernen dabei, wie man KI als Co-Pilot effektiv einsetzt.' },
      ],
    },
    {
      id: 'deployment',
      title: 'Deployment & Infrastruktur',
      icon: '☁️',
      description: 'Code schreiben ist die halbe Miete. Ihn zuverlassig in Produktion zu bringen und dort zu halten – das ist die andere Halfte.',
      services: [
        { key: 'dep-kubernetes', name: 'Kubernetes-Deployment', price: '50 €', unit: '/ Stunde', desc: 'Von Docker-Compose zu Kubernetes. Manifeste, Ingress, TLS, Monitoring – der ganze Stack.' },
        { key: 'dep-opensource', name: 'Open-Source-Setup', price: '50 €', unit: '/ Stunde', desc: 'Nextcloud, Mattermost, Vaultwarden, Keycloak & mehr. Self-hosted, DSGVO-konform, unter Ihrer Kontrolle.' },
<<<<<<< HEAD
        { key: 'dep-wartung', name: 'Wartung & Monitoring', price: '50 €', unit: '/ Stunde', desc: 'Updates, Backups, Alerting. Damit Sie ruhig schlafen konnen, wahrend Ihre Infrastruktur lauft.' },
=======
        { key: 'dep-wartung', name: 'Wartung & Monitoring', price: '50 €', unit: '/ Stunde', desc: 'Updates, Backups, Alerting. Damit Sie ruhig schlafen können, wahrend Ihre Infrastruktur läuft.' },
>>>>>>> origin/main
        { key: 'dep-migration', name: 'Migration & Umzug', price: '50 €', unit: '/ Stunde', desc: 'Von der Cloud zum eigenen Server oder umgekehrt. Daten sicher migrieren, Downtime minimieren.' },
      ],
    },
  ],
  leistungenPricingHighlight: [
<<<<<<< HEAD
    { label: 'Kennenlerngesprach', price: '20 €', note: '45 Minuten · Bedarf erfassen & eingrenzen' },
=======
    { label: 'Kennenlerngespräch', price: '20 €', note: '45 Minuten · Bedarf erfassen & eingrenzen' },
>>>>>>> origin/main
    { label: 'Stundensatz', price: '50 €', note: 'Alle Leistungen · Fair & transparent', highlight: true },
  ],
  uebermich: {
    pageHeadline: 'Von der IT-Abteilung zur KI-Beratung',
<<<<<<< HEAD
    subheadline: 'Uber mich',
    introParagraphs: [
      'Manche Leute finden ihren Weg geradlinig. Ich habe meinen eher im Zickzack gefunden – und bin der Meinung, dass genau das der Grund ist, warum ich heute gute Beratung machen kann.',
      'Angefangen hat alles in der IT-Abteilung. Nicht in einem hippen Startup, sondern dort, wo Technik wirklich funktionieren muss: in Unternehmen, die darauf angewiesen sind, dass morgens um acht alles lauft. Grosse Firmen, kleine Firmen – ich habe ihre Server gewartet, ihre Netzwerke aufgebaut, ihre Mitarbeiter supportet und dabei gelernt, dass die grosste Herausforderung in der IT selten die Technik ist. Es sind die Menschen, die Prozesse und die Frage "Warum machen wir das eigentlich so?".',
=======
    subheadline: 'Über mich',
    introParagraphs: [
      'Manche Leute finden ihren Weg geradlinig. Ich habe meinen eher im Zickzack gefunden – und bin der Meinung, dass genau das der Grund ist, warum ich heute gute Beratung machen kann.',
      'Angefangen hat alles in der IT-Abteilung. Nicht in einem hippen Startup, sondern dort, wo Technik wirklich funktionieren muss: in Unternehmen, die darauf angewiesen sind, dass morgens um acht alles läuft. Große Firmen, kleine Firmen – ich habe ihre Server gewartet, ihre Netzwerke aufgebaut, ihre Mitarbeiter supportet und dabei gelernt, dass die größte Herausforderung in der IT selten die Technik ist. Es sind die Menschen, die Prozesse und die Frage "Warum machen wir das eigentlich so?".',
>>>>>>> origin/main
    ],
    sections: [
      {
        title: 'Der Security-Hintergrund',
<<<<<<< HEAD
        content: 'Irgendwann wollte ich es genauer wissen und habe IT-Sicherheit im Bachelor studiert. Penetration Testing, Kryptographie, sichere Architekturen – das volle Programm. Was dabei hangengeblieben ist: ein tiefes Misstrauen gegenuber "das haben wir schon immer so gemacht" und die Uberzeugung, dass Security keine Checkbox ist, sondern eine Denkweise.',
      },
      {
        title: 'Die KI-Revolution – live dabei',
        content: 'Als im November 2022 ChatGPT 3 erschien, hat sich fur mich alles verandert. Nicht weil ich dachte "cool, ein Chatbot" – sondern weil ich sofort verstanden habe, dass sich die Art, wie wir Software bauen, grundlegend andern wurde. Seitdem habe ich praktisch jeden Tag mit KI gearbeitet. Tausende Stunden Prompting, Architektur-Entscheidungen, Trial and Error. Was als "Vibes-based Development" angefangen hat – also die intuitive Arbeit mit KI, bei der man mehr fuhlt als versteht – habe ich systematisch in solides Software-Architekturwissen verwandelt.',
      },
    ],
    milestones: [
      { year: 'Fruher', title: 'IT-Management', desc: 'Die IT grosser und kleiner Unternehmen gemanaged und supportet. Server, Netzwerke, Helpdesk, Strategie – der ganze Spass.' },
=======
        content: 'Irgendwann wollte ich es genauer wissen und habe IT-Sicherheit im Bachelor studiert. Penetration Testing, Kryptographie, sichere Architekturen – das volle Programm. Was dabei hängengeblieben ist: ein tiefes Misstrauen gegenüber "das haben wir schon immer so gemacht" und die Überzeugung, dass Security keine Checkbox ist, sondern eine Denkweise.',
      },
      {
        title: 'Die KI-Revolution – live dabei',
        content: 'Als im November 2022 ChatGPT 3 erschien, hat sich für mich alles verändert. Nicht weil ich dachte "cool, ein Chatbot" – sondern weil ich sofort verstanden habe, dass sich die Art, wie wir Software bauen, grundlegend ändern würde. Seitdem habe ich praktisch jeden Tag mit KI gearbeitet. Tausende Stunden Prompting, Architektur-Entscheidungen, Trial and Error. Was als "Vibes-based Development" angefangen hat – also die intuitive Arbeit mit KI, bei der man mehr fühlt als versteht – habe ich systematisch in solides Software-Architekturwissen verwandelt.',
      },
    ],
    milestones: [
      { year: 'Fruher', title: 'IT-Management', desc: 'Die IT großer und kleiner Unternehmen gemanaged und supportet. Server, Netzwerke, Helpdesk, Strategie – der ganze Spass.' },
>>>>>>> origin/main
      { year: 'Studium', title: 'B.Sc. IT-Sicherheit', desc: 'Informatik studiert mit Schwerpunkt IT-Sicherheit. Penetration Testing, Kryptographie, sichere Systeme.' },
      { year: 'Nov 2022', title: 'GPT-3 & der Wendepunkt', desc: 'ChatGPT erscheint. Ab diesem Tag: jeden Tag KI. Prompts, Pipelines, Architektur. Aus Vibes wurde Wissen.' },
      { year: 'Heute', title: 'Beratung & Entwicklung', desc: 'Software-Architektur, KI-Beratung, Kubernetes-Deployments. Und endlich bereit, dieses Wissen weiterzugeben.' },
    ],
    notDoing: [
<<<<<<< HEAD
      { title: 'Kein Webdesign', text: 'Ich baue Infrastruktur und Architektur. Fur schicke Pixel-perfekte Designs gibt es bessere Leute.' },
      { title: 'Keine leeren Versprechen', text: '"KI lost alles" ist Unsinn. Ich sage Ihnen ehrlich, was geht und was nicht. Auch wenn das bedeutet, dass Sie mich nicht buchen.' },
      { title: 'Keine 24/7-Erreichbarkeit', text: 'Gute Arbeit braucht Fokus. Ich arbeite grundlich, nicht hektisch.' },
    ],
    privateText: 'Ich lebe in {city}. Wenn ich nicht gerade Kubernetes-Cluster debugge oder mit Claude uber Architekturentscheidungen diskutiere, bin ich wahrscheinlich draussen unterwegs oder experimentiere mit dem nachsten Open-Source-Tool, das mir uber den Weg lauft.',
  },
  kontakt: {
    intro: 'Egal ob Frage, Kennenlerngesprach oder konkretes Projekt – schreiben Sie mir. Ich antworte in der Regel innerhalb von 24 Stunden.',
    sidebarTitle: 'Kennenlerngesprach',
    sidebarText: '45 Minuten, 20 Euro. Wir sprechen uber Ihre Situation, ich stelle die richtigen Fragen, und am Ende wissen wir beide, ob und wie ich Ihnen helfen kann.',
    sidebarCta: 'Kein Verkaufsgesprach. Nur Klarheit.',
=======
      { title: 'Kein Webdesign', text: 'Ich baue Infrastruktur und Architektur. Für schicke Pixel-perfekte Designs gibt es bessere Leute.' },
      { title: 'Keine leeren Versprechen', text: '"KI lost alles" ist Unsinn. Ich sage Ihnen ehrlich, was geht und was nicht. Auch wenn das bedeutet, dass Sie mich nicht buchen.' },
      { title: 'Keine 24/7-Erreichbarkeit', text: 'Gute Arbeit braucht Fokus. Ich arbeite grundlich, nicht hektisch.' },
    ],
    privateText: 'Ich lebe in {city}. Wenn ich nicht gerade Kubernetes-Cluster debugge oder mit Claude über Architekturentscheidungen diskutiere, bin ich wahrscheinlich draußen unterwegs oder experimentiere mit dem nächsten Open-Source-Tool, das mir über den Weg läuft.',
  },
  kontakt: {
    intro: 'Egal ob Frage, Kennenlerngespräch oder konkretes Projekt – schreiben Sie mir. Ich antworte in der Regel innerhalb von 24 Stunden.',
    sidebarTitle: 'Kennenlerngespräch',
    sidebarText: '45 Minuten, 20 Euro. Wir sprechen über Ihre Situation, ich stelle die richtigen Fragen, und am Ende wissen wir beide, ob und wie ich Ihnen helfen kann.',
    sidebarCta: 'Kein Verkaufsgespräch. Nur Klarheit.',
>>>>>>> origin/main
    showPhone: false,
    showSteps: true,
  },
  faq: [
    {
<<<<<<< HEAD
      question: 'Fur wen ist die KI-Beratung gedacht?',
      answer: 'Fur alle, die KI sinnvoll nutzen wollen – ob Privatperson, Selbstandiger oder Unternehmen. Ich hole Sie dort ab, wo Sie stehen, und zeige Ihnen, was heute schon funktioniert.',
    },
    {
      question: 'Brauche ich Programmierkenntnisse?',
      answer: 'Nein. Fur die KI-Beratung und grundlegende Automatisierung brauchen Sie null Vorkenntnisse. Fur Software-Entwicklung mit KI starten wir bei den Basics – KI ubernimmt den Grossteil der schweren Arbeit.',
    },
    {
      question: 'Wie lauft ein Kennenlerngesprach ab?',
      answer: '45 Minuten, 20 Euro. Wir sprechen uber Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit Sinn macht – und wenn ja, wie.',
    },
    {
      question: 'Warum Open Source statt Standardsoftware?',
      answer: 'Weil Sie damit unabhangig bleiben: keine Vendor-Lock-ins, keine steigenden Lizenzkosten, volle Kontrolle uber Ihre Daten. Und oft ist die Open-Source-Losung auch die bessere.',
    },
    {
      question: 'Arbeiten Sie remote oder vor Ort?',
      answer: 'Beides. Die meisten Projekte lassen sich hervorragend remote umsetzen. Fur intensivere Zusammenarbeit komme ich auch gerne nach Luneburg und Umgebung.',
=======
      question: 'Für wen ist die KI-Beratung gedacht?',
      answer: 'Für alle, die KI sinnvoll nutzen wollen – ob Privatperson, Selbständiger oder Unternehmen. Ich hole Sie dort ab, wo Sie stehen, und zeige Ihnen, was heute schon funktioniert.',
    },
    {
      question: 'Brauche ich Programmierkenntnisse?',
      answer: 'Nein. Für die KI-Beratung und grundlegende Automatisierung brauchen Sie null Vorkenntnisse. Für Software-Entwicklung mit KI starten wir bei den Basics – KI übernimmt den Großteil der schweren Arbeit.',
    },
    {
      question: 'Wie läuft ein Kennenlerngespräch ab?',
      answer: '45 Minuten, 20 Euro. Wir sprechen über Ihre Situation, ich stelle Fragen, Sie stellen Fragen. Am Ende wissen wir beide, ob eine Zusammenarbeit Sinn macht – und wenn ja, wie.',
    },
    {
      question: 'Warum Open Source statt Standardsoftware?',
      answer: 'Weil Sie damit unabhängig bleiben: keine Vendor-Lock-ins, keine steigenden Lizenzkosten, volle Kontrolle über Ihre Daten. Und oft ist die Open-Source-Lösung auch die bessere.',
    },
    {
      question: 'Arbeiten Sie remote oder vor Ort?',
      answer: 'Beides. Die meisten Projekte lassen sich hervorragend remote umsetzen. Für intensivere Zusammenarbeit komme ich auch gerne nach Luneburg und Umgebung.',
>>>>>>> origin/main
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
