export const MAP_W = 960;
export const MAP_H = 540;

export interface Aabb { x1: number; y1: number; x2: number; y2: number; }

const BORDER_WALLS: Aabb[] = [
  { x1: 0, y1: 0, x2: MAP_W, y2: 1 },
  { x1: 0, y1: MAP_H - 1, x2: MAP_W, y2: MAP_H },
  { x1: 0, y1: 0, x2: 1, y2: MAP_H },
  { x1: MAP_W - 1, y1: 0, x2: MAP_W, y2: MAP_H },
];

const WALL_SEGMENTS: Aabb[] = [
  { x1: 60, y1: 50, x2: 360, y2: 76 },
  { x1: 680, y1: 50, x2: 960, y2: 76 },
  { x1: 60, y1: 464, x2: 480, y2: 490 },
  { x1: 600, y1: 464, x2: 960, y2: 490 },
];

const COVER_WALLS: Aabb[] = [
  { x1: 230, y1: 182, x2: 370, y2: 218 },
  { x1: 750, y1: 282, x2: 890, y2: 318 },
  { x1: 415, y1: 442, x2: 585, y2: 478 },
  { x1: 100, y1: 280, x2: 200, y2: 320 },
];

export const SOLID_WALLS: Aabb[] = [...BORDER_WALLS, ...WALL_SEGMENTS, ...COVER_WALLS];

export const DOORS: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }> = [
  { id: 'north', x1: 389, y1: 52, x2: 451, y2: 72 },
  { id: 'south', x1: 649, y1: 468, x2: 711, y2: 488 },
];
