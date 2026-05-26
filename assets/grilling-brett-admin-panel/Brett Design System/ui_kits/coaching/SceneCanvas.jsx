// ui_kits/coaching/SceneCanvas.jsx — CSS-perspective placeholder for the live Three.js scene.

function Mannequin({ figure, selected, onClick }) {
  // Tiny stylized standing figure built from SVG primitives — sage body, parchment skin head,
  // brass selection ring. The real production rig is a Three.js mannequin with 14 bones.
  const { x, z, scale, color, label, face } = figure;
  // Map z (depth) to a vertical screen offset, x to horizontal.
  // The container itself is the perspective stage.
  return (
    <button
      className={`mannequin ${selected ? 'selected' : ''}`}
      style={{
        '--fig-x': `${x}px`,
        '--fig-z': `${z}px`,
        '--fig-scale': scale,
      }}
      onClick={onClick}
      title={label}
    >
      <svg viewBox="0 0 64 160" width="48" height="120">
        {/* selection ring (floor projection) */}
        {selected && (
          <ellipse cx="32" cy="152" rx="22" ry="5"
            fill="none" stroke="#c8a96e" strokeWidth="1.4"
            style={{ filter: 'drop-shadow(0 0 6px rgba(200,169,110,0.6))' }} />
        )}
        {/* legs */}
        <rect x="24" y="92" width="6" height="52" fill={color} rx="2" />
        <rect x="34" y="92" width="6" height="52" fill={color} rx="2" />
        {/* knee joints */}
        <circle cx="27" cy="118" r="2.4" fill="#6f8db8" />
        <circle cx="37" cy="118" r="2.4" fill="#6f8db8" />
        {/* ankle joints */}
        <circle cx="27" cy="142" r="2.6" fill="#7fa37a" />
        <circle cx="37" cy="142" r="2.6" fill="#7fa37a" />
        {/* torso */}
        <rect x="20" y="44" width="24" height="50" fill={color} rx="3" />
        {/* arms */}
        <rect x="10" y="46" width="6" height="42" fill={color} rx="2" />
        <rect x="48" y="46" width="6" height="42" fill={color} rx="2" />
        {/* shoulder + elbow + wrist */}
        <circle cx="13" cy="68" r="2.2" fill="#c8a96e" />
        <circle cx="51" cy="68" r="2.2" fill="#c8a96e" />
        <circle cx="13" cy="88" r="2.2" fill="#e4c452" />
        <circle cx="51" cy="88" r="2.2" fill="#e4c452" />
        {/* head */}
        <circle cx="32" cy="28" r="14" fill="#d9c89b" />
        {face && (
          <image href={`../../assets/figure-pack/faces/${face}.png`} x="18" y="14" width="28" height="28" />
        )}
        {/* head pivot */}
        <circle cx="32" cy="42" r="2.4" fill="#d29c8a" />
      </svg>
      <span className="fig-label">{label}</span>
    </button>
  );
}

function SceneCanvas({ figures, selectedId, onSelectFigure, onCanvasDoubleClick, placingMode }) {
  return (
    <div
      className={`scene-canvas ${placingMode ? 'placing' : ''}`}
      onDoubleClick={(e) => {
        if (e.target.classList.contains('scene-floor')) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const z = e.clientY - rect.top - rect.height / 2;
          onCanvasDoubleClick(x, z);
        }
      }}
      onClick={(e) => {
        if (placingMode && e.target.classList.contains('scene-floor')) {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left - rect.width / 2;
          const z = e.clientY - rect.top - rect.height / 2;
          onCanvasDoubleClick(x, z);
        }
      }}
    >
      <div className="scene-floor">
        <div className="scene-grid" />
      </div>
      <div className="scene-figures">
        {figures.map(f => (
          <Mannequin
            key={f.id}
            figure={f}
            selected={f.id === selectedId}
            onClick={(e) => { e.stopPropagation(); onSelectFigure(f.id); }}
          />
        ))}
      </div>
      <div className="scene-vignette" />
    </div>
  );
}

window.SceneCanvas = SceneCanvas;
