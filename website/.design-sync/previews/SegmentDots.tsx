// @ts-nocheck
// Authored preview — SegmentDots progress primitive (factory UI), partial + full fill.
export const MidProgress = () => {
  const { SegmentDots } = window.MentolderDS;
  return <SegmentDots total={8} filled={5} />;
};

export const Complete = () => {
  const { SegmentDots } = window.MentolderDS;
  return <SegmentDots total={6} filled={6} />;
};

export const Empty = () => {
  const { SegmentDots } = window.MentolderDS;
  return <SegmentDots total={8} filled={1} />;
};
