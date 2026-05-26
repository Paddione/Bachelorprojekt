// admin/screens-live.jsx — Live admin sidebar (Match · Bots · Spieler · System)
//   + Bot card stack
//   + Handoff pass-token

function BotCardStack({ bots, onRemove, onSwap }) {
  // Up to 5 cards fanned out as a stack. Each card slightly offset + rotated.
  const visible = bots.slice(-5);
  const remaining = bots.length;
  return (
    <div className="bot-stack-wrap">
      <div className="bot-stack-info">
        <span>Bots auf dem Brett · <b>{remaining}</b> / 5</span>
        <span>{remaining === 0 ? '— leer —' : 'Top-Karte ist aktiv'}</span>
      </div>

      <div className="bot-stack">
        {remaining === 0 && <div className="ghost" style={{transform: 'translateX(-50%)'}}></div>}
        {visible.map((b, idx) => {
          const i = idx; // 0 = bottom of fan, last = top
          const total = visible.length;
          const offset = (i - (total - 1) / 2);
          const isTop = idx === total - 1;
          return (
            <div
              key={b.id}
              className="bot-card"
              style={{
                transform: `translateX(calc(-50% + ${offset * 10}px)) translateY(${(total - 1 - i) * 6}px) rotate(${offset * 2.4}deg)`,
                zIndex: idx + 1,
                opacity: 1 - (total - 1 - i) * 0.05,
              }}
            >
              <div className="top">
                <span className="kind">{b.kind}</span>
                <span className="id">{b.id}</span>
              </div>
              <div className="stars">
                {'★★★★★'.split('').map((c, j) => (
                  <span key={j} className={j < b.difficulty ? '' : 'off'}>{c}</span>
                ))}
              </div>
              <div className="load">
                <span>Nahkampf <span className="w">{b.melee}</span></span>
                <span>Fern <span className="w">{b.ranged}</span></span>
              </div>
              {isTop && (
                <div className="actions">
                  <button onClick={() => onSwap(b.id)}>Tausch</button>
                  <button onClick={() => onRemove(b.id)}>Despawn</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BotControls({ bots, setBots }) {
  const add = () => {
    if (bots.length >= 5) return;
    const next = [...bots, window.makeBot(bots.length + Math.floor(Math.random() * 20))];
    setBots(next);
  };
  const sub = () => {
    if (bots.length === 0) return;
    setBots(bots.slice(0, -1));
  };
  return (
    <div className="bot-controls">
      <div className="stepper">
        <button onClick={sub} disabled={bots.length === 0}>−</button>
        <div className="val">{bots.length}</div>
        <button onClick={add} disabled={bots.length >= 5}>+</button>
      </div>
      <button className="btn btn-ghost btn-sm" onClick={() => setBots([])}>Alle despawnen</button>
    </div>
  );
}

function HandoffBlock({ role, onHandoff, otherAdmins }) {
  if (role === 'solo') {
    return (
      <div className="handoff" style={{opacity: 0.55}}>
        <div className="handoff-token idle">i</div>
        <div className="text">
          Du bist <b>einziger Admin</b>. Sobald ein zweiter Spieler beitritt
          (mit Admin-Rolle), erscheint ein Übergabe-Token hier.
        </div>
      </div>
    );
  }
  if (role === 'readonly') {
    return (
      <div className="handoff" style={{opacity: 0.85}}>
        <div className="handoff-token" style={{filter: 'grayscale(0.6)'}}>—</div>
        <div className="text">
          Du bist <b>Co-Admin · Read-only</b>. {otherAdmins[0]} hält das Token
          und kann es dir freiwillig übergeben.
        </div>
      </div>
    );
  }
  return (
    <div className="handoff">
      <div className="handoff-token idle" title="Halte das Token · drag to hand off">P</div>
      <div className="text">
        Du hältst das <b>Admin-Token</b>. Übergib es an einen Co-Admin, dann
        kann er Modus, Bots, Reset auslösen.
        <div className="targets">
          {otherAdmins.map(a => (
            <button key={a} onClick={() => onHandoff(a)}>
              <span>An <b style={{color: 'var(--brass-hi)'}}>{a}</b> übergeben</span>
              <span className="arrow">→</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TabMatch({ state, set, role }) {
  const readonly = role === 'readonly';
  return (
    <>
      <div className="group">
        <div className="group-head">
          <h5>Modus</h5>
          <span className="meta">Im laufenden Match</span>
        </div>
        <div className={`mini-mode-list ${readonly ? 'is-ro' : ''}`}>
          {window.MODES.map(m => (
            <button
              key={m.id}
              className={state.mode === m.id ? 'active' : ''}
              onClick={() => !readonly && set.setMode(m.id)}
              disabled={readonly}
            >
              <span className="k">[{m.key}]</span>
              <span className="n">{m.name}</span>
              <span className="pick">Aktiv</span>
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Mayhem-Toggle</h5>
          <span className="meta">Über Mode-Switch hinaus</span>
        </div>
        <div
          className={`toggle-row ${state.mayhem ? 'mayhem-row' : ''}`}
          onClick={() => !readonly && set.setMayhem(!state.mayhem)}
          style={readonly ? {opacity: 0.5, pointerEvents: 'none'} : {}}
        >
          <div className="l">
            <span>Mayhem · Spawns aktiv</span>
            <span className="sub">{state.mayhem ? 'Wellen laufen · Drops aktiv' : 'Eingefroren · Warmup-Modus'}</span>
          </div>
          <span className={`toggle ${state.mayhem ? 'on' : ''}`}></span>
        </div>
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Aktionen</h5>
          <span className="meta">RTT &lt; 200ms</span>
        </div>
        <div className="action-row">
          <button className="action-tile" disabled={readonly} onClick={() => set.log('Runde zurückgesetzt')}>
            <span className="l">Runde</span>
            <span className="v">↻ Reset</span>
          </button>
          <button className="action-tile" disabled={readonly} onClick={() => set.log('Spawns zurückgesetzt')}>
            <span className="l">Spawns</span>
            <span className="v">⌖ Reset Positionen</span>
          </button>
          <button className="action-tile warn" disabled={readonly} onClick={() => set.log('Runde abgebrochen')}>
            <span className="l">Stop</span>
            <span className="v">⏹ Runde beenden</span>
          </button>
          <button className="action-tile" disabled={readonly} onClick={() => set.log('Pause')}>
            <span className="l">Pause</span>
            <span className="v">⏸ Spiel pausieren</span>
          </button>
        </div>
      </div>
    </>
  );
}

function TabBots({ state, set, role }) {
  const readonly = role === 'readonly';
  return (
    <>
      <div className="group">
        <div className="group-head">
          <h5>Bot-Stack</h5>
          <span className="meta">Karten-Stapel · Top = aktiv</span>
        </div>
        <BotCardStack
          bots={state.bots}
          onRemove={(id) => !readonly && set.setBots(state.bots.filter(b => b.id !== id))}
          onSwap={(id) => !readonly && set.log(`Bot ${id} loadout getauscht`)}
        />
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Steuerung</h5>
          <span className="meta">{state.bots.length} / 5</span>
        </div>
        <div style={readonly ? {opacity: 0.5, pointerEvents: 'none'} : {}}>
          <BotControls bots={state.bots} setBots={set.setBots} />
        </div>
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Bot-Typ wählen</h5>
          <span className="meta">Beim nächsten Spawn</span>
        </div>
        <div className="seg" style={readonly ? {opacity: 0.5, pointerEvents: 'none'} : {}}>
          {['Rogue', 'Tank', 'Warrior', 'Mage', 'Zombie'].map(k => (
            <button key={k} className={state.botKind === k ? 'active' : ''} onClick={() => set.setBotKind(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function TabPlayers({ state, set, role }) {
  const readonly = role === 'readonly';
  return (
    <>
      <div className="group">
        <div className="group-head">
          <h5>Live im Match</h5>
          <span className="meta">{state.players.length + state.bots.length} Total</span>
        </div>
        <div className="live-players">
          {state.players.map((p, i) => (
            <div key={i} className={`live-player ${p.you ? 'you' : ''}`}>
              <div className="av">{p.name.slice(0, 2).toUpperCase()}</div>
              <div className="meta">
                <span className="name">{p.name}</span>
                <span className="sub">{p.you ? 'Admin · Du' : (p.coadmin ? 'Co-Admin' : 'Spieler')} · {p.ping}ms</span>
              </div>
              <span className="kd">{p.kd}</span>
              {!p.you && !readonly && <button className="kick" onClick={() => set.log(`${p.name} gekickt`)}>Kick</button>}
            </div>
          ))}
          {state.bots.slice(0, 4).map(b => (
            <div key={b.id} className="live-player bot">
              <div className="av">B</div>
              <div className="meta">
                <span className="name">{b.kind} #{b.id.slice(-1)}</span>
                <span className="sub">Bot · ★{b.difficulty} · {b.melee}/{b.ranged}</span>
              </div>
              <span className="kd">0 / 0</span>
            </div>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Einladen</h5>
          <span className="meta">Code KRB-9A2</span>
        </div>
        <div className="invite-block" style={{padding: 12}}>
          <div className="invite-link">
            <div className="link">brett.dev/s/KRB-9A2</div>
            <button className="btn btn-mono btn-sm">⧉ Kopieren</button>
          </div>
          <div className="search">
            <span className="glyph">⌕</span>
            <input placeholder="Spieler suchen — Name oder Brett-ID" />
          </div>
        </div>
      </div>
    </>
  );
}

function TabSystem({ state, set, role, onHandoff }) {
  return (
    <>
      <div className="group">
        <div className="group-head">
          <h5>Admin-Übergabe</h5>
          <span className="meta">Pass-Token</span>
        </div>
        <HandoffBlock
          role={role}
          onHandoff={(target) => { set.log(`Admin-Token an ${target} übergeben`); onHandoff && onHandoff(target); }}
          otherAdmins={['Tina']}
        />
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Session</h5>
          <span className="meta">KRB-9A2 · 8m 12s</span>
        </div>
        <div className="log">
          {state.log.slice().reverse().slice(0, 12).map((e, i) => (
            <div key={i} className="entry">
              <span className="t">{e.t}</span>
              <span><b>{e.who}</b> · {e.msg}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="group">
        <div className="group-head">
          <h5>Verbindung</h5>
          <span className="meta">WS · stabil</span>
        </div>
        <div className="action-row">
          <div className="action-tile" style={{cursor: 'default'}}>
            <span className="l">Latenz</span>
            <span className="v">42 ms</span>
          </div>
          <div className="action-tile" style={{cursor: 'default'}}>
            <span className="l">Tickrate</span>
            <span className="v">60 / s</span>
          </div>
        </div>
      </div>
    </>
  );
}

function AdminSidebar({
  open, setOpen,
  position, // 'right' | 'left' | 'dock'
  state, set,
  role,
  onHandoff,
}) {
  const [tab, setTab] = React.useState('match');
  const tabComponent = { match: TabMatch, bots: TabBots, players: TabPlayers, system: TabSystem }[tab];

  return (
    <div className="admin-shell">
      <button
        className={`admin-toggle pos-${position}`}
        onClick={() => setOpen(!open)}
        title="Admin-Panel"
        style={open ? {opacity: 0, pointerEvents: 'none', transform: position === 'dock' ? 'translateX(-50%) scale(0.8)' : 'scale(0.8)'} : {}}
      >
        <span className="glyph">⚙</span>
        <span className="pulse"></span>
        <span className="role-tag">{role === 'solo' ? 'Admin' : role === 'readonly' ? 'Co · RO' : 'Co · Admin'}</span>
      </button>

      <div className={`admin-sidebar pos-${position} ${open ? '' : 'closed'}`}>
        <div className="admin-head">
          <div className="id">
            <span className="label">Session</span>
            <span className="code">KRB-9A2</span>
          </div>
          <span className={`role-chip ${role === 'readonly' ? 'readonly' : (role === 'coadmin' ? 'coadmin' : '')}`}>
            {role === 'solo' ? 'Admin · paddione' : role === 'readonly' ? 'Co · Read-only' : 'Co · Admin'}
          </span>
          <button className="close" onClick={() => setOpen(false)} aria-label="schließen">✕</button>
        </div>

        <div className="admin-tabs">
          {['match', 'bots', 'spieler', 'system'].map(t => {
            const id = t === 'spieler' ? 'players' : t;
            const label = t.charAt(0).toUpperCase() + t.slice(1);
            const count = id === 'bots' ? state.bots.length : (id === 'players' ? state.players.length : null);
            return (
              <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
                {label}{count != null ? <span className="count">· {count}</span> : null}
              </button>
            );
          })}
        </div>

        <div className="admin-body">
          {React.createElement(tabComponent, { state, set, role, onHandoff })}
        </div>
      </div>
    </div>
  );
}

window.AdminSidebar = AdminSidebar;
Object.assign(window, { TabMatch, TabBots, TabPlayers, TabSystem, BotCardStack, HandoffBlock });
