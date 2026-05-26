// ui_kits/coaching/Topbar.jsx — fixed top bar with presets, stiffness, figure editor, appearance, online indicator.

const POSE_PRESETS = ['Stand', 'Kneel', 'Prone', 'Crawl', 'Slump', 'T-Pose'];

function Topbar({
  activePreset, onPreset,
  stiffness, onStiffness,
  figEditorOpen, onToggleFigEditor,
  drawerOpen, onToggleDrawer,
  onlineCount = 1,
  hasSelection = false,
}) {
  return (
    <div className="topbar">
      <div className="tb-group">
        {POSE_PRESETS.map(p => (
          <button
            key={p}
            className={`preset-btn ${activePreset === p ? 'active' : ''}`}
            onClick={() => onPreset(p)}
          >{p}</button>
        ))}
      </div>
      <div className="tb-sep" />
      <div className="tb-group" style={{ gap: 8 }}>
        <span className="tb-label" title="Physik (schlaff)">🌡 PHYS</span>
        <input
          id="stiffness"
          type="range" min="0" max="1" step="0.01"
          value={stiffness}
          onChange={e => onStiffness(parseFloat(e.target.value))}
        />
        <span className="tb-label" title="IK (steif)">IK 🎯</span>
      </div>
      <div className="tb-sep" />
      <div className="tb-group" style={{ marginLeft: 'auto' }}>
        <button
          className={`preset-btn ${figEditorOpen ? 'open' : ''}`}
          onClick={onToggleFigEditor}
          aria-expanded={figEditorOpen}
        >＋ Figur ▾</button>
        <button
          className={`preset-btn ${drawerOpen ? 'open' : ''}`}
          onClick={onToggleDrawer}
          disabled={!hasSelection}
          title={hasSelection ? 'Aussehen bearbeiten' : 'Erst eine Figur wählen'}
        >✦ Aussehen</button>
        <span className="online-indicator">● <span>{onlineCount}</span> online</span>
      </div>
    </div>
  );
}

window.Topbar = Topbar;
