// @ts-nocheck
// Authored preview — testimonial / pull-quote cards (text-heavy: checks serif + italics).
export const Testimonial = () => {
  const { QuoteCard } = window.MentolderDS;
  return (
    <QuoteCard
      quote="Patrick hat es geschafft, dass unser Team Technologie nicht mehr als Bedrohung, sondern als Werkzeug begreift. Das hat unsere Zusammenarbeit grundlegend verändert."
      name="Sabine Mertens"
      role="Bereichsleiterin, mittelständischer Maschinenbau"
    />
  );
};

export const Short = () => {
  const { QuoteCard } = window.MentolderDS;
  return (
    <QuoteCard
      quote="Endlich jemand, der Klartext spricht und trotzdem zuhört."
      name="Andreas Vogt"
      role="Geschäftsführer"
      initials="AV"
    />
  );
};
