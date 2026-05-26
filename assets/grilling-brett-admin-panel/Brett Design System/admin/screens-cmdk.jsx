// admin/screens-cmdk.jsx — Command Palette ⌘K + Mobile bottom-sheet variant.

function CommandPalette({ open, onClose, state, set, role }) {
  const [q, setQ] = React.useState('');
  const [sel, setSel] = React.useState(0);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ(''); setSel(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  const allCmds = React.useMemo(() => {
    const log = (msg) => set.log(msg);
    const out = [
      // Match
      { group: 'Match', ic: 'M', label: 'Runde zurücksetzen', sub: 'Spawns + Score', kbd: ['⌘', 'R'], do: () => log('Runde zurückgesetzt') },
      { group: 'Match', ic: '⏸', label: 'Spiel pausieren', sub: 'Alle Spieler frieren ein', kbd: ['␣'], do: () => log('Pause') },
      { group: 'Match', ic: '⏹', label: 'Runde beenden', sub: 'Zurück in den Setup', kbd: ['⌘', '.'], do: () => log('Runde beendet') },
      { group: 'Match', ic: 'm', label: 'Mayhem an / aus', sub: state.mayhem ? 'Aktuell: an' : 'Aktuell: aus', do: () => { set.setMayhem(!state.mayhem); log(`Mayhem ${!state.mayhem ? 'an' : 'aus'}`); } },
      // Modes
      ...window.MODES.map(m => ({
        group: 'Modus', ic: m.key, label: `Modus → ${m.name}`, sub: m.desc, kbd: [m.key],
        do: () => { set.setMode(m.id); log(`Modus → ${m.name}`); }
      })),
      // Bots
      { group: 'Bots', ic: '+', label: 'Bot hinzufügen', sub: `Aktuell: ${state.bots.length} / 5`, kbd: ['B'], do: () => { if (state.bots.length < 5) set.setBots([...state.bots, window.makeBot(state.bots.length)]); log('Bot gespawnt'); } },
      { group: 'Bots', ic: '−', label: 'Letzten Bot despawnen', sub: state.bots.length > 0 ? state.bots[state.bots.length-1].id : 'keine Bots', kbd: ['⇧', 'B'], do: () => { if (state.bots.length > 0) set.setBots(state.bots.slice(0, -1)); log('Bot despawnt'); } },
      { group: 'Bots', ic: '✕', label: 'Alle Bots despawnen', sub: `${state.bots.length} Bots betroffen`, do: () => { set.setBots([]); log('Alle Bots despawnt'); } },
      // Players
      { group: 'Spieler', ic: '⧉', label: 'Invite-Link kopieren', sub: 'brett.dev/s/KRB-9A2', kbd: ['⌘', 'C'], do: () => log('Invite-Link kopiert') },
      { group: 'Spieler', ic: '⌕', label: 'Spieler suchen — Tina', sub: 'online · in KRB-9A2', do: () => log('Tina eingeladen') },
      { group: 'Spieler', ic: '⌕', label: 'Spieler suchen — Martina', sub: 'online', do: () => log('Martina eingeladen') },
      // System
      { group: 'System', ic: '↻', label: 'Admin-Token an Tina übergeben', sub: 'Co-Admin · Read-only → Admin', do: () => log('Token an Tina übergeben') },
      { group: 'System', ic: 'q', label: 'Session beenden', sub: 'Brett zurück in die Lobby', do: () => log('Session beendet') },
    ];
    return out;
  }, [state, set]);

  const filtered = React.useMemo(() => {
    if (!q) return allCmds;
    const t = q.toLowerCase();
    return allCmds.filter(c => c.label.toLowerCase().includes(t) || c.sub.toLowerCase().includes(t) || c.group.toLowerCase().includes(t));
  }, [q, allCmds]);

  React.useEffect(() => { setSel(0); }, [q]);

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      const cmd = filtered[sel];
      if (cmd) { cmd.do(); onClose(); }
    }
  };

  if (!open) return null;

  // Group by group
  const grouped = {};
  filtered.forEach((c, i) => { (grouped[c.group] ||= []).push({ ...c, _i: i }); });

  return (
    <div className="cmdk-scrim" onClick={onClose}>
      <div className="cmdk" onClick={(e) => e.stopPropagation()}>
        <div className="cmdk-input">
          <span className="glyph">⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Suchen oder Befehl — Modus, Bot, Spieler …"
          />
          <span className="esc">Esc</span>
        </div>
        <div className="cmdk-list">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div className="cmdk-group">{group}</div>
              {items.map((it) => (
                <div
                  key={it._i}
                  className={`cmdk-item ${it._i === sel ? 'sel' : ''}`}
                  onMouseEnter={() => setSel(it._i)}
                  onClick={() => { it.do(); onClose(); }}
                >
                  <span className="ic">{it.ic}</span>
                  <div>
                    <div>{it.label}</div>
                    <div className="sub">{it.sub}</div>
                  </div>
                  <div className="kbd-row">
                    {(it.kbd || []).map((k, ki) => <span key={ki} className="kbd">{k}</span>)}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {filtered.length === 0 && (
            <div style={{padding: '24px 18px', textAlign: 'center', color: 'var(--mute)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase'}}>
              Kein Befehl gefunden
            </div>
          )}
        </div>
        <div className="cmdk-foot">
          <span><span className="kbd">↑</span> <span className="kbd">↓</span> Navigation</span>
          <span><span className="kbd">↵</span> Ausführen</span>
          <span><span className="kbd">Esc</span> Schließen</span>
        </div>
      </div>
    </div>
  );
}

// ─── Mobile bottom-sheet (in a phone rig)
function MobileBottomSheet({ state, set, role }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [tab, setTab] = React.useState('match');
  const tabs = ['match', 'bots', 'spieler', 'system'];

  return (
    <div className="phone-rig">
      <div className="phone-notch"></div>
      <div className="phone-status">
        <span>09:41</span>
        <span>● ●● ●●●</span>
      </div>
      <div className="phone-scene">
        <MayhemScene variant="combat" />
      </div>

      <button className="phone-toggle" onClick={() => setCollapsed(!collapsed)}>
        <span style={{fontFamily: 'var(--font-serif)', fontSize: 22, color: 'var(--brass-hi)'}}>⚙</span>
      </button>

      <div className={`phone-sheet ${collapsed ? 'collapsed' : ''}`} onClick={() => collapsed && setCollapsed(false)}>
        <div className="grabber"></div>
        <div className="ph-tabs">
          {tabs.map(t => {
            const id = t === 'spieler' ? 'players' : t;
            const label = t.charAt(0).toUpperCase() + t.slice(1);
            return (
              <button key={id} className={tab === id ? 'active' : ''} onClick={(e) => { e.stopPropagation(); setTab(id); }}>
                {label}
              </button>
            );
          })}
        </div>
        <div className="ph-content">
          {tab === 'match' && <window.TabMatch state={state} set={set} role={role} />}
          {tab === 'bots'  && <window.TabBots state={state} set={set} role={role} />}
          {tab === 'players' && <window.TabPlayers state={state} set={set} role={role} />}
          {tab === 'system' && <window.TabSystem state={state} set={set} role={role} />}
        </div>
      </div>
    </div>
  );
}

window.CommandPalette = CommandPalette;
window.MobileBottomSheet = MobileBottomSheet;
