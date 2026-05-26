// ui_kits/mayhem/CoopHUD.jsx — co-op wave bar at top-center with optional boss-HP.

function CoopHUD({ wave = 1, totalWaves = 10, enemies = 0, progress = 0, bossHp = null, onTriggerDeath }) {
  return (
    <div className="coop-hud">
      <div className="coop-top">
        <span className="coop-label">CO-OP</span>
        <span className="coop-wave">WELLE {wave} / {totalWaves}</span>
        <span className="coop-enemies">Feinde: <strong>{enemies}</strong></span>
      </div>
      <div className="coop-bar"><div className="coop-fill" style={{ width: `${progress}%` }} /></div>
      {bossHp != null && (
        <div className="boss-wrap">
          <div className="boss-label">⚠ BOSS HP</div>
          <div className="boss-bar"><div className="boss-fill" style={{ width: `${bossHp}%` }} /></div>
        </div>
      )}
      {onTriggerDeath && (
        <button className="coop-debug" onClick={onTriggerDeath}>Tod simulieren</button>
      )}
    </div>
  );
}

window.CoopHUD = CoopHUD;
