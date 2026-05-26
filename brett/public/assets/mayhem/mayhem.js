'use strict';

// crypto.randomUUID is only available in secure contexts (HTTPS/localhost).
// Fall back to a getRandomValues-based v4 UUID for plain-HTTP dev.
const randomUUID = typeof crypto.randomUUID === 'function'
  ? () => crypto.randomUUID()
  : () => ([1e7]+-1e3+-4e3+-8e3+-1e11).replace(/[018]/g, c =>
      (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));

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
  let _initDone = false;
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

  let _isSpectator  = false;
  let _pvAiMode     = false;
  let _heroSelectUi = null;   // { el, lockCard, setStatus, showPlayButton, destroy }
  let _myHeroId     = null;
  let _opponentHeroId = null;
  let _lastFireMs     = 0;
  let _duelRoundPause = false;
  let _duelHpFillA  = null;   // HP bar DOM element for duel playerA
  let _duelHpFillB  = null;   // HP bar DOM element for duel playerB
  let _pendingGameMode = null; // snapshot gameMode received before init(); applied in start()

  let _specTarget = null;
  let _specMode   = 'follow';
  let _specFlyVel = { x: 0, y: 0, z: 0 };
  const _specKeys = {};
  const _specialCooldowns = {};

  const input = {
    forward: false, backward: false, left: false, right: false,
    sprint: false, jump: false, flail: false, fire: false,
  };

  function _canUseSpecial(key, cooldownMs) {
    const now  = Date.now();
    const last = _specialCooldowns[key] || 0;
    if (now - last < cooldownMs) return false;
    _specialCooldowns[key] = now;
    return true;
  }

  // ── Init ──────────────────────────────────────────────────────────────────
  function init(opts) {
    ({ scene, camera, canvas, makeMannequin, roomToken: room } = opts);
    send = opts.sendMessage;
    playerId = randomUUID();
    window._mayhemCamera = camera;
    window._mayhemMakeMannequin = makeMannequin;
    bindKeys();
    chaseCam = new window.MayhemChaseCamera(camera, canvas);
    _initDone = true;
    if (enabled) {
      start();
      window.dispatchEvent(new CustomEvent('brett:mayhem-enabled'));
    }
  }

  // ── Key / mouse bindings ──────────────────────────────────────────────────
  function bindKeys() {
    let _b = window.MayhemKeybindings ? window.MayhemKeybindings.load() : null;
    function b() { return _b || {}; }

    const weaponIdx = { 'Digit1': 0, 'Digit2': 1, 'Digit3': 2, 'Digit4': 3, 'Digit5': 4 };

    window.addEventListener('keydown', (e) => {
      if (!enabled) return;
      _specKeys[e.code] = true;
      if (_isSpectator) {
        if (e.code === 'Tab') {
          e.preventDefault();
          _cycleSpecTarget();
        }
        if (e.code === 'KeyF') {
          _specMode = _specMode === 'fly' ? 'follow' : 'fly';
          if (_specMode === 'fly' && document.pointerLockElement === null) {
            canvas.requestPointerLock().catch(() => {});
          } else if (_specMode === 'follow') {
            document.exitPointerLock();
            if (_isFirstPersonActive() && canvas) {
              requestAnimationFrame(() => canvas.requestPointerLock());
            }
          }
        }
      }
      const kb = b();
      const code = e.code;
      if (code === kb.forward)      { input.forward  = true; e.preventDefault(); }
      if (code === kb.backward)     { input.backward = true; e.preventDefault(); }
      if (code === kb.left)         { input.left     = true; e.preventDefault(); }
      if (code === kb.right)        { input.right    = true; e.preventDefault(); }
      if (code === kb.sprint || code === 'ShiftRight') { input.sprint = true; }
      if (code === kb.jump)         { input.jump     = true; e.preventDefault(); }
      if (code === kb.flail)        input.flail    = true;
      if (weaponIdx[code] !== undefined && weaponIdx[code] < (weaponSystem?.getAllWeapons().length || 5)) {
        weaponSystem?.select(weaponIdx[code]);
      }
      if (e.code === 'Digit4' && _myHeroId === 'patrick') {
        if (_canUseSpecial('stealth', 8000)) {
          localAvatar.mannequin.root.traverse(o => {
            if (o.isMesh && o.material) { o.material.transparent = true; o.material.opacity = 0.15; }
          });
          send({ type: 'hero_stealth', playerId, active: true });
          window.MayhemAudio.onFire('hero-stealth');
          setTimeout(() => {
            localAvatar.mannequin.root.traverse(o => {
              if (o.isMesh && o.material) { o.material.opacity = 1.0; }
            });
            send({ type: 'hero_stealth', playerId, active: false });
          }, 2000);
        }
      }
      if (e.code === 'Digit5' && _myHeroId === 'patrick') {
        if (_canUseSpecial('teleport', 6000) && _aimPoint) {
          const lp = localAvatar.mannequin.root.position;
          const dx = _aimPoint.x - lp.x, dz = _aimPoint.z - lp.z;
          const dist = Math.hypot(dx, dz);
          const maxRange = 5;
          const scale = dist > maxRange ? maxRange / dist : 1;
          const tx = lp.x + dx * scale;
          const tz = lp.z + dz * scale;
          effectsMgr?.spawnSmokePuff(scene, { x: lp.x, y: 0.5, z: lp.z });
          localAvatar.mannequin.root.position.set(tx, lp.y, tz);
          effectsMgr?.spawnSmokePuff(scene, { x: tx, y: 0.5, z: tz });
          send({ type: 'hero_teleport', playerId, x: tx, z: tz });
          window.MayhemAudio.onFire('hero-teleport');
        }
      }
      if (code === kb.prevWeapon)   weaponSystem?.prev();
      if (code === kb.nextWeapon)   weaponSystem?.next();
      if (code === kb.reload)       gameMode?.onRespawnKey(playerId);
      if (code === kb.vehicle)      spawnVehicleLocal();
      if (code === kb.cycleMode)    cycleMode();
      if (code === kb.toggleMayhem) toggle();
    });
    window.addEventListener('keyup', (e) => {
      _specKeys[e.code] = false;
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
    if (!_initDone) return; // init() will call start()/stop() once it runs
    if (on) {
      start();
      window.dispatchEvent(new CustomEvent('brett:mayhem-enabled'));
    } else {
      stop();
      window.dispatchEvent(new CustomEvent('brett:mayhem-disabled'));
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
        _lastFireMs = performance.now();
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
        _onModeChange(mode);
        updateHud();
      },
      onLmsEnd: (result) => showLmsResult(result),
      onDuelEnd: (result) => _onDuelEnd(result),
    });

    // Apply game mode from snapshot (arrived before init()), or default warmup obstacles
    if (_pendingGameMode) {
      gameMode.setMode(_pendingGameMode); // triggers _rebuildObstacles + _showHeroSelectModal via callback
      _pendingGameMode = null;
    } else {
      _rebuildObstacles(gameMode.mode);
    }

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
    const skinId = (() => {
      try { return window.localStorage.getItem('brett.skinId') || 'default'; }
      catch { return 'default'; }
    })();
    localAvatar = new window.MayhemPlayerAvatar({ id: playerId, mannequin, local: true, color, skinId });
    localAvatar.setWeapon(weaponSystem.current);
    _lastWeaponKey = weaponSystem.current?.key || null;
    chaseCam.attach(localAvatar.mannequin.root);
    send({ type: 'player_join', playerId, color });

    if (gameMode && gameMode.mode === 'duel') {
      const fighters = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'));
      if (fighters.length >= 2) {
        _isSpectator = true;
        _enterSpectatorMode();
      }
    }
  }

  // ── Co-op wave spawning ───────────────────────────────────────────────────
  function spawnWave(def) {
    // Remove existing bots
    for (const bot of aiBots.values()) { bot.remove(scene); remoteAvatars.delete(bot.id); }
    aiBots.clear();

    for (let i = 0; i < def.count; i++) {
      const botId = 'bot-' + randomUUID();
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
            if (killerId === playerId) {
              window.MayhemAudio?.onKill();
            }
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

  function _onModeChange(mode) {
    if (mode === 'duel') {
      _showHeroSelectModal();
    } else {
      if (_heroSelectUi) { _closeOverlay(_heroSelectUi); _heroSelectUi = null; }
    }
  }

  function _showHeroSelectModal() {
    document.body.setAttribute('data-overlay', '');
    if (_heroSelectUi) _closeOverlay(_heroSelectUi);
    const pvAiAvailable = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-')).length === 0;
    _heroSelectUi = window.MayhemHeroSelect.buildHeroSelectModal({
      heroes:     window.MayhemHeroes.HEROES,
      heroOrder:  window.MayhemHeroes.HERO_ORDER,
      isSpectator: _isSpectator,
      pvAiAvailable,
      onSelect(heroId) {
        _myHeroId = heroId;
        if (window._minionManager) {
          window._minionManager.clear();
          window._minionManager = null;
        }
        if (window._remoteMinionMeshes) {
          for (const m of window._remoteMinionMeshes.values()) {
            scene.remove(m);
          }
          window._remoteMinionMeshes.clear();
        }
        if (window._autoTurret) {
          window._autoTurret.disable();
          window._autoTurret = null;
        }
        window._pvAiBot = null;
        window.MayhemHeroes.assignHero(localAvatar, heroId,
          window.MayhemWeapons.WeaponSystem, (w, origin, dir, id) => {
            if (w.projectileType === 'frostnova') {
              effectsMgr?.spawnFrostnovaEffect(scene, localAvatar.mannequin.root.position);
              window.MayhemAudio.onFire('frostnova');
              for (const [remoteId, remoteAv] of remoteAvatars) {
                const rp = remoteAv.mannequin.root.position;
                const lp = localAvatar.mannequin.root.position;
                const dist = Math.hypot(rp.x - lp.x, rp.z - lp.z);
                if (dist <= w.aoeRadius) {
                  const impulse = { x: 0, y: 0, z: 0 };
                  const dx = rp.x - lp.x, dz = rp.z - lp.z;
                  const len = Math.hypot(dx, dz) || 1;
                  impulse.x = (dx / len) * 3;
                  impulse.z = (dz / len) * 3;
                  send({ type: 'hit', victimId: remoteId, weaponKey: 'frostnova', shooterId: playerId, impulse });
                }
              }
              send({ type: 'hero_slow', slowFactor: w.slowFactor, durationMs: w.slowDurationMs });
              return;
            }
            if (w.projectileType === 'summon') {
              const mm = window._minionManager;
              if (mm && mm.count < 2) {
                const enemy = [...remoteAvatars.values()][0];
                mm.spawn(localAvatar.mannequin.root.position, enemy
                  ? { id: [...remoteAvatars.keys()][0], pos: enemy.mannequin.root.position }
                  : null);
                window.MayhemAudio.onFire('summon-minion');
              }
              return;
            }
            if (w.key === 'shield_minion') {
              if (window._minionManager) { window._minionManager.shieldOldest(); window.MayhemAudio.onFire('shield-minion'); }
              return;
            }
            if (w.key === 'frenzy_minion') {
              if (window._minionManager) { window._minionManager.frenzyOldest(); window.MayhemAudio.onFire('frenzy-minion'); }
              return;
            }
            if (w.projectileType === 'vehicle_switch') {
              const current = localAvatar._vehicle;
              const nextType = (!current || current.type === 'motorcycle') ? 'car' : 'motorcycle';
              if (current) {
                window.MayhemVehicle.Vehicle.despawn(current, scene);
                if (window._autoTurret) { window._autoTurret.disable(); }
              }
              const newVehicle = window.MayhemVehicle.Vehicle.spawn(nextType, localAvatar.mannequin.root.position, scene);
              localAvatar._vehicle = newVehicle;
              window.MayhemAudio.onFire('vehicle-switch');
              send({ type: 'vehicle_switch', playerId, vehicleType: nextType });
              if (nextType === 'car') {
                window._autoTurret = new window.MayhemVehicle.AutoTurret({
                  vehicle: newVehicle, scene, THREE: window.THREE,
                  onFire: ({ targetId, damage }) => {
                    send({ type: 'hit', victimId: targetId, weaponKey: 'turret', shooterId: playerId, impulse: { x: 0, y: 0, z: 0 } });
                  },
                });
                window._autoTurret.enable();
              }
              return;
            }
            if (w.projectileType === 'repair') {
              const v = localAvatar._vehicle;
              if (v) {
                v.hp = Math.min(v.maxHp, (v.hp || 0) + 40);
                effectsMgr?.spawnSmokePuff(scene, v.mesh ? v.mesh.position : localAvatar.mannequin.root.position);
                window.MayhemAudio.onFire('vehicle-repair');
                send({ type: 'vehicle_repair', playerId, amount: 40 });
              }
              return;
            }
            if (w.projectileType === 'sprint') {
              const v = localAvatar._vehicle;
              if (v) {
                v.speedMult = 2.5;
                v.damagesOnContact = true;
                window.MayhemAudio.onFire('motorcycle-engine');
                send({ type: 'motorcycle_sprint', playerId, durationMs: 1500 });
                setTimeout(() => { v.speedMult = 1; v.damagesOnContact = false; }, 1500);
              }
              return;
            }

          });
        weaponSystem = localAvatar.weaponSystem;
        if (heroId === 'martina') {
          window._minionManager = new window.MayhemHeroes.MinionManager({
            maxMinions: 2,
            minionMeshFactory: pos => {
              const m = makeMannequin(`minion-${pos.x}-${pos.z}`, pos);
              m.root.scale.setScalar(0.6);
              m.root.traverse(o => {
                if (o.isMesh && o.material) {
                  o.material = o.material.clone();
                  o.material.color.setHex(0xb8c0a8);
                }
              });
              return m.root;
            },
            onHit: ({ targetId, damage }) => {
              send({ type: 'hit', victimId: targetId, damage, weaponKey: 'minion-melee', shooterId: playerId });
            },
            onSync: msg => send(msg),
          });
        }
        send({ type: 'hero_select', heroId });
        _heroSelectUi.setStatus('Warte auf Gegner …');
        _checkBothHeroesSelected();
      },
      onPvAiToggle(active) { _pvAiMode = active; },
    });
    document.body.appendChild(_heroSelectUi.el);
  }

  function _checkBothHeroesSelected() {
    if (!_myHeroId) return;
    if (!_pvAiMode && !_opponentHeroId) return;
    if (!isHost) return;  // only host drives start
    if (_heroSelectUi) {
      const startBtn = _heroSelectUi.showPlayButton(() => {
        startBtn.style.display = 'none';
        const pA = playerId;
        const pB = _pvAiMode ? 'bot-pvai' : [...remoteAvatars.keys()][0];
        gameMode.startDuelFighting(pA, pB);
        send({
          type: 'duel_start',
          playerA: pA, playerB: pB,
          heroA: _myHeroId,
          heroB: _pvAiMode ? (_opponentHeroId || 'patrick') : (_opponentHeroId),
          nameA: window._currentUser?.displayName || pA,
          nameB: _pvAiMode ? 'KI' : (window._knownNames?.[pB] || pB),
        });
        _startDuelRound(pA, pB);
      });
    }
  }

  function _startDuelRound(playerA, playerB) {
    if (_heroSelectUi) { _closeOverlay(_heroSelectUi); _heroSelectUi = null; }
    _duelRoundPause = false;
    if (_pvAiMode && isHost) {
      _spawnPvAiBot(_opponentHeroId || 'patrick');
    }
    if (_myHeroId === 'oskar') {
      const vehicle = window.MayhemVehicle.Vehicle.spawn('motorcycle', localAvatar.mannequin.root.position, scene);
      localAvatar._vehicle = vehicle;
    }
    _buildDuelHud();
    window.MayhemAudio?.play('duel-gong');
  }

  function _spawnPvAiBot(heroId) {
    const botId  = 'bot-pvai';
    const botPos = { x: 3, y: 0, z: 3 };   // opposite side of arena
    const bot    = new window.MayhemAiBot.AIBot({
      id: botId, heroId, pos: botPos, scene, THREE: window.THREE,
      obstacles, weaponSystem: new window.MayhemWeapons.WeaponSystem(
        window.MayhemHeroes.HEROES[heroId].abilities,
        (w, origin, dir, id) => {
          if (w.projectileType === 'frostnova') return;
          if (w.melee) {
            if (localAvatar) {
              const lp = localAvatar.mannequin.root.position;
              const dist = Math.hypot(lp.x - origin.x, lp.z - origin.z);
              if (dist <= w.meleeRange) {
                const impulse = { x: dir.x * 2, z: dir.z * 2 };
                sendWeaponHit(playerId, w.key, id);
              }
            }
            return;
          }
          if (projectileMgr) projectileMgr.spawn(w, origin, dir, id);
        }),
      onDeath: () => { _handleBotDeath(); },
    });
    bot.hp      = 100;
    bot.heroId  = heroId;
    window._pvAiBot = bot;
    aiBots.set(botId, bot);
    remoteAvatars.set(botId, bot.avatar);  // so spectators can follow
  }

  function _handleBotDeath() {
    if (!isHost || _duelRoundPause) return;
    // Server is authoritative — route bot death through server like any player_death
    send({ type: 'player_death', playerId: 'bot-pvai' });
  }

  function _onDuelRoundEnd({ winner, winsA, winsB }) {
    window.MayhemAudio?.play('ko-stinger');
    _duelRoundPause = true;
    _showDuelRoundResult(winner, winsA, winsB);
    // Server fires duel_round_start after 3s — that handler resets HP / respawn.
  }

  function _onDuelEnd({ matchWinner, reason, winsA, winsB, heroA, heroB, nameA, nameB }) {
    window.MayhemAudio?.play('crowd-cheer');
    const resolvedWinsA = winsA ?? gameMode?.duelState?.winsA ?? 0;
    const resolvedWinsB = winsB ?? gameMode?.duelState?.winsB ?? 0;
    _showDuelMatchResult(matchWinner, reason, resolvedWinsA, resolvedWinsB, heroA, heroB, nameA, nameB);
    // Server fires duel_abandoned (60s timeout) or duel_reset (rematch) — those handlers clean up.
  }

  function _buildDuelHud(winsA, winsB) {
    const existing = document.getElementById('duel-score-hud');
    if (existing) existing.remove();
    _duelHpFillA = null;
    _duelHpFillB = null;

    const ds = gameMode?.duelState || {};
    const resolvedWinsA = winsA ?? ds.winsA ?? 0;
    const resolvedWinsB = winsB ?? ds.winsB ?? 0;
    const round = resolvedWinsA + resolvedWinsB + 1;

    const HEROES = window.MayhemHeroes?.HEROES || {};
    const nameA = HEROES[_myHeroId]?.name || 'A';
    const nameB = _pvAiMode
      ? (HEROES[_opponentHeroId]?.name || 'KI')
      : (HEROES[_opponentHeroId]?.name || 'B');

    const bar = document.createElement('div');
    bar.id = 'duel-score-hud';
    bar.style.cssText = `
      position: fixed; top: 12px; left: 50%; transform: translateX(-50%);
      display: flex; align-items: center; gap: 16px;
      background: rgba(0,0,0,.55); padding: 6px 14px; border-radius: 8px;
      font-family: 'Geist Mono', monospace; color: #d7b06a; font-size: 11px;
      pointer-events: none; z-index: 1000;
    `;
    bar.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:80px">
        <span style="letter-spacing:0.1em">${nameA}</span>
        <div style="width:80px;height:6px;background:#333;border-radius:3px;overflow:hidden">
          <div id="duel-hp-fill-a" style="height:100%;width:100%;background:#d7b06a;transition:width 0.15s;border-radius:3px;"></div>
        </div>
      </div>
      <div style="text-align:center;letter-spacing:0.14em;white-space:nowrap">
        RUNDE ${round} · ${resolvedWinsA}—${resolvedWinsB}
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-start;gap:2px;min-width:80px">
        <span style="letter-spacing:0.1em">${nameB}</span>
        <div style="width:80px;height:6px;background:#333;border-radius:3px;overflow:hidden">
          <div id="duel-hp-fill-b" style="height:100%;width:100%;background:#a0aec0;transition:width 0.15s;border-radius:3px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(bar);
    _duelHpFillA = document.getElementById('duel-hp-fill-a');
    _duelHpFillB = document.getElementById('duel-hp-fill-b');
  }

  function _showDuelRoundResult(winnerId, winsA, winsB) {
    const overlay = document.createElement('div');
    overlay.id = 'duel-round-result-overlay';
    overlay.style.cssText = `
      position: fixed; inset: 0; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      background: rgba(11,17,28,0.7); z-index: 2000;
      font-family: 'Geist Mono', monospace; pointer-events: none;
    `;
    overlay.innerHTML = `
      <div style="font-size: 22px; color: #f0d28c; letter-spacing: 0.18em; margin-bottom: 12px;">
        RUNDE GEWONNEN
      </div>
      <div style="font-size: 14px; color: #b9bda3;">
        ${winsA} : ${winsB}
      </div>
    `;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.remove(), 3000);
  }

  function _showDuelMatchResult(matchWinnerId, reason, winsA, winsB, heroAId, heroBId, nameAOverride, nameBOverride) {
    document.body.setAttribute('data-overlay', '');
    const existing = document.getElementById('duel-match-result-overlay');
    if (existing) _closeOverlay(existing);

    const HEROES = window.MayhemHeroes?.HEROES || {};
    const ds = gameMode?.duelState || {};
    const resolvedHeroAId = heroAId || ds.heroA || _myHeroId;
    const resolvedHeroBId = heroBId || ds.heroB || _opponentHeroId;
    const heroA = HEROES[resolvedHeroAId] || {};
    const heroB = HEROES[resolvedHeroBId] || {};
    const winnerIsA = matchWinnerId === ds.playerA || (_pvAiMode && matchWinnerId !== 'bot-pvai');
    const displayNameA = nameAOverride || heroA.name || 'A';
    const displayNameB = nameBOverride || (_pvAiMode ? (heroB.name || 'KI') : (heroB.name || 'B'));
    const winnerDisplayName = winnerIsA ? displayNameA : displayNameB;

    const overlay = document.createElement('div');
    overlay.id = 'duel-match-result-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;
      background:radial-gradient(ellipse at center,rgba(0,0,0,.4),rgba(0,0,0,.8));
      display:flex;align-items:center;justify-content:center;z-index:3000;
      font-family:'Geist Mono',monospace;
    `;

    const borderA = winnerIsA ? '2px solid #d7b06a' : '1px solid rgba(255,255,255,.1)';
    const bgA     = winnerIsA ? 'rgba(215,176,106,.08)' : 'rgba(255,255,255,.02)';
    const opA     = winnerIsA ? '1' : '0.7';
    const borderB = winnerIsA ? '1px solid rgba(255,255,255,.1)' : '2px solid #d7b06a';
    const bgB     = winnerIsA ? 'rgba(255,255,255,.02)' : 'rgba(215,176,106,.08)';
    const opB     = winnerIsA ? '0.7' : '1';
    const imgBorderA = winnerIsA ? '#d7b06a' : 'rgba(255,255,255,.15)';
    const imgBorderB = winnerIsA ? 'rgba(255,255,255,.15)' : '#d7b06a';

    const isFighter = ds.playerA === playerId || ds.playerB === playerId;

    overlay.innerHTML = `
      <div style="background:rgba(11,17,28,.96);border:1px solid rgba(215,176,106,.32);border-radius:16px;padding:28px 32px;width:520px;max-width:90vw;box-shadow:0 20px 60px rgba(0,0,0,.8);color:#d7b06a">
        <div style="text-align:center;margin-bottom:18px">
          <div style="font-size:10px;letter-spacing:.24em;color:#8A8497;text-transform:uppercase">Match End · BO3</div>
          <div style="font-size:24px;letter-spacing:.18em;color:#d7b06a;margin-top:6px;font-weight:600">${winnerDisplayName.toUpperCase()} GEWINNT</div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:24px">
          <div style="flex:1;text-align:center;padding:14px;border:${borderA};border-radius:12px;background:${bgA};opacity:${opA}">
            <img src="${heroA.portrait||''}" onerror="this.style.display='none'" style="width:72px;height:72px;border-radius:10px;border:2px solid ${imgBorderA};object-fit:cover">
            <div style="margin-top:10px;font-size:14px;color:#fff">${displayNameA.toUpperCase()}</div>
            <div style="font-size:10px;color:#8A8497;letter-spacing:.14em;margin-top:2px">${(heroA.description||'').toUpperCase()}</div>
          </div>
          <div style="text-align:center;padding:0 8px">
            <div style="font-size:38px;color:#fff;font-weight:700;letter-spacing:.04em">${winsA} — ${winsB}</div>
            <div style="font-size:9px;color:#8A8497;letter-spacing:.2em;margin-top:2px">FINAL</div>
          </div>
          <div style="flex:1;text-align:center;padding:14px;border:${borderB};border-radius:12px;background:${bgB};opacity:${opB}">
            <img src="${heroB.portrait||''}" onerror="this.style.display='none'" style="width:72px;height:72px;border-radius:10px;border:2px solid ${imgBorderB};object-fit:cover">
            <div style="margin-top:10px;font-size:14px;color:#fff">${displayNameB.toUpperCase()}</div>
            <div style="font-size:10px;color:#8A8497;letter-spacing:.14em;margin-top:2px">${(heroB.description||'').toUpperCase()}</div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px" id="duel-rematch-buttons">
          <button data-rematch="same" style="background:#d7b06a;color:#0b111c;border:none;padding:12px;border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.16em;font-weight:600;cursor:pointer">REMATCH · GLEICHE HELDEN</button>
          <button data-rematch="select" style="background:transparent;color:#d7b06a;border:1px solid #d7b06a;padding:11px;border-radius:8px;font-family:inherit;font-size:12px;letter-spacing:.16em;font-weight:600;cursor:pointer">REMATCH · NEUE HELDEN WÄHLEN</button>
          <button data-rematch="abandon" style="background:transparent;color:#8A8497;border:1px solid rgba(255,255,255,.12);padding:9px;border-radius:8px;font-family:inherit;font-size:11px;letter-spacing:.14em;cursor:pointer">ZURÜCK ZUM WARMUP</button>
        </div>
        <div id="duel-rematch-waiting" style="display:none;margin-top:14px;text-align:center;font-size:10px;letter-spacing:.16em;color:#d7b06a"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-rematch]').forEach(btn => {
      if (!isFighter) { btn.disabled = true; btn.style.opacity = '0.4'; btn.style.cursor = 'not-allowed'; return; }
      btn.addEventListener('click', () => {
        btn.disabled = true;
        const action = btn.getAttribute('data-rematch');
        if (action === 'same') send({ type: 'rematch_request', sameHeroes: true });
        else if (action === 'select') send({ type: 'rematch_request', sameHeroes: false });
        else if (action === 'abandon') send({ type: 'duel_abandoned_request' });
      }, { once: true });
    });
  }

  function _enterSpectatorMode() {
    _isSpectator = true;
    if (localAvatar) { localAvatar.mannequin.root.visible = false; }
    _showSpectatorHud();
    _specTarget = [...remoteAvatars.keys()].find(id => !id.startsWith('bot-')) || null;
    _specMode   = 'follow';
  }

  function _cycleSpecTarget() {
    const fighters = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'));
    if (fighters.length === 0) return;
    const idx = fighters.indexOf(_specTarget);
    _specTarget = fighters[(idx + 1) % fighters.length] || null;
  }

  function _showSpectatorHud() {
    const existing = document.getElementById('spectator-hud-v2');
    if (existing) existing.remove();

    const HEROES = window.MayhemHeroes?.HEROES || {};
    const ds = gameMode?.duelState || {};
    const heroA = HEROES[ds.heroA] || HEROES[_myHeroId] || null;
    const heroB = HEROES[ds.heroB] || HEROES[_opponentHeroId] || null;
    const nameA = heroA?.name || 'A';
    const nameB = heroB?.name || 'B';
    const portraitA = heroA?.portrait || '';
    const portraitB = heroB?.portrait || '';
    const winsA = ds.winsA || 0;
    const winsB = ds.winsB || 0;
    const round = winsA + winsB + 1;

    const hud = document.createElement('div');
    hud.id = 'spectator-hud-v2';
    hud.innerHTML = `
      <div class="sh-fighter sh-fighter-a">
        <img src="${portraitA}" onerror="this.style.display='none'" alt="">
        <div class="sh-meta">
          <div class="sh-name">${nameA.toUpperCase()}</div>
          <div class="sh-hp"><div class="sh-hp-fill" data-fighter="a" style="width:100%"></div></div>
        </div>
      </div>
      <div class="sh-score">
        <div class="sh-dots">
          ${[0,1,2].map(i => {
            const filled = i < winsA;
            const leading = i === winsA && winsA >= winsB;
            return `<div data-role="round-dot" class="sh-dot ${filled?'filled':''} ${leading?'leading':''}"></div>`;
          }).join('')}
        </div>
        <div class="sh-round">RUNDE ${round} · BO3</div>
      </div>
      <div class="sh-fighter sh-fighter-b">
        <div class="sh-meta sh-meta-right">
          <div class="sh-name">${nameB.toUpperCase()}</div>
          <div class="sh-hp"><div class="sh-hp-fill" data-fighter="b" style="width:100%"></div></div>
        </div>
        <img src="${portraitB}" onerror="this.style.display='none'" alt="">
      </div>
    `;
    hud.style.cssText = `
      position:fixed;top:14px;left:50%;transform:translateX(-50%);
      display:flex;align-items:center;gap:18px;
      background:rgba(11,17,28,.92);border:1px solid rgba(215,176,106,.32);
      border-radius:14px;padding:10px 18px;
      box-shadow:0 8px 32px rgba(0,0,0,.6);
      font-family:'Geist Mono',monospace;color:#d7b06a;
      pointer-events:none;z-index:2000;
    `;
    _injectSpectatorHudCss();
    document.body.appendChild(hud);

    // Bottom-right footer (controls hint)
    const footer = document.createElement('div');
    footer.id = 'spectator-hud-footer';
    footer.style.cssText = `
      position:fixed;bottom:14px;right:18px;
      display:flex;align-items:center;gap:14px;
      background:rgba(11,17,28,.85);border:1px solid rgba(215,176,106,.2);
      border-radius:10px;padding:8px 14px;
      font-family:'Geist Mono',monospace;font-size:10px;color:#d7b06a;
      pointer-events:none;z-index:2000;
    `;
    const targetHeroId = _specTarget ? (remoteAvatars.get(_specTarget) || (_specTarget === playerId ? localAvatar : null))?.heroId : null;
    const targetName = targetHeroId ? (window.MayhemHeroes?.HEROES?.[targetHeroId]?.name || 'Spieler') : 'niemand';
    footer.innerHTML = `
      <span>ZUSCHAUER · folgst ${targetName.toUpperCase()}</span>
      <span><kbd>Tab</kbd> wechseln  <kbd>F</kbd> freie Kamera</span>
    `;
    document.body.appendChild(footer);
  }

  function _injectSpectatorHudCss() {
    if (document.getElementById('spectator-hud-v2-css')) return;
    const s = document.createElement('style');
    s.id = 'spectator-hud-v2-css';
    s.textContent = `
      #spectator-hud-v2 .sh-fighter { display:flex; align-items:center; gap:10px; }
      #spectator-hud-v2 .sh-fighter img { width:48px; height:48px; border-radius:8px; border:2px solid #d7b06a; object-fit:cover; }
      #spectator-hud-v2 .sh-name { font-size:12px; letter-spacing:.14em; color:#fff; }
      #spectator-hud-v2 .sh-hp { width:130px; height:6px; background:#222; border-radius:3px; margin-top:4px; overflow:hidden; }
      #spectator-hud-v2 .sh-meta-right { text-align:right; }
      #spectator-hud-v2 .sh-meta-right .sh-hp { display:flex; justify-content:flex-end; }
      #spectator-hud-v2 .sh-hp-fill { height:100%; background:linear-gradient(90deg,#d7b06a,#e5c885); border-radius:3px; transition:width .15s; }
      #spectator-hud-v2 .sh-score { display:flex; flex-direction:column; align-items:center; gap:4px; padding:0 10px; }
      #spectator-hud-v2 .sh-dots { display:flex; gap:6px; }
      #spectator-hud-v2 .sh-dot { width:10px; height:10px; border-radius:99px; border:1.5px solid rgba(215,176,106,.45); background:transparent; }
      #spectator-hud-v2 .sh-dot.filled { background:#d7b06a; border-color:#d7b06a; }
      #spectator-hud-v2 .sh-dot.leading { background:rgba(215,176,106,.18); border-color:#d7b06a; box-shadow:0 0 0 2px rgba(215,176,106,.25); }
      #spectator-hud-v2 .sh-round { font-size:10px; letter-spacing:.18em; color:#8A8497; }
      #spectator-hud-footer kbd { background:#1a2233; color:#d7b06a; border:1px solid #2a3344; padding:2px 6px; border-radius:4px; font-size:10px; font-family:inherit; margin-right:2px; }
    `;
    document.head.appendChild(s);
  }

  function _updateSpectatorHud() {
    const hud = document.getElementById('spectator-hud-v2');
    if (!hud) return;
    const ds = gameMode?.duelState;
    if (!ds) return;
    // Update HP bars
    const fillA = hud.querySelector('.sh-hp-fill[data-fighter="a"]');
    const fillB = hud.querySelector('.sh-hp-fill[data-fighter="b"]');
    if (fillA) {
      const av = remoteAvatars.get(ds.playerA) || (ds.playerA === playerId ? localAvatar : null);
      if (av) fillA.style.width = Math.max(0, av.hp) + '%';
    }
    if (fillB) {
      const av = remoteAvatars.get(ds.playerB) || (ds.playerB === playerId ? localAvatar : null);
      if (av) fillB.style.width = Math.max(0, av.hp) + '%';
    }
    // Update round dots
    const dots = hud.querySelectorAll('[data-role="round-dot"]');
    dots.forEach((dot, i) => {
      dot.classList.toggle('filled', i < ds.winsA);
      dot.classList.toggle('leading', i === ds.winsA && ds.winsA >= ds.winsB);
    });
    const roundEl = hud.querySelector('.sh-round');
    if (roundEl) roundEl.textContent = `RUNDE ${ds.winsA + ds.winsB + 1} · BO3`;
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
    if (_heroSelectUi) { _closeOverlay(_heroSelectUi); _heroSelectUi = null; }
    const specHud = document.getElementById('spectator-hud-v2');
    if (specHud) specHud.remove();
    const specFooter = document.getElementById('spectator-hud-footer');
    if (specFooter) specFooter.remove();
    document.removeEventListener('mousemove', _onMouseMove);
    document.removeEventListener('touchmove', _onTouchMove);
    if (document.pointerLockElement) {
      document.exitPointerLock();
      if (_isFirstPersonActive() && canvas) {
        requestAnimationFrame(() => canvas.requestPointerLock());
      }
    }
    window.MayhemEffects = null;
    effectsMgr = null;
    weaponSystem = null;
    gameMode = null;
    chaseCam.detach();
    if (window._minionManager) {
      window._minionManager.clear();
      window._minionManager = null;
    }
    if (window._remoteMinionMeshes) {
      for (const m of window._remoteMinionMeshes.values()) {
        scene.remove(m);
      }
      window._remoteMinionMeshes.clear();
      window._remoteMinionMeshes = null;
    }
    if (window._autoTurret) {
      window._autoTurret.disable();
      window._autoTurret = null;
    }
    window._pvAiBot = null;
    _myHeroId = null;
    _opponentHeroId = null;
    _duelRoundPause = false;
    _isSpectator = false;
    _specTarget = null;
    _specMode = 'follow';
  }

  function _isFirstPersonActive() {
    return enabled && !_isSpectator && localAvatar;
  }

  function _closeOverlay(node) {
    if (node) {
      if (typeof node.destroy === 'function') node.destroy();
      else if (node.parentNode) node.parentNode.removeChild(node);
      else if (typeof node.remove === 'function') node.remove();
    }
    document.body.removeAttribute('data-overlay');
    if (_isFirstPersonActive() && canvas) {
      requestAnimationFrame(() => canvas.requestPointerLock());
    }
  }

  function _updateCrosshairTint() {
    const now = performance.now();
    const recentlyFired = (now - (_lastFireMs || 0)) < 150;
    const heroIsCool = _myHeroId === 'tina';
    let target;
    if (recentlyFired) target = 0xc4453a;       // blood-bright
    else if (heroIsCool) target = 0x6fa8d8;     // stille-blau
    else target = 0xc8a96e;                     // brass-game (default)
    
    if (_crosshairMesh && _crosshairMesh.material) {
      if (_crosshairMesh.material.color.lerp) {
        _crosshairMesh.material.color.lerp(new THREE.Color(target), 0.18);
      } else {
        _crosshairMesh.material.color.set(target);
      }
    }
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
    if ((shooterId || playerId) === playerId) {
      window.MayhemAudio?.onHit(weaponKey);
    }
  }

  function sendFlailHit(victimId, impulse) {
    send({ type: 'hit', victimId, weaponKey: 'fist', shooterId: playerId, impulse, source: 'flail' });
    applyHitLocally(victimId, 'fist', impulse, playerId);
    window.MayhemAudio?.onHit('fist');
  }

  function sendVehicleHit(victimId, impulse) {
    send({ type: 'hit', victimId, weaponKey: 'vehicle', shooterId: playerId, impulse, source: 'vehicle' });
    applyHitLocally(victimId, 'vehicle', impulse, playerId);
    window.MayhemAudio?.onHit('vehicle');
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
    const hpBefore = localAvatar.hp;

    window.MayhemAudio?.onHit(weaponKey);

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
    const hpAfter = localAvatar.hp;

    if (hpBefore > 0 && hpAfter <= 0) {
      window.MayhemAudio?.onKill();
    }

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

    if (_isSpectator) {
      if (_specMode === 'follow' && _specTarget) {
        const av = remoteAvatars.get(_specTarget);
        if (av) chaseCam.attach(av.mannequin.root);
      } else if (_specMode === 'fly') {
        chaseCam.detach();
        const FLYSPEED = 8;
        const moveVector = new window.THREE.Vector3(0, 0, 0);
        if (_specKeys['KeyW']) moveVector.z -= FLYSPEED * dt;
        if (_specKeys['KeyS']) moveVector.z += FLYSPEED * dt;
        if (_specKeys['KeyA']) moveVector.x -= FLYSPEED * dt;
        if (_specKeys['KeyD']) moveVector.x += FLYSPEED * dt;
        if (_specKeys['KeyQ']) moveVector.y -= FLYSPEED * dt;
        if (_specKeys['KeyE']) moveVector.y += FLYSPEED * dt;
        
        camera.position.x = Math.max(-13, Math.min(13, camera.position.x + moveVector.x));
        camera.position.y = Math.max(1,   Math.min(8,  camera.position.y + moveVector.y));
        camera.position.z = Math.max(-13, Math.min(13, camera.position.z + moveVector.z));
        camera.lookAt(0, 0, 0);
      }
      for (const a of remoteAvatars.values()) a.update(dt, 0);
      projectileMgr?.update(dt);
      effectsMgr?.update(dt);
      chaseCam?.update();
      if (hud) updateHudFrame();
      return;
    }

    if (_crosshairMesh) {
      const overlayOpen = document.body.hasAttribute('data-overlay');
      _crosshairMesh.visible = !overlayOpen && _isFirstPersonActive();
      if (!overlayOpen) {
        _updateCrosshairTint();
      }
    }

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
      if (localAvatar._vehicle && localAvatar._vehicle.mesh) {
        const lp = localAvatar.mannequin.root.position;
        const v = localAvatar._vehicle;
        v.mesh.position.set(lp.x, v.type === 'motorcycle' ? 0.35 : 0.45, lp.z);
        v.mesh.rotation.y = localAvatar.facingY;

        if (v.damagesOnContact) {
          const vCapsule = { x: lp.x, y: 0.5, z: lp.z, radius: v.type === 'motorcycle' ? 0.6 : 1.0, height: 1.0 };
          const physics = window.MayhemPhysics;
          for (const [remoteId, remoteAv] of remoteAvatars) {
            if (remoteAv.isDead) continue;
            if (physics.capsuleCapsule(vCapsule, remoteAv.getCapsule())) {
              send({ type: 'hit', victimId: remoteId, weaponKey: 'vehicle', shooterId: playerId, impulse: { x: 0, y: 0, z: 0 } });
            }
          }
        }
      }
    }

    // Tick AI bots — they drive their own avatars (already in remoteAvatars)
    // pvAiBot is skipped here; it is ticked separately below with the correct enemy ref
    if (aiBots.size > 0) {
      const allCombatants = new Map(remoteAvatars);
      if (localAvatar) allCombatants.set(playerId, localAvatar);
      for (const [id, bot] of aiBots) {
        if (id === 'bot-pvai') continue;
        bot.tick(dt, allCombatants);
      }
    }

    for (const a of remoteAvatars.values()) a.update(dt, 0);
    if (window._minionManager) {
      window._minionManager.tick(dt, Date.now());
    }
    if (window._autoTurret) {
      window._autoTurret.tick(remoteAvatars, Date.now());
    }
    if (window._pvAiBot && _pvAiMode) {
      const enemy = { pos: localAvatar.mannequin.root.position };
      window._pvAiBot.tick(dt, enemy, obstacles);
    }
    for (const v of vehicles.values()) {
      v.update(dt);
      if (!v.alive) { v.remove(scene); vehicles.delete(v.id); }
    }
    projectileMgr?.update(dt);
    effectsMgr?.update(dt);
    chaseCam?.update();
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
    const id = randomUUID();
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
    if (snap.gameMode) {
      if (gameMode) gameMode.setMode(snap.gameMode);
      else _pendingGameMode = snap.gameMode;
    }
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

      case 'hero_select':
        _opponentHeroId = msg.heroId;
        if (_heroSelectUi) {
          _heroSelectUi.lockCard(msg.heroId);
          _heroSelectUi.setStatus('Gegner hat gewählt ✓');
        }
        _checkBothHeroesSelected();
        break;

      case 'duel_start':
        _startDuelRound(msg.playerA, msg.playerB);
        break;

      case 'duel_round_end':
        if (gameMode && gameMode.mode === 'duel') {
          if (gameMode.duelState) { gameMode.duelState.winsA = msg.winsA; gameMode.duelState.winsB = msg.winsB; }
          _onDuelRoundEnd({ winner: msg.winner, winsA: msg.winsA, winsB: msg.winsB });
          if (_isSpectator) _updateSpectatorHud();
        }
        break;

      case 'duel_match_end':
        if (gameMode && gameMode.mode === 'duel') {
          if (gameMode.duelState) { gameMode.duelState.winsA = msg.winsA; gameMode.duelState.winsB = msg.winsB; }
          _onDuelEnd({ matchWinner: msg.winner, reason: msg.reason, winsA: msg.winsA, winsB: msg.winsB, heroA: msg.heroA, heroB: msg.heroB, nameA: msg.nameA, nameB: msg.nameB });
        }
        break;

      case 'duel_round_start':
        if (gameMode && gameMode.mode === 'duel') {
          if (localAvatar) { localAvatar.resetHero(); localAvatar.resetHp(); localRespawn(); }
          if (window._pvAiBot) {
            window._pvAiBot.hp = 100;
            window._pvAiBot.avatar.resetHp();
            window._pvAiBot.avatar.resetHero();
            window._pvAiBot._x = 3; window._pvAiBot._z = 3;
            if (window._pvAiBot.mannequin) {
              window._pvAiBot.mannequin.root.position.set(3, 0, 3);
              window._pvAiBot.mannequin.root.rotation.y = 0;
            }
          }
          if (_duelHpFillA) _duelHpFillA.style.width = '100%';
          if (_duelHpFillB) _duelHpFillB.style.width = '100%';
          _duelRoundPause = false;
          _buildDuelHud(msg.winsA ?? 0, msg.winsB ?? 0);
          if (_isSpectator) _updateSpectatorHud();
        }
        break;

      case 'rematch_state':
        {
          const waitEl = document.getElementById('duel-rematch-waiting');
          if (waitEl) {
            const isWaiting = msg.requested && msg.requested.includes(playerId) && msg.requested.length === 1;
            waitEl.style.display = isWaiting ? 'block' : 'none';
            waitEl.textContent = isWaiting ? '⏳ Warte auf Gegner...' : '';
          }
        }
        break;

      case 'duel_reset':
        {
          const resultOverlay = document.getElementById('duel-match-result-overlay');
          if (resultOverlay) _closeOverlay(resultOverlay);
          if (msg.mode === 'same') {
            if (localAvatar) { localAvatar.resetHero(); localAvatar.resetHp(); localRespawn(); }
            _buildDuelHud(0, 0);
          } else {
            _myHeroId = null; _opponentHeroId = null;
            if (gameMode && typeof gameMode.enterHeroSelect === 'function') gameMode.enterHeroSelect();
          }
        }
        break;

      case 'duel_abandoned':
        {
          const overlay = document.getElementById('duel-match-result-overlay');
          if (overlay) _closeOverlay(overlay);
          const scoreHud = document.getElementById('duel-score-hud');
          if (scoreHud) scoreHud.remove();
          _duelHpFillA = null; _duelHpFillB = null;
          if (isHost && gameMode) send({ type: 'game_mode_change', mode: 'warmup' });
        }
        break;

      case 'hero_stealth':
        {
          const av = remoteAvatars.get(msg.playerId);
          if (av) av.mannequin.root.visible = !msg.active;
        }
        break;

      case 'hero_teleport':
        {
          const av = remoteAvatars.get(msg.playerId);
          if (av) { av.mannequin.root.position.x = msg.x; av.mannequin.root.position.z = msg.z; }
        }
        break;

      case 'hero_slow':
        if (localAvatar) {
          localAvatar.applySlowDebuff(msg.slowFactor, msg.durationMs);
        }
        break;

      case 'minion_spawn':
        {
          const miniMesh = makeMannequin(`minion-${msg.minionId}`, { x: msg.x, z: msg.z });
          miniMesh.root.scale.setScalar(0.6);
          miniMesh.root.traverse(o => {
            if (o.isMesh && o.material) {
              o.material = o.material.clone();
              o.material.color.setHex(0xb8c0a8);
            }
          });
          window._remoteMinionMeshes = window._remoteMinionMeshes || new Map();
          window._remoteMinionMeshes.set(msg.minionId, miniMesh.root);
        }
        break;

      case 'minion_update':
        {
          const mesh = window._remoteMinionMeshes && window._remoteMinionMeshes.get(msg.minionId);
          if (mesh) { mesh.position.x = msg.x; mesh.position.z = msg.z; }
        }
        break;

      case 'minion_die':
        {
          const mesh = window._remoteMinionMeshes && window._remoteMinionMeshes.get(msg.minionId);
          if (mesh) { scene.remove(mesh); window._remoteMinionMeshes.delete(msg.minionId); }
        }
        break;

      case 'player_join':
        if (gameMode && gameMode.mode === 'duel') {
          const fighters = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-'));
          if (fighters.length >= 2 && msg.playerId === playerId) {
            _isSpectator = true;
            _enterSpectatorMode();
          }
        }
        if (msg.playerId === playerId) return;
        if (remoteAvatars.has(msg.playerId)) return;
        { const m = makeMannequin(msg.playerId, { x: 0, z: 0 });
          remoteAvatars.set(msg.playerId,
            new window.MayhemPlayerAvatar({ id: msg.playerId, mannequin: m, local: false, color: msg.color || '#888' })); }
        isHost = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-')).length === 0;
        break;

      case 'player_state':
        if (msg.playerId === playerId) return;
        { const a = remoteAvatars.get(msg.playerId); if (a) a.setNetState(msg); }
        break;

      case 'player_leave':
        {
          const al = remoteAvatars.get(msg.playerId);
          if (al) {
            al.remove(scene);
            remoteAvatars.delete(msg.playerId);
          }
          isHost = [...remoteAvatars.keys()].filter(id => !id.startsWith('bot-')).length === 0;
        }
        break;

      case 'vehicle_switch': {
        const av = remoteAvatars.get(msg.playerId);
        if (av && av.netTarget) av.netTarget.vehicleType = msg.vehicleType;
        break;
      }

      case 'vehicle_repair':
      case 'motorcycle_sprint':
        // Visual-only relay — remote movement speed changes are evident from player_state interpolation
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
        if (_duelHpFillA || _duelHpFillB) {
          const ds = gameMode?.duelState;
          const pct = Math.max(0, msg.hp);
          if (ds?.playerA === msg.playerId && _duelHpFillA) {
            _duelHpFillA.style.width = pct + '%';
          } else if (ds?.playerB === msg.playerId && _duelHpFillB) {
            _duelHpFillB.style.width = pct + '%';
          }
        }
        if (_isSpectator) _updateSpectatorHud();
        updateHud();
        break;

      case 'player_death':
        // Server now owns duel scoring — it sees player_death and emits round/match end.
        gameMode?.handleDeath(msg.playerId, msg.playerId === playerId);
        if (msg.killerId) gameMode?.handleKill(msg.killerId);
        if (msg.killerId === playerId) {
          window.MayhemAudio?.onKill();
        }
        if (_isSpectator) _updateSpectatorHud();
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

      case 'bot_spawn':
        if (isHost) {
          const botId = 'bot-' + randomUUID();
          const pos = nextSpawnPoint();
          const botMannequin = makeMannequin(botId, pos);
          const bot = new window.MayhemAIBot({
            id: botId,
            mannequin: botMannequin,
            colorIndex: aiBots.size,
            callbacks: {
              onFire: (weaponDef, originPos, dirVec, shooterId) => {
                if (projectileMgr) projectileMgr.spawn(weaponDef, originPos, dirVec, shooterId);
              },
              onDeath: (id, killerId) => {
                aiBots.delete(id);
                remoteAvatars.delete(id);
                if (killerId && killerId !== id) gameMode?.handleKill(killerId);
                if (killerId === playerId) {
                  window.MayhemAudio?.onKill();
                }
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
          // Broadcast to other clients
          send({
            type: 'add',
            figure: {
              id: botId,
              type: 'mannequin',
              x: pos.x,
              z: pos.z,
              appearance: bot.avatar.appearance || { color: bot.avatar.color }
            }
          });
        }
        break;

      case 'bot_despawn': {
        const bot = aiBots.get(msg.botId);
        if (bot) {
          bot.remove(scene);
          aiBots.delete(msg.botId);
        }
        const av = remoteAvatars.get(msg.botId);
        if (av) {
          av.remove(scene);
          remoteAvatars.delete(msg.botId);
        }
        updateHud();
        break;
      }

      case 'round_reset':
        if (localAvatar) {
          localAvatar.resetHero();
          localAvatar.resetHp();
          localRespawn();
        }
        for (const bot of aiBots.values()) {
          bot.remove(scene);
          remoteAvatars.delete(bot.id);
        }
        aiBots.clear();
        deadHumans.clear();
        updateHud();
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
      <div id="mhud-cooldowns" style="display:none;gap:6px;align-items:center;">
        <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
          <span style="font-size:9px;color:#888">4</span>
          <div style="width:28px;height:4px;background:#333;border-radius:2px;overflow:hidden">
            <div id="mhud-stealth-cd" style="height:100%;width:100%;background:#d7b06a;border-radius:2px;"></div>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:center;gap:1px;">
          <span style="font-size:9px;color:#888">5</span>
          <div style="width:28px;height:4px;background:#333;border-radius:2px;overflow:hidden">
            <div id="mhud-teleport-cd" style="height:100%;width:100%;background:#d7b06a;border-radius:2px;"></div>
          </div>
        </div>
      </div>
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

    if (_pvAiMode && window._pvAiBot && _duelHpFillB) {
      _duelHpFillB.style.width = Math.max(0, window._pvAiBot.hp) + '%';
    }

    const cooldownsEl = document.getElementById('mhud-cooldowns');
    if (cooldownsEl) {
      const isPatrick = _myHeroId === 'patrick';
      cooldownsEl.style.display = isPatrick ? 'flex' : 'none';
      if (isPatrick) {
        const nowMs = Date.now();
        const stealthEl = document.getElementById('mhud-stealth-cd');
        const teleEl    = document.getElementById('mhud-teleport-cd');
        if (stealthEl) {
          stealthEl.style.width = Math.min(1, (nowMs - (_specialCooldowns['stealth'] || 0)) / 8000) * 100 + '%';
        }
        if (teleEl) {
          teleEl.style.width = Math.min(1, (nowMs - (_specialCooldowns['teleport'] || 0)) / 6000) * 100 + '%';
        }
      }
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
    requestPointerLock() {
      if (_isFirstPersonActive() && canvas) {
        requestAnimationFrame(() => canvas.requestPointerLock());
      }
    },
    isFirstPersonActive() {
      return _isFirstPersonActive();
    },
    get _initialized() { return _initDone; },
    _internal: {
      remoteAvatars,
      vehicles,
      get localAvatar() { return localAvatar; },
      get _isSpectator() { return _isSpectator; },
      set _isSpectator(val) { _isSpectator = val; },
      get _specTarget() { return _specTarget; },
      set _specTarget(val) { _specTarget = val; },
      get gameMode() { return gameMode; },
      set gameMode(val) { gameMode = val; },
      _showSpectatorHud,
    },
  };
})();

if (typeof window !== 'undefined') window.Mayhem = Mayhem;
