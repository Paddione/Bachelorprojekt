// Arena UI kit — components.jsx
// All shared bits: buttons, inputs, badges, panel, page-shell.
// Loaded after React + Babel; exposes everything onto window.

const { useState, useEffect, useRef } = React;

// ---------- Buttons ----------------------------------------------------------
function Btn({ kind = "primary", size = "md", children, icon, kbd, full, onClick, disabled, style }) {
  const base = {
    fontFamily: "var(--font-sans)", fontWeight: 500,
    border: "1px solid transparent", borderRadius: "var(--radius-md)",
    cursor: disabled ? "not-allowed" : "pointer", display: "inline-flex",
    alignItems: "center", justifyContent: "center", gap: 8,
    transition: "all var(--dur) var(--ease)",
    width: full ? "100%" : "auto", opacity: disabled ? 0.4 : 1,
    padding: size === "lg" ? "13px 22px" : size === "sm" ? "7px 12px" : "11px 18px",
    fontSize: size === "lg" ? 15 : size === "sm" ? 12 : 14,
    ...style,
  };
  const kinds = {
    primary:  { background: "var(--color-primary)", color: "var(--color-primary-fg)", boxShadow: "var(--inner-line)" },
    secondary:{ background: "transparent", color: "var(--color-text)", borderColor: "var(--line-3)" },
    ghost:    { background: "transparent", color: "var(--color-text-secondary)" },
    danger:   { background: "transparent", color: "var(--color-danger)", borderColor: "rgba(226,107,107,.4)" },
    cyan:     { background: "transparent", color: "var(--teal)", borderColor: "rgba(91,212,208,.4)" },
  };
  return (
    <button onClick={disabled ? undefined : onClick} style={{ ...base, ...kinds[kind] }}
      onMouseEnter={(e) => { if (disabled) return;
        if (kind === "primary") e.currentTarget.style.background = "var(--color-primary-2)";
        if (kind === "secondary" || kind === "ghost") { e.currentTarget.style.borderColor = "var(--lime)"; e.currentTarget.style.color = "var(--lime)"; }
      }}
      onMouseLeave={(e) => { Object.assign(e.currentTarget.style, base, kinds[kind]); }}>
      {icon}<span>{children}</span>{kbd && <kbd style={{ fontFamily: "var(--font-mono)", fontSize: 10, background: "rgba(255,255,255,.08)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--line-2)", marginLeft: 4 }}>{kbd}</kbd>}
    </button>
  );
}

// ---------- Inputs -----------------------------------------------------------
function Field({ label, hint, children }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {label && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".16em", color: "var(--color-text-muted)", textTransform: "uppercase" }}>{label}</span>}
      {children}
      {hint && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--color-text-muted)" }}>{hint}</span>}
    </label>
  );
}
function Input({ value, onChange, placeholder, code, maxLength, style }) {
  return <input
    value={value} onChange={onChange} placeholder={placeholder} maxLength={maxLength}
    style={{
      background: "var(--color-surface)", border: "1px solid var(--line-2)", borderRadius: "var(--radius-md)",
      padding: "10px 14px", color: "var(--color-text)", fontFamily: "var(--font-sans)", fontSize: 14, outline: "none",
      ...(code ? { fontFamily: "var(--font-mono)", letterSpacing: ".3em", textAlign: "center", textTransform: "uppercase" } : {}),
      ...style,
    }}
    onFocus={(e) => { e.currentTarget.style.outline = "2px solid var(--lime)"; e.currentTarget.style.outlineOffset = "1px"; e.currentTarget.style.borderColor = "var(--lime)"; }}
    onBlur={(e) => { e.currentTarget.style.outline = "none"; e.currentTarget.style.borderColor = "var(--line-2)"; }}
  />;
}

// ---------- Pills / badges ---------------------------------------------------
function Pill({ tone = "neutral", dot, children }) {
  const tones = {
    lime:    { bg: "var(--lime-tint)",       fg: "var(--lime)",     bd: "var(--lime-tint-2)" },
    teal:    { bg: "var(--teal-tint)",       fg: "var(--teal)",     bd: "transparent" },
    fail:    { bg: "rgba(226,107,107,.10)",   fg: "var(--fail)",     bd: "transparent" },
    neutral: { bg: "transparent",            fg: "var(--mute)",      bd: "var(--line-2)" },
  }[tone];
  return (
    <span style={{
      background: tones.bg, color: tones.fg, border: `1px solid ${tones.bd}`,
      fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".16em",
      padding: "4px 10px", borderRadius: 999, textTransform: "uppercase",
      display: "inline-flex", alignItems: "center", gap: 6,
    }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 999, background: "currentColor" }} />}
      {children}
    </span>
  );
}

// ---------- Eyebrow ----------------------------------------------------------
function Eyebrow({ children, noRule }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em",
      color: "var(--lime)", textTransform: "uppercase",
      display: "inline-flex", alignItems: "center", gap: 10,
    }}>
      {!noRule && <span style={{ width: 22, height: 1, background: "currentColor" }} />}
      {children}
    </span>
  );
}

// ---------- Card / panel -----------------------------------------------------
function Panel({ children, style, padded = true }) {
  return (
    <div style={{
      background: "var(--color-surface)", border: "1px solid var(--line)",
      borderRadius: "var(--radius-lg)", padding: padded ? 24 : 0,
      boxShadow: "var(--shadow-1)", ...style,
    }}>{children}</div>
  );
}

// ---------- Wordmark ---------------------------------------------------------
function Wordmark({ size = 32 }) {
  return (
    <span style={{ fontFamily: "var(--font-serif)", fontSize: size, lineHeight: 1, letterSpacing: "-0.5px", color: "var(--color-text)" }}>
      Kore<span style={{ color: "var(--lime)" }}>.</span>
    </span>
  );
}

// ---------- Page shell -------------------------------------------------------
function PageShell({ active, onNav, children }) {
  const tabs = [
    { id: "home", label: "Home" },
    { id: "lobby", label: "Lobby" },
    { id: "game", label: "Game" },
    { id: "results", label: "Results" },
    { id: "picker", label: "Characters" },
  ];
  return (
    <div className="grain-bg" style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text)", position: "relative" }}>
      <header style={{
        position: "relative", zIndex: 2,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "20px 32px", borderBottom: "1px solid var(--line)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="../../assets/icon-192.png" style={{ width: 32, height: 32, borderRadius: 8 }} alt="" />
          <Wordmark size={24} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".18em", color: "var(--mute)", marginLeft: 16 }}>· ARENA</span>
        </div>
        <nav style={{ display: "flex", gap: 4 }}>
          {tabs.map((t) => (
            <button key={t.id} onClick={() => onNav(t.id)} style={{
              background: active === t.id ? "var(--lime-tint)" : "transparent",
              color: active === t.id ? "var(--lime)" : "var(--fg-soft)",
              border: "none", padding: "8px 14px", borderRadius: 8,
              fontFamily: "var(--font-sans)", fontWeight: 500, fontSize: 13, cursor: "pointer",
              transition: "all var(--dur) var(--ease)",
            }}>{t.label}</button>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--mute)", letterSpacing: ".16em", textTransform: "uppercase" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "var(--teal)" }} />
          <span>connected</span>
          <span style={{ color: "var(--fg)" }}>· alex.k</span>
        </div>
      </header>
      <main style={{ position: "relative", zIndex: 1, padding: "40px 32px 80px", maxWidth: 1280, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

Object.assign(window, { Btn, Field, Input, Pill, Eyebrow, Panel, Wordmark, PageShell });
