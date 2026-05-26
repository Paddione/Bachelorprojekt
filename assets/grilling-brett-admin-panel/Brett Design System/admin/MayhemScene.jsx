// admin/MayhemScene.jsx — Scene under the admin overlay.
// Three visually distinct variants matching the Brett dual-mode design system:
//   · combat  — Mayhem grid, ragdolls flying, blood + flash
//   · warmup  — Mayhem substrate, but quiet — spawn rings, figures standing
//   · coaching — Slate substrate (warmer), no perspective grid, brass selection ring

function CombatFigure({ x, z, scale, color, tilt = 0, splat, pose = 'stand' }) {
  // pose: 'stand' | 'run' | 'ragdoll'
  const armLeftX  = pose === 'stand' ? 10 : (pose === 'run' ? 6  : 4);
  const armRightX = pose === 'stand' ? 48 : (pose === 'run' ? 50 : 54);
  const armTilt   = pose === 'stand' ? 0  : (pose === 'run' ? -8 : -14);
  return (
    <div
      className="mayhem-fig"
      style={{
        '--fig-x': `${x}px`,
        '--fig-z': `${z}px`,
        '--fig-scale': scale,
        '--fig-tilt': `${tilt}deg`,
      }}>
      {splat && <img className="mayhem-splat" src="../assets/sprites/blood-splat-02.png" alt="" />}
      <svg viewBox="0 0 64 160" width="48" height="120">
        <rect x="24" y="92" width="6" height="52" fill={color} rx="2" />
        <rect x="34" y="92" width="6" height="52" fill={color} rx="2" />
        <rect x="20" y="44" width="24" height="50" fill={color} rx="3" />
        <g transform={`rotate(${armTilt} 32 50)`}>
          <rect x={armLeftX}  y="46" width="6" height="42" fill={color} rx="2" />
          <rect x={armRightX} y="46" width="6" height="42" fill={color} rx="2" />
        </g>
        <circle cx="32" cy="28" r="14" fill="#d9c89b" />
      </svg>
    </div>
  );
}

function SpawnRing({ x, z, ready }) {
  return (
    <div
      className={`spawn-ring ${ready ? 'ready' : ''}`}
      style={{
        '--fig-x': `${x}px`,
        '--fig-z': `${z}px`,
      }}
    />
  );
}

function MayhemScene({ variant = 'combat' }) {
  if (variant === 'coaching') {
    return <CoachingScene />;
  }
  if (variant === 'warmup') {
    return <WarmupScene />;
  }
  // ── combat (default Mayhem)
  const figs = [
    { x: -200, z: -20, scale: 1.0,  color: '#b8c0a8', tilt: 0,   pose: 'run' },
    { x:   80, z:  10, scale: 0.9,  color: '#e06b6b', tilt: -8,  pose: 'run' },
    { x:  220, z:  60, scale: 0.85, color: '#6ba8e0', tilt: 18,  pose: 'ragdoll', splat: true },
    { x: -110, z: 100, scale: 0.75, color: '#c06be0', tilt: -22, pose: 'ragdoll', splat: true },
  ];
  return (
    <div className="mayhem-scene scene-combat">
      <div className="mayhem-floor"><div className="mayhem-grid" /></div>
      <div className="mayhem-figs">
        {figs.map((f, i) => <CombatFigure key={i} {...f} />)}
      </div>
      <img className="mayhem-flash" src="../assets/sprites/muzzle-flash.png" alt="" />
      <div className="mayhem-vignette" />
      <div className="scene-tag">
        <span className="dot live"></span>
        <span>Mayhem · Welle 3 · 4 Spieler aktiv</span>
      </div>
    </div>
  );
}

function WarmupScene() {
  // Same ink substrate but quiet: dimmer grid, no flash, figures standing,
  // brass spawn rings marking pre-match positions
  const figs = [
    { x: -160, z:  20, scale: 0.95, color: '#b8c0a8', tilt: 0, pose: 'stand' },
    { x:  140, z:  60, scale: 0.90, color: '#b8c0a8', tilt: 0, pose: 'stand' },
    { x:    0, z: -20, scale: 1.00, color: '#b8c0a8', tilt: 0, pose: 'stand' },
  ];
  const rings = [
    { x: -160, z:  60, ready: true },
    { x:  140, z: 100, ready: true },
    { x:    0, z:  20, ready: true },
    { x: -240, z: 140, ready: false },
    { x:  240, z: 140, ready: false },
    { x:    0, z: 200, ready: false },
  ];
  return (
    <div className="mayhem-scene scene-warmup">
      <div className="mayhem-floor"><div className="mayhem-grid dimmed" /></div>
      <div className="mayhem-figs">
        {rings.map((r, i) => <SpawnRing key={`r${i}`} {...r} />)}
        {figs.map((f, i) => <CombatFigure key={`f${i}`} {...f} />)}
      </div>
      <div className="mayhem-vignette" />
      <div className="scene-tag warmup">
        <span className="dot warmup-dot"></span>
        <span>Warmup · 3 Spieler bereit · 6 Spawns</span>
      </div>
    </div>
  );
}

function CoachingScene() {
  // Different substrate (slate, warmer), no perspective grid — coaching is a
  // top-down constellation board. Figures stand in a quiet group. Brass ring
  // under the selected one.
  const figs = [
    { x: -110, z:  20, scale: 0.95, color: '#b8c0a8', tilt: 0, pose: 'stand' },
    { x:   90, z:  60, scale: 0.88, color: '#b8c0a8', tilt: 0, pose: 'stand' },
    { x:  -20, z: 130, scale: 0.78, color: '#b8c0a8', tilt: 0, pose: 'stand', selected: true },
    { x:  180, z: 160, scale: 0.72, color: '#b8c0a8', tilt: 0, pose: 'stand' },
  ];
  return (
    <div className="mayhem-scene scene-coaching">
      <div className="coaching-board">
        <div className="coaching-rings">
          <div className="coaching-ring r1"></div>
          <div className="coaching-ring r2"></div>
          <div className="coaching-ring r3"></div>
        </div>
      </div>
      <div className="mayhem-figs">
        {figs.map((f, i) => (
          <React.Fragment key={i}>
            {f.selected && (
              <div
                className="select-ring"
                style={{
                  '--fig-x': `${f.x}px`,
                  '--fig-z': `${f.z + 30}px`,
                }}
              />
            )}
            <CombatFigure {...f} />
          </React.Fragment>
        ))}
      </div>
      <div className="scene-tag coaching">
        <span className="dot coaching-dot"></span>
        <span>Coaching · Aufstellung · 4 Figuren</span>
      </div>
    </div>
  );
}

window.MayhemScene = MayhemScene;
