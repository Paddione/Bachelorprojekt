// @ts-nocheck
// Authored preview — Stepper numeric control (factory UI), mid-progress and bounds.
export const MidValue = () => {
  const { Stepper } = window.MentolderDS;
  return <Stepper value={4} min={1} max={10} />;
};

export const AtMin = () => {
  const { Stepper } = window.MentolderDS;
  return <Stepper value={1} min={1} max={10} />;
};

export const AtMax = () => {
  const { Stepper } = window.MentolderDS;
  return <Stepper value={10} min={1} max={10} />;
};
