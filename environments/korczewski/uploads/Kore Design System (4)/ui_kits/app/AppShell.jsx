// AppShell.jsx — Kore in-product app shell recreation
// Sticky nav with tabs · clusters list · run detail · paper invoice

function ShellNav({ active, onNav }) {
  const tabs = [
    ['home', 'Home'],
    ['clusters', 'Clusters'],
    ['runs', 'Runs'],
    ['billing', 'Billing'],
  ];
  return (
    <nav className="shell-nav">
      <div className="shell-nav-inner">
        <a className="shell-brand" href="#" onClick={(e)=>e.preventDefault()}>
          <img src="../../assets/logo-mark.svg" width="26" height="26" />
          <span>Kore<span className="dot">.</span></span>
          <span className="sep">/</span>
          <span className="crumb">Operator console</span>
        </a>
        <div className="shell-tabs">
          {tabs.map(([k, l], i) => (
            <button key={k}
                    className={`shell-tab ${active === k ? 'active' : ''}`}
                    onClick={() => onNav(k)}>
              <span className="num">{String(i+1).padStart(2,'0')}</span>{l}
            </button>
          ))}
        </div>
        <span className="shell-meta">k. korczewski · ord-1</span>
      </div>
    </nav>
  );
}

function HomeView() {
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '60px 28px' }}>
      <span className="eyebrow no-rule">[ Today, 14:02 CET ]</span>
      <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 56, letterSpacing: '-0.02em', margin: '14px 0 0', lineHeight: 1.05 }}>
        Three clusters syncing, <em className="em">none on fire.</em>
      </h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginTop: 48 }}>
        <article style={{ padding: 32, background: 'var(--ink-850)', border: '1px solid var(--line)', borderRadius: 16 }}>
          <span className="eyebrow">Cluster · ord-1</span>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, marginTop: 14, letterSpacing: '-0.01em' }}>
            Tradesman <em className="em">production</em>
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 24 }}>
            <div className="stat" style={statCss}><div className="lab" style={statLab}>Nodes</div><div className="v" style={statV}>14</div></div>
            <div className="stat" style={statCss}><div className="lab" style={statLab}>Pods</div><div className="v" style={statV}>312</div></div>
            <div className="stat" style={statCss}><div className="lab" style={statLab}>P95</div><div className="v" style={statV}>84<span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--mute)', marginLeft: 4 }}>ms</span></div></div>
          </div>
          <div style={{ marginTop: 24 }}>
            <span className="pill ok"><span className="dot"></span>Ready</span>{' '}
            <span className="pill sync"><span className="dot"></span>Rolling 1.29 → 1.30</span>
          </div>
        </article>

        <article style={{ padding: 32, background: 'var(--ink-850)', border: '1px solid var(--line)', borderRadius: 16 }}>
          <span className="eyebrow">Pager · last 24h</span>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, marginTop: 14, letterSpacing: '-0.01em' }}>
            <em className="em">Zero</em> pages.
          </h3>
          <p style={{ color: 'var(--fg-soft)', marginTop: 14, fontSize: 14.5, lineHeight: 1.55 }}>
            Last incident closed Tue 14:32 CET. Runbook updated.
          </p>
          <a className="btn ghost sm" style={{ marginTop: 24 }}>View incident timeline →</a>
        </article>
      </div>
    </div>
  );
}

const statCss = { padding: 18, background: 'var(--ink-800)', borderRadius: 12, boxShadow: 'inset 0 1px 0 var(--copper)' };
const statLab = { fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--mute)' };
const statV   = { fontFamily: 'var(--serif)', fontSize: 30, color: 'var(--fg)', marginTop: 6, letterSpacing: '-0.01em', lineHeight: 1 };

