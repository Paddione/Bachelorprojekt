// @ts-nocheck
// Authored preview — ToggleSwitch primitive (factory UI), on and off states.
export const On = () => {
  const { ToggleSwitch } = window.MentolderDS;
  return <ToggleSwitch value={true} size="md" glow={true} />;
};

export const Off = () => {
  const { ToggleSwitch } = window.MentolderDS;
  return <ToggleSwitch value={false} size="md" glow={true} />;
};

export const Large = () => {
  const { ToggleSwitch } = window.MentolderDS;
  return <ToggleSwitch value={true} size="lg" glow={true} />;
};
