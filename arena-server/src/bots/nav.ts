import { MAP_W, MAP_H } from '../game/constants';
import type { Aabb } from '../game/map';

const CELL = 32; // grid cell size in px
export const GRID_COLS = Math.ceil(MAP_W / CELL);
export const GRID_ROWS = Math.ceil(MAP_H / CELL);

export type Grid = boolean[][]; // true = walkable

export interface GVec2 { col: number; row: number; }

// Build a walkable grid. Cells overlapping walls are blocked.
export function buildGrid(walls: Aabb[]): Grid {
  const grid: Grid = Array.from({ length: GRID_ROWS }, () => new Array(GRID_COLS).fill(true));
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const x1 = col * CELL;
      const y1 = row * CELL;
      const x2 = x1 + CELL;
      const y2 = y1 + CELL;
      for (const w of walls) {
        if (x1 < w.x2 && x2 > w.x1 && y1 < w.y2 && y2 > w.y1) {
          grid[row][col] = false;
          break;
        }
      }
    }
  }
  return grid;
}

// Convert world px to grid cell
export function toCell(x: number, y: number): GVec2 {
  return { col: Math.floor(x / CELL), row: Math.floor(y / CELL) };
}

// Convert grid cell center to world px
export function toWorld(cell: GVec2): { x: number; y: number } {
  return { x: cell.col * CELL + CELL / 2, y: cell.row * CELL + CELL / 2 };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// A* — returns world-px waypoints from start to goal. Returns [] if unreachable.
export function astar(
  grid: Grid,
  fromX: number, fromY: number,
  toX: number, toY: number,
): Array<{ x: number; y: number }> {
  const start = toCell(fromX, fromY);
  const goal = toCell(
    clamp(toX, 0, MAP_W - 1),
    clamp(toY, 0, MAP_H - 1),
  );

  // Clamp start to walkable
  if (!grid[start.row]?.[start.col]) {
    // Find nearest walkable
    return [];
  }
  // If goal is blocked, aim for nearest walkable neighbor
  const actualGoal = grid[goal.row]?.[goal.col] ? goal : (nearestWalkable(grid, goal) ?? goal);

  const key = (c: GVec2) => c.row * GRID_COLS + c.col;
  const h = (c: GVec2) => Math.abs(c.col - actualGoal.col) + Math.abs(c.row - actualGoal.row);

  const open = new Map<number, GVec2>();
  const gScore = new Map<number, number>();
  const fScore = new Map<number, number>();
  const cameFrom = new Map<number, GVec2>();

  const startKey = key(start);
  open.set(startKey, start);
  gScore.set(startKey, 0);
  fScore.set(startKey, h(start));

  const DIRS = [
    { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
    { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
    { dc: -1, dr: -1 }, { dc: 1, dr: -1 },
    { dc: -1, dr: 1 }, { dc: 1, dr: 1 },
  ];

  let iterations = 0;
  while (open.size > 0 && iterations++ < 2000) {
    // Get node with lowest fScore
    let currentKey = -1;
    let lowestF = Infinity;
    for (const [k, c] of open) {
      const f = fScore.get(k) ?? Infinity;
      if (f < lowestF) { lowestF = f; currentKey = k; }
    }
    const current = open.get(currentKey)!;
    open.delete(currentKey);

    if (current.col === actualGoal.col && current.row === actualGoal.row) {
      // Reconstruct path
      const path: GVec2[] = [current];
      let c = current;
      while (cameFrom.has(key(c))) {
        c = cameFrom.get(key(c))!;
        path.unshift(c);
      }
      // Convert to world coords, skip first cell (current position)
      const worldPath = path.slice(1).map(toWorld);
      if (actualGoal.col === goal.col && actualGoal.row === goal.row && worldPath.length > 0) {
        worldPath[worldPath.length - 1] = { x: toX, y: toY };
      }
      return worldPath;
    }

    const g = gScore.get(currentKey) ?? Infinity;
    for (const d of DIRS) {
      const nc: GVec2 = { col: current.col + d.dc, row: current.row + d.dr };
      if (nc.col < 0 || nc.col >= GRID_COLS || nc.row < 0 || nc.row >= GRID_ROWS) continue;
      if (!grid[nc.row][nc.col]) continue;
      const stepCost = (d.dc !== 0 && d.dr !== 0) ? 1.414 : 1;
      const ng = g + stepCost;
      const nk = key(nc);
      if (ng < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, current);
        gScore.set(nk, ng);
        fScore.set(nk, ng + h(nc));
        open.set(nk, nc);
      }
    }
  }
  return []; // unreachable
}

function nearestWalkable(grid: Grid, cell: GVec2): GVec2 | null {
  for (let r = 1; r <= 3; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        const nr = cell.row + dr;
        const nc = cell.col + dc;
        if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS && grid[nr][nc]) {
          return { row: nr, col: nc };
        }
      }
    }
  }
  return null;
}

// LOS check in world space using lineCast
import { lineCast } from '../game/physics';
export function hasLos(ax: number, ay: number, bx: number, by: number, walls: Aabb[]): boolean {
  return lineCast(ax, ay, bx, by, walls) >= 1;
}