export const PRESENCE_PALETTE = ['#4ea1ff', '#3fb950', '#f0a35e', '#c06be0', '#e06b8b', '#6be0d0'];

export function createPresence() {
  const people = new Map();   // userId -> { userId, name, color }
  const holds = new Map();     // figureId -> userId
  let nextColor = 0;
  return {
    join({ userId, name }) {
      if (!userId) return;
      if (people.has(userId)) { people.get(userId).name = name; return; }
      const color = PRESENCE_PALETTE[nextColor % PRESENCE_PALETTE.length];
      nextColor++;
      people.set(userId, { userId, name: name || userId, color });
    },
    leave(userId) {
      people.delete(userId);
      for (const [fig, owner] of holds) if (owner === userId) holds.delete(fig);
    },
    get(userId) { return people.get(userId) || null; },
    list() { return [...people.values()]; },
    setHold(figureId, userId) { holds.set(figureId, userId); },
    clearHold(figureId) { holds.delete(figureId); },
    holderOf(figureId) { return holds.get(figureId) || null; },
  };
}
