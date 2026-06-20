import React, { useEffect, useState } from 'react';
import { BrandMark, Icons } from './components/Icons';
import { Dashboard } from './components/Dashboard';
import { Kundenakte } from './components/Kundenakte';
import { ProfileEditor } from './components/ProfileEditor';
import { Workspace } from './components/Workspace';
import { CompareView } from './components/CompareView';
import { AdminArea } from './components/AdminArea';
import { Presentation } from './components/Presentation';
import { ExportView } from './components/ExportView';
import type { Client, Session, Screen } from './lib/types';

export function App() {
  const [route, setRoute] = useState<Screen>({ kind: 'dashboard' });
  const [rtl, setRtl] = useState(false);

  useEffect(() => { document.documentElement.dir = rtl ? 'rtl' : 'ltr'; }, [rtl]);

  // window-route dispatch for /present and /export (used by window.open())
  useEffect(() => {
    const onHash = () => {
      const m = window.location.hash.match(/^#\/(present|export)\/(.+)$/);
      if (m) setRoute({ kind: m[1] as 'present' | 'export', sessionId: m[2] });
    };
    onHash();
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const onNav = (next: Screen) => { setRoute(next); window.scrollTo(0, 0); };

  return (
    <div className="app">
      <TopBar route={route} onNav={onNav} rtl={rtl} setRtl={setRtl} />
      {route.kind === 'dashboard' && <Dashboard onNav={onNav} />}
      {route.kind === 'akte' && <Kundenakte client={route.client} onNav={onNav} />}
      {route.kind === 'profile' && <ProfileEditor client={route.client} onNav={onNav} />}
      {route.kind === 'workspace' && <Workspace session={route.session} client={route.client} onNav={onNav} />}
      {route.kind === 'compare' && <CompareView session={route.session} client={route.client} onNav={onNav} />}
      {route.kind === 'admin' && <AdminArea onNav={onNav} />}
      {route.kind === 'present' && <Presentation sessionId={route.sessionId} />}
      {route.kind === 'export' && <ExportView sessionId={route.sessionId} />}
    </div>
  );
}

function TopBar({ route, onNav, rtl, setRtl }: { route: Screen; onNav: (s: Screen) => void; rtl: boolean; setRtl: (b: boolean) => void }) {
  const isAdmin = route.kind === 'admin';
  const isDashboard = route.kind === 'dashboard';
  return (
    <header className="topbar">
      <div className="brand-row">
        <BrandMark size={30} />
        <span className="name">mentolder<span className="dot">.</span></span>
      </div>
      <span className="brand-sub">Coaching Studio</span>
      <nav className="topnav" aria-label="Hauptnavigation">
        <button className={isDashboard ? 'is-active' : ''} onClick={() => onNav({ kind: 'dashboard' })}>Übersicht</button>
        <button className={isAdmin ? 'is-active' : ''} onClick={() => onNav({ kind: 'admin' })}>Admin</button>
      </nav>
      <span className="spacer" />
      <div className="topbar-tools">
        <button className={'icon-btn' + (rtl ? ' is-on' : '')} onClick={() => setRtl(!rtl)} aria-pressed={rtl} title="RTL-Layout umschalten"><Icons.rtl /></button>
        <button className="btn btn-ghost btn-sm" onClick={() => onNav({ kind: 'dashboard' })} title="Neue Session"><Icons.plus />Session</button>
      </div>
    </header>
  );
}
