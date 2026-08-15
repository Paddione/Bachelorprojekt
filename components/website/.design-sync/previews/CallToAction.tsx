// @ts-nocheck
// Authored preview — closing call-to-action band.
export const Default = () => {
  const { CallToAction } = window.MentolderDS;
  return <CallToAction locale="de" />;
};

export const CustomWithSecondary = () => {
  const { CallToAction } = window.MentolderDS;
  return (
    <CallToAction
      locale="de"
      eyebrow="Kostenloses Erstgespräch"
      title="Bereit für den"
      titleEmphasis="nächsten Schritt?"
      subtitle="Lass uns in 30 Minuten herausfinden, wo du stehst und was als Nächstes sinnvoll ist — ohne Verkaufsdruck."
      primaryText="Termin vereinbaren"
      secondaryText="Mehr erfahren"
      secondaryHref="/leistungen"
    />
  );
};
