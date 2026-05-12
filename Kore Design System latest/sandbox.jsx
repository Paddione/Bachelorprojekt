/* global React, FloorConcrete, FloorGrate, WallBlock, Door, Vent, CoverWall,
   BulletHole, Scorch, BloodSmear, Footprint, Graffiti,
   RedBarrel, Sandbags, Vending, Terminal, ServerRack, Streetlight, Cone, Locker,
   SpawnPoint, CapturePoint, SupplyDrop, ExitMarker, ZoneRing,
   Explosion, SmokePuff, EMPBurst, HealAura, ShieldBubble,
   Turret, Drone, Merchant, TopDownBody,
   HealthPack, MedSyringe, ArmorPlate, AmmoBox, Keycard, RespectCoin,
   PowerShield, PowerSpeed, PowerDamage, PowerEMP, PowerCloak,
   LootCrate, BloodSplat, BloodPool, MuzzleFlash, BulletHit, SkullMarker,
   Glock, Deagle, M4A1 */
// =====================================================================
//  sandbox.jsx — Top-down map vignette showing assets in context.
//  Static layout with subtle animation: turret scans, drone hovers,
//  capture point ticks, streetlight flickers, supply drop pulses.
// =====================================================================

const { useState, useEffect, useMemo } = React;

const MAP_W = 1100;
const MAP_H = 600;

/* repeated floor — 64×64 tiles */
function TiledFloor({ kind = 'concrete', x, y, w, h }) {
  const Tile = kind === 'grate' ? FloorGrate : FloorConcrete;
  const cols = Math.ceil(w / 64);
  const rows = Math.ceil(h / 64);
  return (
    <div style={{ position:'absolute', left:x, top:y, width:w, height:h, overflow:'hidden' }}>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} style={{ display:'flex' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} style={{ width:64, height:64 }}>
              <Tile size={64}/>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/* place an asset at (x, y) — anchored center */
function Place({ x, y, rotate = 0, children, z = 1, hint }) {
  return (
    <div style={{
      position:'absolute', left: x, top: y,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      zIndex: z,
    }} title={hint}>{children}</div>
  );
}

/* live turret that sweeps */
function LiveTurret({ x, y }) {
  const [a, setA] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setA(Math.sin(t * 0.55) * 70);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <Place x={x} y={y} z={5}><Turret size={86} scanAngle={a}/></Place>;
}

/* hovering drone */
function LiveDrone({ x, y, ax = 18, ay = 6 }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const dx = Math.sin(t * 0.7) * ax;
  const dy = Math.cos(t * 0.9) * ay;
  return (
    <Place x={x + dx} y={y + dy} z={8}>
      <Drone size={64}/>
    </Place>
  );
}

/* flickering streetlight */
function LiveStreetlight({ x, y, period = 4200 }) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const id = setInterval(() => {
      // most of the time on; brief flicker off
      setOn(Math.random() > 0.06);
    }, 240);
    return () => clearInterval(id);
  }, []);
  return (
    <Place x={x} y={y} z={2}>
      <div style={{ opacity: on ? 1 : 0.55, transition: 'opacity 60ms linear' }}>
        <Streetlight size={140}/>
      </div>
    </Place>
  );
}

/* pulsing supply drop */
function LiveSupply({ x, y }) {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      setScale(1 + Math.sin(t * 2.4) * 0.06);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Place x={x} y={y} z={4}>
      <div style={{ transform: `scale(${scale})` }}>
        <SupplyDrop size={88}/>
      </div>
    </Place>
  );
}

/* capture point with growing fill */
function LiveCapture({ x, y }) {
  const [p, setP] = useState(0.35);
  useEffect(() => {
    const id = setInterval(() => setP(prev => (prev + 0.01) > 1 ? 0.35 : prev + 0.01), 200);
    return () => clearInterval(id);
  }, []);
  return <Place x={x} y={y} z={3}><CapturePoint size={90} percent={p}/></Place>;
}

/* spinning coin */
function LiveCoin({ x, y, size = 42 }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const sx = Math.abs(Math.cos(t * 2.5));
  const dy = Math.sin(t * 2.2) * 3;
  return (
    <Place x={x} y={y + dy} z={4}>
      <div style={{ transform: `scaleX(${0.4 + sx * 0.6})` }}>
        <RespectCoin size={size}/>
      </div>
    </Place>
  );
}

/* floating powerup */
function FloatingPowerup({ x, y, Comp, size = 52, period = 2400 }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const dy = Math.sin(t * (Math.PI * 2000 / period) / 1000) * 3;
  return <Place x={x} y={y + dy} z={4}><Comp size={size}/></Place>;
}

/* ---------- Sandbox: an annotated top-down vignette --------------- */
function ArenaVignette() {
  return (
    <div style={{
      position:'relative',
      width: '100%',
      maxWidth: MAP_W,
      aspectRatio: `${MAP_W} / ${MAP_H}`,
      margin: '0 auto',
      background: '#0E0814',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-card)',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-2)',
    }}>
      <div style={{ position:'absolute', inset:0 }}>
        {/* base inner box uses real coords; we scale via padding-bottom trick */}
        <div style={{ position:'absolute', inset:0, transformOrigin:'top left' }}>
          <SandboxScene/>
        </div>
      </div>
    </div>
  );
}

