// brett/public/assets/coaching/hud-model.mjs
export function buildHudModel({ steps = [], index = 0, participants = [], isAdmin = false } = {}) {
  const total = steps.length;
  const safeIndex = total ? Math.max(0, Math.min(index, total - 1)) : 0;
  return {
    phaseLabel: total ? steps[safeIndex] : '—',
    phaseProgress: `${total ? safeIndex + 1 : 0} / ${total}`,
    canBack: isAdmin && safeIndex > 0,
    canAdvance: isAdmin && safeIndex < total - 1,
    showControls: !!isAdmin,
    participants: participants.map((p) => ({ name: p.name, color: p.color, userId: p.userId })),
  };
}
