// @ts-nocheck
// Authored preview — mentolder FAQ accordion with realistic coaching questions.
export const Default = () => {
  const { FAQ } = window.MentolderDS;
  return (
    <FAQ
      items={[
        {
          question: 'Für wen ist ein Coaching bei mentolder geeignet?',
          answer: 'Für Führungskräfte und Selbstständige, die digitale Veränderung gestalten wollen — ob beim ersten Schritt in die Transformation oder bei konkreten Entscheidungen im Tagesgeschäft.',
        },
        {
          question: 'Finden die Termine online oder vor Ort statt?',
          answer: 'Beides ist möglich. Persönliche Termine biete ich in Lüneburg, Hamburg und Umgebung an, digitale Sessions per Videocall deutschlandweit.',
        },
        {
          question: 'Wie läuft das erste Gespräch ab?',
          answer: 'Das Erstgespräch ist unverbindlich. Wir klären Ihr Anliegen, schauen, ob die Chemie stimmt, und legen erst danach gemeinsam die nächsten Schritte fest.',
        },
        {
          question: 'Wie vertraulich sind die Gespräche?',
          answer: 'Vollständig. Alles, was im Coaching besprochen wird, bleibt zwischen uns — Diskretion ist die Grundlage meiner Arbeit.',
        },
      ]}
    />
  );
};

export const CustomTitle = () => {
  const { FAQ } = window.MentolderDS;
  return (
    <FAQ
      title="Häufige Fragen zur IT-Sicherheit"
      items={[
        {
          question: 'Brauche ich ein Security-Audit, wenn bei uns nie etwas passiert ist?',
          answer: 'Gerade dann. Ein Audit deckt Risiken auf, bevor sie zum Vorfall werden — und gibt Ihnen eine belastbare Grundlage für Entscheidungen.',
        },
        {
          question: 'Wie lange dauert ein Audit?',
          answer: 'Je nach Umfang zwischen einem und mehreren Tagen. Den genauen Rahmen klären wir vorab im Gespräch.',
        },
      ]}
    />
  );
};

export const Single = () => {
  const { FAQ } = window.MentolderDS;
  return (
    <FAQ
      title="Kurz gefragt"
      items={[
        {
          question: 'Was kostet eine Coaching-Session?',
          answer: 'Eine 1:1 Session beginnt bei 180 €. Für längere Begleitungen vereinbaren wir gerne ein passendes Paket.',
        },
      ]}
    />
  );
};
