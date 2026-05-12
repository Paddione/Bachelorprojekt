import { describe, it, expect } from 'vitest';
import { buildGrid, astar, toCell, toWorld, GRID_COLS, GRID_ROWS } from './nav';
import type { Aabb } from '../game/map';

describe('nav', () => {
  it('buildGrid marks wall cells as blocked', () => {
    const wall: Aabb = { x1: 0, y1: 0, x2: 32, y2: 32 };
    const grid = buildGrid([wall]);
    expect(grid[0][0]).toBe(false);
    expect(grid[0][1]).toBe(true);
  });

  it('all cells walkable with no walls', () => {
    const grid = buildGrid([]);
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        expect(grid[r][c]).toBe(true);
      }
    }
  });

  it('astar finds a direct path with no walls', () => {
    const grid = buildGrid([]);
    const path = astar(grid, 16, 16, 160, 16);
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1];
    expect(last.x).toBeCloseTo(160, 0);
  });

  it('astar routes around a wall blocking direct path', () => {
    // Block the direct horizontal path at col=3 (x=96..128)
    const wall: Aabb = { x1: 96, y1: 0, x2: 128, y2: 192 }; // tall wall, forces route around
    const grid = buildGrid([wall]);
    const path = astar(grid, 16, 96, 160, 96);
    expect(path.length).toBeGreaterThan(0);
    // Path must not pass through blocked cells
    for (const wp of path) {
      const c = toCell(wp.x, wp.y);
      expect(grid[c.row]?.[c.col]).toBe(true);
    }
  });

  it('returns empty array when start is blocked', () => {
    const wall: Aabb = { x1: 0, y1: 0, x2: 64, y2: 64 };
    const grid = buildGrid([wall]);
    const path = astar(grid, 16, 16, 500, 500);
    expect(path).toHaveLength(0);
  });
});