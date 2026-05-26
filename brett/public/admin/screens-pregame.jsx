// admin/screens-pregame.jsx — Login + Lobby home screens.

function LoginCard({ onLogin }) {
  const [user, setUser] = React.useState('paddione');
  const isAdmin = user.trim().toLowerCase() === 'paddione';
  return (
    <div className="login-stage">
      <div className="login-card">
        <div className="login-mark">&lt;</div>
        <h1>Brett <em>—</em> Anmeldung</h1>
        <p className="login-sub">Systemisches Brett · dev.korczewski.de</p>

        <form className="login-form" onSubmit={(e) => { e.preventDefault(); onLogin(user); }}>
          <div className="field">
            <label>Username</label>
            <div className="input user-with-badge">
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                autoFocus
                spellCheck="false"
              />
              {isAdmin && <span className="admin-badge">Admin</span>}
            </div>
          </div>
          <div className="field">
            <label>Passwort</label>
            <input type="password" className="input" defaultValue="••••••••••••" readOnly />
          </div>
          <div className="login-footer">
            <button type="submit" className="btn btn-primary">Einloggen</button>
            <button type="button" className="btn btn-ghost btn-sm">Magic-Link</button>
            <span className="hint">↵ zum Bestätigen</span>
          </div>
        </form>
      </div>
    </div>
  );
}

function LobbyHome({ user, onCreateSession }) {
  const openSessions = [
    { code: 'KRB-9A2', host: 'Tina',     mode: 'Mayhem',     players: '3 / 8',  live: true },
    { code: 'PWL-44X', host: 'Martina',  mode: 'LMS',        players: '2 / 6',  live: true },
    { code: 'ZTV-7Q1', host: 'Oskar',    mode: 'Duel',       players: '1 / 2',  live: false },
    { code: 'JMD-018', host: 'Helene',   mode: 'Coaching',   players: '4 / 4',  live: false },
  ];
  const leaderboard = [
    { name: 'Tina',     score: '14 / 2 K' },
    { name: 'Martina',  score: '9 / 5 K' },
    { name: 'Oskar',    score: '7 / 6 K' },
    { name: 'paddione', score: '4 / 3 K', you: true },
  ];
  return (
    <div className="lobby-stage lobby-grain">
      <div className="lobby-inner">
        <div className="lobby-head">
          <span className="num">[ 01 ]</span>
          <div>
            <span className="eyebrow-mono">Lobby · Übersicht</span>
            <h1>Willkommen, <em>{user}</em>.</h1>
          </div>
          <div className="meta">
            <span><span className="dot"></span>4 Sessions live · 12 Spieler online</span>
            <span style={{color: 'var(--brass-game)'}}>● Admin</span>
          </div>
        </div>

        <div className="lobby-grid">
          {/* Featured: Mayhem-Session erstellen */}
          <div className="lobby-card featured" style={{gridColumn: '1 / -1'}}>
            <div className="card-head">
              <h3>Eigene Session — <em style={{color: 'var(--brass-hi)', fontStyle: 'italic'}}>Mayhem</em>, dein Brett.</h3>
              <span className="card-meta">[ Admin · paddione ]</span>
            </div>
            <div className="feature-cta">
              <div className="blurb">
                Erstelle eine neue Session und bekomme das Brett für dich.
                Wähle <em>Modus</em>, füge <em>Bots</em> hinzu, lade Spieler ein —
                und starte, sobald die Aufstellung steht.
              </div>
              <button className="btn btn-primary start-match-cta" onClick={() => {
                if (window.__brettSendFn) window.__brettSendFn({ type: 'admin_session_create' });
                onCreateSession();
              }}>
                Mayhem-Session erstellen
                <span style={{marginLeft: 6}}>→</span>
              </button>
            </div>
          </div>

          <div className="lobby-card">
            <div className="card-head">
              <h3>Offene Sessions</h3>
              <span className="card-meta">[ 02 · {openSessions.length} aktiv ]</span>
            </div>
            <div className="sessions-list">
              {openSessions.map((s, i) => (
                <div key={i} className={`session-row ${s.live ? 'live' : ''}`}>
                  <span className="code">{s.code}</span>
                  <span>{s.host}</span>
                  <span className="mode-pill">{s.mode}</span>
                  <span className="players">{s.players}</span>
                  <button className="btn btn-ghost btn-sm">Beitreten</button>
                </div>
              ))}
            </div>
          </div>

          <div className="lobby-card leaderboard">
            <div className="card-head">
              <h3>Bestenliste</h3>
              <span className="card-meta">[ 03 · Diese Woche ]</span>
            </div>
            <ol>
              {leaderboard.map((p, i) => (
                <li key={i} className={p.you ? 'you' : ''}>
                  <span className="rank">{String(i + 1).padStart(2, '0')}</span>
                  <span className="name">{p.name}</span>
                  <span className="score">{p.score}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

window.LoginCard = LoginCard;
window.LobbyHome = LobbyHome;
