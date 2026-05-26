// admin/screens-setup.jsx — Setup screen (Mayhem-Session erstellen).
// Floats over the live warmup scene; can be hidden so the user can still play warmup.

const MODES = [
  { id: 'mayhem',     key: 'M', name: 'Mayhem',     desc: 'Free-for-all · Waffen · Fahrzeuge' },
  { id: 'lms',        key: 'L', name: 'LMS',        desc: 'Last Man Standing · 1 Leben' },
  { id: 'duel',       key: 'D', name: 'Duel',       desc: '1 vs 1 · Best-of' },
  { id: 'deathmatch', key: 'T', name: 'Deathmatch', desc: 'Frags zählen · Zeitlimit' },
  { id: 'coaching',   key: 'C', name: 'Coaching',   desc: 'Aufstellung · ohne Kampf' },
];

const MAPS = [
  { id: 'arena',  name: 'Arena',  meta: '32 × 32 · 8 Spawns' },
  { id: 'docks',  name: 'Docks',  meta: '48 × 24 · 6 Spawns' },
  { id: 'stille', name: 'Stille', meta: '24 × 24 · 4 Spawns' },
];

const BOT_KINDS = ['Rogue', 'Tank', 'Warrior', 'Mage', 'Zombie'];
const BOT_WEAPONS = ['rifle', 'club', 'katana', 'handgun', 'fireball'];

function makeBot(i) {
  const kind = BOT_KINDS[i % BOT_KINDS.length];
  return {
    id: `B-${String(i + 1).padStart(3, '0')}`,
    kind,
    difficulty: ((i * 2) % 5) + 1, // 1..5
    melee: BOT_WEAPONS[(i + 2) % BOT_WEAPONS.length],
    ranged: BOT_WEAPONS[(i + 1) % BOT_WEAPONS.length],
  };
}