/* The actual scene at fixed coordinates — wrapper above stretches it
 * to the available width; we let it overflow as percentages by using
 * absolute positioning relative to the parent. */
function SandboxScene() {
  return (
    <div style={{
      position:'absolute', inset:0,
      width: '100%', height: '100%',
    }}>
      <ScalingMap/>
    </div>
  );
}

/* Scales the fixed-size scene to fit the parent box */
function ScalingMap() {
  const ref = React.useRef(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const onResize = () => {
      if (!ref.current) return;
      const parent = ref.current.parentElement;
      const sx = parent.clientWidth / MAP_W;
      const sy = parent.clientHeight / MAP_H;
      setScale(Math.min(sx, sy));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div ref={ref} style={{
      position: 'absolute',
      width: MAP_W, height: MAP_H,
      left: '50%', top: '50%',
      transform: `translate(-50%, -50%) scale(${scale})`,
      transformOrigin: 'center center',
    }}>
      <MapInterior/>
    </div>
  );
}

function MapInterior() {
  // bullet hole / footstep distributions (memoized)
  const decals = useMemo(() => {
    const out = [];
    const seedRng = (s) => () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    const r = seedRng(13);
    for (let i = 0; i < 16; i++) out.push({ kind:'hole', x: 80 + r() * (MAP_W - 160), y: 60 + r() * (MAP_H - 120) });
    for (let i = 0; i < 5; i++) out.push({ kind:'foot', x: 250 + i * 28, y: 380 + (i%2)*8, rot: -10 + i });
    for (let i = 0; i < 3; i++) out.push({ kind:'foot', x: 700 + i * 24, y: 220 + (i%2)*6, rot: 110 + i*2 });
    return out;
  }, []);

  return (
    <div style={{ position:'absolute', inset:0, background:'#0E0814' }}>
      {/* floors — concrete base + grate utility strip */}
      <TiledFloor kind="concrete" x={0}   y={0}   w={MAP_W}      h={MAP_H} />
      <TiledFloor kind="grate"    x={420} y={220} w={260}        h={160} />

      {/* zone ring (fades outward) */}
      <div style={{ position:'absolute', left:0, top:0, width:MAP_W, height:MAP_H, pointerEvents:'none', opacity:.55 }}>
        <svg width={MAP_W} height={MAP_H} style={{ position:'absolute' }}>
          <circle cx={MAP_W/2} cy={MAP_H/2} r={Math.min(MAP_W, MAP_H) * 0.42}
            fill="none" stroke="#5BD4D0" strokeWidth="2" strokeDasharray="3 3" opacity=".4"/>
        </svg>
      </div>

      {/* graffiti backdrop */}
      <Place x={170} y={90}><Graffiti size={220}/></Place>

      {/* walls boxing in north corridor */}
      <div style={{ position:'absolute', left:60, top:50 }}><WallBlock width={300} height={26}/></div>
      <div style={{ position:'absolute', left:680, top:50 }}><WallBlock width={360} height={26}/></div>
      <div style={{ position:'absolute', left:60, top: MAP_H - 76 }}><WallBlock width={420} height={26}/></div>
      <div style={{ position:'absolute', left:600, top: MAP_H - 76 }}><WallBlock width={440} height={26}/></div>

      {/* doors */}
      <Place x={420} y={62}><Door size={62}/></Place>
      <Place x={680} y={MAP_H - 62}><Door size={62}/></Place>

      {/* covers */}
      <Place x={300} y={200}><CoverWall size={150}/></Place>
      <Place x={820} y={300}><CoverWall size={150}/></Place>
      <Place x={500} y={460}><CoverWall size={170}/></Place>

      {/* sandbag emplacement */}
      <Place x={150} y={300}><Sandbags size={170}/></Place>

      {/* vents */}
      <Place x={420} y={420}><Vent size={70}/></Place>
      <Place x={780} y={120}><Vent size={70}/></Place>

      {/* props — left side */}
      <Place x={90}  y={460}><RedBarrel size={70}/></Place>
      <Place x={140} y={460}><RedBarrel size={70}/></Place>
      <Place x={220} y={490}><Cone size={42}/></Place>
      <Place x={250} y={500} rotate={28}><Cone size={42}/></Place>

      {/* terminals + capture point cluster */}
      <Place x={550} y={300}><Terminal size={84}/></Place>
      <LiveCapture x={550} y={210}/>

      {/* server racks alley */}
      <Place x={920} y={120}><ServerRack size={86}/></Place>
      <Place x={920} y={210}><ServerRack size={86}/></Place>
      <Place x={920} y={300}><ServerRack size={86}/></Place>

      {/* lockers */}
      <Place x={70}  y={170}><Locker size={70}/></Place>
      <Place x={70}  y={250}><Locker size={70}/></Place>

      {/* vending */}
      <Place x={1000} y={460}><Vending size={92}/></Place>

      {/* pickups + powerups */}
      <Place x={380} y={300}><HealthPack size={42}/></Place>
      <Place x={620} y={420}><AmmoBox size={42}/></Place>
      <Place x={350} y={460}><ArmorPlate size={42}/></Place>
      <Place x={750} y={460}><Keycard size={42}/></Place>
      <FloatingPowerup x={660} y={300} Comp={PowerShield} size={50}/>
      <FloatingPowerup x={250} y={150} Comp={PowerSpeed}  size={50} period={1800}/>
      <FloatingPowerup x={870} y={460} Comp={PowerEMP}    size={50} period={2200}/>

      {/* coins around the merchant */}
      <LiveCoin x={830} y={170} size={32}/>
      <LiveCoin x={870} y={190} size={28}/>
      <LiveCoin x={820} y={210} size={28}/>

      {/* merchant */}
      <Place x={840} y={190} z={6}><Merchant size={86}/></Place>

      {/* turret guarding terminal */}
      <LiveTurret x={550} y={120}/>

      {/* drone patrolling north corridor */}
      <LiveDrone x={420} y={150}/>

      {/* streetlight pools */}
      <LiveStreetlight x={150} y={150}/>
      <LiveStreetlight x={1000} y={140}/>
      <LiveStreetlight x={300} y={520}/>

      {/* supply drop landing zone */}
      <LiveSupply x={330} y={340}/>
      <Place x={330} y={340}><SpawnPoint size={130}/></Place>

      {/* exit door area */}
      <Place x={1010} y={300}><ExitMarker size={84}/></Place>

      {/* decals — bullet holes scattered, footprints trailing */}
      {decals.map((d, i) => (
        <Place key={i} x={d.x} y={d.y} rotate={d.rot || 0} z={1}>
          {d.kind === 'hole' ? <BulletHole size={18}/> : <Footprint size={22}/>}
        </Place>
      ))}

      {/* persistent decals: scorch + smear + dead body */}
      <Place x={620} y={520}><Scorch size={120}/></Place>
      <Place x={620} y={520}><BloodPool size={140}/></Place>
      <Place x={620} y={520} z={3}>
        <div style={{ transform: 'rotate(-78deg)' }}><TopDownBody size={70} tone="cyan" dead slumped/></div>
      </Place>
      <Place x={680} y={510}><BloodSmear size={110}/></Place>
      <Place x={580} y={500}><SkullMarker size={28}/></Place>
      <Place x={460} y={180}><BloodSplat size={64} seed={9}/></Place>

      {/* a player and their loot crate, mid-action */}
      <Place x={420} y={300} z={7}>
        <div style={{ transform:'rotate(35deg)' }}><TopDownBody size={64} tone="lime"/></div>
      </Place>
      <Place x={420} y={300} z={9}>
        <div style={{ transform: 'translate(0px, -36px) rotate(35deg)' }}>
          <Glock size={36}/>
        </div>
      </Place>
      <Place x={460} y={262} z={10}>
        <div style={{ transform: 'rotate(35deg)' }}><MuzzleFlash size={42}/></div>
      </Place>

      {/* explosion preview at barrel */}
      <ExplosionLoop x={120} y={460}/>

      {/* heal aura at health pickup */}
      <Place x={380} y={300} z={2}><HealAura size={120}/></Place>

      {/* shield bubble around the merchant */}
      <Place x={840} y={190} z={3}><ShieldBubble size={150}/></Place>

      {/* smoke drifting */}
      <SmokeDrift x={120} y={420}/>

      {/* labels — tiny mono captions to guide the eye */}
      <Caption x={550} y={370} text="POINT B · 65%"/>
      <Caption x={330} y={420} text="DROP ZONE"/>
      <Caption x={1010} y={358} text="EXIT"/>
      <Caption x={840} y={250} text="MERCHANT"/>
      <Caption x={620} y={580} text="K.I.A."/>
    </div>
  );
}

function Caption({ x, y, text }) {
  return (
    <div style={{
      position:'absolute', left:x, top:y,
      transform:'translate(-50%, 0)',
      fontFamily:'JetBrains Mono, monospace',
      fontSize: 10,
      letterSpacing: '0.18em',
      color: 'rgba(200,247,106,.85)',
      textTransform: 'uppercase',
      pointerEvents:'none',
      zIndex: 20,
    }}>{text}</div>
  );
}

function ExplosionLoop({ x, y }) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 8), 220);
    return () => clearInterval(id);
  }, []);
  if (frame >= 5) return null;
  return <Place x={x} y={y} z={6}><Explosion size={120} frame={frame}/></Place>;
}

function SmokeDrift({ x, y }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    let raf, start = performance.now();
    const tick = () => { setT((performance.now() - start) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <Place x={x + Math.sin(t * 0.4) * 12} y={y + (t * 6) % 60 - 30} z={5}>
      <div style={{ opacity: .65 }}><SmokePuff size={140}/></div>
    </Place>
  );
}

Object.assign(window, { ArenaVignette });
