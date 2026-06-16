// @ts-nocheck
// Authored preview — mentolder framed founder portrait (initials placeholder).
export const Default = () => {
  const { Portrait } = window.MentolderDS;
  return (
    <Portrait
      avatarType="initials"
      avatarInitials="PK"
      name="Patrick Korczewski"
      role="Gründer · Digital Coach"
      location="Lüneburg · DE"
      tagText="Anno 2026 · Lüneburg"
    />
  );
};

export const MentorRole = () => {
  const { Portrait } = window.MentolderDS;
  return (
    <Portrait
      avatarType="initials"
      avatarInitials="PK"
      name="Patrick Korczewski"
      role="Führungskräfte-Mentor"
      location="Hamburg · DE"
      tagText="40 Jahre IT · Sicherheit"
    />
  );
};

export const Defaults = () => {
  const { Portrait } = window.MentolderDS;
  return (
    <Portrait
      avatarType="initials"
      avatarInitials="PK"
      name="Patrick Korczewski"
      role="Coach & Sparringspartner"
    />
  );
};