function ClustersView({ onOpen }) {
  const rows = [
    ['ord-1',  'Tradesman · prod',     '1.30',     14, 'ok'],
    ['fra-2',  'Lumen.ag · prod',      '1.29',     22, 'sync'],
    ['sfo-3',  'Halst · staging',      '1.30',      6, 'ok'],
    ['waw-1',  'Internal · sandbox',   '1.28',      3, 'paused'],
    ['ber-1',  'Tradesman · canary',   '1.30',      4, 'fail'],
  ];
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginBottom: 24 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 38, letterSpacing: '-0.02em' }}>Clusters</h2>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)' }}>5 under care</span>
        <a className="btn primary sm" style={{ marginLeft: 'auto' }}>+ Adopt cluster</a>
      </div>
      <div style={{ border: '1px solid var(--line)', borderRadius: 16, overflow: 'hidden', background: 'var(--ink-850)' }}>
        <div style={hdrRow}>
          <span>Region</span><span>Account</span><span>Version</span><span>Nodes</span><span>Status</span><span></span>
        </div>
        {rows.map(([region, account, ver, nodes, status]) => (
          <div key={region} style={dataRow} onClick={() => onOpen?.(region)}>
            <span style={{ fontFamily: 'var(--mono)', color: 'var(--copper)', fontSize: 12.5 }}>{region}</span>
            <span>{account}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--fg-soft)' }}>v{ver}</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--fg-soft)' }}>{nodes}</span>
            <span><span className={`pill ${status}`}><span className="dot"></span>{statusLabel(status)}</span></span>
            <span style={{ textAlign: 'right', color: 'var(--mute)', fontFamily: 'var(--mono)', fontSize: 11 }}>↗</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const hdrRow = { display: 'grid', gridTemplateColumns: '120px 1fr 100px 90px 160px 40px', padding: '14px 22px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--mute)' };
const dataRow = { display: 'grid', gridTemplateColumns: '120px 1fr 100px 90px 160px 40px', padding: '18px 22px', borderBottom: '1px solid var(--line)', fontFamily: 'var(--sans)', fontSize: 14, color: 'var(--fg)', alignItems: 'center', cursor: 'pointer', transition: 'background 180ms var(--ease)' };
function statusLabel(s){ return ({ok:'Ready',sync:'Rolling',fail:'Failing',paused:'Paused',paid:'Paid'})[s]; }

function RunsView() {
  const runs = [
    ['#R-2218', 'tradesman/api', 'rolling-update', 'sync', '14:01'],
    ['#R-2217', 'lumen/etl',     'helm-upgrade',   'ok',   '13:42'],
    ['#R-2216', 'halst/web',     'rollback',       'ok',   '12:09'],
    ['#R-2215', 'tradesman/api', 'apply-manifest', 'fail', '09:33'],
  ];
  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '40px 28px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 14 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 32, letterSpacing: '-0.02em', marginBottom: 18 }}>Runs</h2>
        <div style={{ border: '1px solid var(--line)', borderRadius: 14, background: 'var(--ink-850)' }}>
          {runs.map(([id, target, op, st, t], i) => (
            <div key={id} style={{ padding: '16px 18px', borderBottom: i === runs.length-1 ? 'none' : '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 6, cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--copper)', fontSize: 12.5 }}>{id}</span>
                <span className={`pill ${st}`}><span className="dot"></span>{statusLabel(st)}</span>
              </div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 14 }}>{target}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)' }}>{op} · {t}</div>
            </div>
          ))}
        </div>
      </div>
      <article style={{ background: 'var(--ink-850)', border: '1px solid var(--line)', borderRadius: 14, padding: 32, position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: 'radial-gradient(60% 80% at 100% 0%, rgba(200,247,106,.08), transparent 60%)' }} />
        <div style={{ position: 'relative' }}>
          <span className="eyebrow">Run · #R-2218</span>
          <h3 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: 28, marginTop: 14, letterSpacing: '-0.01em' }}>
            tradesman/api · <em className="em">rolling-update</em>
          </h3>
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            <span className="pill sync"><span className="dot"></span>Rolling</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--mute)', alignSelf: 'center' }}>started 14:01 · 47s ago</span>
          </div>
          <pre style={{ marginTop: 24, padding: 20, background: 'var(--ink-900)', borderRadius: 10, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--fg-soft)', lineHeight: 1.6, border: '1px solid var(--line)', overflow: 'auto' }}>
{`14:01:02  helm upgrade api ./charts/api --atomic
14:01:04  → planning…
14:01:08  + 3 deployments
14:01:09  ~ 1 service (tradesman-api → :8080)
14:01:14  → applying…
14:01:21  ✓ tradesman-api-77b… ready  (3/3)
14:01:31  ✓ tradesman-api-77b… ready  (6/6)
14:01:47  ⏵ tradesman-api-77b… 9/14`}
          </pre>
          <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
            <a className="btn ghost sm">Pause</a>
            <a className="btn ghost sm">Rollback</a>
            <a className="btn primary sm" style={{ marginLeft: 'auto' }}>Open in repo →</a>
          </div>
        </div>
      </article>
    </div>
  );
}

