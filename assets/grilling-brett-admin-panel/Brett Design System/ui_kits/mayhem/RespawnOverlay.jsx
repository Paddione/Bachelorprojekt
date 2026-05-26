// ui_kits/mayhem/RespawnOverlay.jsx — death overlay with countdown.

function RespawnOverlay({ countdown, onCancel }) {
  if (countdown == null) return null;
  return (
    <div className="respawn-overlay">
      <div className="respawn-card">
        <div className="msg">Gefallen — Respawn in</div>
        <div className="countdown">{countdown}</div>
        {onCancel && <button className="respawn-cancel" onClick={onCancel}>Aussteigen</button>}
      </div>
    </div>
  );
}

window.RespawnOverlay = RespawnOverlay;
