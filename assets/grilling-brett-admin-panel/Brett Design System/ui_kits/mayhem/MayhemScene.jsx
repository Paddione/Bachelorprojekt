// ui_kits/mayhem/MayhemScene.jsx — CSS-perspective placeholder for the combat scene.

function CombatFigure({ x, z, scale, color, tilt = 0, splat }) {
  return (
    <div
      className="mayhem-fig"
      style={{
        '--fig-x': `${x}px`,
        '--fig-z': `${z}px`,
        '--fig-scale': scale,
        '--fig-tilt': `${tilt}deg`,
      }}>
      {splat && <img className="mayhem-splat" src="../../assets/sprites/blood-splat-02.png" alt="" />}
      <svg viewBox="0 0 64 160" width="48" height="120">
        <rect x="24" y="92" width="6" height="52" fill={color} rx="2" />
        <rect x="34" y="92" width="6" height="52" fill={color} rx="2" />
        <rect x="20" y="44" width="24" height="50" fill={color} rx="3" />
        <rect x="10" y="46" width="6" height="42" fill={color} rx="2" />
        <rect x="48" y="46" width="6" height="42" fill={color} rx="2" />
        <circle cx="32" cy="28" r="14" fill="#d9c89b" />
      </svg>
    </div>
  );
}

function MayhemScene() {
  const figs = [
    { x: -200, z: -20, scale: 1.0, color: '#b8c0a8', tilt: 0 },
    { x:   80, z:  10, scale: 0.9, color: '#e06b6b', tilt: -8 },
    { x:  220, z:  60, scale: 0.85, color: '#6ba8e0', tilt: 18, splat: true },
    { x: -110, z: 100, scale: 0.75, color: '#c06be0', tilt: -22, splat: true },
  ];
  return (
    <div className="mayhem-scene">
      <div className="mayhem-floor">
        <div className="mayhem-grid" />
      </div>
      <div className="mayhem-figs">
        {figs.map((f, i) => <CombatFigure key={i} {...f} />)}
      </div>
      {/* muzzle flash on screen edge */}
      <img className="mayhem-flash" src="../../assets/sprites/muzzle-flash.png" alt="" />
      <div className="mayhem-vignette" />
    </div>
  );
}

window.MayhemScene = MayhemScene;
