/* Avatar treatments — 2-letter initials, Mentolder system */

function Avatar({ name, size = 40, variant = "brass", className = "" }) {
  const parts = (name || "").trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase() || "?";
  const letterSize = Math.round(size * 0.38);
  const ring = Math.max(1, Math.round(size / 36));

  const styles = {
    brass: {
      background: "linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.80 0.09 75) 55%, oklch(0.72 0.09 75) 100%)",
      color: "#0b111c",
      fontFamily: "var(--sans)",
      fontWeight: 600,
      letterSpacing: "-0.02em",
      boxShadow: "inset 0 1px 0 0 rgba(255,255,255,.25), inset 0 -1px 0 0 rgba(0,0,0,.18)",
    },
    hairline: {
      background: "var(--ink-800)",
      color: "var(--brass-2)",
      fontFamily: "var(--mono)",
      fontWeight: 500,
      letterSpacing: "0.04em",
      boxShadow: `inset 0 0 0 1px var(--line-2)`,
    },
    ring: {
      background: "transparent",
      color: "var(--brass)",
      fontFamily: "var(--mono)",
      fontWeight: 500,
      letterSpacing: "0.04em",
      boxShadow: `inset 0 0 0 1px var(--brass)`,
    },
    plate: {
      background: "linear-gradient(155deg, oklch(0.32 0.04 75) 0%, oklch(0.22 0.03 75) 100%)",
      color: "var(--brass-2)",
      fontFamily: "var(--mono)",
      fontWeight: 500,
      letterSpacing: "0.04em",
      borderRadius: "var(--radius-sm)",
      boxShadow: "inset 0 1px 0 0 rgba(255,255,255,.06), inset 0 0 0 1px rgba(0,0,0,.4)",
    },
    sage: {
      background: "linear-gradient(155deg, oklch(0.84 0.06 160) 0%, oklch(0.74 0.06 160) 100%)",
      color: "#0b111c",
      fontFamily: "var(--sans)",
      fontWeight: 600,
      letterSpacing: "-0.02em",
    },
    serif: {
      background: "linear-gradient(155deg, oklch(0.86 0.09 75) 0%, oklch(0.78 0.09 75) 100%)",
      color: "#0b111c",
      fontFamily: "var(--serif)",
      fontWeight: 500,
      letterSpacing: "-0.01em",
      fontStyle: "italic",
      boxShadow: "inset 0 1px 0 0 rgba(255,255,255,.22)",
    },
  };

  const s = styles[variant] ?? styles.brass;
  const radius = variant === "plate" ? "var(--radius-sm)" : "999px";

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: letterSize,
        lineHeight: 1,
        flexShrink: 0,
        userSelect: "none",
        ...s,
      }}
    >
      <span style={{ transform: "translateY(-0.5px)" }}>{initials}</span>
    </div>
  );
}

function NameRow({ name, role, variant, size = 44 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <Avatar name={name} variant={variant} size={size} />
      <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
        <span style={{ fontFamily: "var(--sans)", fontSize: 16, color: "var(--fg)", fontWeight: 500 }}>{name}</span>
        {role ? (
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute)" }}>{role}</span>
        ) : null}
      </div>
    </div>
  );
}

function AvatarsBeforeAfter() {
  // Before: one letter, generic brass disc (the screenshot)
  const Before = ({ letter }) => (
    <div
      style={{
        width: 44, height: 44, borderRadius: 999,
        background: "linear-gradient(155deg, oklch(0.84 0.09 75), oklch(0.74 0.09 75))",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        fontFamily: "var(--serif)", fontSize: 20, color: "#3a2a10", fontWeight: 500,
      }}
    >{letter}</div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, padding: 40 }}>
      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--mute)", marginBottom: 22 }}>
          Vorher · Single letter
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Before letter="G" />
            <span style={{ fontFamily: "var(--sans)", fontSize: 16, color: "var(--fg)" }}>Gerald Korczewski</span>
          </div>
          <div style={{ height: 1, background: "var(--line)" }} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <Before letter="P" />
            <span style={{ fontFamily: "var(--sans)", fontSize: 16, color: "var(--fg)" }}>Patrick Korczewski</span>
          </div>
        </div>
      </div>

      <div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--brass)", marginBottom: 22, display: "inline-flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.8 }} />Nachher · GK / PK
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <NameRow name="Gerald Korczewski" role="Inhaber · Coach" variant="brass" />
          <div style={{ height: 1, background: "var(--line)" }} />
          <NameRow name="Patrick Korczewski" role="Entwickler" variant="brass" />
        </div>
      </div>
    </div>
  );
}

