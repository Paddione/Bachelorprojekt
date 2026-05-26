// admin/App.jsx — Brett Admin Panel · main orchestrator.
// Phases: login → lobby → setup → live
// Reads tweaks: position (right/left/dock), mode, bots, role, scene

const { useState, useEffect, useMemo, useRef } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "position": "right",
  "mode": "mayhem",
  "botCount": 3,
  "role": "solo",
  "scene": "combat",
  "sidebarStyle": "tabs",
  "startPhase": "live"
}/*EDITMODE-END*/;

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => { window.__setTweak = setTweak; }, [setTweak]);

  // ── phase state
  const [phase, setPhase] = useState(tweaks.startPhase || 'login'); // login | lobby | setup | live
  const [user, setUser]   = useState('paddione');

  // ── live state (shared across screens)
  const [bots, setBots]       = useState([]);
  const [mode, setMode]       = useState(tweaks.mode || 'mayhem');
  const [map, setMap]         = useState('arena');
  const [mayhem, setMayhem]   = useState(true);
  const [botKind, setBotKind] = useState('Rogue');
  const [setupHidden, setSetupHidden] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const [log, setLog] = useState([
    { t: '08:12', who: 'paddione', msg: 'Session erstellt' },
    { t: '08:12', who: 'system',   msg: 'KRB-9A2 vergeben' },
  ]);

  // Players (mocked)
  const players = [
    { name: 'paddione', you: true,  ping: 14, kd: '4 / 3' },
    { name: 'Tina',     coadmin: true, ping: 38, kd: '12 / 4' },
    { name: 'Martina',  ping: 52, kd: '7 / 5' },
  ];

  // ── react to tweaks
  useEffect(() => { setMode(tweaks.mode); }, [tweaks.mode]);
  useEffect(() => {
    // populate bots from tweak count (only when count differs)
    const target = tweaks.botCount;
    if (bots.length !== target) {
      const next = Array.from({ length: target }, (_, i) => window.makeBot(i));
      setBots(next);
    }
  }, [tweaks.botCount]);
  useEffect(() => {
    if (phase === 'login' && tweaks.startPhase !== 'login') setPhase(tweaks.startPhase);
  }, [tweaks.startPhase]);

  // ── ⌘K listener
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (phase === 'live') setCmdkOpen(o => !o);
      }
      if (e.key === 'Escape' && cmdkOpen) setCmdkOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cmdkOpen]);

  const logFn = (msg) => {
    const t = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    setLog(prev => [...prev, { t, who: user, msg }]);
  };

  const state = { bots, mode, map, mayhem, botKind, players, log };
  const set = {
    setBots, setMode, setMap, setMayhem, setBotKind, log: logFn,
  };

  // ── render shell
  const isMobile = tweaks.position === 'mobile';

  return (
    <>
      {/* dev-strip · phase scrubber so the user can navigate the flow */}
      <DevStrip phase={phase} setPhase={setPhase} user={user} setTweak={setTweak} cmdkOpen={cmdkOpen} setCmdkOpen={setCmdkOpen} />

      <div className="phase-body">
        {/* The scene under the overlay (visible from setup onwards) */}
        {(phase === 'setup' || phase === 'live') && !isMobile && (
          <MayhemScene variant={tweaks.scene || 'combat'} />
        )}

        {phase === 'login' && (
          <LoginCard onLogin={(u) => { setUser(u); setPhase('lobby'); }} />
        )}

        {phase === 'lobby' && (
          <LobbyHome user={user} onCreateSession={() => setPhase('setup')} />
        )}

        {phase === 'setup' && (
          <SetupScreen
            hidden={setupHidden}
            setHidden={setSetupHidden}
            mode={mode} setMode={setMode}
            map={map} setMap={setMap}
            bots={bots} setBots={setBots}
            user={user}
            onStart={() => { setPhase('live'); logFn('Spiel gestartet'); }}
            onCancel={() => setPhase('lobby')}
          />
        )}

        {phase === 'live' && !isMobile && (
          <>
            {tweaks.sidebarStyle === 'cmdk-only' ? (
              <FloatingCmdkHint open={cmdkOpen} setOpen={setCmdkOpen} position={tweaks.position} />
            ) : (
              <AdminSidebar
                open={sidebarOpen}
                setOpen={setSidebarOpen}
                position={tweaks.position}
                state={state} set={set}
                role={tweaks.role}
                onHandoff={(target) => setTweak('role', 'readonly')}
              />
            )}
            <CommandPalette open={cmdkOpen} onClose={() => setCmdkOpen(false)} state={state} set={set} role={tweaks.role} />
          </>
        )}

        {phase === 'live' && isMobile && (
          <MobileBottomSheet state={state} set={set} role={tweaks.role} />
        )}
      </div>

      {/* Tweaks panel · custom */}
      <BrettTweaks tweaks={tweaks} setTweak={setTweak} />
    </>
  );
}

// ── Tiny floating ⌘K hint when in cmdk-only mode (no sidebar)
function FloatingCmdkHint({ open, setOpen, position }) {
  const pos = position === 'left' ? { left: 16 } : position === 'dock' ? { left: '50%', transform: 'translateX(-50%)' } : { right: 16 };
  return (
    <button
      onClick={() => setOpen(true)}
      style={{
        position: 'fixed',
        top: 'auto', bottom: 16,
        ...pos,
        background: 'var(--ink-800)',
        border: '1px solid var(--brass-mute)',
        color: 'var(--brass-hi)',
        borderRadius: 999,
        padding: '8px 16px',
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-2)',
        display: 'inline-flex',
        gap: 10,
        alignItems: 'center',
        zIndex: 60,
      }}
    >
      <span style={{fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 14, textTransform: 'none', letterSpacing: 0, color: 'var(--brass-game)'}}>Admin</span>
      <span className="kbd">⌘</span><span className="kbd">K</span>
    </button>
  );
}

