export function createLocks() {
  const locks = new Map(); // figureId -> { userId, name, color }
  return {
    acquire(figureId, owner) {
      if (locks.has(figureId)) return false;
      locks.set(figureId, { userId: owner.userId, name: owner.name, color: owner.color });
      return true;
    },
    release(figureId, userId) {
      const cur = locks.get(figureId);
      if (!cur || cur.userId !== userId) return false;
      locks.delete(figureId);
      return true;
    },
    releaseAllFor(userId) {
      for (const [fig, o] of locks) if (o.userId === userId) locks.delete(fig);
    },
    owner(figureId) { return locks.get(figureId) || null; },
    list() { return [...locks.entries()].map(([figureId, o]) => ({ figureId, ...o })); },
    replaceAll(arr) {
      locks.clear();
      for (const e of arr || []) locks.set(e.figureId, { userId: e.userId, name: e.name, color: e.color });
    },
  };
}
