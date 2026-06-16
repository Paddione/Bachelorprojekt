// @ts-nocheck
// Authored preview — mentolder Kontaktformular in its idle (empty) state.
export const German = () => {
  const { ContactForm } = window.MentolderDS;
  return <ContactForm locale="de" />;
};

export const English = () => {
  const { ContactForm } = window.MentolderDS;
  return <ContactForm locale="en" />;
};
