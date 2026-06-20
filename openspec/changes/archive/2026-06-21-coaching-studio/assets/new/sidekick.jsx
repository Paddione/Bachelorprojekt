/* Sidekick widget — Mentolder editorial redesign */

const sidekickItems = [
  { id: "anfragen",   no: "01", title: "Anfragen",          sub: "Tickets erstellen & bearbeiten", badge: 1 },
  { id: "postfach",   no: "02", title: "Postfach",          sub: "Nachrichten & Anfragen" },
  { id: "fragen",     no: "03", title: "Fragebögen",        sub: "Aufgaben beantworten" },
  { id: "feedback",   no: "04", title: "Feedback & Support",sub: "Fehler melden, Ideen teilen" },
  { id: "hilfe",      no: "05", title: "Hilfe",             sub: "Kontexthilfe für diese Seite" },
];

/* ----------------------------------------------------------------- */
/* Atoms                                                              */
/* ----------------------------------------------------------------- */

const Arrow = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <path d="M5 12h14M13 5l7 7-7 7" />
  </svg>
);

const Expand = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5" />
  </svg>
);

const Close = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

const Grain = () => (
  <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.55, mixBlendMode: "overlay" }} aria-hidden="true">
    <filter id="sk-grain">
      <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" />
      <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#sk-grain)" />
  </svg>
);

const Halo = ({ x = "85%", y = "12%", color = "rgba(232,200,112,0.18)", size = 320, blur = 60 }) => (
  <div style={{
    position: "absolute", left: x, top: y, width: size, height: size,
    background: `radial-gradient(circle at center, ${color}, transparent 65%)`,
    filter: `blur(${blur}px)`, pointerEvents: "none", transform: "translate(-50%,-50%)",
  }} />
);

const Eyebrow = ({ children }) => (
  <div style={{
    fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.22em",
    textTransform: "uppercase", color: "var(--brass)",
    display: "inline-flex", alignItems: "center", gap: 12,
  }}>
    <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.85 }} />
    {children}
  </div>
);

const ChromeBtn = ({ children, onClick }) => (
  <button onClick={onClick} style={{
    width: 32, height: 32, borderRadius: 999, border: "1px solid var(--line)",
    background: "transparent", color: "var(--fg-soft)",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "all 200ms var(--ease-soft)",
  }}
  onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--brass)"; e.currentTarget.style.color = "var(--brass)"; }}
  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--line)"; e.currentTarget.style.color = "var(--fg-soft)"; }}
  >{children}</button>
);

const BrassBadge = ({ n }) => (
  <span style={{
    minWidth: 22, height: 22, padding: "0 8px", borderRadius: 999,
    background: "var(--brass)", color: "#0b111c",
    fontFamily: "var(--mono)", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em",
    display: "inline-flex", alignItems: "center", justifyContent: "center",
  }}>{n}</span>
);

const PulseDot = () => (
  <span style={{ position: "relative", width: 8, height: 8, display: "inline-block" }}>
    <span style={{
      position: "absolute", inset: 0, borderRadius: 999, background: "var(--sage)",
      boxShadow: "0 0 0 0 oklch(0.80 0.06 160 / 0.45)",
      animation: "sk-pulse 2.2s var(--ease-soft) infinite",
    }} />
  </span>
);

/* ----------------------------------------------------------------- */
/* SidekickShell                                                      */
/* ----------------------------------------------------------------- */

