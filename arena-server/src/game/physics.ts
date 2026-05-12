import type { Aabb } from './map';
import { MAP_W, MAP_H, PLAYER_HITBOX_W, PLAYER_HITBOX_H } from './constants';

export { Aabb };
export interface Vec2 { x: number; y: number; }

// Returns true if the centered hitbox (cx,cy, hw×hh half-extents) overlaps the AABB
export function aabbOverlap(cx: number, cy: number, hw: number, hh: number, wall: Aabb): boolean {
  return cx - hw < wall.x2 && cx + hw > wall.x1 &&
         cy - hh < wall.y2 && cy + hh > wall.y1;
}

// Returns true if any wall in the list overlaps the hitbox
export function collidesAny(cx: number, cy: number, walls: Aabb[]): boolean {
  const hw = PLAYER_HITBOX_W / 2;
  const hh = PLAYER_HITBOX_H / 2;
  return walls.some(w => aabbOverlap(cx, cy, hw, hh, w));
}

// Move from (cx,cy) by (dx,dy), slide along walls. Returns new center.
export function moveWithCollision(
  cx: number, cy: number,
  dx: number, dy: number,
  walls: Aabb[],
): Vec2 {
  // Clamp to map bounds first
  const hw = PLAYER_HITBOX_W / 2;
  const hh = PLAYER_HITBOX_H / 2;

  // Try full move
  let nx = Math.max(hw, Math.min(MAP_W - hw, cx + dx));
  let ny = Math.max(hh, Math.min(MAP_H - hh, cy + dy));
  if (!collidesAny(nx, ny, walls)) return { x: nx, y: ny };

  // Try x-only
  nx = Math.max(hw, Math.min(MAP_W - hw, cx + dx));
  ny = Math.max(hh, Math.min(MAP_H - hh, cy));
  if (!collidesAny(nx, ny, walls)) return { x: nx, y: ny };

  // Try y-only
  nx = Math.max(hw, Math.min(MAP_W - hw, cx));
  ny = Math.max(hh, Math.min(MAP_H - hh, cy + dy));
  if (!collidesAny(nx, ny, walls)) return { x: nx, y: ny };

  // Fully blocked
  return { x: cx, y: cy };
}

// Parametric ray-AABB slab intersection. Returns t ∈ [0,1] of first hit, or 1 if clear.
export function lineCast(ax: number, ay: number, bx: number, by: number, walls: Aabb[]): number {
  const dx = bx - ax;
  const dy = by - ay;
  let tMin = 1;
  for (const w of walls) {
    if (dx !== 0) {
      const t1 = (w.x1 - ax) / dx;
      const t2 = (w.x2 - ax) / dx;
      const tEnter = Math.min(t1, t2);
      const tExit  = Math.max(t1, t2);
      if (tEnter < tExit && tEnter > 0 && tEnter < tMin) {
        const hitY = ay + dy * tEnter;
        if (hitY >= w.y1 && hitY <= w.y2) tMin = tEnter;
      }
    }
    if (dy !== 0) {
      const t1 = (w.y1 - ay) / dy;
      const t2 = (w.y2 - ay) / dy;
      const tEnter = Math.min(t1, t2);
      const tExit  = Math.max(t1, t2);
      if (tEnter < tExit && tEnter > 0 && tEnter < tMin) {
        const hitX = ax + dx * tEnter;
        if (hitX >= w.x1 && hitX <= w.x2) tMin = tEnter;
      }
    }
  }
  return tMin;
}

// Returns true if the straight line from a to b is unobstructed
export function hasLos(ax: number, ay: number, bx: number, by: number, walls: Aabb[]): boolean {
  return lineCast(ax, ay, bx, by, walls) >= 1;
}

// Returns true if any part of circle (cx,cy,r) overlaps AABB
export function circleIntersectsAabb(cx: number, cy: number, r: number, aabb: Aabb): boolean {
  const nearX = Math.max(aabb.x1, Math.min(cx, aabb.x2));
  const nearY = Math.max(aabb.y1, Math.min(cy, aabb.y2));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

// Distance squared
export function dist2(ax: number, ay: number, bx: number, by: number): number {
  return (ax - bx) ** 2 + (ay - by) ** 2;
}

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt(dist2(ax, ay, bx, by));
}

// Angle from (ax,ay) to (bx,by) in radians
export function angleTo(ax: number, ay: number, bx: number, by: number): number {
  return Math.atan2(by - ay, bx - ax);
}