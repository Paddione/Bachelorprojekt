'use strict';

const Mayhem = (() => {
  const STATE_RATE_HZ    = 15;
  const VEHICLE_COOLDOWN_MS = 5000;
  const MODES_CYCLE = ['warmup', 'deathmatch', 'lms', 'coop', 'duel'];

  const MAX_PLAYERS = 4;

  // Cardinal spawn slots — north/east/south/west at r=7, clear of obstacles
  const SPAWN_SLOTS = [
    { x:  0, z:  7 },
    { x:  7, z:  0 },
    { x:  0, z: -7 },
    { x: -7, z:  0 },
  ];
  let _spawnSlot = 0;
  function nextSpawnPoint() {
    const pt = SPAWN_SLOTS[_spawnSlot % SPAWN_SLOTS.length];
    _spawnSlot = (_spawnSlot + 1) % SPAWN_SLOTS.length;
    return { x: pt.x + (Math.random() - 0.5) * 1.2, z: pt.z + (Math.random() - 0.5) * 1.2 };
  }

  let scene, camera, canvas, makeMannequin, send = () => {}, room;
  let enabled = false;
  let localAvatar = null;
  const remoteAvatars = new Map();
  const aiBots = new Map();         // botId → MayhemAIBot (subset of remoteAvatars)
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
  let _lastWeaponKey = null;
  let isHost      = false;
  let deadHumans  = new Set();
  let coopStartTimer = null;

  let _crosshairMesh = null;   // THREE.Mesh — ring on ground
  let _aimPlane      = null;   // THREE.Plane — y=0 intersect target
  let _aimDir        = null;   // THREE.Vector3 — current aim direction
  let _aimPoint      = null;   // THREE.Vector3 — crosshair world position
  let _mouseNDC      = null;   // THREE.Vector2 — normalized device coords
  let _raycaster     = null;   // THREE.Raycaster

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
    let _b = window.MayhemKeybindings ? window.MayhemKeybindings.load() : null;
    function b() { return _b || {}; }

    const weaponIdx = { 'Digit1': 0, 'Digit2': 1, 'Digit3': 2, 'Digit4': 3, 'Digit5': 4 };

    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      const kb = b();
      const code = e.code;
      if (code === kb.forward)      { input.forward  = true; e.preventDefault(); }
      if (code === kb.backward)     { input.backward = true; e.preventDefault(); }
      if (code === kb.left)         { input.left     = true; e.preventDefault(); }
      if (code === kb.right)        { input.right    = true; e.preventDefault(); }
      if (code === kb.sprint || code === 'ShiftRight') { input.sprint = true; }
      if (code === kb.jump)         { input.jump     = true; e.preventDefault(); }
      if (code === kb.flail)        input.flail    = true;
      if (weaponIdx[code] !== undefined) weaponSystem?.select(weaponIdx[code]);
      if (code === kb.prevWeapon)   weaponSystem?.prev();
      if (code === kb.nextWeapon)   weaponSystem?.next();
      if (code === kb.reload)       gameMode?.onRespawnKey(playerId);
      if (code === kb.vehicle)      spawnVehicleLocal();
      if (code === kb.cycleMode)    cycleMode();
      if (code === kb.toggleMayhem) toggle();
    });
    window.addEventListener('keyup', (e) => {
      const kb = b();
      const code = e.code;
      if (code === kb.forward)  input.forward  = false;
      if (code === kb.backward) input.backward = false;
      if (code === kb.left)     input.left     = false;
      if (code === kb.right)    input.right    = false;
      if (code === kb.sprint || code === 'ShiftRight') input.sprint = false;
      if (code === kb.jump)     input.jump     = false;
      if (code === kb.flail)    input.flail    = false;
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

    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('touchmove', _onTouchMove, { passive: true });

    });
  }

  function _onMouseMove(e) {
    if (!_mouseNDC) return;
    _mouseNDC.x = (e.clientX / window.innerWidth)  * 2 - 1;
    _mouseNDC.y = -(e.clientY / window.innerHeight) * 2 + 1;
  }

  function _onTouchMove(e) {
    if (!_mouseNDC || !e.touches[0]) return;
    _mouseNDC.x = (e.touches[0].clientX / window.innerWidth)  * 2 - 1;
    _mouseNDC.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
  }

  // ── Enable / toggle ───────────────────────────────────────────────────────
  function setEnabled(on) {
    if (on === enabled) return;
    enabled = on;
    if (on) {
      start();
      window.dispatchEvent(new CustomEvent('brett:mayhem-enabled'));
    } else {
      stop();
    }
  }
  function toggle() {
    const next = !enabled;
    setEnabled(next);
    send({ type: 'mayhem_mode', enabled: next });
  }

  function cycleMode() {
    if (!enabled) return;
    const cur = gameMode ? MODES_CYCLE.indexOf(gameMode.mode) : 0;
    const next = MODES_CYCLE[(cur + 1) % MODES_CYCLE.length];
    send({ type: 'game_mode_change', mode: next });
  }

  // ── Start / Stop ─────────────────────────────────────────────────────────
  function start() {
    showBanner();
    const THREE = window.THREE;

    // Effects
    effectsMgr = new window.MayhemEffectsClass(scene);
    window.MayhemEffects = effectsMgr;

    // Weapon system
    weaponSystem = new window.MayhemWeapons.WeaponSystem(
      (weaponDef, originPos, dirVec, shooterId) => {
        projectileMgr.spawn(weaponDef, originPos, dirVec, shooterId);
      }
    );

    // Crosshair setup
    _aimPlane  = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    _aimDir    = new THREE.Vector3(0, 0, -1);
    _aimPoint  = new THREE.Vector3();
    _mouseNDC  = new THREE.Vector2();
    _raycaster = new THREE.Raycaster();

    const crosshairGeo = new THREE.RingGeometry(0.18, 0.25, 32);
    const crosshairMat = new THREE.MeshBasicMaterial({
      color: 0xd7b06a,   // --brass-game
      transparent: true, opacity: 0.85, side: THREE.DoubleSide,
    });
    _crosshairMesh = new THREE.Mesh(crosshairGeo, crosshairMat);
    _crosshairMesh.rotation.x = -Math.PI / 2;
    _crosshairMesh.position.y = 0.06;
    scene.add(_crosshairMesh);

    // Projectile manager
    projectileMgr = new window.MayhemProjectiles.ProjectileManager(
      scene,
      () => { const m = new Map(remoteAvatars); if (localAvatar) m.set(playerId, localAvatar); return m; },
      () => obstacles,
      (victimId, weaponKey, shooterId) => sendWeaponHit(victimId, weaponKey, shooterId),
    );

    // Determine if this client is the host (first to join — no remote humans yet)
    isHost = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-')).length === 0;

    // Game mode
    gameMode = new window.MayhemGameMode.GameModeManager({
      onRespawn: (pid) => {
        if (pid === playerId) localRespawn();
      },
      onModeChange: (mode) => {
        _rebuildObstacles(mode);
        updateHud();
      },
      onLmsEnd: (result) => showLmsResult(result),
    });

    _rebuildObstacles(gameMode.mode);

    // Co-op callbacks (only host drives wave progression)
    gameMode.setCoopCallbacks({
      onWaveStart: ({ wave, def }) => {
        deadHumans.clear();
        spawnWave(def);
        send({ type: 'wave_start', wave, enemyCount: def.count, boss: def.boss ?? false });
        updateHud();
      },
      onWaveComplete: ({ wave }) => {
        send({ type: 'wave_complete', wave });
        setTimeout(() => {
          for (const id of deadHumans) {
            if (id === playerId) localRespawn();
          }
          deadHumans.clear();
          updateHud();
        }, 3000);
      },
      onCoopWin:  () => { send({ type: 'coop_win' });  showCoopBanner('YOU WIN — all waves cleared!'); },
      onCoopLose: () => { send({ type: 'coop_lose' }); showCoopBanner('DEFEATED'); },
    });

    // HUD
    hud = buildHud();

    // Spawn local player — slot 0 (north)
    _spawnSlot = 0;
    _lastWeaponKey = null;
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    const spawnPos = nextSpawnPoint();
    const mannequin = makeMannequin(playerId, spawnPos);
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color });
    localAvatar.setWeapon(weaponSystem.current);
    _lastWeaponKey = weaponSystem.current?.key || null;
    chaseCam.attach(localAvatar.mannequin.root);
    send({ type: 'player_join', playerId, color });

  }

  // ── Co-op wave spawning ───────────────────────────────────────────────────
  function spawnWave(def) {
    // Remove existing bots
    for (const bot of aiBots.values()) { bot.remove(scene); remoteAvatars.delete(bot.id); }
    aiBots.clear();

    for (let i = 0; i < def.count; i++) {
      const botId = 'bot-' + crypto.randomUUID();
      const pos   = nextSpawnPoint();
      const botMannequin = makeMannequin(botId, pos);
      const bot = new window.MayhemAIBot({
        id: botId,
        mannequin: botMannequin,
        colorIndex: i,
        bossMultiplier: def.boss ? (def.multiplier || null) : null,
        callbacks: {
          onFire: (weaponDef, originPos, dirVec, shooterId) => {
            if (projectileMgr) projectileMgr.spawn(weaponDef, originPos, dirVec, shooterId);
          },
          onDeath: (id, killerId) => {
            aiBots.delete(id);
            remoteAvatars.delete(id);
            if (killerId && killerId !== id) gameMode?.handleKill(killerId);
            gameMode?.handleEnemyDeath(id);
            updateHud();
          },
          getGameMode: () => gameMode?.mode || 'warmup',
        },
      });
      if (bot.avatar && bot.weaponDef) bot.avatar.setWeapon(bot.weaponDef);
      aiBots.set(botId, bot);
      remoteAvatars.set(botId, bot.avatar);
      gameMode?.registerEnemy(botId);
    }
  }

  function _rebuildObstacles(mode) {
    if (obstacles.length) {
      window.MayhemObstacles.removeObstaclesFromScene(scene, obstacles);
      obstacles = [];
    }
    const THREE = window.THREE;
    if (mode === 'duel') {
      obstacles = window.MayhemObstacles.buildDuelArena(THREE);
    } else {
      obstacles = window.MayhemObstacles.buildObstacles(THREE, room || 'default');
    }
    window.MayhemObstacles.addObstaclesToScene(scene, obstacles);
    if (projectileMgr) projectileMgr.clear();
  }

  function stop() {
    hideBanner();
    destroyHud();
    deadHumans.clear();
    if (coopStartTimer) { clearTimeout(coopStartTimer); coopStartTimer = null; }
    isHost = false;
    if (localAvatar) {
      send({ type: 'player_leave', playerId });
      localAvatar.remove(scene);
      localAvatar = null;
    }
    for (const bot of aiBots.values()) { bot.remove(scene); remoteAvatars.delete(bot.id); }
    aiBots.clear();
    for (const a of remoteAvatars.values()) a.remove(scene);
    remoteAvatars.clear();
    for (const v of vehicles.values()) v.remove(scene);
    vehicles.clear();
    if (obstacles.length) {
      window.MayhemObstacles.removeObstaclesFromScene(scene, obstacles);
      obstacles = [];
    }
    if (projectileMgr) { projectileMgr.clear(); projectileMgr = null; }
    if (_crosshairMesh) { scene.remove(_crosshairMesh); _crosshairMesh = null; }
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('touchmove', _onTouchMove);
    window.MayhemEffects = null;
    effectsMgr = null;
    weaponSystem = null;
    gameMode = null;
    chaseCam.detach();
  }

  // ── Respawn ───────────────────────────────────────────────────────────────
  function localRespawn() {
    if (!localAvatar) return;
    const pos = nextSpawnPoint();
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
    // Co-op: no friendly fire between human players
    if (gameMode?.mode === 'coop') {
      const shooterIsHuman = shooterId && !shooterId.startsWith('bot-');
      const victimIsHuman  = victimId  && !victimId.startsWith('bot-');
      if (shooterIsHuman && victimIsHuman) return;
    }
    if (victimId === playerId && localAvatar) {
      processLocalHit(weaponKey, impulse, shooterId);
    } else {
      const bot = aiBots.get(victimId);
      if (bot) {
        bot.processHit(weaponKey, impulse, shooterId, weaponSystem);
        return;
      }
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
      if (shooterId && shooterId !== playerId) gameMode?.handleKill(shooterId);
      if (gameMode?.mode === 'coop') {
        deadHumans.add(playerId);
        const allHumanIds = [playerId, ...[...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'))];
        gameMode.handlePlayerDeathCoop(playerId, allHumanIds);
      } else {
        gameMode?.handleDeath(playerId, true);
      }
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

    // Update aim direction from mouse position
    if (_raycaster && _mouseNDC && localAvatar) {
      _raycaster.setFromCamera(_mouseNDC, camera);
      if (_raycaster.ray.intersectPlane(_aimPlane, _aimPoint)) {
        const lp = localAvatar.mannequin.root.position;
        _aimDir.set(_aimPoint.x - lp.x, 0, _aimPoint.z - lp.z).normalize();
        _crosshairMesh.position.set(_aimPoint.x, 0.06, _aimPoint.z);
      }
    }

    if (localAvatar) {
      localAvatar.setInput(input);
      localAvatar.update(dt, yaw);

      // Weapon fire
      if (input.fire && weaponSystem && !localAvatar.isDead) {
        const pos = localAvatar.mannequin.root.position;
        const dir = { x: _aimDir.x, y: 0.05, z: _aimDir.z };
        weaponSystem.tryFire({ x: pos.x, y: pos.y, z: pos.z }, dir, playerId);
      }
      weaponSystem?.tick();

      // Sync weapon model when selection changes
      const curWeaponKey = weaponSystem?.current?.key || null;
      if (curWeaponKey !== _lastWeaponKey) {
        _lastWeaponKey = curWeaponKey;
        if (weaponSystem?.current) localAvatar.setWeapon(weaponSystem.current);
      }
    }

    // Tick AI bots — they drive their own avatars (already in remoteAvatars)
    if (aiBots.size > 0) {
      const allCombatants = new Map(remoteAvatars);
      if (localAvatar) allCombatants.set(playerId, localAvatar);
      for (const bot of aiBots.values()) bot.tick(dt, allCombatants);
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
        if (msg.mode === 'coop' && isHost) {
          if (coopStartTimer) clearTimeout(coopStartTimer);
          coopStartTimer = setTimeout(() => gameMode?.startCoop(), 3000);
        }
        updateHud();
        break;

      case 'player_join':
        if (msg.playerId === playerId) return;
        if (remoteAvatars.has(msg.playerId)) return;
        { const m = makeMannequin(msg.playerId, { x: 0, z: 0 });
          remoteAvatars.set(msg.playerId,
            new window.MayhemPlayerAvatar({ id: msg.playerId, mannequin: m, local: false, color: msg.color || '#888' })); }
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

      case 'wave_start':
        // Non-host clients spawn their own copy of the wave bots
        if (!isHost && gameMode) {
          const def = window.MayhemGameMode.WAVE_DEFS[msg.wave - 1];
          if (def) {
            deadHumans.clear();
            spawnWave(def);
            updateHud();
          }
        }
        break;

      case 'coop_wave_sync':
        // Late-join sync: spawn bots for the current wave
        if (gameMode && msg.wave > 0) {
          const def = window.MayhemGameMode.WAVE_DEFS[msg.wave - 1];
          if (def) spawnWave(def);
          updateHud();
        }
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
    const soloKiBadge = room && room.startsWith('solo-')
      ? '<span id="mhud-solo-badge" style="background:rgba(124,58,237,0.25);color:#a78bfa;border:1px solid rgba(124,58,237,0.4);border-radius:4px;padding:1px 7px;font-size:10px;font-weight:700;">🤖 vs. KI</span>'
      : '';
    div.innerHTML = `
      <span id="mhud-mode" style="color:#aaa;text-transform:uppercase;font-size:11px"></span>
      ${soloKiBadge}
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
    updateCoopHud();
  }

  function updateCoopHud() {
    const hudEl = document.getElementById('coop-hud');
    if (!hudEl || !gameMode) return;
    const isCoop = gameMode.mode === 'coop';
    hudEl.style.display = isCoop ? 'flex' : 'none';
    if (!isCoop) return;
    const wave    = gameMode.getCoopWave();
    const enemies = gameMode._enemiesAlive.size;
    const def     = gameMode.getCoopWaveDef();
    const waveLabel = document.getElementById('coop-wave-label');
    const enemyCount = document.getElementById('coop-enemy-count');
    const progressBar = document.getElementById('coop-progress-bar');
    if (waveLabel)   waveLabel.textContent = `WELLE ${wave} / 10`;
    if (enemyCount)  enemyCount.innerHTML  = `Feinde: <strong>${enemies}</strong>`;
    if (progressBar) progressBar.style.width = `${(wave / 10) * 100}%`;
    const bossWrap = document.getElementById('boss-hp-wrap');
    const bossBar  = document.getElementById('boss-hp-bar');
    const isBossWave = def && def.boss;
    if (bossWrap) bossWrap.style.display = isBossWave ? 'block' : 'none';
    if (isBossWave && def && bossBar) {
      const maxHp = def.multiplier.hp;
      let currentHp = 0;
      for (const bot of aiBots.values()) {
        if (bot.isBoss) { currentHp = bot._hp; break; }
      }
      bossBar.style.width = `${Math.max(0, (currentHp / maxHp) * 100)}%`;
    }
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
  function showCoopBanner(text) {
    const div = document.createElement('div');
    div.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);' +
      'background:#1a1a2e;border:2px solid #c9aa71;color:#c9aa71;font-family:monospace;' +
      'font-size:32px;padding:24px 48px;z-index:9999;text-align:center;border-radius:8px;';
    div.textContent = text;
    document.body.appendChild(div);
    setTimeout(() => div.remove(), 5000);
  }

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

  return {
    init, toggle, setEnabled, onSnapshot, onMessage, tick,
    _internal: { remoteAvatars, vehicles, get localAvatar() { return localAvatar; } },
  };
})();

if (typeof window !== 'undefined') window.Mayhem = Mayhem;