function BillingView() {
  return (
    <div className="paper-stage">
      <div className="paper-doc">
        <div style={{ padding: '48px 56px', borderBottom: '1px solid var(--line-paper)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <img src="../../assets/logo-lockup-light.svg" width="180" height="54" />
            <div style={{ marginTop: 18, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', lineHeight: 1.6 }}>
              KORE. UG (HAFTUNGSBESCHRÄNKT)<br/>
              FRIEDRICHSTRASSE 132 · 10117 BERLIN<br/>
              VAT DE-348-991-204
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--copper-print)' }}>Invoice</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 36, marginTop: 6, color: 'var(--ink-text)' }}>2026-04-<em style={{ fontStyle: 'italic', color: 'var(--copper-print)' }}>0042</em></div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)', marginTop: 6 }}>Due 12 May 2026 · Net 14</div>
          </div>
        </div>
        <div style={{ padding: '32px 56px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, borderBottom: '1px solid var(--line-paper)' }}>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>Billed to</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, marginTop: 6, color: 'var(--ink-text)' }}>Tradesman <em style={{ fontStyle: 'italic', color: 'var(--copper-print)' }}>GmbH</em></div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 8, lineHeight: 1.55 }}>
              Attn: Maya Oduya, Head of Platform<br/>
              Hauptstraße 17 · 10827 Berlin
            </div>
          </div>
          <div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>Period</div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 22, marginTop: 6, color: 'var(--ink-text)' }}>April 2026</div>
            <div style={{ fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--ink-soft)', marginTop: 8 }}>
              Reliability retainer · cluster ord-1
            </div>
          </div>
        </div>
        <div style={{ padding: '32px 56px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--sans)', fontSize: 14 }}>
            <thead>
              <tr style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>
                <th style={{ textAlign: 'left', padding: '10px 0', borderBottom: '1px solid var(--line-paper)' }}>Item</th>
                <th style={{ textAlign: 'right', padding: '10px 0', borderBottom: '1px solid var(--line-paper)' }}>Hours</th>
                <th style={{ textAlign: 'right', padding: '10px 0', borderBottom: '1px solid var(--line-paper)' }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '10px 0', borderBottom: '1px solid var(--line-paper)' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Reliability retainer · base',  '40.0', '€220', '€8,800.00'],
                ['Incident response · 2026-04-09','3.5',  '€280', '€980.00'],
                ['Runbook revision · v3.4',       '2.0',  '€220', '€440.00'],
              ].map((r, i) => (
                <tr key={i}>
                  <td style={cellL}>{r[0]}</td>
                  <td style={cellR}>{r[1]}</td>
                  <td style={cellR}>{r[2]}</td>
                  <td style={{ ...cellR, fontFamily: 'var(--serif)', fontSize: 17 }}>{r[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 32, paddingTop: 18, borderTop: '1px solid var(--line-paper)', display: 'flex', justifyContent: 'flex-end', gap: 48, alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-mute)' }}>Total due</span>
            <span style={{ fontFamily: 'var(--serif)', fontSize: 36, color: 'var(--ink-text)' }}>€10,220.<em style={{ fontStyle: 'italic', color: 'var(--copper-print)' }}>00</em></span>
          </div>
          <div style={{ marginTop: 24, fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-mute)' }}>
            <span className="pill paid"><span className="dot"></span>Paid · 2026-04-28</span>
          </div>
        </div>
      </div>
    </div>
  );
}
const cellL = { padding: '14px 0', borderBottom: '1px dashed var(--line-paper)', color: 'var(--ink-text)' };
const cellR = { padding: '14px 0', borderBottom: '1px dashed var(--line-paper)', textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--ink-soft)' };

function AppShell() {
  const [tab, setTab] = React.useState('home');
  return (
    <>
      <ShellNav active={tab} onNav={setTab} />
      {tab === 'home' && <HomeView />}
      {tab === 'clusters' && <ClustersView onOpen={() => setTab('runs')} />}
      {tab === 'runs' && <RunsView />}
      {tab === 'billing' && <BillingView />}
    </>
  );
}
window.AppShell = AppShell;
