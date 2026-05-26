// ui_kits/mayhem/Scoreboard.jsx — top-right scoreboard panel.

function Scoreboard({ players }) {
  return (
    <div className="score-board">
      <div className="score-head">
        <span className="sb-label">SCORE</span>
        <span className="sb-count">{players.length} / 4</span>
      </div>
      {players.map((p, i) => (
        <div className={`score-row ${i === 0 ? 'leading' : ''}`} key={p.name}>
          <span className="name">{p.name}</span>
          <span className="kills">{p.kills}</span>
        </div>
      ))}
    </div>
  );
}

window.Scoreboard = Scoreboard;
