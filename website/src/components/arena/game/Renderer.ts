import { Application, Graphics, Sprite, Texture, Assets, Container, Text } from 'pixi.js';
import type { MatchState, PlayerState } from '../shared/lobbyTypes';
import { SOLID_WALLS, DOORS, MAP_W, MAP_H } from './mapData';

const KORE = {
  floor:       0x120d1c,
  wall:        0x1a1326,
  cover:       0x2d2240,
  lime:        0xc8f76a,
  blood:       0xd33a2c,
  teal:        0x5bd4d0,
  door_locked: 0x3a2e52,
  door_open:   0x4a5a1a,
};

const CHAR_SPRITE: Record<string, string> = {
  'blonde-guy':       '/arena/warrior-stand-00.png',
  'brown-guy':        '/arena/tank-stand-00.png',
  'long-red-girl':    '/arena/rogue-stand-00.png',
  'blonde-long-girl': '/arena/mage-stand-00.png',
};

const ITEM_COLORS: Record<string, number> = {
  'health-pack':  0xd33a2c,
  'med-syringe':  0xd33a2c,
  'armor-plate':  0x5bd4d0,
  'ammo-box':     0xc8a857,
  'keycard':      0xc8f76a,
  'respect-coin': 0xd8ff8a,
};

const POWERUP_COLORS: Record<string, number> = {
  shield: 0x5bd4d0, speed: 0xc8f76a, damage: 0xd33a2c,
  emp: 0xe0d060, cloak: 0x8a8497,
};

interface PlayerSprite {
  container: Container;
  body: Sprite | Graphics;
  hpBar: Graphics;
  nameTag: Text;
}

