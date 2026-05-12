import type { PlayerState, MatchState, ItemKind, PowerupKind } from '../game/state';
import type { Grid } from './nav';
import { astar, hasLos, toCell } from './nav';
import { SOLID_WALLS } from '../game/map';
import { dist2, dist, angleTo } from '../game/physics';
import { WEAPONS, MAP_W, MAP_H } from '../game/constants';
import { isOutsideZone } from '../game/zone';

export interface BotInput {
  wasd: number;   // 0=idle, 1..8 = N/NE/E/SE/S/SW/W/NW
  aim: number;    // radians
  fire: boolean;
  melee: boolean;
  pickup: boolean;
  dodge: boolean;
}

type BotState = 'WANDER' | 'ENGAGE' | 'LOOT' | 'FLEE' | 'RECENTER';

const ENGAGE_RANGE_PX = 350;
const PREFER_RANGE_PX = 200;
const LOOT_RANGE_PX = 150;
const FLEE_HP_THRESHOLD = 1;
const DECISION_INTERVAL_MS = 200;
const AIM_NOISE_RAD = 0.15; // medium preset

export class BotAI {
  private state: BotState = 'WANDER';
  private waypoints: Array<{ x: number; y: number }> = [];
  private decisionTimer = 0;
  private wanderTarget: { x: number; y: number } | null = null;
  private aimNoise = 0;

  constructor(
    private readonly botKey: string,
    private readonly grid: Grid,
  ) {}

  decide(match: MatchState, dtMs: number): BotInput {
    this.decisionTimer -= dtMs;
    if (this.decisionTimer <= 0) {
      this.decisionTimer = DECISION_INTERVAL_MS;
      this.updateState(match);
    }

    const me = match.players[this.botKey];
    if (!me || !me.alive) return idle();

    return this.buildInput(me, match);
  }

  private updateState(match: MatchState): void {
    const me = match.players[this.botKey];
    if (!me || !me.alive) return;

    // RECENTER takes priority — bot is outside the zone
    if (isOutsideZone(me.x, me.y, match.zone)) {
      this.state = 'RECENTER';
      this.waypoints = astar(this.grid, me.x, me.y, match.zone.cx, match.zone.cy);
      return;
    }

    // FLEE — low HP, find nearest cover
    if (me.hp <= FLEE_HP_THRESHOLD && this.state !== 'FLEE') {
      this.state = 'FLEE';
      const cover = nearestCover(me.x, me.y);
      this.waypoints = astar(this.grid, me.x, me.y, cover.x, cover.y);
      return;
    }

    // ENGAGE — visible enemy within range
    const enemy = closestVisibleEnemy(me, match);
    if (enemy && dist(me.x, me.y, enemy.x, enemy.y) <= ENGAGE_RANGE_PX) {
      this.state = 'ENGAGE';
      // Navigate to preferred range
      if (dist(me.x, me.y, enemy.x, enemy.y) > PREFER_RANGE_PX) {
        this.waypoints = astar(this.grid, me.x, me.y, enemy.x, enemy.y);
      } else {
        this.waypoints = []; // in range, strafe
      }
      return;
    }

    // LOOT — visible pickup within range
    const loot = closestLoot(me, match);
    if (loot && dist(me.x, me.y, loot.x, loot.y) <= LOOT_RANGE_PX) {
      this.state = 'LOOT';
      this.waypoints = astar(this.grid, me.x, me.y, loot.x, loot.y);
      return;
    }

    // WANDER
    if (this.state !== 'WANDER' || !this.wanderTarget || this.waypoints.length === 0) {
      this.state = 'WANDER';
      this.wanderTarget = randomWalkable(this.grid);
      this.waypoints = astar(this.grid, me.x, me.y, this.wanderTarget.x, this.wanderTarget.y);
    }
  }

  private buildInput(me: PlayerState, match: MatchState): BotInput {
    const input: BotInput = { wasd: 0, aim: me.facing, fire: false, melee: false, pickup: false, dodge: false };

    // Movement: follow waypoints
    if (this.waypoints.length > 0) {
      const next = this.waypoints[0];
      const d = dist(me.x, me.y, next.x, next.y);
      if (d < 20) {
        this.waypoints.shift(); // reached waypoint
      } else {
        const angle = angleTo(me.x, me.y, next.x, next.y);
        input.wasd = angleToWasd(angle);
      }
    }

    // Aim and fire in ENGAGE state
    if (this.state === 'ENGAGE') {
      const enemy = closestVisibleEnemy(me, match);
      if (enemy) {
        this.aimNoise = (Math.random() - 0.5) * 2 * AIM_NOISE_RAD;
        input.aim = angleTo(me.x, me.y, enemy.x, enemy.y) + this.aimNoise;
        const d = dist(me.x, me.y, enemy.x, enemy.y);
        if (d <= WEAPONS.melee.rangePx) {
          input.melee = true;
        } else {
          input.fire = true;
        }
      }
    }

    return input;
  }
}

// --- Helpers ---

function idle(): BotInput {
  return { wasd: 0, aim: 0, fire: false, melee: false, pickup: false, dodge: false };
}

function closestVisibleEnemy(me: PlayerState, match: MatchState): PlayerState | null {
  let best: PlayerState | null = null;
  let bestD = Infinity;
  for (const p of Object.values(match.players)) {
    if (p.key === me.key || !p.alive) continue;
    const d = dist(me.x, me.y, p.x, p.y);
    if (d < bestD && hasLos(me.x, me.y, p.x, p.y, SOLID_WALLS)) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

function closestLoot(me: PlayerState, match: MatchState): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bestD = Infinity;
  for (const item of match.items) {
    const d = dist(me.x, me.y, item.x, item.y);
    if (d < bestD) { best = item; bestD = d; }
  }
  for (const pu of match.powerups) {
    const d = dist(me.x, me.y, pu.x, pu.y);
    if (d < bestD) { best = pu; bestD = d; }
  }
  return best;
}

function nearestCover(x: number, y: number): { x: number; y: number } {
  // Simple: aim for map center (behind cover walls)
  return { x: 480, y: 270 };
}

function randomWalkable(grid: Grid): { x: number; y: number } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const row = Math.floor(Math.random() * grid.length);
    const col = Math.floor(Math.random() * grid[0].length);
    if (grid[row][col]) {
      return { x: col * 32 + 16, y: row * 32 + 16 };
    }
  }
  return { x: 480, y: 270 };
}

const WASD_ANGLES = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4, Math.PI, -3*Math.PI/4, -Math.PI/2, -Math.PI/4];
function angleToWasd(angle: number): number {
  // Returns 1..8 (N/NE/E/SE/S/SW/W/NW)
  // 0=E, π/2=S, π=W, -π/2=N (atan2 convention)
  // Map to: 1=N, 2=NE, 3=E, 4=SE, 5=S, 6=SW, 7=W, 8=NW
  const normalized = ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const dirs = [3, 4, 5, 6, 7, 8, 1, 2]; // E,SE,S,SW,W,NW,N,NE
  const idx = Math.round(normalized / (Math.PI / 4)) % 8;
  return dirs[idx];
}