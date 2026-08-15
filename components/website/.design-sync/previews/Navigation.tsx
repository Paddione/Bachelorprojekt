// @ts-nocheck
// Authored preview — mentolder sticky top navigation (idle, logged-out state).
const navLinks = [
  { label: 'Angebote', href: '/#angebote' },
  { label: 'Über mich', href: '/ueber-mich' },
  { label: 'Referenzen', href: '/referenzen' },
  { label: 'Kontakt', href: '/kontakt' },
];

export const Default = () => {
  const { Navigation } = window.MentolderDS;
  return (
    <Navigation
      siteTitle="mentolder"
      links={navLinks}
      pathname="/"
      locale="de"
    />
  );
};

export const OnReferenzen = () => {
  const { Navigation } = window.MentolderDS;
  return (
    <Navigation
      siteTitle="mentolder"
      links={navLinks}
      pathname="/referenzen"
      locale="de"
    />
  );
};
