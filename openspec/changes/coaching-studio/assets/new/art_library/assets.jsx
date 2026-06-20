/* eslint-disable */
// Mentolder — supporting style assets:
// brand marks (mark, animated brass-pulse, app icon),
// 12-color palette card, service icon set, surface tiles, type lockup.

// =====================================================================
// LOGOS
// =====================================================================

const LogoMark = ({ size = 140 }) => (
  // The "m." mark on a brass-rimmed deep-ink tile — same shape language as
  // the topbar `.brand .mark` plate but rendered editorial-scale.
  <svg width={size} height={size} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="ml-bg" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#1a2436"/>
        <stop offset="60%" stopColor="#101826"/>
        <stop offset="100%" stopColor="#0a0f18"/>
      </linearGradient>
      <linearGradient id="ml-brass" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor="#f0d28c"/>
        <stop offset="45%" stopColor="#d7b06a"/>
        <stop offset="100%" stopColor="#8a6a2a"/>
      </linearGradient>
      <linearGradient id="ml-ring" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="#f4dc9a"/>
        <stop offset="50%" stopColor="#c89a4a"/>
        <stop offset="100%" stopColor="#7a5a1a"/>
      </linearGradient>
      <filter id="ml-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.4"/>
        <feOffset dy="1.5"/>
        <feComponentTransfer><feFuncA type="linear" slope=".4"/></feComponentTransfer>
        <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <rect width="160" height="160" rx="36" ry="36" fill="url(#ml-bg)"/>
    <rect x="4" y="4" width="152" height="152" rx="32" ry="32"
          fill="none" stroke="url(#ml-ring)" strokeWidth="2.5"/>
    <text x="80" y="100" textAnchor="middle"
          fontFamily='Newsreader, "EB Garamond", Georgia, serif'
          fontWeight="500" fontSize="86"
          fill="url(#ml-brass)" filter="url(#ml-shadow)">m</text>
    {/* the brand "dot" */}
    <circle cx="118" cy="100" r="4.5" fill="url(#ml-brass)" filter="url(#ml-shadow)"/>
  </svg>
);

const LogoBrassPulse = ({ size = 140 }) => (
  // Animated counterpart — the brass mark with concentric pulse rings
  // (like the Korczewski radar logo, but warmed for Mentolder).
  <svg width={size} height={size} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bp-bg" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="#152033"/>
        <stop offset="100%" stopColor="#0a0f18"/>
      </radialGradient>
      <radialGradient id="bp-core" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#fff3d4"/>
        <stop offset="40%" stopColor="#e8c878"/>
        <stop offset="100%" stopColor="#8a6a2a" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="bp-ring" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor="#f4dc9a"/>
        <stop offset="100%" stopColor="#7a5a1a"/>
      </linearGradient>
      <filter id="bp-glow"><feGaussianBlur stdDeviation="3"/></filter>
      <clipPath id="bp-clip"><rect width="160" height="160" rx="36" ry="36"/></clipPath>
    </defs>
    <g clipPath="url(#bp-clip)">
      <rect width="160" height="160" fill="url(#bp-bg)"/>
      <rect x="4" y="4" width="152" height="152" rx="32" ry="32"
            fill="none" stroke="url(#bp-ring)" strokeWidth="2"/>
      {/* static rings */}
      <g transform="translate(80,80)" fill="none" stroke="#e8c878" strokeWidth="0.6">
        <circle r="22" opacity="0.22"/>
        <circle r="42" opacity="0.13"/>
        <circle r="62" opacity="0.07"/>
      </g>
      {/* animated pulse rings */}
      <g transform="translate(80,80)" fill="none" stroke="#f0d28c" strokeWidth="1.2">
        <circle className="pulse-ring-1" r="28" opacity="0"/>
        <circle className="pulse-ring-2" r="28" opacity="0"/>
        <circle className="pulse-ring-3" r="28" opacity="0"/>
      </g>
      {/* core */}
      <circle cx="80" cy="80" r="18" fill="url(#bp-core)" filter="url(#bp-glow)" className="core-glow"/>
      <circle cx="80" cy="80" r="7" fill="#fff3d4" className="core-glow"/>
    </g>
  </svg>
);

