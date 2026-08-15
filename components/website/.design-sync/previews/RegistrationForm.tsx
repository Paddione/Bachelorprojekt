// @ts-nocheck
// Authored preview — mentolder Erstgespräch registration form, idle state (German + English locale).
export const Default = () => {
  const { RegistrationForm } = window.MentolderDS;
  return <RegistrationForm locale="de" />;
};

export const English = () => {
  const { RegistrationForm } = window.MentolderDS;
  return <RegistrationForm locale="en" />;
};