function DevStrip({ phase, setPhase, user, setTweak, cmdkOpen, setCmdkOpen }) {
  const steps = [
    { id: 'login', label: '01 · Login' },
    { id: 'lobby', label: '02 · Lobby' },
    { id: 'setup', label: '03 · Setup' },
    { id: 'live',  label: '04 · Live' },
  ];
  return (
    <div className="dev-strip">
      <span className="brand-mark">Brett<span style={{color:'var(--brass-hi)'}}>.</span></span>
      <div className="dev-step">
        {steps.map((s, i) => (
          <React.Fragment key={s.id}>
            <button className={phase === s.id ? 'active' : ''} onClick={() => setPhase(s.id)}>{s.label}</button>
            {i < steps.length - 1 && <span className="sep">·</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="dev-meta">
        {phase === 'live' && (
          <button
            onClick={() => setCmdkOpen(!cmdkOpen)}
            style={{
              background: 'transparent', border: '1px solid var(--line)',
              color: 'var(--brass-game)', fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.14em', padding: '3px 8px', borderRadius: 3,
              cursor: 'pointer', marginRight: 12,
            }}
          >⌘K · Palette</button>
        )}
        Build 2026-05-26 · paddione@dev
      </div>
    </div>
  );
}

// ── Custom Tweaks panel (uses starter helpers)
function BrettTweaks({ tweaks, setTweak }) {
  return (
    <TweaksPanel title="Tweaks · Brett Admin">
      <TweakSection label="Position">
        <TweakRadio
          label="Layout"
          value={tweaks.position}
          onChange={(v) => setTweak('position', v)}
          options={[
            { value: 'right',  label: 'Rechts' },
            { value: 'left',   label: 'Links' },
            { value: 'dock',   label: 'Unten' },
            { value: 'mobile', label: 'Mobile' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Sidebar-Stil">
        <TweakRadio
          label="Modus"
          value={tweaks.sidebarStyle}
          onChange={(v) => setTweak('sidebarStyle', v)}
          options={[
            { value: 'tabs',       label: 'Tabs' },
            { value: 'cmdk-only',  label: '⌘K' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Live-Modus">
        <TweakSelect
          label="Mode"
          value={tweaks.mode}
          onChange={(v) => setTweak('mode', v)}
          options={[
            { value: 'mayhem',     label: 'Mayhem' },
            { value: 'lms',        label: 'LMS' },
            { value: 'duel',       label: 'Duel' },
            { value: 'deathmatch', label: 'Deathmatch' },
            { value: 'coaching',   label: 'Coaching' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Bots">
        <TweakSlider
          label="Anzahl"
          value={tweaks.botCount}
          onChange={(v) => setTweak('botCount', v)}
          min={0} max={5} step={1}
        />
      </TweakSection>

      <TweakSection label="Admin-Rolle">
        <TweakSelect
          label="Rolle"
          value={tweaks.role}
          onChange={(v) => setTweak('role', v)}
          options={[
            { value: 'solo',     label: 'Solo-Admin (hält Token)' },
            { value: 'readonly', label: 'Co-Admin · Read-only' },
            { value: 'coadmin',  label: 'Co-Admin (nach Handoff)' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Scene">
        <TweakRadio
          label="Hintergrund"
          value={tweaks.scene}
          onChange={(v) => setTweak('scene', v)}
          options={[
            { value: 'combat',   label: 'Mayhem' },
            { value: 'warmup',   label: 'Warmup' },
            { value: 'coaching', label: 'Coaching' },
          ]}
        />
      </TweakSection>

      <TweakSection label="Phase">
        <TweakSelect
          label="Springen zu"
          value={tweaks.startPhase}
          onChange={(v) => setTweak('startPhase', v)}
          options={[
            { value: 'login', label: '01 · Login' },
            { value: 'lobby', label: '02 · Lobby' },
            { value: 'setup', label: '03 · Setup' },
            { value: 'live',  label: '04 · Live' },
          ]}
        />
      </TweakSection>
    </TweaksPanel>
  );
}

// Brett mount API — replaces vanilla admin-panel.js
const __brettAdminState = {
  root: null,
  appRef: null,
  pendingMessages: [],
};

window.AdminPanel = {
  mount({ sendFn, room, roomName, joinMode, isAdmin }) {
    if (__brettAdminState.root) return;
    const container = document.getElementById('admin-root');
    if (!container) {
      console.error('[brett-admin] #admin-root not found in DOM');
      return;
    }
    window.__brettSendFn = sendFn;
    window.__brettRoom = room;
    window.__brettRoomName = roomName;
    window.__brettJoinMode = joinMode;
    __brettAdminState.root = ReactDOM.createRoot(container);
    __brettAdminState.root.render(<App />);
    // Flush pending messages
    setTimeout(() => {
      const fn = window.__brettAdminOnMessage;
      if (fn) {
        for (const m of __brettAdminState.pendingMessages) fn(m);
        __brettAdminState.pendingMessages = [];
      }
    }, 0);
  },
  onMessage(msg) {
    const fn = window.__brettAdminOnMessage;
    if (fn) fn(msg);
    else __brettAdminState.pendingMessages.push(msg);
  },
  toggle() {
    window.dispatchEvent(new CustomEvent('brett-admin:toggle'));
  },
};
