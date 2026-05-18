// brett/public/assets/combat/controller.mjs
import { WEAPONS, STARTER_LOADOUT } from './weapons.mjs';
import { validateDamageEvent, applyDamage } from './damage.mjs';
import * as Hud from './combat-hud.mjs';
import * as Fx from './fx.mjs';

export function startCombat({ scene, camera, players, self, ws, hudRoot }) {
  const state = {
    self, loadout: { ...STARTER_LOADOUT }, active: 'ranged',
    ammo: { handgun: 12, rifle: 0, fireball: 0 },
    lastShotAt: 0,
  };

  Hud.mountCombatHud(hudRoot);
  Hud.setHP(hudRoot, self.hp ?? 100);
  Hud.setSlot(hudRoot, 'melee', state.loadout.melee);
  Hud.setSlot(hudRoot, 'ranged', state.loadout.ranged);
  Hud.setActiveSlot(hudRoot, state.active);
  Hud.setAmmo(hudRoot, state.ammo[state.loadout.ranged], WEAPONS[state.loadout.ranged].mag);
  Hud.setVisible(hudRoot, true);

  window.addEventListener('keydown', e => {
    if (e.code === 'Digit1') { state.active = 'melee'; Hud.setActiveSlot(hudRoot, 'melee'); }
    if (e.code === 'Digit2') { state.active = 'ranged'; Hud.setActiveSlot(hudRoot, 'ranged'); }
    if (e.code === 'KeyQ')   { state.active = state.active === 'melee' ? 'ranged' : 'melee'; Hud.setActiveSlot(hudRoot, state.active); }
    if (e.code === 'KeyR')   reload(state, { hudRoot });
  });

  window.addEventListener('mousedown', () => fire(state, { scene, camera, players, ws, hudRoot }));

  ws.on('damage_event', msg => {
    const victim = players.find(p => p.id === msg.victim_id);
    if (!victim) return;
    applyDamage(victim, msg.damage);
    Fx.spawnBloodDecal(scene, new THREE.Vector3(...msg.position), new THREE.Vector3(0,1,0));
    if (victim.id === self.id) Hud.setHP(hudRoot, victim.hp);
    if (victim.hp <= 0) ws.send({ type: 'death_event', victim_id: victim.id, killer_id: msg.shooter_id });
  });

  ws.on('death_event', _msg => {
    // Score tracking comes in Phase 6
  });

  return state;
}

function fire(state, { scene, camera, players, ws, hudRoot }) {
  const weaponKey = state.loadout[state.active];
  const w = WEAPONS[weaponKey];
  const now = Date.now();
  if (now - state.lastShotAt < w.cooldownMs) return;
  if (w.type === 'ranged' && (state.ammo[weaponKey] ?? 0) <= 0) return;

  state.lastShotAt = now;

  if (w.type === 'ranged') {
    state.ammo[weaponKey]--;
    Hud.setAmmo(hudRoot, state.ammo[weaponKey], w.mag);
    const selfPos = state.self.mesh?.position ?? new THREE.Vector3();
    Fx.spawnMuzzleFlash(scene, selfPos, new THREE.Vector3(0,0,-1));
    const hit = raycastPlayers(camera, players, state.self);
    if (hit) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: hit.player.id,
        weapon: weaponKey, damage: w.dmg,
        position: [hit.point.x, hit.point.y, hit.point.z],
      };
      ws.send(ev);
      applyDamage(hit.player, w.dmg);
      Fx.spawnBloodDecal(scene, hit.point, hit.normal ?? new THREE.Vector3(0,1,0));
    }
  } else {
    const selfPos = state.self.mesh?.position ?? new THREE.Vector3();
    Fx.spawnSlashArc(scene, selfPos, new THREE.Vector3(0,0,-1));
    const targets = meleeSweep(state.self, players, w.range);
    for (const t of targets) {
      const ev = {
        type: 'damage_event', shooter_id: state.self.id, victim_id: t.id,
        weapon: weaponKey, damage: w.dmg,
        position: [t.x ?? 0, t.y ?? 0, t.z ?? 0],
      };
      ws.send(ev);
      applyDamage(t, w.dmg);
    }
  }
}

function reload(state, { hudRoot }) {
  const key = state.loadout.ranged;
  const w = WEAPONS[key];
  if (!w.mag) return;
  setTimeout(() => {
    state.ammo[key] = w.mag;
    Hud.setAmmo(hudRoot, w.mag, w.mag);
  }, w.reloadMs);
}

function raycastPlayers(camera, players, self) {
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera({ x: 0, y: 0 }, camera);
  for (const p of players) {
    if (p.id === self.id || (p.hp ?? 100) <= 0) continue;
    const mesh = p.mesh ?? p.root;
    if (!mesh) continue;
    const hit = raycaster.intersectObject(mesh, true)[0];
    if (hit) return { player: p, point: hit.point, normal: hit.face?.normal ?? new THREE.Vector3(0,1,0) };
  }
  return null;
}

function meleeSweep(self, players, range) {
  const sx = self.x ?? self.mesh?.position?.x ?? 0;
  const sz = self.z ?? self.mesh?.position?.z ?? 0;
  return players.filter(p =>
    p.id !== self.id && (p.hp ?? 100) > 0 &&
    Math.hypot((p.x ?? p.mesh?.position?.x ?? 0) - sx, (p.z ?? p.mesh?.position?.z ?? 0) - sz) <= range
  );
}
