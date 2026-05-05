/* eslint-disable */
// Supporting style assets for the portfolio: K logos, color palette card,
// prop tokens, terrain swatches, typography lockup.

// ---- THE TWO K LOGOS (lifted faithfully from the KERN/KORE Claude artifact) ----

const LogoAppIcon = ({ size = 160 }) => (
  <svg width={size} height={size} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#1a1a2e"/>
        <stop offset="100%" stopColor="#0c0c18"/>
      </radialGradient>
      <radialGradient id="core1" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#d4ff6e"/>
        <stop offset="40%" stopColor="#a8e040"/>
        <stop offset="100%" stopColor="#4a8010" stopOpacity="0"/>
      </radialGradient>
      <filter id="glow1">
        <feGaussianBlur stdDeviation="3" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="softglow">
        <feGaussianBlur stdDeviation="8" result="blur"/>
        <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <clipPath id="rounded1">
        <rect width="160" height="160" rx="36" ry="36"/>
      </clipPath>
    </defs>
    <g clipPath="url(#rounded1)">
      <rect width="160" height="160" fill="url(#bg1)"/>
      <g transform="translate(62, 82)" fill="none" stroke="#b8ff4a" strokeWidth="0.5">
        <circle r="20" opacity="0.25"/>
        <circle r="36" opacity="0.15"/>
        <circle r="52" opacity="0.10"/>
        <circle r="68" opacity="0.06"/>
      </g>
      <circle cx="62" cy="82" r="38" fill="#6aaa00" opacity="0.12" filter="url(#softglow)"/>
      <line x1="62" y1="82" x2="108" y2="34" stroke="#c8f050" strokeWidth="9" strokeLinecap="round" filter="url(#glow1)" opacity="0.95"/>
      <line x1="62" y1="82" x2="108" y2="130" stroke="#c8f050" strokeWidth="9" strokeLinecap="round" filter="url(#glow1)" opacity="0.95"/>
      <line x1="30" y1="30" x2="30" y2="134" stroke="#c8f050" strokeWidth="9" strokeLinecap="round" filter="url(#glow1)" opacity="0.85"/>
      <circle cx="62" cy="82" r="10" fill="url(#core1)" className="core-glow" filter="url(#softglow)"/>
      <circle cx="62" cy="82" r="5" fill="#eeff88" filter="url(#glow1)"/>
    </g>
  </svg>
);

const LogoRadarPulse = ({ size = 160 }) => (
  <svg width={size} height={size} viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <radialGradient id="bg2" cx="45%" cy="52%" r="60%">
        <stop offset="0%" stopColor="#141428"/>
        <stop offset="100%" stopColor="#07070f"/>
      </radialGradient>
      <radialGradient id="core2" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#ffffff"/>
        <stop offset="30%" stopColor="#d0ff60"/>
        <stop offset="100%" stopColor="#4a8010" stopOpacity="0"/>
      </radialGradient>
      <filter id="glow2">
        <feGaussianBlur stdDeviation="2.5" result="b"/>
        <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
      <filter id="softglow2"><feGaussianBlur stdDeviation="10"/></filter>
      <clipPath id="rounded2"><rect width="160" height="160" rx="36" ry="36"/></clipPath>
    </defs>
    <g clipPath="url(#rounded2)">
      <rect width="160" height="160" fill="url(#bg2)"/>
      <g transform="translate(72, 80)" fill="none" stroke="#b0e840" strokeWidth="1">
        <circle className="pulse-ring-1" r="28" opacity="0"/>
        <circle className="pulse-ring-2" r="28" opacity="0"/>
        <circle className="pulse-ring-3" r="28" opacity="0"/>
      </g>
      <g transform="translate(72, 80)" fill="none" stroke="#b8ff4a" strokeWidth="0.5">
        <circle r="22" opacity="0.2"/>
        <circle r="40" opacity="0.12"/>
        <circle r="58" opacity="0.07"/>
      </g>
      <ellipse cx="72" cy="80" rx="36" ry="34" fill="#88cc00" opacity="0.1" filter="url(#softglow2)"/>
      <line x1="32" y1="28" x2="32" y2="132" stroke="#c0f040" strokeWidth="8" strokeLinecap="round" filter="url(#glow2)"/>
      <line x1="72" y1="80" x2="116" y2="28" stroke="#c8f858" strokeWidth="8" strokeLinecap="round" filter="url(#glow2)"/>
      <line x1="72" y1="80" x2="116" y2="132" stroke="#c8f858" strokeWidth="8" strokeLinecap="round" filter="url(#glow2)"/>
      <circle cx="72" cy="80" r="12" fill="#88cc00" opacity="0.3" filter="url(#softglow2)" className="core-glow"/>
      <circle cx="72" cy="80" r="6" fill="url(#core2)" filter="url(#glow2)" className="core-glow"/>
      <circle cx="72" cy="80" r="3" fill="#ffffff"/>
    </g>
  </svg>
);