function SidekickShell({ children, footer }) {
  return (
    <div style={{
      width: 480, height: 900, background: "var(--ink-900)",
      borderLeft: "1px solid var(--line-2)",
      position: "relative", overflow: "hidden", display: "flex", flexDirection: "column",
      color: "var(--fg)",
    }}>
      <Halo x="92%" y="10%" color="rgba(232,200,112,0.22)" size={360} blur={80} />
      <Halo x="-10%" y="92%" color="rgba(70,110,160,0.16)" size={300} blur={70} />
      <Grain />

      {/* Top bar */}
      <div style={{
        position: "relative", padding: "22px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderBottom: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{
            fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.28em",
            textTransform: "uppercase", color: "var(--fg)",
          }}>Sidekick</span>
          <span style={{ width: 1, height: 12, background: "var(--line-2)" }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 8,
            fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
            textTransform: "uppercase", color: "var(--mute)" }}>
            <PulseDot /> Verfügbar
          </span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <ChromeBtn><Expand /></ChromeBtn>
          <ChromeBtn><Close /></ChromeBtn>
        </div>
      </div>

      {children}

      {footer ?? (
        <div style={{
          position: "relative", marginTop: "auto", padding: "18px 28px",
          borderTop: "1px solid var(--line)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
          textTransform: "uppercase", color: "var(--mute-2)",
        }}>
          <span>GK · 2026 · Lüneburg</span>
          <span style={{ color: "var(--mute)" }}>v2.4</span>
        </div>
      )}

      <style>{`@keyframes sk-pulse {
        0%   { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0.45); }
        70%  { box-shadow: 0 0 0 10px oklch(0.80 0.06 160 / 0); }
        100% { box-shadow: 0 0 0 0 oklch(0.80 0.06 160 / 0); }
      }`}</style>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/* Variant A — Editorial numbered list                                */
/* ----------------------------------------------------------------- */

function SidekickA() {
  const [hover, setHover] = React.useState(null);
  return (
    <SidekickShell>
      <div style={{ position: "relative", padding: "36px 28px 8px" }}>
        <Eyebrow>Helpdesk · 05 Bereiche</Eyebrow>
        <h2 style={{
          margin: "16px 0 4px", fontFamily: "var(--serif)",
          fontSize: 34, lineHeight: 1.05, letterSpacing: "-0.02em",
          fontWeight: 400, color: "var(--fg)",
        }}>
          Womit kann ich Ihnen <em style={{ color: "var(--brass-2)" }}>helfen?</em>
        </h2>
        <p style={{ margin: "10px 0 0", fontSize: 14, color: "var(--mute)", maxWidth: "38ch" }}>
          Kein Skript, kein Bot — direkter Zugang zu Tickets, Nachrichten und Kontexthilfe.
        </p>
      </div>

      <div style={{ position: "relative", marginTop: 28, borderTop: "1px solid var(--line)" }}>
        {sidekickItems.map((it) => {
          const isHover = hover === it.id;
          return (
            <a
              key={it.id}
              href="#"
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "grid", gridTemplateColumns: "44px 1fr auto 24px",
                alignItems: "center", gap: 18,
                padding: "20px 28px", borderBottom: "1px solid var(--line)",
                textDecoration: "none", color: "inherit", position: "relative",
                background: isHover
                  ? "linear-gradient(to right, transparent, rgba(232,200,112,.04), transparent)"
                  : "transparent",
                transition: "background 240ms var(--ease-soft)",
              }}
            >
              <span style={{
                fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: isHover ? "var(--brass)" : "var(--mute-2)",
                transition: "color 200ms var(--ease-soft)",
              }}>{it.no}</span>

              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{
                  fontFamily: "var(--serif)", fontSize: 22, lineHeight: 1.15,
                  letterSpacing: "-0.015em", fontWeight: 400, color: "var(--fg)",
                }}>{it.title}</span>
                <span style={{ fontSize: 13, color: "var(--mute)" }}>{it.sub}</span>
              </span>

              <span style={{ minWidth: 22, display: "flex", justifyContent: "flex-end" }}>
                {it.badge ? <BrassBadge n={it.badge} /> : null}
              </span>

              <span style={{
                width: 28, height: 28, borderRadius: 999,
                border: `1px solid ${isHover ? "var(--brass)" : "var(--line-2)"}`,
                background: isHover ? "var(--brass)" : "transparent",
                color: isHover ? "#0b111c" : "var(--fg-soft)",
                display: "inline-flex", alignItems: "center", justifyContent: "center",
                transition: "all 220ms var(--ease-soft)",
              }}><Arrow size={12} /></span>
            </a>
          );
        })}
      </div>
    </SidekickShell>
  );
}

/* ----------------------------------------------------------------- */
/* Variant B — Tile grid                                              */
/* ----------------------------------------------------------------- */

const TileIcon = ({ kind }) => {
  const props = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (kind) {
    case "anfragen":  return (<svg {...props}><path d="M20 7l-8-4-8 4 8 4 8-4z" /><path d="M4 7v10l8 4 8-4V7" /><path d="M12 11v10" /></svg>);
    case "postfach":  return (<svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10l9 5 9-5" /></svg>);
    case "fragen":    return (<svg {...props}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>);
    case "feedback":  return (<svg {...props}><circle cx="12" cy="12" r="4" /><path d="M12 4v2M12 18v2M4 12h2M18 12h2M6 6l1.5 1.5M16.5 16.5L18 18M6 18l1.5-1.5M16.5 7.5L18 6" /></svg>);
    case "hilfe":     return (<svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .8-1 1.7M12 17h.01" /></svg>);
    default:          return null;
  }
};

function SidekickB() {
  const [hover, setHover] = React.useState(null);
  return (
    <SidekickShell>
      <div style={{ position: "relative", padding: "36px 28px 24px" }}>
        <Eyebrow>Sidekick · Helpdesk</Eyebrow>
        <h2 style={{
          margin: "16px 0 0", fontFamily: "var(--serif)",
          fontSize: 30, lineHeight: 1.1, letterSpacing: "-0.02em",
          fontWeight: 400, color: "var(--fg)",
        }}>
          Womit kann ich Ihnen <em style={{ color: "var(--brass-2)" }}>helfen?</em>
        </h2>
      </div>

      <div style={{ position: "relative", padding: "0 22px 22px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {sidekickItems.map((it, i) => {
          const isHover = hover === it.id;
          const isFull = i === sidekickItems.length - 1; // last item spans both cols
          return (
            <a
              key={it.id}
              href="#"
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                gridColumn: isFull ? "span 2" : "auto",
                position: "relative", textDecoration: "none", color: "inherit",
                padding: "20px 18px 22px",
                background: "var(--ink-850)",
                border: `1px solid ${isHover ? "var(--brass)" : "var(--line)"}`,
                borderRadius: "var(--radius-md)",
                transition: "all 200ms var(--ease-soft)",
                display: "flex", flexDirection: "column", gap: 14,
                minHeight: isFull ? 92 : 132,
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
                <span style={{
                  color: isHover ? "var(--brass)" : "var(--fg-soft)",
                  transition: "color 200ms var(--ease-soft)",
                }}><TileIcon kind={it.id} /></span>
                <span style={{
                  fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em",
                  textTransform: "uppercase", color: "var(--mute-2)",
                }}>{it.no}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{
                    fontFamily: "var(--sans)", fontSize: 16, fontWeight: 500,
                    color: "var(--fg)", letterSpacing: "-0.01em",
                  }}>{it.title}</span>
                  {it.badge ? <BrassBadge n={it.badge} /> : null}
                </div>
                <span style={{ fontSize: 12, color: "var(--mute)", lineHeight: 1.4 }}>{it.sub}</span>
              </div>
            </a>
          );
        })}
      </div>

      {/* Quick action */}
      <div style={{ position: "relative", padding: "0 28px 24px" }}>
        <button style={{
          width: "100%", padding: "14px 18px", borderRadius: 999,
          background: "var(--brass)", border: "none", color: "#0b111c",
          fontFamily: "var(--sans)", fontSize: 14, fontWeight: 500,
          letterSpacing: "-0.01em", cursor: "pointer",
          display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 10,
        }}>Neue Anfrage erstellen <Arrow size={14} /></button>
      </div>
    </SidekickShell>
  );
}

