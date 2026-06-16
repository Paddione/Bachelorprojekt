// @ts-nocheck
// Authored preview — mentolder "Warum ich" section with reasons + founder quote.
export const Default = () => {
  const { WhyMe } = window.MentolderDS;
  return (
    <WhyMe
      headline="Warum mentolder"
      intro="Erfahrung, die *Orientierung* gibt — wenn Technik und Menschen aufeinandertreffen."
      points={[
        {
          title: '30+ Jahre Führungserfahrung',
          text: 'Ich weiß, wie sich Verantwortung anfühlt — und begleite Sie aus eigener Erfahrung, nicht aus dem Lehrbuch.',
        },
        {
          title: '40 Jahre in IT & Sicherheit',
          text: 'Von den Grundlagen bis zur Absicherung komplexer Systeme: ich übersetze Technik in tragfähige Entscheidungen.',
        },
        {
          title: 'Empathisch & auf Augenhöhe',
          text: 'Kein Frontalunterricht, sondern echtes Sparring — vertraulich, klar und ohne Fachjargon.',
        },
      ]}
      quote="Digitale Transformation gelingt nicht über Tools, sondern über Menschen, die sie tragen."
      quoteName="Patrick Korczewski"
      quoteRole="Gründer · mentolder"
    />
  );
};

export const TwoPoints = () => {
  const { WhyMe } = window.MentolderDS;
  return (
    <WhyMe
      headline="Mein Ansatz"
      intro="Weniger *Buzzwords*, mehr Wirkung."
      points={[
        {
          title: 'Praxis vor Theorie',
          text: 'Jede Empfehlung lässt sich am Montag umsetzen — nicht erst nach dem nächsten Großprojekt.',
        },
        {
          title: 'Diskretion als Standard',
          text: 'Was im Coaching besprochen wird, bleibt im Coaching. Immer.',
        },
      ]}
      quote="Die beste Strategie ist die, die Ihr Team auch wirklich lebt."
      quoteName="Patrick Korczewski"
      quoteRole="Digital Coach & Mentor"
    />
  );
};

export const NoQuoteRole = () => {
  const { WhyMe } = window.MentolderDS;
  return (
    <WhyMe
      headline="Über mich"
      intro="Ein Mentor für Führungskräfte in *Lüneburg, Hamburg und Umgebung*."
      points={[
        {
          title: 'Lokal verwurzelt',
          text: 'Vor Ort in der Region — für persönliche Termine ebenso wie für digitale Sessions.',
        },
        {
          title: 'Branchenübergreifend',
          text: 'Vom Handwerksbetrieb bis zum Mittelstand: ich höre zu, bevor ich berate.',
        },
        {
          title: 'Verbindlich erreichbar',
          text: 'Auch zwischen den Terminen bin ich für meine Klientinnen und Klienten da.',
        },
      ]}
      quote="Veränderung beginnt mit einem ehrlichen Gespräch."
      quoteName="Patrick Korczewski"
    />
  );
};