// ---- COLOR PALETTE ----
const PALETTE = [
  { hex: "#0F0B18", name: "Tafelschwarz", role: "Brett · Substrat" },
  { hex: "#3D8A4F", name: "Mooshain", role: "Elara · Kleid" },
  { hex: "#C0341D", name: "Hexenrot", role: "Elara · Haar" },
  { hex: "#6B7480", name: "Eisengrau", role: "Brann · Rüstung" },
  { hex: "#C26A2A", name: "Schmiedebart", role: "Brann · Bart" },
  { hex: "#3A3148", name: "Mönchsviolett", role: "Korrin · Robe" },
  { hex: "#5C2E2A", name: "Postrot", role: "Vex · Mantel" },
  { hex: "#C8F76A", name: "Plasmalimette", role: "Akzent · Marke" },
  { hex: "#5BD4D0", name: "Kelchcyan", role: "Sigille · Lebenslicht" },
  { hex: "#E8DCC0", name: "Knochenelfenbein", role: "Hörner · Papier" },
  { hex: "#E26B6B", name: "Wundrot", role: "Schaden · Wappen" },
  { hex: "#EDE6D8", name: "Pergament", role: "Karten · Notizen" }
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

// ---- PROP TOKENS ----
// Small SVG props for the board: chest, key, torch, potion, scroll, coin
function PropChest({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <path d="M10,30 L54,30 L54,54 L10,54 Z" fill="#7A4A22"/>
    <path d="M10,30 Q10,18 32,16 Q54,18 54,30 Z" fill="#9A5A2A"/>
    <rect x="10" y="36" width="44" height="3" fill="#3C2310"/>
    <rect x="28" y="30" width="8" height="14" fill="#C8B068"/>
    <circle cx="32" cy="38" r="1.5" fill="#3C2310"/>
    <ellipse cx="32" cy="58" rx="22" ry="2" fill="#000" opacity="0.4"/>
  </svg>
); }

function PropTorch({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <path d="M28,38 L36,38 L34,58 L30,58 Z" fill="#5A3618"/>
    <ellipse cx="32" cy="36" rx="6" ry="3" fill="#3C2310"/>
    <path d="M28,36 Q24,22 32,12 Q40,22 36,36 Q34,28 32,32 Q30,28 28,36 Z" fill="#FFB347"/>
    <path d="M30,32 Q28,22 32,16 Q36,22 34,32 Q33,26 32,28 Q31,26 30,32 Z" fill="#FFE066"/>
    <ellipse cx="32" cy="60" rx="14" ry="2" fill="#000" opacity="0.4"/>
  </svg>
); }

function PropPotion({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <path d="M26,18 L38,18 L38,28 Q46,32 46,42 Q46,54 32,54 Q18,54 18,42 Q18,32 26,28 Z" fill="#5BD4D0" opacity="0.85"/>
    <path d="M22,42 Q22,32 32,32 Q42,32 42,42" fill="none" stroke="#fff" strokeWidth="1" opacity="0.4"/>
    <rect x="24" y="14" width="16" height="6" fill="#3A2E52"/>
    <rect x="22" y="12" width="20" height="4" fill="#221932"/>
    <ellipse cx="32" cy="58" rx="14" ry="2" fill="#000" opacity="0.4"/>
  </svg>
); }

function PropKey({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <circle cx="20" cy="32" r="10" fill="none" stroke="#C8B068" strokeWidth="3"/>
    <circle cx="20" cy="32" r="3" fill="#0F0B18"/>
    <rect x="28" y="30" width="22" height="4" fill="#C8B068"/>
    <rect x="42" y="34" width="3" height="6" fill="#C8B068"/>
    <rect x="48" y="34" width="3" height="6" fill="#C8B068"/>
    <ellipse cx="32" cy="58" rx="20" ry="1.5" fill="#000" opacity="0.4"/>
  </svg>
); }

function PropScroll({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <rect x="14" y="22" width="36" height="22" fill="#EDE6D8"/>
    <line x1="20" y1="28" x2="44" y2="28" stroke="#6B8B1F" strokeWidth="0.6"/>
    <line x1="20" y1="32" x2="44" y2="32" stroke="#6B8B1F" strokeWidth="0.6"/>
    <line x1="20" y1="36" x2="38" y2="36" stroke="#6B8B1F" strokeWidth="0.6"/>
    <ellipse cx="14" cy="33" rx="4" ry="11" fill="#D2C9B6"/>
    <ellipse cx="50" cy="33" rx="4" ry="11" fill="#D2C9B6"/>
    <ellipse cx="32" cy="58" rx="22" ry="2" fill="#000" opacity="0.4"/>
  </svg>
); }

function PropCoin({ s = 64 }) { return (
  <svg viewBox="0 0 64 64" width={s} height={s}>
    <ellipse cx="32" cy="34" rx="14" ry="14" fill="#C8B068"/>
    <ellipse cx="32" cy="32" rx="14" ry="14" fill="#E8C870"/>
    <text x="32" y="38" textAnchor="middle" fontFamily="serif" fontSize="14" fill="#7A5818" fontStyle="italic">K</text>
    <ellipse cx="32" cy="58" rx="14" ry="1.5" fill="#000" opacity="0.4"/>
  </svg>
); }

const PROPS = [
  { id: "chest", de: "Truhe", el: PropChest },
  { id: "torch", de: "Fackel", el: PropTorch },
  { id: "potion", de: "Trank", el: PropPotion },
  { id: "key", de: "Schlüssel", el: PropKey },
  { id: "scroll", de: "Schriftrolle", el: PropScroll },
  { id: "coin", de: "Münze", el: PropCoin }
];

function PropGrid() {
  return (
    <div className="props">
      {PROPS.map(p => {
        const El = p.el;
        return (
          <div key={p.id} className="props__cell">
            <div className="props__art"><El/></div>
            <div className="props__cap">
              <div className="props__name">{p.de}</div>
              <div className="mono props__id">{p.id.toUpperCase()}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---- TERRAIN SWATCHES (textured tiles for the board) ----
function TerrainTile({ name, id, render }) {
  return (
    <div className="terrain__cell">
      <div className="terrain__tile">{render()}</div>
      <div className="terrain__cap">
        <div className="terrain__name">{name}</div>
        <div className="mono terrain__id">{id}</div>
      </div>
    </div>
  );
}

function TerrainGrid() {
  return (
    <div className="terrain">
      <TerrainTile name="Wald" id="TER-01" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="120" height="80" fill="#22542F"/>
          {Array.from({length: 14}).map((_,i) => {
            const x = (i*9 + (i%2)*4) % 120;
            const y = (i*13) % 64 + 12;
            return <g key={i} transform={`translate(${x},${y})`}>
              <path d="M0,8 L4,-2 L8,8 Z" fill="#3D8A4F"/>
              <path d="M2,4 L4,-4 L6,4 Z" fill="#5BA862"/>
              <rect x="3" y="8" width="2" height="3" fill="#5A3618"/>
            </g>;
          })}
        </svg>
      )}/>
      <TerrainTile name="Stein" id="TER-02" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="120" height="80" fill="#3C434C"/>
          {Array.from({length: 8}).map((_,i) => (
            <ellipse key={i} cx={(i*17+8)%120} cy={(i*11+12)%70} rx={6+(i%3)} ry={4+(i%2)} fill="#6B7480" opacity={0.7}/>
          ))}
          {Array.from({length: 6}).map((_,i) => (
            <ellipse key={`h${i}`} cx={(i*22+12)%120} cy={(i*17+10)%70} rx={3} ry={2} fill="#A8B0BB" opacity={0.4}/>
          ))}
        </svg>
      )}/>
      <TerrainTile name="Wasser" id="TER-03" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="120" height="80" fill="#1E4A5C"/>
          {Array.from({length: 5}).map((_,i) => (
            <path key={i} d={`M0,${10+i*16} Q30,${6+i*16} 60,${10+i*16} T120,${10+i*16}`}
              stroke="#5BD4D0" strokeWidth="1" fill="none" opacity={0.5 - i*0.06}/>
          ))}
          {Array.from({length: 8}).map((_,i) => (
            <circle key={`b${i}`} cx={(i*15+5)%120} cy={(i*9+15)%72} r="1" fill="#82E2DF" opacity={0.7}/>
          ))}
        </svg>
      )}/>
      <TerrainTile name="Holzdiele" id="TER-04" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <rect width="120" height="80" fill="#5A3618"/>
          {[0,16,32,48,64].map(y => (
            <g key={y}>
              <line x1="0" y1={y} x2="120" y2={y} stroke="#3C2310" strokeWidth="1"/>
              <path d={`M0,${y+8} Q60,${y+5} 120,${y+8}`} stroke="#7A4A22" strokeWidth="0.6" fill="none" opacity="0.6"/>
              <circle cx={(y*3)%110+5} cy={y+8} r="1" fill="#3C2310"/>
              <circle cx={(y*3)%110+90} cy={y+8} r="1" fill="#3C2310"/>
            </g>
          ))}
        </svg>
      )}/>
      <TerrainTile name="Schnee" id="TER-05" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <defs><linearGradient id="snow-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E8EEF2"/><stop offset="100%" stopColor="#A8B6C0"/>
          </linearGradient></defs>
          <rect width="120" height="80" fill="url(#snow-g)"/>
          {Array.from({length:14}).map((_,i) => (
            <circle key={i} cx={(i*9+3)%120} cy={(i*7+5)%75} r={1.5} fill="#fff" opacity="0.9"/>
          ))}
          {[0,1,2].map(i => (
            <path key={i} d={`M${i*45+10},${50+i*8} Q${i*45+30},${44+i*8} ${i*45+50},${50+i*8}`}
              stroke="#fff" strokeWidth="2" fill="none" opacity="0.7"/>
          ))}
        </svg>
      )}/>
      <TerrainTile name="Sand" id="TER-06" render={() => (
        <svg viewBox="0 0 120 80" width="100%" height="100%" preserveAspectRatio="none">
          <defs><linearGradient id="sand-g" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#E8C878"/><stop offset="100%" stopColor="#B89A58"/>
          </linearGradient></defs>
          <rect width="120" height="80" fill="url(#sand-g)"/>
          {Array.from({length: 4}).map((_,i) => (
            <path key={i} d={`M0,${20+i*15} Q60,${15+i*15} 120,${22+i*15}`}
              stroke="#9A7E3C" strokeWidth="0.7" fill="none" opacity="0.7"/>
          ))}
          {Array.from({length:30}).map((_,i) => (
            <circle key={`s${i}`} cx={(i*7+3)%120} cy={(i*11+4)%76} r={0.6} fill="#7A5818" opacity="0.5"/>
          ))}
        </svg>
      )}/>
    </div>
  );
}