/* ----------------------------------------------------------------- */
/* Variant C — Compact dense list with avatar                         */
/* ----------------------------------------------------------------- */

function SidekickC() {
  const [hover, setHover] = React.useState(null);
  return (
    <SidekickShell>
      <div style={{ position: "relative", padding: "30px 28px 22px", display: "flex", gap: 18, alignItems: "center" }}>
        <div style={{
          width: 56, height: 56, borderRadius: 999, overflow: "hidden", flexShrink: 0,
          background: "linear-gradient(155deg, oklch(0.86 0.09 75), oklch(0.74 0.09 75))",
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--mono)", fontWeight: 500, fontSize: 18, letterSpacing: "0.04em",
          color: "#0b111c",
          boxShadow: "inset 0 0 0 1px rgba(0,0,0,.18)",
        }}>GK</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)", letterSpacing: "-0.015em" }}>Gerald Korczewski</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--mute)", display: "inline-flex", alignItems: "center", gap: 8 }}>
            <PulseDot /> Antwortet in ≈ 1 h
          </span>
        </div>
      </div>

      <div style={{ position: "relative", padding: "0 28px 18px" }}>
        <Eyebrow>Direkt zum Punkt</Eyebrow>
      </div>

      <div style={{ position: "relative", borderTop: "1px solid var(--line)" }}>
        {sidekickItems.map((it) => {
          const isHover = hover === it.id;
          return (
            <a
              key={it.id}
              href="#"
              onMouseEnter={() => setHover(it.id)}
              onMouseLeave={() => setHover(null)}
              style={{
                display: "grid", gridTemplateColumns: "1fr auto auto",
                alignItems: "center", gap: 18,
                padding: "16px 28px", borderBottom: "1px solid var(--line)",
                textDecoration: "none", color: "inherit",
                background: isHover ? "rgba(255,255,255,.02)" : "transparent",
                transition: "background 200ms var(--ease-soft)",
                position: "relative",
              }}
            >
              {/* brass bar accent on hover */}
              <span style={{
                position: "absolute", left: 0, top: 16, bottom: 16, width: 2,
                background: "var(--brass)",
                opacity: isHover ? 1 : 0,
                transition: "opacity 200ms var(--ease-soft)",
              }} />

              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <span style={{
                  fontFamily: "var(--sans)", fontSize: 15, fontWeight: 500,
                  color: "var(--fg)", letterSpacing: "-0.01em",
                  display: "inline-flex", alignItems: "center", gap: 10,
                }}>
                  <span style={{
                    fontFamily: "var(--mono)", fontSize: 10, color: "var(--mute-2)",
                    letterSpacing: "0.18em",
                  }}>{it.no} —</span>
                  {it.title}
                </span>
                <span style={{ fontSize: 12.5, color: "var(--mute)" }}>{it.sub}</span>
              </div>

              {it.badge ? <BrassBadge n={it.badge} /> : <span />}

              <span style={{
                color: isHover ? "var(--brass)" : "var(--mute-2)",
                transition: "color 200ms var(--ease-soft)",
                display: "inline-flex",
              }}><Arrow size={14} /></span>
            </a>
          );
        })}
      </div>

      <div style={{ position: "relative", padding: "20px 28px" }}>
        <a href="#" style={{
          color: "var(--brass)", textDecoration: "none",
          fontFamily: "var(--sans)", fontSize: 13, fontWeight: 500,
          display: "inline-flex", alignItems: "center", gap: 8,
        }}>
          Direkt an Gerald schreiben <Arrow size={12} />
        </a>
      </div>
    </SidekickShell>
  );
}

Object.assign(window, { SidekickA, SidekickB, SidekickC });
