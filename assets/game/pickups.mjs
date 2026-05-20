export function computeSpawnPosition({ players, boardRadius, minDist, rng = Math.random }) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * boardRadius;
    const pos = { x: Math.cos(a) * r, y: 0.5, z: Math.sin(a) * r };
    if (players.every(p => Math.hypot(pos.x - p.x, pos.z - p.z) >= minDist)) return pos;
  }
  return { x: 0, y: 0.5, z: 0 };
}

export function canTakePickup({ player, pickup }) {
  return Math.hypot(player.x - pickup.x, player.z - pickup.z) <= pickup.takeRadius;
}

export const PICKUP_TABLE = {
  rifle:    { respawnMs: 30_000, takeRadius: 1.5, mesh: 'octahedron-brass' },
  fireball: { respawnMs: 60_000, takeRadius: 1.5, mesh: 'octahedron-fire' },
};
