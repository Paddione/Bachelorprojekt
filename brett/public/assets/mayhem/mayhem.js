'use strict';

const Mayhem = (() => {
  const STATE_RATE_HZ = 15;
  const VEHICLE_COOLDOWN_MS = 5000;
  let scene, camera, canvas, makeMannequin, send, room;
  let enabled = false;
  let localAvatar = null;
  const remoteAvatars = new Map();
  const vehicles = new Map();
  let chaseCam = null;
  let banner = null;
  let lastStateSent = 0;
  let lastVehicleSpawn = 0;
  const input = { forward: false, backward: false, left: false, right: false,
                  sprint: false, jump: false, flail: false };
  let playerId = null;

  function init(opts) {
    ({ scene, camera, canvas, makeMannequin, sendMessage: send, roomToken: room } = opts);
    send = opts.sendMessage;
    playerId = crypto.randomUUID();
    bindKeys();
    chaseCam = new window.MayhemChaseCamera(camera, canvas);
  }

  function bindKeys() {
    const map = {
      'KeyW': 'forward', 'KeyS': 'backward', 'KeyA': 'left', 'KeyD': 'right',
      'ShiftLeft': 'sprint', 'ShiftRight': 'sprint',
      'Space': 'jump', 'KeyF': 'flail',
    };
    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      if (map[e.code]) { input[map[e.code]] = true; e.preventDefault(); }
      if (e.code === 'KeyV') spawnVehicleLocal();
      if (e.code === 'KeyM') toggle();
    });
    window.addEventListener('keyup', (e) => {
      if (map[e.code]) input[map[e.code]] = false;
    });
    canvas.addEventListener('mousedown', (e) => { if (enabled && e.button === 0) input.flail = true; });
    canvas.addEventListener('mouseup',   (e) => { if (e.button === 0) input.flail = false; });
  }

  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (on) start(); else stop();
  }

  function toggle() {
    send({ type: 'mayhem_mode', enabled: !enabled });
  }

  function start() {
    showBanner();
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const edge = randomEdgeSpawn();
    const mannequin = makeMannequin(playerId, edge);
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color });
    chaseCam.attach(localAvatar.mannequin.root);
    send({ type: 'player_join', playerId, color });
  }

  function stop() {
    hideBanner();
    if (localAvatar) {
      send({ type: 'player_leave', playerId });
      localAvatar.remove(scene);
      localAvatar = null;
    }
    for (const a of remoteAvatars.values()) a.remove(scene);
    remoteAvatars.clear();
    for (const v of vehicles.values()) v.remove(scene);
    vehicles.clear();
    chaseCam.detach();
  }

  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;top:8px;left:50%;transform:translateX(-50%);' +
      'background:rgba(0,0,0,0.7);color:#fff;padding:8px 16px;border-radius:8px;' +
      'font:14px sans-serif;z-index:1000;pointer-events:none;';
    banner.textContent = '🤸 Mayhem-Modus aktiv — WASD/Maus zum Steuern, F flailen, V Fahrzeug, M zum Beenden';
    document.body.appendChild(banner);
  }
  function hideBanner() {
    if (banner) { banner.remove(); banner = null; }
  }

  function randomEdgeSpawn() {
    const edge = Math.floor(Math.random() * 4);
    const r = 4;
    if (edge === 0) return { x: -r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 1) return { x:  r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 2) return { x: (Math.random() - 0.5) * 2 * r, z: -r };
    return { x: (Math.random() - 0.5) * 2 * r, z:  r };
  }

  function spawnVehicleLocal() {
    const now = performance.now();
    if (now - lastVehicleSpawn < VEHICLE_COOLDOWN_MS) return;
    if (!localAvatar) return;
    lastVehicleSpawn = now;
    const yaw = localAvatar.facingY;
    const dirX = Math.cos(yaw);
    const dirZ = -Math.sin(yaw);
    const fromX = localAvatar.mannequin.root.position.x - dirX * 6;
    const fromZ = localAvatar.mannequin.root.position.z - dirZ * 6;
    const id = crypto.randomUUID();
    send({ type: 'vehicle_spawn', vehicleId: id, kind: 'cart',
           fromX, fromZ, dirX, dirZ, speed: window.MayhemVehicle.SPEED, spawnedAt: Date.now() });
    spawnVehicleFromMsg({ vehicleId: id, fromX, fromZ, dirX, dirZ });
  }

  function spawnVehicleFromMsg(msg) {
    const v = new window.MayhemVehicle({
      id: msg.vehicleId, scene, fromX: msg.fromX, fromZ: msg.fromZ,
      dirX: msg.dirX, dirZ: msg.dirZ,
    });
    vehicles.set(msg.vehicleId, v);
  }

  function onSnapshot(snap) {
    setEnabled(!!snap.mayhem);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'mayhem_mode': setEnabled(!!msg.enabled); break;
      case 'player_join':
        if (msg.playerId === playerId) return;
        if (remoteAvatars.has(msg.playerId)) return;
        const m = makeMannequin(msg.playerId, { x: 0, z: 0 });
        remoteAvatars.set(msg.playerId,
          new window.MayhemPlayerAvatar({ id: msg.playerId, mannequin: m, local: false, color: msg.color || '#888' }));
        break;
      case 'player_state':
        if (msg.playerId === playerId) return;
        const a = remoteAvatars.get(msg.playerId);
        if (a) a.setNetState(msg);
        break;
      case 'player_leave':
        const al = remoteAvatars.get(msg.playerId);
        if (al) { al.remove(scene); remoteAvatars.delete(msg.playerId); }
        break;
      case 'hit':
        const victim = (msg.victimId === playerId) ? localAvatar : remoteAvatars.get(msg.victimId);
        if (victim) victim.applyHit(msg.impulse, msg.source);
        break;
      case 'vehicle_spawn':
        if (!vehicles.has(msg.vehicleId)) spawnVehicleFromMsg(msg);
        break;
    }
  }

  function tick(dt) {
    if (!enabled) return;
    const yaw = chaseCam ? chaseCam.getYaw() : 0;
    if (localAvatar) {
      localAvatar.setInput(input);
      localAvatar.update(dt, yaw);
    }
    for (const a of remoteAvatars.values()) a.update(dt, 0);
    for (const v of vehicles.values()) {
      v.update(dt);
      if (!v.alive) { v.remove(scene); vehicles.delete(v.id); }
    }
    chaseCam.update();
    detectCollisions();
    maybeSendState();
  }

  function detectCollisions() {
    if (!localAvatar) return;
    const physics = window.MayhemPhysics;
    if (localAvatar.flailing) {
      const wrists = localAvatar.getWristWorldPositions();
      for (const a of remoteAvatars.values()) {
        if (a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        const cap = a.getCapsule();
        for (const w of wrists) {
          const sphereAsCap = { x: w.x, y: w.y - 0.18, z: w.z, radius: w.radius, height: 0.36 };
          if (physics.capsuleCapsule(sphereAsCap, cap)) {
            if (localAvatar.canHit(a.id)) sendHit(a.id, 'flail', impulseToward(a, localAvatar, 4));
          }
        }
      }
    }
    for (const v of vehicles.values()) {
      const box = v.getAABB();
      const targets = [localAvatar, ...remoteAvatars.values()];
      for (const a of targets) {
        if (!a || a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        if (physics.aabbCapsule(box, a.getCapsule())) {
          if (localAvatar.canHit(a.id)) sendHit(a.id, 'vehicle', v.getImpulse());
        }
      }
    }
  }

  function impulseToward(target, source, mag) {
    const dx = target.mannequin.root.position.x - source.mannequin.root.position.x;
    const dz = target.mannequin.root.position.z - source.mannequin.root.position.z;
    const m = Math.hypot(dx, dz) || 1;
    return { x: (dx / m) * mag, z: (dz / m) * mag };
  }

  function sendHit(victimId, source, impulse) {
    const msg = { type: 'hit', victimId, source, impulse, durationMs: 3000 };
    send(msg);
    const v = (victimId === playerId) ? localAvatar : remoteAvatars.get(victimId);
    if (v) v.applyHit(impulse, source);
  }

  function maybeSendState() {
    if (!localAvatar) return;
    const now = performance.now();
    if (now - lastStateSent < 1000 / STATE_RATE_HZ) return;
    lastStateSent = now;
    send({ type: 'player_state', playerId, ...localAvatar.getStatePayload() });
  }

  return { init, onSnapshot, onMessage, toggle, tick, setEnabled,
           _internal: { remoteAvatars, vehicles, get localAvatar() { return localAvatar; } } };
})();

if (typeof window !== 'undefined') window.Mayhem = Mayhem;
