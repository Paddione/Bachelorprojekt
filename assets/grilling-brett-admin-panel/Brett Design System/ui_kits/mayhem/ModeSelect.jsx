// ui_kits/mayhem/ModeSelect.jsx — full-screen mode picker overlay.

function ModeSelect({ onPick, defaultMode = 'mayhem' }) {
  return (
    <div className="mode-select-overlay" onClick={(e) => e.target.classList.contains('mode-select-overlay') && null}>
      <div className="mode-select-card">
        <h2>Wähle deinen Modus</h2>
        <div className="mode-grid">
          <button className="mode-card" onClick={() => onPick('coaching')}>
            <div className="title">Coaching</div>
            <div className="sub">Systemische Aufstellung</div>
          </button>
          <button
            className={`mode-card mode-card-mayhem ${defaultMode === 'mayhem' ? 'mode-card-default' : ''}`}
            onClick={() => onPick('mayhem')}>
            <div className="title">
              🤸 Mayhem
              {defaultMode === 'mayhem' && <span className="badge">STANDARD</span>}
            </div>
            <div className="sub">3D Kampfmodus · Waffen · Fahrzeuge</div>
          </button>
        </div>
      </div>
    </div>
  );
}

window.ModeSelect = ModeSelect;
