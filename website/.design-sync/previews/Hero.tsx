// @ts-nocheck
// Authored preview — realistic mentolder hero compositions.
export const Default = () => {
  const { Hero } = window.MentolderDS;
  return <Hero />;
};

export const WithInitials = () => {
  const { Hero } = window.MentolderDS;
  return (
    <Hero
      tagline="Digital Coach & Führungskräfte-Mentor"
      title="Menschen, Prozesse und Technik —"
      titleEmphasis="wieder in Einklang gebracht."
      subtitle="Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe."
      avatarType="initials"
      avatarInitials="PK"
      personName="Patrick Korczewski"
      personRole="Gründer · mentolder"
    />
  );
};