// ---- TYPOGRAPHY LOCKUP ----
function TypeLockup() {
  return (
    <div className="typelock">
      <div className="typelock__big">
        <span className="typelock__k">K</span>
        <span className="typelock__rest">orczewski</span>
      </div>
      <div className="typelock__sub mono">EIN BRETTSPIEL · STUDIO-NOTIZBUCH · 2026</div>
      <div className="typelock__divider"/>
      <div className="typelock__row">
        <div>
          <div className="eyebrow">Display</div>
          <div className="typelock__sample" style={{fontFamily: "var(--serif)", fontSize: "32px"}}>
            Der Wald war <em>still</em>.
          </div>
        </div>
        <div>
          <div className="eyebrow">Body</div>
          <div className="typelock__sample" style={{fontFamily: "var(--sans)", fontSize: "15px", lineHeight: 1.55, color: "var(--fg-soft)"}}>
            Vier Figuren stehen auf dem Brett. Jede in einer eigenen Farbe, jede mit einer eigenen Geschichte.
          </div>
        </div>
        <div>
          <div className="eyebrow">Mono · Token</div>
          <div className="typelock__sample mono" style={{fontSize: "12px", letterSpacing: "0.18em", textTransform: "uppercase"}}>
            FIG-01 · ELARA · GRÜNES KLEID · ROTES HAAR
          </div>
        </div>
      </div>
    </div>
  );
}

window.LogoAppIcon = LogoAppIcon;
window.LogoRadarPulse = LogoRadarPulse;
window.PaletteCard = PaletteCard;
window.PropGrid = PropGrid;
window.TerrainGrid = TerrainGrid;
window.TypeLockup = TypeLockup;
