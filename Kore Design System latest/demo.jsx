/* global React, Glock, Deagle, M4A1, MuzzleFlash, BulletHit, BloodSplat, BloodPool, LootCrate, Bullet, TopDownBody, useTweaks, TweaksPanel, TweakSection, TweakRadio, TweakSlider, TweakToggle */
const { useState, useEffect, useRef, useCallback } = React;

const FIELD_W = 720;
const FIELD_H = 460;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "weapon": "m4a1",
  "deathAnim": "cycle",
  "splatIntensity": 1,
  "limeRim": true,
  "infiniteAmmo": true,
  "showHitboxes": false
}/*EDITMODE-END*/;

const WEAPONS = {
  glock:  { label: 'Glock 17',     fireRate: 220, spread: 0.04, mag: 17, reload: 1100, dmg: 28, comp: Glock },
  deagle: { label: 'Desert Eagle', fireRate: 360, spread: 0.02, mag:  7, reload: 1400, dmg: 65, comp: Deagle },
  m4a1:   { label: 'M4A1',         fireRate:  90, spread: 0.06, mag: 30, reload: 1600, dmg: 18, comp: M4A1   },
};

function ArenaApp() {
  const [tw, setTweak] = useTweaks(TWEAK_DEFAULTS);
  return (
    <>
      <Arena tw={tw} />
      <TweaksPanel title="Tweaks">
        <TweakSection label="Weapon">
          <TweakRadio label="Active" value={tw.weapon}
            options={[
              { value: 'glock',  label: 'Glock'  },
              { value: 'deagle', label: 'Deagle' },
              { value: 'm4a1',   label: 'M4A1'   },
            ]}
            onChange={v => setTweak('weapon', v)} />
          <TweakToggle label="Lime rim light" value={tw.limeRim}      onChange={v => setTweak('limeRim', v)} />
          <TweakToggle label="Infinite ammo"  value={tw.infiniteAmmo} onChange={v => setTweak('infiniteAmmo', v)} />
        </TweakSection>
        <TweakSection label="Death animation">
          <TweakRadio label="On kill" value={tw.deathAnim}
            options={[
              { value: 'cycle', label: 'Cycle' },
              { value: 'hit',   label: 'Hit'   },
              { value: 'slump', label: 'Slump' },
              { value: 'loot',  label: 'Loot'  },
            ]}
            onChange={v => setTweak('deathAnim', v)} />
          <TweakSlider label="Splat intensity" value={tw.splatIntensity}
            min={0.3} max={2} step={0.05} unit="×"
            onChange={v => setTweak('splatIntensity', v)} />
        </TweakSection>
        <TweakSection label="Debug">
          <TweakToggle label="Show hitboxes" value={tw.showHitboxes} onChange={v => setTweak('showHitboxes', v)} />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

function Arena({ tw }) {
  const fieldRef = useRef(null);
  const [player, setPlayer] = useState({ x: FIELD_W * 0.18, y: FIELD_H * 0.5 });
  const [aim, setAim] = useState({ x: FIELD_W * 0.5, y: FIELD_H * 0.5 });
  const [bullets, setBullets] = useState([]);
  const [fxList, setFxList] = useState([]);
  const [dummies, setDummies] = useState(initDummies);
  const [muzzle, setMuzzle] = useState(0);
  const [ammo, setAmmo] = useState(WEAPONS[tw.weapon].mag);
  const [reloading, setReloading] = useState(false);
  const [killCount, setKillCount] = useState(0);
  const lastFireRef = useRef(0);
  const animCycleRef = useRef(0);
  const idRef = useRef(1);
  const nextId = () => idRef.current++;
  const twRef = useRef(tw);
  twRef.current = tw;

  function initDummies() {
    return [
      { id: 1, x: FIELD_W * 0.55, y: FIELD_H * 0.30, hp: 100, maxHp: 100, dead: false, deathAnim: null, deathFrame: 0, hitFlash: 0, deathSeed: 1 },
      { id: 2, x: FIELD_W * 0.78, y: FIELD_H * 0.55, hp: 100, maxHp: 100, dead: false, deathAnim: null, deathFrame: 0, hitFlash: 0, deathSeed: 7 },
      { id: 3, x: FIELD_W * 0.62, y: FIELD_H * 0.78, hp: 100, maxHp: 100, dead: false, deathAnim: null, deathFrame: 0, hitFlash: 0, deathSeed: 13 },
    ];
  }

  useEffect(() => {
    setAmmo(WEAPONS[tw.weapon].mag);
    setReloading(false);
  }, [tw.weapon]);

  useEffect(() => {
    const onMove = (e) => {
      if (!fieldRef.current) return;
      const r = fieldRef.current.getBoundingClientRect();
      setAim({ x: e.clientX - r.left, y: e.clientY - r.top });
    };
    const f = fieldRef.current;
    if (f) f.addEventListener('mousemove', onMove);
    return () => { if (f) f.removeEventListener('mousemove', onMove); };
  }, []);

  // game loop
  useEffect(() => {
    let raf;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(48, now - last); last = now;
      setBullets(bs => bs
        .map(b => ({ ...b, x: b.x + b.vx * dt / 16, y: b.y + b.vy * dt / 16 }))
        .filter(b => b.x > -20 && b.x < FIELD_W + 20 && b.y > -20 && b.y < FIELD_H + 20 && now - b.born < 1400)
      );
      setBullets(bs => {
        let remaining = bs;
        bs.forEach(b => {
          setDummies(ds => {
            let hit = false;
            const next = ds.map(d => {
              if (d.dead || hit) return d;
              const dx = d.x - b.x, dy = d.y - b.y;
              if (dx*dx + dy*dy < 30*30) {
                hit = true;
                const newHp = d.hp - b.dmg;
                if (newHp <= 0) {
                  let anim = twRef.current.deathAnim;
                  if (anim === 'cycle') {
                    const choices = ['hit', 'slump', 'loot'];
                    anim = choices[animCycleRef.current % 3];
                    animCycleRef.current++;
                  }
                  setKillCount(k => k + 1);
                  return { ...d, hp: 0, dead: true, deathAnim: anim, deathFrame: 0, hitFlash: 0 };
                }
                return { ...d, hp: newHp, hitFlash: 1 };
              }
              return d;
            });
            if (hit) {
              remaining = remaining.filter(x => x.id !== b.id);
              setFxList(f => [...f,
                { id: nextId(), kind: 'hitspark', x: b.x, y: b.y, born: now },
                { id: nextId(), kind: 'splat',    x: b.x, y: b.y, born: now, seed: Math.floor(Math.random() * 100) }
              ]);
            }
            return next;
          });
        });
        return remaining;
      });
      setDummies(ds => ds.map(d => d.hitFlash > 0 && !d.dead ? { ...d, hitFlash: Math.max(0, d.hitFlash - dt / 200) } : d));
      setDummies(ds => ds.map(d => d.dead ? { ...d, deathFrame: Math.min(d.deathFrame + dt / 100, 30) } : d));
      setFxList(fs => fs.filter(f => now - f.born < 900));
      setMuzzle(m => Math.max(0, m - dt / 80));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const fire = useCallback(() => {
    const now = performance.now();
    const cur = twRef.current;
    const w = WEAPONS[cur.weapon];
    if (now - lastFireRef.current < w.fireRate) return;
    if (reloading) return;
    if (!cur.infiniteAmmo && ammo <= 0) return;
    lastFireRef.current = now;
    setMuzzle(1);
    if (!cur.infiniteAmmo) {
      setAmmo(a => {
        const next = a - 1;
        if (next <= 0) {
          setReloading(true);
          setTimeout(() => { setAmmo(w.mag); setReloading(false); }, w.reload);
        }
        return next;
      });
    }
    const dx = aim.x - player.x, dy = aim.y - player.y;
    const baseAng = Math.atan2(dy, dx);
    const ang = baseAng + (Math.random() - 0.5) * w.spread;
    const speed = 18;
    setBullets(bs => [...bs, {
      id: nextId(),
      x: player.x + Math.cos(baseAng) * 26,
      y: player.y + Math.sin(baseAng) * 26,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      born: now,
      dmg: w.dmg,
    }]);
  }, [aim, player, reloading, ammo]);

  const firingRef = useRef(false);
  useEffect(() => {
    let id;
    const loop = () => { if (firingRef.current) fire(); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, [fire]);

  useEffect(() => {
    const keys = {};
    const down = (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key.toLowerCase() === 'r') {
        const w = WEAPONS[twRef.current.weapon];
        setReloading(true);
        setTimeout(() => { setAmmo(w.mag); setReloading(false); }, w.reload);
      }
    };
    const up = (e) => { keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    let raf;
    const loop = () => {
      const sp = 3;
      let dx = 0, dy = 0;
      if (keys['w'] || keys['arrowup'])    dy -= sp;
      if (keys['s'] || keys['arrowdown'])  dy += sp;
      if (keys['a'] || keys['arrowleft'])  dx -= sp;
      if (keys['d'] || keys['arrowright']) dx += sp;
      if (dx || dy) setPlayer(p => ({ x: Math.max(28, Math.min(FIELD_W - 28, p.x + dx)), y: Math.max(28, Math.min(FIELD_H - 28, p.y + dy)) }));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); cancelAnimationFrame(raf); };
  }, []);

  const reset = () => { setDummies(initDummies()); setBullets([]); setFxList([]); setKillCount(0); animCycleRef.current = 0; };

  const aimAngle = Math.atan2(aim.y - player.y, aim.x - player.x);
  const W = WEAPONS[tw.weapon];
  const WeaponComp = W.comp;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--s-4)' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 'var(--s-3) var(--s-5)',
        background: 'var(--ink-850)', border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
        gap: 'var(--s-6)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-4)' }}>
          <span className="eyebrow no-rule" style={{ color: 'var(--lime)' }}>WEAPON</span>
          <span style={{ fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--fg)', fontWeight: 500 }}>{W.label}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span className="eyebrow no-rule" style={{ color: 'var(--mute)' }}>AMMO</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: reloading ? 'var(--lime)' : 'var(--fg)', minWidth: 80, textAlign: 'right' }}>
            {reloading ? 'RELOADING…' : `${ammo} / ${W.mag}`}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-2)' }}>
          <span className="eyebrow no-rule" style={{ color: 'var(--mute)' }}>KILLS</span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 14, color: 'var(--fg)' }}>{killCount}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--s-3)' }}>
          <span className="eyebrow no-rule" style={{ color: 'var(--mute)' }}>WASD · CLICK · R</span>
          <button onClick={reset} style={{
            background: 'transparent', border: '1px solid var(--line-2)',
            color: 'var(--fg)', padding: '6px 12px', borderRadius: 'var(--r-input)',
            fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>respawn</button>
        </div>
      </div>

      <div ref={fieldRef}
        onMouseDown={() => { firingRef.current = true; fire(); }}
        onMouseUp={() => { firingRef.current = false; }}
        onMouseLeave={() => { firingRef.current = false; }}
        style={{
          position: 'relative',
          width: FIELD_W, height: FIELD_H, maxWidth: '100%',
          background: 'radial-gradient(circle at 30% 30%, #1A1326 0%, #120D1C 80%)',
          border: '1px solid var(--line)', borderRadius: 'var(--r-card)',
          overflow: 'hidden', cursor: 'crosshair', userSelect: 'none',
        }}
      >
        <svg width={FIELD_W} height={FIELD_H} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,.04)" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width={FIELD_W} height={FIELD_H} fill="url(#grid)" />
        </svg>

        {[...dummies].sort((a,b) => Number(a.dead) - Number(b.dead)).map(d => (
          <DummyView key={d.id} d={d} showHitbox={tw.showHitboxes} splatIntensity={tw.splatIntensity} />
        ))}

        {fxList.map(f => <FxView key={f.id} f={f} splatIntensity={tw.splatIntensity} />)}

        {bullets.map(b => {
          const ang = Math.atan2(b.vy, b.vx);
          return (
            <div key={b.id} style={{ position: 'absolute', left: b.x, top: b.y, transform: `translate(-50%,-50%) rotate(${ang + Math.PI/2}rad)` }}>
              <Bullet size={9} />
            </div>
          );
        })}

        <div style={{ position: 'absolute', left: player.x, top: player.y, transform: 'translate(-50%, -50%)' }}>
          <TopDownBody size={64} tone="lime" />
        </div>
        <div style={{
          position: 'absolute', left: player.x, top: player.y,
          transform: `translate(-50%, -50%) rotate(${aimAngle + Math.PI/2}rad)`,
          transformOrigin: '50% 50%', pointerEvents: 'none',
        }}>
          <div style={{ position: 'relative', transform: 'translate(0, -34px)' }}>
            <WeaponComp size={tw.weapon === 'm4a1' ? 110 : tw.weapon === 'deagle' ? 64 : 56} rimOn={tw.limeRim} />
            {muzzle > 0.05 && (
              <div style={{
                position: 'absolute',
                left: '50%', top: tw.weapon === 'm4a1' ? -28 : -22,
                transform: `translate(-50%, 0) scale(${muzzle})`,
                opacity: muzzle, pointerEvents: 'none',
              }}>
                <MuzzleFlash size={tw.weapon === 'm4a1' ? 56 : 44} />
              </div>
            )}
          </div>
        </div>

        <div style={{
          position: 'absolute', left: aim.x, top: aim.y,
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
          width: 22, height: 22,
        }}>
          <svg viewBox="0 0 22 22" width="22" height="22">
            <circle cx="11" cy="11" r="9" fill="none" stroke="var(--lime)" strokeWidth="1" opacity=".55" />
            <line x1="11" y1="0"  x2="11" y2="6"  stroke="var(--lime)" strokeWidth="1.2" />
            <line x1="11" y1="16" x2="11" y2="22" stroke="var(--lime)" strokeWidth="1.2" />
            <line x1="0"  y1="11" x2="6"  y2="11" stroke="var(--lime)" strokeWidth="1.2" />
            <line x1="16" y1="11" x2="22" y2="11" stroke="var(--lime)" strokeWidth="1.2" />
          </svg>
        </div>

        <div style={{ position: 'absolute', top: 12, left: 16, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--mute)' }}>
          ARENA · TRAINING ROOM · 720 × 460
        </div>
        <div style={{ position: 'absolute', bottom: 12, right: 16, fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--mute-2)' }}>
          {dummies.filter(d => d.dead).length} / {dummies.length} DOWN
        </div>
      </div>
    </div>
  );
}

function DummyView({ d, showHitbox, splatIntensity }) {
  if (d.dead) return <DummyDead d={d} splatIntensity={splatIntensity} />;
  return (
    <div style={{ position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%, -50%)' }}>
      {showHitbox && <div style={{ position: 'absolute', left: -30, top: -30, width: 60, height: 60, border: '1px dashed var(--lime)', borderRadius: '50%', pointerEvents: 'none' }} />}
      <div style={{ filter: d.hitFlash > 0.1 ? 'brightness(2.4) saturate(0.4)' : 'none', transition: 'filter 50ms' }}>
        <TopDownBody size={64} tone="cyan" />
      </div>
      <div style={{ position: 'absolute', top: -38, left: -22, width: 44, height: 4, background: 'rgba(0,0,0,.5)', borderRadius: 2 }}>
        <div style={{ width: `${(d.hp / d.maxHp) * 100}%`, height: '100%', background: d.hp > 50 ? 'var(--lime)' : d.hp > 25 ? '#E6FFB0' : '#E26B6B', borderRadius: 2, transition: 'width 120ms' }} />
      </div>
    </div>
  );
}

function DummyDead({ d, splatIntensity }) {
  const f = d.deathFrame;
  const anim = d.deathAnim;
  if (anim === 'hit') {
    const rot = f < 2 ? 0 : f < 6 ? -20 : f < 10 ? -90 : f < 14 ? -160 : -180;
    return (
      <div style={{ position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%, -50%)' }}>
        {f > 4 && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${Math.min(1, (f-4)/8) * splatIntensity})`, opacity: Math.max(0, 1 - (f - 14) / 16) }}>
            <BloodSplat size={110} seed={d.deathSeed} />
          </div>
        )}
        <div style={{
          transform: `rotate(${rot}deg)`,
          transition: 'transform 200ms var(--ease)',
          filter: f < 2 ? 'brightness(3) saturate(0)' : 'none',
        }}>
          <TopDownBody size={64} tone="cyan" dead />
        </div>
      </div>
    );
  }
  if (anim === 'slump') {
    const rot = f < 2 ? 0 : f < 5 ? -15 : f < 9 ? -55 : -90;
    const offsetY = f >= 6 ? 12 : 0;
    return (
      <div style={{ position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%, -50%)' }}>
        {f > 6 && (
          <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%, ${offsetY}px) scale(${Math.min(1, (f-6)/8) * splatIntensity})`, opacity: Math.min(1, (f-6) / 4) }}>
            <BloodPool size={120} />
          </div>
        )}
        <div style={{
          transform: `rotate(${rot}deg) translate(${f >= 6 ? -6 : 0}px, ${offsetY}px)`,
          transformOrigin: '50% 60%',
          transition: 'transform 240ms var(--ease)',
        }}>
          <TopDownBody size={64} tone="cyan" dead slumped={f >= 6} />
        </div>
      </div>
    );
  }
  // loot
  const showBody = f < 4;
  const showSplat = f >= 3 && f < 22;
  const showCrate = f >= 7;
  const showBadge = f >= 11 && f < 22;
  const cratePop = f >= 7 && f < 9;
  return (
    <div style={{ position: 'absolute', left: d.x, top: d.y, transform: 'translate(-50%, -50%)' }}>
      {showBody && (
        <div style={{ filter: 'brightness(3) saturate(0)', opacity: Math.max(0, 1 - f / 4) }}>
          <TopDownBody size={64} tone="cyan" dead />
        </div>
      )}
      {showSplat && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${Math.min(1.1, (f-3) / 4) * splatIntensity})`, opacity: Math.max(0.3, 1 - (f-12) / 12) }}>
          <BloodSplat size={120} seed={d.deathSeed} />
        </div>
      )}
      {showCrate && (
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: `translate(-50%,-50%) scale(${cratePop ? 1.15 : 1})`, transition: 'transform 180ms var(--ease)' }}>
          <LootCrate size={56} />
        </div>
      )}
      {showBadge && (
        <div style={{
          position: 'absolute', left: '50%', top: -24,
          transform: `translate(-50%, ${(f - 11) * -2}px)`,
          opacity: Math.max(0, 1 - (f - 11) / 11),
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase',
            color: 'var(--lime)', background: 'rgba(18,13,28,.85)', border: '1px solid var(--lime)',
            padding: '3px 8px', borderRadius: 'var(--r-chip)',
          }}>+1 LOOT</span>
        </div>
      )}
    </div>
  );
}

function FxView({ f, splatIntensity }) {
  const age = (performance.now() - f.born) / 1000;
  if (f.kind === 'hitspark') {
    const o = Math.max(0, 1 - age * 4);
    if (o <= 0) return null;
    return <div style={{ position: 'absolute', left: f.x, top: f.y, transform: `translate(-50%,-50%) scale(${1 + age * 1.5})`, opacity: o, pointerEvents: 'none' }}><BulletHit size={28} /></div>;
  }
  if (f.kind === 'splat') {
    const o = age < 0.5 ? Math.min(1, age * 4) : Math.max(0, 1 - (age - 0.5) * 2);
    return <div style={{ position: 'absolute', left: f.x, top: f.y, transform: `translate(-50%,-50%) scale(${0.6 * splatIntensity})`, opacity: o * 0.85, pointerEvents: 'none' }}><BloodSplat size={56} seed={f.seed} /></div>;
  }
  return null;
}

Object.assign(window, { ArenaApp });
