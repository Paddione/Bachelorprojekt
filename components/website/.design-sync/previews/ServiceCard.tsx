// @ts-nocheck
// Authored preview — mentolder service offering cards (Tailwind-styled).
export const Default = () => {
  const { ServiceCard } = window.MentolderDS;
  return (
    <ServiceCard
      icon="🧭"
      title="Digital Coaching"
      description="Persönliche Begleitung für Führungskräfte, die digitale Veränderung souverän gestalten wollen."
      features={['1:1 Sessions', 'Praxisnahe Methoden', 'Zwischen den Terminen erreichbar']}
      href="/leistungen/coaching"
      price="ab 180 € / Session"
    />
  );
};

export const WithoutPrice = () => {
  const { ServiceCard } = window.MentolderDS;
  return (
    <ServiceCard
      icon="🛡️"
      title="IT-Sicherheit & Strategie"
      description="40 Jahre IT-Erfahrung für tragfähige Entscheidungen — von der Architektur bis zur Absicherung."
      features={['Security-Audit', 'Risiko-Bewertung', 'Umsetzungs-Roadmap']}
      href="/leistungen/it-sicherheit"
    />
  );
};