export class Renderer {
  private app: Application;
  private backgroundG = new Graphics();
  private dynamicLayer = new Container();
  private zoneG = new Graphics();
  private playerSprites = new Map<string, PlayerSprite>();
  private itemSprites = new Map<string, Graphics>();
  private powerupSprites = new Map<string, Graphics>();
  private textures = new Map<string, Texture>();
  private ready = false;
  private destroyed = false;
  private followTarget: string | null = null;
  private initPromise: Promise<void>;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new Application();
    this.initPromise = this.app.init({
      canvas,
      width: MAP_W,
      height: MAP_H,
      backgroundColor: KORE.floor,
      antialias: false,
    }).then(() => {
      if (this.destroyed) return;
      this.initScene();
    });
  }

  private initScene() {
    this.drawBackground();
    this.app.stage.addChild(this.backgroundG, this.dynamicLayer);
    this.dynamicLayer.addChild(this.zoneG);
    this.ready = true;
  }

  private drawBackground() {
    const g = this.backgroundG;
    g.setStrokeStyle({ width: 1, color: 0x1d1230, alpha: 0.5 });
    for (let x = 0; x < MAP_W; x += 32) g.moveTo(x, 0).lineTo(x, MAP_H);
    for (let y = 0; y < MAP_H; y += 32) g.moveTo(0, y).lineTo(MAP_W, y);
    g.stroke();

    g.setFillStyle({ color: KORE.wall });
    for (const w of SOLID_WALLS) g.rect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1).fill();

    g.setStrokeStyle({ width: 1, color: KORE.lime, alpha: 0.25 });
    for (const w of SOLID_WALLS) g.rect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1).stroke();
  }

  private drawDoors(state: MatchState) {
    for (const doorDef of DOORS) {
      const locked = state.doors.find(d => d.id === doorDef.id)?.locked ?? true;
      const color = locked ? KORE.door_locked : KORE.door_open;
      const w = doorDef.x2 - doorDef.x1;
      const h = doorDef.y2 - doorDef.y1;
      this.backgroundG.setFillStyle({ color });
      this.backgroundG.rect(doorDef.x1, doorDef.y1, w, h).fill();
      if (!locked) {
        this.backgroundG.setStrokeStyle({ width: 1, color: KORE.lime });
        this.backgroundG.rect(doorDef.x1, doorDef.y1, w, h).stroke();
      }
    }
  }

  private drawZone(state: MatchState) {
    this.zoneG.clear();
    const { cx, cy, radius, shrinking } = state.zone;
    const zoneColor = shrinking ? 0xff3344 : 0x4466ff;
    // Dim overlay: fill whole canvas semi-transparent, cut out zone circle
    this.zoneG.setFillStyle({ color: 0x000000, alpha: 0.35 });
    this.zoneG.rect(0, 0, MAP_W, MAP_H).fill();
    // Zone boundary ring
    this.zoneG.setStrokeStyle({ width: shrinking ? 3 : 2, color: zoneColor, alpha: 0.85 });
    this.zoneG.circle(cx, cy, radius).stroke();
  }

  private getOrCreatePlayerSprite(key: string, player: PlayerState): PlayerSprite {
    const existing = this.playerSprites.get(key);
    if (existing) return existing;

    const container = new Container();
    const spritePath = CHAR_SPRITE[player.characterId] ?? '/arena/zombie-stand-00.png';

    // Fallback graphics circle while async texture loads
    const fallback = new Graphics();
    fallback.setFillStyle({ color: player.isBot ? KORE.teal : KORE.lime });
    fallback.circle(0, 0, 12).fill();

    const hpBar = new Graphics();
    const nameTag = new Text({
      text: player.displayName.split('@')[0].slice(0, 12),
      style: { fontSize: 9, fill: 0xeceff3, fontFamily: 'monospace' },
    });
    nameTag.anchor.set(0.5, 1);
    nameTag.y = -18;

    container.addChild(fallback, hpBar, nameTag);
    this.dynamicLayer.addChild(container);

    const ps: PlayerSprite = { container, body: fallback, hpBar, nameTag };
    this.playerSprites.set(key, ps);

    // Load texture and swap body sprite
    const cached = this.textures.get(spritePath);
    if (cached) {
      this.swapSprite(ps, cached, fallback, container);
    } else {
      Assets.load(spritePath).then((t: Texture) => {
        this.textures.set(spritePath, t);
        this.swapSprite(ps, t, ps.body, container);
      }).catch(() => {/* keep fallback */});
    }

    return ps;
  }

  private swapSprite(ps: PlayerSprite, tex: Texture, old: Sprite | Graphics, container: Container) {
    const spr = new Sprite(tex);
    spr.anchor.set(0.5);
    spr.width = 32;
    spr.height = 32;
    container.removeChild(old);
    container.addChildAt(spr, 0);
    ps.body = spr;
  }

  private updatePlayerSprite(ps: PlayerSprite, player: PlayerState, isMe: boolean) {
    ps.container.x = player.x;
    ps.container.y = player.y;
    ps.container.rotation = player.facing;

    const hasCloakEnemy = !isMe && player.activePowerups.some(a => a.kind === 'cloak');
    ps.container.alpha = !player.alive ? 0.15 : hasCloakEnemy ? 0.12 : player.dodging ? 0.5 : 1;

    ps.hpBar.clear();
    for (let i = 0; i < 2; i++) {
      ps.hpBar.setFillStyle({ color: i < player.hp ? KORE.blood : 0x3a2e52 });
      ps.hpBar.rect(-8 + i * 10, -28, 8, 4).fill();
    }
    if (player.armor > 0) {
      ps.hpBar.setFillStyle({ color: KORE.teal });
      ps.hpBar.rect(-4, -34, 8, 3).fill();
    }
    if (isMe) {
      ps.hpBar.setStrokeStyle({ width: 1, color: KORE.lime, alpha: 0.6 });
      ps.hpBar.circle(0, 0, 16).stroke();
    }
  }

  private syncItems(state: MatchState) {
    const currentIds = new Set(state.items.map(i => i.id));
    for (const [id, g] of this.itemSprites) {
      if (!currentIds.has(id)) { this.dynamicLayer.removeChild(g); this.itemSprites.delete(id); }
    }
    for (const item of state.items) {
      if (!this.itemSprites.has(item.id)) {
        const g = new Graphics();
        g.setFillStyle({ color: ITEM_COLORS[item.kind] ?? 0xffffff }).circle(0, 0, 8).fill();
        g.setStrokeStyle({ width: 1, color: 0xffffff, alpha: 0.4 }).circle(0, 0, 8).stroke();
        g.x = item.x; g.y = item.y;
        this.dynamicLayer.addChild(g);
        this.itemSprites.set(item.id, g);
      }
    }
  }

  private syncPowerups(state: MatchState) {
    const currentIds = new Set(state.powerups.map(p => p.id));
    for (const [id, g] of this.powerupSprites) {
      if (!currentIds.has(id)) { this.dynamicLayer.removeChild(g); this.powerupSprites.delete(id); }
    }
    for (const pu of state.powerups) {
      if (!this.powerupSprites.has(pu.id)) {
        const g = new Graphics();
        const color = POWERUP_COLORS[pu.kind] ?? 0xffffff;
        g.setFillStyle({ color, alpha: 0.8 }).circle(0, 0, 12).fill();
        g.setStrokeStyle({ width: 2, color }).circle(0, 0, 12).stroke();
        g.x = pu.x; g.y = pu.y;
        this.dynamicLayer.addChild(g);
        this.powerupSprites.set(pu.id, g);
      }
    }
  }

  drawFrame(state: MatchState, myKey: string) {
    if (!this.ready) return;
    this.drawDoors(state);
    this.drawZone(state);
    this.syncItems(state);
    this.syncPowerups(state);

    const visibleKeys = new Set(Object.keys(state.players));
    for (const [key, ps] of this.playerSprites) {
      if (!visibleKeys.has(key)) { this.dynamicLayer.removeChild(ps.container); this.playerSprites.delete(key); }
    }
    for (const [key, player] of Object.entries(state.players)) {
      const ps = this.getOrCreatePlayerSprite(key, player);
      this.updatePlayerSprite(ps, player, key === myKey);
    }
  }

  startTicker(getState: () => MatchState | null, myKey: string) {
    this.initPromise.then(() => {
      if (this.destroyed) return;
      this.app.ticker.add(() => {
        const s = getState();
        if (s) this.drawFrame(s, myKey);
      });
    });
  }

  setFollowTarget(playerKey: string | null): void {
    this.followTarget = playerKey;
  }

  setTickerSpeed(speed: number): void {
    this.initPromise.then(() => {
      if (this.destroyed) return;
      this.app.ticker.speed = speed;
    });
  }

  destroy() {
    this.destroyed = true;
    this.initPromise.then(() => {
      try { this.app.destroy(false, { children: true }); } catch { /* not initialized */ }
    });
  }
}
