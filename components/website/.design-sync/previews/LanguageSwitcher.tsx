// @ts-nocheck
// Authored preview — DE/EN locale toggle. Active locale derives from pathname.
export const German = () => {
  const { LanguageSwitcher } = window.MentolderDS;
  return <LanguageSwitcher pathname="/ueber-mich" />;
};

export const English = () => {
  const { LanguageSwitcher } = window.MentolderDS;
  return <LanguageSwitcher pathname="/en/ueber-mich" />;
};