function AvatarVariants() {
  const rows = [
    { variant: "brass",    label: "Brass disc",     note: "Default · Filled brass, dark ink letters" },
    { variant: "hairline", label: "Hairline disc",  note: "Quiet · Ink-800 fill, mono brass letters" },
    { variant: "ring",     label: "Brass ring",     note: "Editorial · Transparent, brass outline" },
    { variant: "plate",    label: "Mark plate",     note: "Square · Echoes the brand mark" },
    { variant: "serif",    label: "Serif disc",     note: "Reserved for Gerald · Italic Newsreader" },
    { variant: "sage",     label: "Sage disc",      note: "System / non-human" },
  ];

  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--brass)", display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.8 }} />Varianten
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr 1fr", rowGap: 22, columnGap: 22, alignItems: "center" }}>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute-2)" }}>Style</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute-2)" }}>Gerald</div>
        <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute-2)" }}>Patrick</div>

        {rows.map(r => (
          <React.Fragment key={r.variant}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--fg)" }}>{r.label}</span>
              <span style={{ fontFamily: "var(--sans)", fontSize: 12, color: "var(--mute)" }}>{r.note}</span>
            </div>
            <div><NameRow name="Gerald Korczewski" variant={r.variant} size={44} /></div>
            <div><NameRow name="Patrick Korczewski" variant={r.variant} size={44} /></div>
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function AvatarSizes() {
  const sizes = [
    { size: 20, label: "20 · inline" },
    { size: 28, label: "28 · list" },
    { size: 36, label: "36 · nav" },
    { size: 44, label: "44 · default" },
    { size: 56, label: "56 · detail" },
    { size: 72, label: "72 · profile" },
    { size: 96, label: "96 · hero" },
  ];

  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--brass)", display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.8 }} />Größen
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap" }}>
        {sizes.map(s => (
          <div key={s.size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Avatar name="Gerald Korczewski" variant="brass" size={s.size} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute)" }}>{s.label}</span>
          </div>
        ))}
      </div>

      <div style={{ height: 1, background: "var(--line)", margin: "12px 0" }} />

      <div style={{ display: "flex", alignItems: "flex-end", gap: 28, flexWrap: "wrap" }}>
        {sizes.map(s => (
          <div key={s.size} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
            <Avatar name="Patrick Korczewski" variant="hairline" size={s.size} />
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute)" }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AvatarSpec() {
  return (
    <div style={{ padding: 40, display: "flex", flexDirection: "column", gap: 28 }}>
      <div style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "var(--brass)", display: "inline-flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 22, height: 1, background: "currentColor", opacity: 0.8 }} />Spec für Implementation
      </div>

      <div style={{ fontFamily: "var(--serif)", fontSize: 28, lineHeight: 1.2, color: "var(--fg)", maxWidth: "44ch" }}>
        Initialen sind immer <em style={{ color: "var(--brass-2)" }}>zwei Buchstaben</em> — Vor- und Nachname.
      </div>

      <pre style={{ margin: 0, padding: 22, background: "var(--ink-850)", borderRadius: "var(--radius-md)", border: "1px solid var(--line)", fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-soft)", lineHeight: 1.7, overflow: "auto" }}>
{`function initialsOf(name) {
  if (!name) return '??';
  const parts = name.trim().split(/\\s+/);
  const first = parts[0]?.[0] ?? '';
  const last  = parts.length > 1
    ? parts[parts.length - 1][0]
    : (parts[0]?.[1] ?? '');   // single-word fallback: first two chars
  return (first + last).toUpperCase() || '??';
}

initialsOf('Gerald Korczewski')   // → 'GK'
initialsOf('Patrick Korczewski')  // → 'PK'
initialsOf('Anna-Maria Schmidt')  // → 'AS'
initialsOf('Cher')                // → 'CH'
initialsOf('')                    // → '??'`}
      </pre>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22 }}>
        {[
          { k: "Letter size",   v: "38% of disc size" },
          { k: "Letter color",  v: "ink-900 on brass · brass-2 on dark" },
          { k: "Font",          v: "Geist 600 (default) · Geist Mono 500 (hairline/ring/plate)" },
          { k: "Tracking",      v: "−0.02em (sans) · +0.04em (mono)" },
          { k: "Radius",        v: "999px disc · radius-sm plate" },
          { k: "Min hit target",v: "≥ 32px (use 28px only when non-interactive)" },
        ].map(item => (
          <div key={item.k} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 0", borderTop: "1px solid var(--line)" }}>
            <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--mute)" }}>{item.k}</span>
            <span style={{ fontFamily: "var(--sans)", fontSize: 14, color: "var(--fg-soft)" }}>{item.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Avatar, NameRow, AvatarsBeforeAfter, AvatarVariants, AvatarSizes, AvatarSpec });