function ModePicker({ mode, onChange }) {
  return (
    <div className="mode-row">
      {MODES.map(m => (
        <button
          key={m.id}
          type="button"
          className={`mode-tile ${mode === m.id ? 'active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          <span className="key">[{m.key}] {m.id}</span>
          <span className="name">{m.name}</span>
          <span className="desc">{m.desc}</span>
        </button>
      ))}
    </div>
  );
}

function MapPicker({ map, onChange }) {
  return (
    <div className="map-row">
      {MAPS.map(m => (
        <button
          key={m.id}
          type="button"
          className={`map-tile ${map === m.id ? 'active' : ''}`}
          onClick={() => onChange(m.id)}
        >
          <MapSketch id={m.id} />
          <div className="map-meta">
            <span className="map-name">{m.name}</span>
            <small>{m.meta}</small>
          </div>
        </button>
      ))}
    </div>
  );
}

function MapSketch({ id }) {
  // Tiny iso schematic — three different floorplans
  if (id === 'arena') return (
    <svg viewBox="0 0 200 88">
      <g stroke="var(--brass-mute)" strokeWidth="1" fill="none">
        <path d="M100 12 L180 44 L100 76 L20 44 Z" />
        <path d="M100 28 L160 44 L100 60 L40 44 Z" />
        <circle cx="100" cy="44" r="3" fill="var(--brass-game)" />
        <circle cx="60" cy="32" r="2" fill="var(--brass-game)" />
        <circle cx="140" cy="32" r="2" fill="var(--brass-game)" />
        <circle cx="60" cy="56" r="2" fill="var(--brass-game)" />
        <circle cx="140" cy="56" r="2" fill="var(--brass-game)" />
      </g>
    </svg>
  );
  if (id === 'docks') return (
    <svg viewBox="0 0 200 88">
      <g stroke="var(--brass-mute)" strokeWidth="1" fill="none">
        <path d="M20 24 L180 24 L160 64 L40 64 Z" />
        <path d="M40 24 L40 64 M80 24 L80 64 M120 24 L120 64 M160 24 L160 64" opacity="0.55" />
        <circle cx="60" cy="44" r="2" fill="var(--brass-game)" />
        <circle cx="100" cy="44" r="2" fill="var(--brass-game)" />
        <circle cx="140" cy="44" r="2" fill="var(--brass-game)" />
      </g>
    </svg>
  );
  return (
    <svg viewBox="0 0 200 88">
      <g stroke="var(--brass-mute)" strokeWidth="1" fill="none">
        <rect x="60" y="20" width="80" height="48" />
        <rect x="80" y="32" width="40" height="24" />
        <circle cx="80" cy="44" r="2" fill="var(--brass-game)" />
        <circle cx="120" cy="44" r="2" fill="var(--brass-game)" />
      </g>
    </svg>
  );
}

function PlayerSlots({ slots, onRemove }) {
  return (
    <div className="player-slots">
      {slots.map((s, i) => {
        if (!s) {
          return (
            <div key={i} className="slot-card empty">
              <div className="avatar">＋</div>
              <div className="who">leer · einladen</div>
              <button className="x" aria-label="leer">·</button>
            </div>
          );
        }
        const cls = s.kind === 'bot' ? 'bot' : (s.you ? 'you' : 'filled');
        const init = s.kind === 'bot' ? 'B' : s.name.slice(0, 2).toUpperCase();
        return (
          <div key={i} className={`slot-card ${cls}`}>
            <div className="avatar">{init}</div>
            <div className="who">
              {s.kind === 'bot' ? `${s.label}` : s.name}
              <small>{s.kind === 'bot' ? `Bot · ★${s.difficulty}` : (s.you ? 'Admin · Du' : 'Spieler')}</small>
            </div>
            <button className="x" onClick={() => onRemove(i)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

function SetupScreen({
  hidden, setHidden,
  mode, setMode,
  map, setMap,
  bots, setBots,
  user,
  onStart,
  onCancel,
}) {
  // Build the slot grid: 1 admin + bots + empty
  const slots = React.useMemo(() => {
    const arr = [];
    arr.push({ kind: 'human', name: user, you: true });
    bots.forEach((b, i) => arr.push({ kind: 'bot', label: `${b.kind} #${i + 1}`, difficulty: b.difficulty, id: b.id }));
    while (arr.length < 6) arr.push(null);
    return arr.slice(0, 6);
  }, [bots, user]);

  const removeSlot = (i) => {
    const slot = slots[i];
    if (!slot || slot.kind !== 'bot') return;
    const botIdx = bots.findIndex(b => b.id === slot.id);
    if (botIdx >= 0) {
      const next = bots.slice(); next.splice(botIdx, 1); setBots(next);
    }
  };

  const inviteLink = 'brett.dev/s/KRB-9A2';

  return (
    <>
      {hidden && (
        <>
          <div className="warmup-banner">
            <span className="dot"></span>
            <span>Setup ausgeblendet · Warmup läuft</span>
          </div>
          <button className="setup-reveal" onClick={() => setHidden(false)}>
            ◇ Setup einblenden
          </button>
        </>
      )}

      <div className={`setup-overlay ${hidden ? 'hidden' : ''}`}>
        <div className="setup-scrim" onClick={() => setHidden(true)}></div>
        <div className="setup-panel">
          <aside className="setup-side">
            <div>
              <div className="num">[ 02 ] PRE-GAME</div>
              <h2>Neue <em>Mayhem</em>-Session.</h2>
              <p style={{color: 'var(--mute)', fontSize: 13, marginTop: 12, lineHeight: 1.55}}>
                Stell die Runde ein, lade Spieler ein, oder spiele bis dahin im Warmup.
                Du kannst dieses Fenster jederzeit ausblenden.
              </p>
            </div>
            <div className="summary">
              <div className="row"><span>Modus</span><b>{mode.toUpperCase()}</b></div>
              <div className="row"><span>Karte</span><b>{map}</b></div>
              <div className="row"><span>Bots</span><b>{bots.length}</b></div>
              <div className="row"><span>Spieler</span><b>1 + {bots.length}</b></div>
              <div className="row"><span>Code</span><b>KRB-9A2</b></div>
            </div>
          </aside>

          <div className="setup-body">
            <section>
              <div className="setup-h">
                <span className="n">[ 01 ]</span>
                <h4>Modus</h4>
                <span className="hint">Wähle eine Spielart</span>
              </div>
              <ModePicker mode={mode} onChange={setMode} />
            </section>

            <section>
              <div className="setup-h">
                <span className="n">[ 02 ]</span>
                <h4>Karte</h4>
                <span className="hint">{MAPS.find(m => m.id === map)?.meta}</span>
              </div>
              <MapPicker map={map} onChange={setMap} />
            </section>

            <section>
              <div className="setup-h">
                <span className="n">[ 03 ]</span>
                <h4>Bots &amp; Aufstellung</h4>
                <span className="hint">{bots.length} Bot{bots.length !== 1 ? 's' : ''} · 6 Slots</span>
              </div>
              <PlayerSlots slots={slots} onRemove={removeSlot} />
              <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBots([...bots, makeBot(bots.length)])}
                  disabled={bots.length >= 5}
                >
                  ＋ Bot hinzufügen
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setBots([])}
                  disabled={bots.length === 0}
                >
                  Bots leeren
                </button>
              </div>
            </section>

            <section>
              <div className="setup-h">
                <span className="n">[ 04 ]</span>
                <h4>Spieler einladen</h4>
                <span className="hint">Link · Code · Suche</span>
              </div>
              <div className="invite-block">
                <div className="invite-link">
                  <div className="link">{inviteLink}</div>
                  <button className="btn btn-mono btn-sm">Kopieren</button>
                </div>
                <div className="code-row">
                  {'KRB9A2'.split('').map((c, i) => (
                    <div key={i} className="code-cell">{c}</div>
                  ))}
                </div>
                <div className="friends">
                  <div className="friend">
                    <div className="av">TI</div>
                    <span>Tina</span>
                    <span className="status online">online · in KRB-9A2</span>
                    <button>Einladen</button>
                  </div>
                  <div className="friend">
                    <div className="av">MA</div>
                    <span>Martina</span>
                    <span className="status online">online</span>
                    <button>Einladen</button>
                  </div>
                  <div className="friend">
                    <div className="av">OS</div>
                    <span>Oskar</span>
                    <span className="status">offline · 2h</span>
                    <button>Einladen</button>
                  </div>
                </div>
                <div className="search">
                  <span className="glyph">⌕</span>
                  <input placeholder="Spieler suchen — Name oder Brett-ID" />
                </div>
              </div>
            </section>
          </div>

          <footer className="setup-footer">
            <label
              className={`warmup-toggle ${hidden ? 'on' : ''}`}
              onClick={() => setHidden(!hidden)}
            >
              <span className="pill"></span>
              <span>{hidden ? 'Setup ausgeblendet · spiele Warmup' : 'Setup ausblenden für Warmup'}</span>
            </label>
            <div className="spacer"></div>
            <button className="btn btn-ghost" onClick={onCancel}>Abbrechen</button>
            <button className="btn btn-primary" onClick={onStart}>
              Spiel starten <span style={{marginLeft: 6}}>→</span>
            </button>
          </footer>
        </div>
      </div>
    </>
  );
}

window.SetupScreen = SetupScreen;
window.makeBot = makeBot;
window.MODES = MODES;
window.MAPS = MAPS;
