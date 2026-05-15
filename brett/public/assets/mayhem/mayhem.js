'use strict';

const Mayhem = (() => {
  const STATE_RATE_HZ    = 15;
  const VEHICLE_COOLDOWN_MS = 5000;
  const MODES_CYCLE = ['warmup', 'deathmatch', 'lms'];

  let scene, camera, canvas, makeMannequin, send, room;
  let enabled = false;
  let localAvatar = null;
  const remoteAvatars = new Map();
  const vehicles = new Map();
  let chaseCam    = null;
  let banner      = null;
  let lastStateSent   = 0;
  let lastVehicleSpawn = 0;
  let obstacles   = [];
  let projectileMgr = null;
  let gameMode    = null;
  let weaponSystem  = null;
  let effectsMgr  = null;
  let hud         = null;
  let playerId    = null;

  const input = {
    forward: false, backward: false, left: false, right: false,
    sprint: false, jump: false, flail: false, fire: false,
  };

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(opts) {
    ({ scene, camera, canvas, makeMannequin, roomToken: room } = opts);
    send = opts.sendMessage;
    playerId = crypto.randomUUID();
    window._mayhemCamera = camera;
    bindKeys();
    chaseCam = new window.MayhemChaseCamera(camera, canvas);
  }

  // ── Key / mouse bindings ──────────────────────────────────────────────────
  function bindKeys() {
    const movMap = {
      'KeyW': 'forward', 'KeyS': 'backward', 'KeyA': 'left', 'KeyD': 'right',
      'ShiftLeft': 'sprint', 'ShiftRight': 'sprint', 'Space': 'jump', 'KeyF': 'flail',
    };
    const weaponIdx = { 'Digit1': 0, 'Digit2': 1, 'Digit3': 2, 'Digit4': 3, 'Digit5': 4 };

    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      if (movMap[e.code]) { input[movMap[e.code]] = true; e.preventDefault(); }
      if (weaponIdx[e.code] !== undefined) weaponSystem?.select(weaponIdx[e.code]);
      if (e.code === 'KeyQ') weaponSystem?.prev();
      if (e.code === 'KeyE') weaponSystem?.next();
      if (e.code === 'KeyR') gameMode?.onRespawnKey(playerId);
      if (e.code === 'KeyV') spawnVehicleLocal();
      if (e.code === 'KeyG') cycleMode();
      if (e.code === 'KeyM') toggle();
    });
    window.addEventListener('keyup', (e) => {
      if (movMap[e.code]) input[movMap[e.code]] = false;
      if (e.code === 'MouseLeft') input.fire = false;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!enabled) return;
      if (e.button === 0) { input.fire = true; e.preventDefault(); }
    });
    canvas.addEventListener('mouseup', (e) => {
      if (e.button === 0) input.fire = false;
    });
    canvas.addEventListener('wheel', (e) => {
      if (!enabled) return;
      if (e.deltaY < 0) weaponSystem?.prev(); else weaponSystem?.next();
    }, { passive: true });
  }

  // ── Enable / toggle ───────────────────────────────────────────────────────
  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (on) start(); else stop();
  }
  function toggle() { send({ type: 'mayhem_mode', enabled: !enabled }); }

  function cycleMode() {
    if (!enabled) return;
    const cur = gameMode ? MODES_CYCLE.indexOf(gameMode.mode) : 0;
    const next = MODES_CYCLE[(cur + 1) % MODES_CYCLE.length];
    send({ type: 'game_mode_change', mode: next });
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    showBanner();

    // Effects
    effectsMgr = new window.MayhemEffectsClass(scene);
    window.MayhemEffects = effectsMgr;

    // Obstacles
    obstacles = window.MayhemObstacles.buildObstacles(window.THREE, room || 'default');
    window.MayhemObstacles.addObstaclesToScene(scene, obstacles);

    // Weapon system
    weaponSystem = new window.MayhemWeapons.WeaponSystem(
      (weaponDef, originPos, dirVec, shooterId) => {
        projectileMgr.spawn(weaponDef, originPos, dirVec, shooterId);
      }
    );

    // Projectile manager
    projectileMgr = new window.MayhemProjectiles.ProjectileManager(
      scene,
      () => { const m = new Map(remoteAvatars); if (localAvatar) m.set(playerId, localAvatar); return m; },
      () => obstacles,
      (victimId, weaponKey, shooterId) => sendWeaponHit(victimId, weaponKey, shooterId),
    );

    // Game mode
    gameMode = new window.MayhemGameMode.GameModeManager({
      onRespawn: (pid) => {
        if (pid === playerId) localRespawn();
      },
      onModeChange: (mode) => updateHud(),
      onLmsEnd: (result) => showLmsResult(result),
    });

    // HUD
    hud = buildHud();

    // Spawn local player
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const edge = randomEdgeSpawn();
    const mannequin = makeMannequin(playerId, edge);
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color });
    chaseCam.attach(localAvatar.mannequin.root);
    send({ type: 'player_join', playerId, color });
  }

  function stop() {
    hideBanner();
    destroyHud();
    if (localAvatar) {
      send({ type: 'player_leave', playerId });
      localAvatar.remove(scene);
      localAvatar = null;
    }
    for (const a of remoteAvatars.values()) a.remove(scene);
    remoteAvatars.clear();
    for (const v of vehicles.values()) v.remove(scene);
    vehicles.clear();
    if (obstacles.length) {
      window.MayhemObstacles.removeObstaclesFromScene(scene, obstacles);
      obstacles = [];
    }
    if (projectileMgr) { projectileMgr.clear(); projectileMgr = null; }
    window.MayhemEffects = null;
    effectsMgr = null;
    weaponSystem = null;
    gameMode = null;
    chaseCam.detach();
  }

  // ── Respawn ───────────────────────────────────────────────────────────────
  function localRespawn() {
    if (!localAvatar) return;
    const pos = randomEdgeSpawn();
    localAvatar.mannequin.root.position.set(pos.x, 0, pos.z);
    localAvatar.resetHp();
    localAvatar.state = window.MayhemPlayerAvatar.STATE.IDLE;
    send({ type: 'player_respawn', playerId, x: pos.x, z: pos.z });
    updateHud();
  }

  // ── Weapon hit (emitted by projectile manager when collision occurs) ──────
  function sendWeaponHit(victimId, weaponKey, shooterId) {
    const dir = { x: 0, y: 0, z: 1 }; // generic impulse — real dir not critical here
    const impulse = { x: (Math.random() - 0.5) * 3, z: (Math.random() - 0.5) * 3 };
    send({ type: 'hit', victimId, weaponKey, shooterId: shooterId || playerId, impulse, source: 'weapon' });
    applyHitLocally(victimId, weaponKey, impulse, shooterId || playerId);
  }

  function sendFlailHit(victimId, impulse) {
    send({ type: 'hit', victimId, weaponKey: 'fist', shooterId: playerId, impulse, source: 'flail' });
    applyHitLocally(victimId, 'fist', impulse, playerId);
  }

  function sendVehicleHit(victimId, impulse) {
    send({ type: 'hit', victimId, weaponKey: 'vehicle', shooterId: playerId, impulse, source: 'vehicle' });
    applyHitLocally(victimId, 'vehicle', impulse, playerId);
  }

  function applyHitLocally(victimId, weaponKey, impulse, shooterId) {
    if (victimId === playerId && localAvatar) {
      processLocalHit(weaponKey, impulse, shooterId);
    } else {
      const a = remoteAvatars.get(victimId);
      if (a) a.applyHit(impulse, weaponKey || 'flail');
    }
  }

  // Victim-authoritative: only the victim applies damage and broadcasts hp_update.
  function processLocalHit(weaponKey, impulse, shooterId) {
    if (!localAvatar || localAvatar.isDead) return;
    const weaponDef = weaponSystem ? weaponSystem.getWeaponDef(weaponKey) : null;
    const damage = weaponDef ? weaponDef.damage
                 : weaponKey === 'vehicle' ? 30 : 15;
    localAvatar.applyDamage(damage);
    localAvatar.applyHit(impulse, weaponKey || 'flail');
    if (effectsMgr) effectsMgr.spawnDamageNumber(localAvatar.mannequin.root.position, damage);

    if (weaponDef?.burnDamagePerSec) {
      localAvatar.startBurn(weaponDef.burnDamagePerSec, weaponDef.burnDurationSec, (hp) => {
        send({ type: 'hp_update', playerId, hp });
        updateHud();
      });
    }

    send({ type: 'hp_update', playerId, hp: localAvatar.hp });

    if (localAvatar.isDead) {
      send({ type: 'player_death', playerId, killerId: shooterId });
      gameMode?.handleDeath(playerId, true);
      if (shooterId && shooterId !== playerId) gameMode?.handleKill(shooterId);
    }
    updateHud();
  }

  // ── Collision detection ───────────────────────────────────────────────────
  function detectCollisions() {
    if (!localAvatar) return;
    const physics = window.MayhemPhysics;
    // Flail punch
    if (localAvatar.flailing) {
      const wrists = localAvatar.getWristWorldPositions();
      for (const a of remoteAvatars.values()) {
        if (a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        const cap = a.getCapsule();
        for (const w of wrists) {
          const sphere = { x: w.x, y: w.y - 0.18, z: w.z, radius: w.radius, height: 0.36 };
          if (physics.capsuleCapsule(sphere, cap)) {
            if (localAvatar.canHit(a.id)) sendFlailHit(a.id, impulseToward(a, localAvatar, 4));
          }
        }
      }
    }
    // Vehicles
    for (const v of vehicles.values()) {
      const box = v.getAABB();
      const targets = [localAvatar, ...remoteAvatars.values()];
      for (const a of targets) {
        if (!a || a.state === window.MayhemPlayerAvatar.STATE.RAGDOLL) continue;
        if (physics.aabbCapsule(box, a.getCapsule())) {
          if (localAvatar.canHit(a.id)) sendVehicleHit(a.id, v.getImpulse());
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

  // ── Per-frame tick ────────────────────────────────────────────────────────
  function tick(dt) {
    if (!enabled) return;
    const yaw = chaseCam ? chaseCam.getYaw() : 0;

    if (localAvatar) {
      localAvatar.setInput(input);
      localAvatar.update(dt, yaw);

      // Weapon fire
      if (input.fire && weaponSystem && !localAvatar.isDead) {
        const pos = localAvatar.mannequin.root.position;
        const fy  = localAvatar.facingY;
        const dir = { x: Math.sin(fy), y: 0.05, z: Math.cos(fy) };
        weaponSystem.tryFire({ x: pos.x, y: pos.y, z: pos.z }, dir, playerId);
      }
      weaponSystem?.tick();
    }

    for (const a of remoteAvatars.values()) a.update(dt, 0);
    for (const v of vehicles.values()) {
      v.update(dt);
      if (!v.alive) { v.remove(scene); vehicles.delete(v.id); }
    }
    projectileMgr?.update(dt);
    effectsMgr?.update(dt);
    chaseCam.update();
    detectCollisions();
    maybeSendState();
    if (hud) updateHudFrame();
  }

  // ── State broadcast ───────────────────────────────────────────────────────
  function maybeSendState() {
    if (!localAvatar) return;
    const now = performance.now();
    if (now - lastStateSent < 1000 / STATE_RATE_HZ) return;
    lastStateSent = now;
    send({ type: 'player_state', playerId, ...localAvatar.getStatePayload() });
  }

  // ── Vehicle ───────────────────────────────────────────────────────────────
  function spawnVehicleLocal() {
    const now = performance.now();
    if (now - lastVehicleSpawn < VEHICLE_COOLDOWN_MS) return;
    if (!localAvatar) return;
    lastVehicleSpawn = now;
    const yaw = localAvatar.facingY;
    const dirX = Math.cos(yaw), dirZ = -Math.sin(yaw);
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

  // ── Network message handling ──────────────────────────────────────────────
  function onSnapshot(snap) {
    setEnabled(!!snap.mayhem);
    if (snap.gameMode && gameMode) gameMode.setMode(snap.gameMode);
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'mayhem_mode':
        setEnabled(!!msg.enabled);
        break;

      case 'game_mode_change':
        if (gameMode && msg.mode) gameMode.setMode(msg.mode);
        updateHud();
        break;

      case 'player_join':
        if (msg.playerId === playerId) return;
        if (remoteAvatars.has(msg.playerId)) return;
        const m = makeMannequin(msg.playerId, { x: 0, z: 0 });
        remoteAvatars.set(msg.playerId,
          new window.MayhemPlayerAvatar({ id: msg.playerId, mannequin: m, local: false, color: msg.color || '#888' }));
        break;

      case 'player_state':
        if (msg.playerId === playerId) return;
        { const a = remoteAvatars.get(msg.playerId); if (a) a.setNetState(msg); }
        break;

      case 'player_leave':
        { const al = remoteAvatars.get(msg.playerId); if (al) { al.remove(scene); remoteAvatars.delete(msg.playerId); } }
        break;

      case 'hit':
        // Apply visual ragdoll for non-victim remote players
        if (msg.victimId !== playerId) {
          const av = remoteAvatars.get(msg.victimId);
          if (av) av.applyHit(msg.impulse, msg.weaponKey || msg.source || 'flail');
        } else {
          // We are the victim — apply damage and broadcast hp_update
          processLocalHit(msg.weaponKey || msg.source, msg.impulse, msg.shooterId);
        }
        break;

      case 'hp_update':
        if (msg.playerId === playerId) {
          if (localAvatar) localAvatar.hp = msg.hp;
        } else {
          const av = remoteAvatars.get(msg.playerId);
          if (av) av.hp = msg.hp;
        }
        updateHud();
        break;

      case 'player_death':
        gameMode?.handleDeath(msg.playerId, msg.playerId === playerId);
        if (msg.killerId) gameMode?.handleKill(msg.killerId);
        updateHud();
        break;

      case 'player_respawn':
        if (msg.playerId !== playerId) {
          const av = remoteAvatars.get(msg.playerId);
          if (av) {
            av.mannequin.root.position.set(msg.x, 0, msg.z);
            av.resetHp();
          }
        }
        break;

      case 'lms_winner':
        gameMode?.handleLmsResult({ winner: msg.playerId, draw: false });
        break;

      case 'lms_draw':
        gameMode?.handleLmsResult({ winner: null, draw: true });
        break;

      case 'vehicle_spawn':
        if (!vehicles.has(msg.vehicleId)) spawnVehicleFromMsg(msg);
        break;
    }
  }

  // ── HUD ───────────────────────────────────────────────────────────────────
  function buildHud() {
    const div = document.createElement('div');
    div.id = 'mayhem-hud';
    div.style.cssText = [
      'position:fixed', 'bottom:16px', 'left:50%', 'transform:translateX(-50%)',
      'display:flex', 'align-items:center', 'gap:12px',
      'background:rgba(0,0,0,0.65)', 'color:#fff', 'padding:8px 16px',
      'border-radius:10px', 'font:13px sans-serif', 'z-index:1001',
      'pointer-events:none', 'user-select:none',
    ].join(';');
    div.innerHTML = `
      <span id="mhud-mode" style="color:#aaa;text-transform:uppercase;font-size:11px"></span>
      <div style="width:120px;height:12px;background:#333;border-radius:6px;overflow:hidden">
        <div id="mhud-hp-fill" style="height:100%;width:100%;background:#4c4;transition:width 0.15s,background 0.3s"></div>
      </div>
      <span id="mhud-hp-text" style="min-width:32px;text-align:right">100</span>
      <span style="color:#888">│</span>
      <span id="mhud-weapon" style="color:#fc8">Handgun</span>
      <span id="mhud-kills" style="color:#fa0;display:none"></span>
      <span id="mhud-respawn" style="color:#ff4;display:none">Press R to respawn</span>
    `;
    document.body.appendChild(div);
    return div;
  }

  function destroyHud() {
    if (hud) { hud.remove(); hud = null; }
  }

  function updateHud() {
    if (!hud) return;
    updateHudFrame();
  }

  function updateHudFrame() {
    if (!hud || !localAvatar) return;
    const hp = Math.max(0, localAvatar.hp);
    const hpFill = document.getElementById('mhud-hp-fill');
    const hpText = document.getElementById('mhud-hp-text');
    const modeEl = document.getElementById('mhud-mode');
    const weaponEl = document.getElementById('mhud-weapon');
    const killsEl = document.getElementById('mhud-kills');
    const respawnEl = document.getElementById('mhud-respawn');
    if (!hpFill) return;

    hpFill.style.width = hp + '%';
    hpFill.style.background = hp > 60 ? '#4c4' : hp > 30 ? '#fa0' : '#f44';
    hpText.textContent = String(Math.round(hp));

    const mode = gameMode?.mode || 'warmup';
    modeEl.textContent = mode.toUpperCase();

    if (weaponSystem) {
      weaponEl.textContent = weaponSystem.current?.label || '';
    }

    if (mode === 'deathmatch') {
      killsEl.style.display = '';
      killsEl.textContent = '⚔ ' + (gameMode?.getKills(playerId) || 0);
    } else {
      killsEl.style.display = 'none';
    }

    const dead = localAvatar.isDead;
    if (dead && mode === 'warmup') {
      respawnEl.style.display = '';
    } else {
      respawnEl.style.display = 'none';
    }
  }

  // ── LMS result overlay ────────────────────────────────────────────────────
  function showLmsResult(result) {
    const el = document.createElement('div');
    el.style.cssText = [
      'position:fixed', 'top:30%', 'left:50%', 'transform:translate(-50%,-50%)',
      'background:rgba(0,0,0,0.85)', 'color:#fff', 'padding:24px 40px',
      'border-radius:14px', 'font:bold 28px sans-serif', 'z-index:2000',
      'text-align:center',
    ].join(';');
    if (result.draw) {
      el.textContent = '🤝 Unentschieden!';
    } else if (result.winner === playerId) {
      el.textContent = '🏆 Du gewinnst!';
    } else {
      el.textContent = '💀 Du hast verloren!';
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 5000);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  function showBanner() {
    if (banner) return;
    banner = document.createElement('div');
    banner.style.cssText = [
      'position:fixed', 'top:8px', 'left:50%', 'transform:translateX(-50%)',
      'background:rgba(0,0,0,0.7)', 'color:#fff', 'padding:8px 16px',
      'border-radius:8px', 'font:13px sans-serif', 'z-index:1000',
      'pointer-events:none',
    ].join(';');
    banner.textContent = '🤸 Mayhem — WASD bewegen · Klicken feuern · F flailen · ' +
                         '1-5/QE Waffe wechseln · V Fahrzeug · G Modus · R Respawn · M beenden';
    document.body.appendChild(banner);
  }
  function hideBanner() { if (banner) { banner.remove(); banner = null; } }

  function randomEdgeSpawn() {
    const edge = Math.floor(Math.random() * 4), r = 4;
    if (edge === 0) return { x: -r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 1) return { x:  r, z: (Math.random() - 0.5) * 2 * r };
    if (edge === 2) return { x: (Math.random() - 0.5) * 2 * r, z: -r };
    return { x: (Math.random() - 0.5) * 2 * r, z:  r };
  }

  return {
    init, toggle, setEnabled, onSnapshot, onMessage, tick,
    _internal: { remoteAvatars, vehicles, get localAvatar() { return localAvatar; } },
  };
})();

if (typeof window !== 'undefined') window.Mayhem = Mayhem;
