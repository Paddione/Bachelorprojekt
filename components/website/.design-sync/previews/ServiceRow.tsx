// @ts-nocheck
// Authored preview — mentolder editorial service rows (numbered offer list).
export const Default = () => {
  const { ServiceRow } = window.MentolderDS;
  return (
    <ServiceRow
      num="01"
      title="Digital Coaching"
      meta="1:1 Begleitung"
      description="Persönliche Begleitung für Führungskräfte, die digitale Veränderung souverän und auf Augenhöhe gestalten wollen — vom ersten Impuls bis zur nachhaltigen Umsetzung."
      features={['Vertrauliche 1:1 Sessions', 'Praxisnahe Methoden', 'Zwischen den Terminen erreichbar']}
      price="180 € / Session"
      href="/leistungen/coaching"
      icon="🧭"
    />
  );
};

export const ITSecurity = () => {
  const { ServiceRow } = window.MentolderDS;
  return (
    <ServiceRow
      num="02"
      title="IT-Sicherheit & Strategie"
      meta="40 Jahre Erfahrung"
      description="Tragfähige Entscheidungen statt Bauchgefühl — von der Architektur über die Risiko-Bewertung bis zur konkreten Absicherung Ihrer Systeme."
      features={['Security-Audit', 'Risiko-Bewertung', 'Umsetzungs-Roadmap']}
      price="ab 1.200 € / Audit"
      href="/leistungen/it-sicherheit"
      icon="🛡️"
    />
  );
};

export const Workshop = () => {
  const { ServiceRow } = window.MentolderDS;
  return (
    <ServiceRow
      num="03"
      title="Führungs-Workshops"
      description="Kompakte Impulse für Teams im Wandel — wir bringen Menschen, Prozesse und Technik wieder in Einklang."
      features={['Halbtags oder ganztags', 'Inhouse in Lüneburg & Hamburg', 'Maßgeschneiderte Agenda']}
      price="auf Anfrage"
      priceUnit="pro Tag"
      href="/leistungen/workshops"
      icon="🤝"
    />
  );
};

export const Minimal = () => {
  const { ServiceRow } = window.MentolderDS;
  return (
    <ServiceRow
      num="04"
      title="Sparring-Gespräch"
      description="Ein klärendes Gespräch, wenn eine Entscheidung ansteht — direkt, vertraulich, ohne langfristige Bindung."
      features={[]}
      price="90 € / 60 Min"
      href="/leistungen/sparring"
    />
  );
};
