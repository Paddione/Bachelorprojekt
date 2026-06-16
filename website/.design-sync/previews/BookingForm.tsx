// @ts-nocheck
// Authored preview — mentolder Terminbuchung. Renders the type/leistung step
// chain in its idle state (slot fetch is async; the static scaffold shows).
export const Default = () => {
  const { BookingForm } = window.MentolderDS;
  return <BookingForm />;
};

export const ErstgespraechPrefilled = () => {
  const { BookingForm } = window.MentolderDS;
  return (
    <BookingForm
      initialType="erstgespraech"
      serviceKey="digital-coaching"
    />
  );
};
