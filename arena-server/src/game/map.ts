import { MAP_W, MAP_H } from './constants';

export interface Aabb { x1: number; y1: number; x2: number; y2: number; }
export interface DoorConfig { id: string; aabb: Aabb; locked: boolean; keycardUnlocks?: boolean; cacheAabb?: Aabb; }
export interface VentPair { a: Aabb; b: Aabb; cooldownMs: number; }
export interface SpawnPoint { x: number; y: number; }
export interface ItemSpot { x: number; y: number; }
export interface PowerupSpot { x: number; y: number; }

export interface MapDef {
  walls: Aabb[];
  doors: DoorConfig[];
  vents: VentPair[];
  spawns: SpawnPoint[];
  itemSpots: ItemSpot[];         // 12-spot table, items rotate through these
  powerupSpots: PowerupSpot[];   // one per powerup kind; index matches PowerupKind order
  supplyDropSpot: { x: number; y: number };
}

// Outer boundary — implicit walls at map edges
const BORDER_THICKNESS = 1;
const BORDER_WALLS: Aabb[] = [
  { x1: 0,          y1: 0,          x2: MAP_W,         y2: BORDER_THICKNESS }, // top
  { x1: 0,          y1: MAP_H - 1,  x2: MAP_W,         y2: MAP_H },            // bottom
  { x1: 0,          y1: 0,          x2: BORDER_THICKNESS, y2: MAP_H },          // left
  { x1: MAP_W - 1,  y1: 0,          x2: MAP_W,         y2: MAP_H },            // right
];

// Wall segments from sandbox.jsx (css left/top + width/height → x1,y1,x2,y2)
// North corridor walls (y=50, gap at x=360..680 filled by locked door)
// South corridor walls (y=464, gap at x=480..600 filled by unlocked door)
const WALL_SEGMENTS: Aabb[] = [
  { x1:  60, y1:  50, x2: 360, y2:  76 }, // north-west wall segment
  { x1: 680, y1:  50, x2: 960, y2:  76 }, // north-east wall segment (extends to map edge)
  { x1:  60, y1: 464, x2: 480, y2: 490 }, // south-west wall segment
  { x1: 600, y1: 464, x2: 960, y2: 490 }, // south-east wall segment
];

// Cover walls — CoverWall sprites centered at (x,y), approx 140×36 horizontal blocks
// Sandbags at (150,300) — approx 100×40
const COVER_WALLS: Aabb[] = [
  { x1: 230, y1: 182, x2: 370, y2: 218 }, // CoverWall at (300,200) size=150
  { x1: 750, y1: 282, x2: 890, y2: 318 }, // CoverWall at (820,300) size=150
  { x1: 415, y1: 442, x2: 585, y2: 478 }, // CoverWall at (500,460) size=170
  { x1: 100, y1: 280, x2: 200, y2: 320 }, // Sandbags at (150,300) size=170
];

// All solid walls (border + segments + covers)
export const SOLID_WALLS: Aabb[] = [
  ...BORDER_WALLS,
  ...WALL_SEGMENTS,
  ...COVER_WALLS,
];

// Doors: Place at center (x,y), 62×20 AABB
// North locked door at (420,62) — Keycard unlocks M4A1 cache behind it
// South unlocked door at (680, MAP_H-62) = (680,478)
export const CONCRETE_ARENA: MapDef = {
  walls: SOLID_WALLS,

  doors: [
    {
      id: 'north',
      aabb: { x1: 389, y1: 52, x2: 451, y2: 72 },
      locked: true,
      keycardUnlocks: true,
      cacheAabb: { x1: 389, y1: 20, x2: 451, y2: 52 }, // M4A1 cache zone
    },
    {
      id: 'south',
      aabb: { x1: 649, y1: 468, x2: 711, y2: 488 },
      locked: false,
    },
  ],

  vents: [
    {
      a: { x1: 405, y1: 410, x2: 435, y2: 430 }, // vent at (420,420)
      b: { x1: 765, y1: 110, x2: 795, y2: 130 }, // vent at (780,120)
      cooldownMs: 4_000,
    },
  ],

  // 4 spawn points, one per corner (inset from walls)
  spawns: [
    { x:  80, y:  80 }, // top-left
    { x: 880, y:  80 }, // top-right
    { x:  80, y: 460 }, // bottom-left
    { x: 880, y: 460 }, // bottom-right
  ],

  // 12 item spawn locations (rotated through each 60s cycle)
  itemSpots: [
    { x: 380, y: 300 }, { x: 620, y: 420 }, { x: 350, y: 460 },
    { x: 750, y: 460 }, { x: 200, y: 200 }, { x: 800, y: 400 },
    { x: 500, y: 100 }, { x: 700, y: 150 }, { x: 150, y: 450 },
    { x: 850, y: 250 }, { x: 300, y: 400 }, { x: 600, y: 250 },
  ],

  // 5 powerup spots — index 0=shield, 1=speed, 2=damage, 3=emp, 4=cloak
  powerupSpots: [
    { x: 660, y: 300 }, // shield
    { x: 250, y: 150 }, // speed
    { x: 480, y: 480 }, // damage
    { x: 870, y: 460 }, // emp
    { x: 750, y: 200 }, // cloak
  ],

  supplyDropSpot: { x: 330, y: 340 },
};