const LogoLockup = ({ size = 1 }) => (
  // wordmark "mentolder." inline mark
  <div style={{display:"inline-flex", alignItems:"center", gap: 14*size, color:"var(--fg)"}}>
    <span style={{
      width: 30*size, height: 30*size, borderRadius: 8*size,
      background: "radial-gradient(circle at 30% 30%, var(--brass-2), var(--brass) 55%, #8a6a2a 100%)",
      boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2), 0 0 0 1px rgba(0,0,0,.3)",
      position: "relative", display:"inline-block"
    }}>
      <span style={{
        position:"absolute", inset: 7*size, borderRadius: 3*size, background:"var(--ink-900)",
        clipPath: "polygon(0 55%, 30% 55%, 30% 0, 70% 0, 70% 55%, 100% 55%, 100% 100%, 0 100%)"
      }}/>
    </span>
    <span style={{fontFamily:"var(--serif)", fontSize: 28*size, letterSpacing:"-.01em"}}>
      mentolder<span style={{color:"var(--brass)"}}>.</span>
    </span>
  </div>
);

// =====================================================================
// TYPE LOCKUP
// =====================================================================

function TypeLockup() {
  return (
    <div className="typelock">
      <div className="typelock__big">
        <span className="typelock__m">m</span><span className="typelock__rest">entolder</span><span className="typelock__dot">.</span>
      </div>
      <div className="typelock__sub mono">DIGITAL COACHING · FÜHRUNGSKRÄFTE-BERATUNG · LÜNEBURG · 2026</div>
      <div className="typelock__divider"/>
      <div className="typelock__row">
        <div>
          <div className="eyebrow">Display · Newsreader</div>
          <div className="typelock__sample" style={{fontFamily:"var(--serif)", fontSize:"34px", lineHeight:1.1, fontWeight:350, letterSpacing:"-.02em"}}>
            Wieder <em>verbinden.</em>
          </div>
        </div>
        <div>
          <div className="eyebrow">Body · Geist</div>
          <div className="typelock__sample" style={{fontFamily:"var(--sans)", fontSize:"15px", lineHeight:1.6, color:"var(--fg-soft)"}}>
            Praxisnah, strukturiert, auf Augenhöhe — drei Worte und eine Haltung.
          </div>
        </div>
        <div>
          <div className="eyebrow">Mono · Geist Mono</div>
          <div className="typelock__sample mono" style={{fontSize:"12px", letterSpacing:"0.18em", textTransform:"uppercase"}}>
            ANNO 2026 · LÜNEBURG · DE
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// PALETTE
// =====================================================================

const PALETTE = [
  { hex: "#0B111C", name: "Tintenblau",   role: "Seite · Substrat" },
  { hex: "#101826", name: "Erhebung",     role: "Karte · Panel" },
  { hex: "#17202E", name: "Tiefenpanel",  role: "Quote · Eingaben" },
  { hex: "#EEF1F3", name: "Lichtweiß",    role: "Vordergrund · Text" },
  { hex: "#CDD3D9", name: "Nebel",        role: "Lede · Sekundär" },
  { hex: "#8C96A3", name: "Gedämpft",     role: "Mono · Mute" },
  { hex: "#D7B06A", name: "Messing",      role: "Akzent · Marke" },
  { hex: "#F0D28C", name: "Messing-Hell", role: "Hover · Highlight" },
  { hex: "#8A6A2A", name: "Messing-Tief", role: "Avatar · Schatten" },
  { hex: "#A8C9B0", name: "Salbei",       role: "Verfügbarkeit · Live" },
  { hex: "#D77A6E", name: "Tonrot",       role: "Warnung · Wappen" },
  { hex: "#6FA8D8", name: "Stille-Blau",  role: "Info · Link" }
];

function PaletteCard() {
  return (
    <div className="palette">
      {PALETTE.map(c => (
        <div key={c.hex} className="palette__sw">
          <div className="palette__chip" style={{background: c.hex}}/>
          <div className="palette__meta">
            <div className="palette__name">{c.name}</div>
            <div className="mono palette__hex">{c.hex.toUpperCase()}</div>
            <div className="palette__role mono">{c.role.toUpperCase()}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// =====================================================================
// SERVICE ICONS — six-piece set in the brand vocabulary
// (replaces "props" — small marks for the offer cards & marketing collateral)
// =====================================================================

const IconCompass = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="32" cy="32" r="22"/>
    <circle cx="32" cy="32" r="2.2" fill="currentColor"/>
    <path d="M32 14 L36 30 L32 50 L28 30 Z" fill="currentColor" opacity=".15"/>
    <path d="M32 14 L36 30 L32 32" stroke="currentColor"/>
    <path d="M32 50 L28 30 L32 32" stroke="currentColor"/>
    <path d="M32 8 L32 12 M32 52 L32 56 M8 32 L12 32 M52 32 L56 32" opacity=".5"/>
  </svg>
);

const IconHandshake = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 28 L18 28 L26 36 L30 32 L40 42 L36 46 L30 40"/>
    <path d="M58 28 L46 28 L38 36"/>
    <path d="M30 32 L36 26 L42 32"/>
    <path d="M14 24 L20 22 L26 26 M50 24 L44 22 L38 26" opacity=".7"/>
  </svg>
);

const IconBriefcase = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <rect x="10" y="20" width="44" height="32" rx="3"/>
    <path d="M24 20 L24 14 Q24 12 26 12 L38 12 Q40 12 40 14 L40 20"/>
    <line x1="10" y1="34" x2="54" y2="34"/>
    <rect x="28" y="32" width="8" height="4" rx="1" fill="currentColor" opacity=".15"/>
  </svg>
);

const IconBookmark = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 10 L48 10 Q50 10 50 12 L50 54 L32 44 L14 54 L14 12 Q14 10 16 10 Z" fill="currentColor" fillOpacity=".08"/>
    <path d="M22 22 L42 22 M22 30 L36 30" opacity=".7"/>
  </svg>
);

const IconChat = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 16 Q10 12 14 12 L46 12 Q50 12 50 16 L50 36 Q50 40 46 40 L26 40 L18 48 L18 40 L14 40 Q10 40 10 36 Z"
          fill="currentColor" fillOpacity=".08"/>
    <circle cx="22" cy="26" r="1.6" fill="currentColor"/>
    <circle cx="30" cy="26" r="1.6" fill="currentColor"/>
    <circle cx="38" cy="26" r="1.6" fill="currentColor"/>
  </svg>
);

const IconSpark = ({ s = 56 }) => (
  <svg viewBox="0 0 64 64" width={s} height={s} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M32 8 L34 26 L52 28 L34 30 L32 48 L30 30 L12 28 L30 26 Z"
          fill="currentColor" fillOpacity=".15"/>
    <path d="M48 50 L49 54 L53 55 L49 56 L48 60 L47 56 L43 55 L47 54 Z"
          fill="currentColor" fillOpacity=".4"/>
  </svg>
);

const ICONS = [
  { id: "compass",   de: "Orientierung", role: "Strategie · Klarheit",   el: IconCompass },
  { id: "handshake", de: "Begleitung",   role: "Coaching · Sparring",     el: IconHandshake },
  { id: "briefcase", de: "Beratung",     role: "Unternehmen · Mandat",    el: IconBriefcase },
  { id: "bookmark",  de: "Methode",      role: "Werkzeug · Notiz",        el: IconBookmark },
  { id: "chat",      de: "Erstgespräch", role: "30 Min. · kostenlos",     el: IconChat },
  { id: "spark",     de: "Veränderung",  role: "Transfer · Haltung",      el: IconSpark }
];

function IconGrid() {
  return (
    <div className="icons">
      {ICONS.map(p => {
        const El = p.el;
        return (
          <div key={p.id} className="icons__cell">
            <div className="icons__art" style={{color:"var(--brass)"}}><El/></div>
            <div className="icons__cap">
              <div className="icons__name">{p.de}</div>
              <div className="mono icons__id">IC · {p.id.toUpperCase()}</div>
              <div className="mono icons__role">{p.role}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
// SURFACE TILES — six tonal swatches that anchor the brand's editorial
// surfaces (replaces "terrain"). Each tile is a stripe of how light
// behaves on the brand's substrates.
// =====================================================================

function SurfaceTile({ name, id, role, render }) {
  return (
    <div className="surface__cell">
      <div className="surface__tile">{render()}</div>
      <div className="surface__cap">
        <div>
          <div className="surface__name">{name}</div>
          <div className="mono surface__role">{role}</div>
        </div>
        <div className="mono surface__id">{id}</div>
      </div>
    </div>
  );
}

function SurfaceGrid() {
  return (
    <div className="surface">
      <SurfaceTile name="Tinte · Tief" id="SUR-01" role="Seitensubstrat" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <defs><radialGradient id="sur1" cx="60%" cy="40%" r="80%">
            <stop offset="0%" stopColor="#1a2436"/><stop offset="100%" stopColor="#070b14"/>
          </radialGradient></defs>
          <rect width="240" height="160" fill="url(#sur1)"/>
          {Array.from({length:60}).map((_,i)=>(
            <circle key={i} cx={(i*37+i*i*3)%240} cy={(i*23+i*i*5)%160} r="0.5" fill="#fff" opacity={0.08+(i%5)*0.02}/>
          ))}
        </svg>
      )}/>
      <SurfaceTile name="Messing-Halo" id="SUR-02" role="Hero · CTA" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <defs><radialGradient id="sur2" cx="70%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#e8c878" stopOpacity="0.55"/>
            <stop offset="60%" stopColor="#8a6a2a" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="#0b111c" stopOpacity="0"/>
          </radialGradient></defs>
          <rect width="240" height="160" fill="#0b111c"/>
          <rect width="240" height="160" fill="url(#sur2)"/>
        </svg>
      )}/>
      <SurfaceTile name="Stille-Blau" id="SUR-03" role="Schatten · Tiefe" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <defs><radialGradient id="sur3" cx="30%" cy="70%" r="70%">
            <stop offset="0%" stopColor="#3a5a82" stopOpacity="0.55"/>
            <stop offset="100%" stopColor="#0b111c" stopOpacity="0"/>
          </radialGradient></defs>
          <rect width="240" height="160" fill="#0b111c"/>
          <rect width="240" height="160" fill="url(#sur3)"/>
        </svg>
      )}/>
      <SurfaceTile name="Hairline-Gitter" id="SUR-04" role="Strip · Karte" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="240" height="160" fill="#101826"/>
          {[40,80,120,160,200].map(x=>(
            <line key={x} x1={x} y1="0" x2={x} y2="160" stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
          ))}
          {[40,80,120].map(y=>(
            <line key={y} x1="0" y1={y} x2="240" y2={y} stroke="rgba(255,255,255,0.07)" strokeWidth="1"/>
          ))}
          <line x1="120" y1="0" x2="120" y2="160" stroke="#d7b06a" strokeWidth="1" opacity="0.45"/>
        </svg>
      )}/>
      <SurfaceTile name="Duotone · Porträt" id="SUR-05" role="Bild · Wash" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <linearGradient id="sur5" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#e8c878" stopOpacity="0.18"/>
              <stop offset="40%" stopColor="#8a8a8a" stopOpacity="0.08"/>
              <stop offset="100%" stopColor="#1a2436" stopOpacity="0.6"/>
            </linearGradient>
          </defs>
          <rect width="240" height="160" fill="#3c4452"/>
          <rect width="240" height="160" fill="url(#sur5)"/>
          {Array.from({length:80}).map((_,i)=>(
            <circle key={i} cx={(i*29)%240} cy={(i*19)%160} r="0.4" fill="#fff" opacity="0.15"/>
          ))}
        </svg>
      )}/>
      <SurfaceTile name="Salbei-Puls" id="SUR-06" role="Verfügbarkeit · Live" render={() => (
        <svg viewBox="0 0 240 160" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="240" height="160" fill="#101826"/>
          <circle cx="120" cy="80" r="50" fill="none" stroke="#a8c9b0" strokeWidth="0.6" opacity="0.45"/>
          <circle cx="120" cy="80" r="32" fill="none" stroke="#a8c9b0" strokeWidth="0.8" opacity="0.6"/>
          <circle cx="120" cy="80" r="16" fill="none" stroke="#a8c9b0" strokeWidth="1" opacity="0.85"/>
          <circle cx="120" cy="80" r="5" fill="#a8c9b0"/>
        </svg>
      )}/>
    </div>
  );
}

// expose
window.LogoMark = LogoMark;
window.LogoBrassPulse = LogoBrassPulse;
window.LogoLockup = LogoLockup;
window.TypeLockup = TypeLockup;
window.PaletteCard = PaletteCard;
window.IconGrid = IconGrid;
window.SurfaceGrid = SurfaceGrid;
window.PALETTE = PALETTE;
window.ICONS = ICONS;
