// =====================================================================
//  arena-assets.jsx — All new Arena SVG asset components.
//  Style: top-down, chunky vector, lime-rim + ink fills, no realism.
// =====================================================================

const KORE = {
  ink900: '#120D1C',
  ink850: '#1A1326',
  ink800: '#241A33',
  ink700: '#2D2240',
  ink600: '#3A2E52',
  fg: '#ECEFF3',
  fgSoft: '#C8C4D2',
  mute: '#8A8497',
  lime: '#C8F76A',
  lime2: '#D8FF8A',
  lime3: '#E6FFB0',
  limeInk: '#2A3A0C',
  cyan: '#5BD4D0',
  bone: '#EDE6D8',
  blood: '#D33A2C',
  bloodDk: '#8E1F18',
  rust: '#A0573A',
  brass: '#C8A857',
};

/* small helper for an iso-ish drop shadow */
const RIM = `0 1px 0 ${KORE.lime}33`;

/* ====================== WEAPONS (set 2) ============================ */

function Shotgun({ size = 180 }) {
  const w = size, h = size * 0.42;
  return (
    <svg viewBox="0 0 180 76" width={w} height={h}>
      {/* stock */}
      <path d="M2 28 L34 22 L40 36 L40 50 L34 60 L4 56 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".7"/>
      <path d="M8 30 L30 26 L34 38 L30 52 L10 50 Z" fill={KORE.ink850}/>
      {/* receiver */}
      <rect x="38" y="32" width="42" height="20" rx="2" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".7"/>
      <rect x="42" y="36" width="34" height="12" fill={KORE.ink900}/>
      {/* pump */}
      <rect x="60" y="50" width="22" height="10" rx="2" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="64" y1="55" x2="78" y2="55" stroke={KORE.ink900} strokeWidth="1.2"/>
      {/* trigger */}
      <path d="M48 52 Q50 60 56 60" fill="none" stroke={KORE.lime} strokeWidth="1"/>
      {/* barrel + tube mag underneath */}
      <rect x="78" y="36" width="92" height="10" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <rect x="78" y="48" width="86" height="8"  fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".5"/>
      {/* bead sight */}
      <circle cx="166" cy="41" r="1.6" fill={KORE.lime}/>
      {/* muzzle */}
      <rect x="170" y="36" width="6" height="10" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
    </svg>
  );
}

function MP5({ size = 150 }) {
  const w = size, h = size * 0.5;
  return (
    <svg viewBox="0 0 150 75" width={w} height={h}>
      {/* stock */}
      <path d="M2 30 L24 28 L24 44 L2 42 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".6"/>
      {/* receiver */}
      <rect x="24" y="24" width="46" height="26" rx="2" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".7"/>
      <rect x="28" y="28" width="38" height="6" fill={KORE.ink900}/>
      {/* charging handle */}
      <circle cx="64" cy="20" r="3" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".5"/>
      <line x1="64" y1="20" x2="64" y2="24" stroke={KORE.ink600} strokeWidth="1.4"/>
      {/* mag — curved */}
      <path d="M44 50 Q44 65 50 70 L60 70 Q66 65 66 50 Z" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <path d="M48 53 Q48 64 52 67 L58 67 Q62 64 62 53 Z" fill={KORE.ink850}/>
      {/* grip */}
      <path d="M68 48 Q70 60 76 62 L80 50 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".6"/>
      {/* trigger */}
      <path d="M72 50 Q74 56 78 56" fill="none" stroke={KORE.lime} strokeWidth=".8"/>
      {/* barrel + handguard */}
      <rect x="70" y="30" width="60" height="14" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="74" y1="34" x2="124" y2="34" stroke={KORE.ink900} strokeWidth=".6"/>
      <line x1="74" y1="40" x2="124" y2="40" stroke={KORE.ink900} strokeWidth=".6"/>
      {/* muzzle */}
      <rect x="130" y="32" width="14" height="10" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
      <circle cx="137" cy="37" r="2" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".6"/>
    </svg>
  );
}

function Sniper({ size = 210 }) {
  const w = size, h = size * 0.34;
  return (
    <svg viewBox="0 0 210 72" width={w} height={h}>
      {/* stock */}
      <path d="M2 32 L40 26 L42 50 L4 56 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="6" y1="36" x2="34" y2="32" stroke={KORE.ink850} strokeWidth=".6"/>
      <line x1="6" y1="44" x2="34" y2="42" stroke={KORE.ink850} strokeWidth=".6"/>
      {/* receiver */}
      <rect x="42" y="30" width="48" height="22" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".7"/>
      {/* bolt */}
      <circle cx="86" cy="28" r="3" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".5"/>
      <line x1="86" y1="28" x2="86" y2="22" stroke={KORE.ink600} strokeWidth="1.6"/>
      {/* mag */}
      <rect x="56" y="52" width="14" height="10" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".6"/>
      {/* trigger */}
      <path d="M62 52 Q64 58 68 58" fill="none" stroke={KORE.lime} strokeWidth=".8"/>
      {/* scope */}
      <rect x="56" y="14" width="34" height="14" rx="3" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
      <circle cx="62" cy="21" r="3" fill={KORE.ink850} stroke={KORE.lime} strokeWidth=".5"/>
      <circle cx="84" cy="21" r="3" fill={KORE.ink850} stroke={KORE.lime} strokeWidth=".5"/>
      <line x1="65" y1="21" x2="81" y2="21" stroke={KORE.ink700} strokeWidth=".6"/>
      {/* barrel */}
      <rect x="90" y="36" width="100" height="10" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      {/* bipod */}
      <line x1="140" y1="46" x2="134" y2="60" stroke={KORE.ink600} strokeWidth="1.6"/>
      <line x1="148" y1="46" x2="156" y2="60" stroke={KORE.ink600} strokeWidth="1.6"/>
      {/* muzzle brake */}
      <rect x="190" y="34" width="14" height="14" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="194" y1="38" x2="194" y2="44" stroke={KORE.lime} strokeWidth=".6"/>
      <line x1="200" y1="38" x2="200" y2="44" stroke={KORE.lime} strokeWidth=".6"/>
    </svg>
  );
}

function Knife({ size = 120 }) {
  const w = size, h = size * 0.32;
  return (
    <svg viewBox="0 0 120 38" width={w} height={h}>
      {/* handle */}
      <rect x="2" y="14" width="38" height="12" rx="2" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="8"  y1="20" x2="36" y2="20" stroke={KORE.ink900} strokeWidth=".6"/>
      <circle cx="6" cy="20" r="1.4" fill={KORE.lime}/>
      {/* guard */}
      <rect x="40" y="10" width="6" height="20" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".6"/>
      {/* blade */}
      <path d="M46 14 L110 18 L116 20 L110 22 L46 26 Z" fill={KORE.fg} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="50" y1="20" x2="108" y2="20" stroke={KORE.mute} strokeWidth=".5"/>
      {/* tip glint */}
      <line x1="100" y1="19" x2="115" y2="20" stroke={KORE.lime} strokeWidth=".6"/>
    </svg>
  );
}

function FragGrenade({ size = 72 }) {
  const w = size;
  return (
    <svg viewBox="0 0 72 72" width={w} height={w}>
      {/* body */}
      <ellipse cx="36" cy="42" rx="20" ry="22" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      {/* segments */}
      <g stroke={KORE.ink900} strokeWidth=".7" fill="none">
        <line x1="24" y1="26" x2="48" y2="26"/>
        <line x1="20" y1="34" x2="52" y2="34"/>
        <line x1="20" y1="42" x2="52" y2="42"/>
        <line x1="20" y1="50" x2="52" y2="50"/>
        <line x1="24" y1="58" x2="48" y2="58"/>
        <line x1="36" y1="22" x2="36" y2="62"/>
        <line x1="28" y1="22" x2="28" y2="62"/>
        <line x1="44" y1="22" x2="44" y2="62"/>
      </g>
      {/* fuse */}
      <rect x="32" y="14" width="8" height="8" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".7"/>
      <path d="M40 16 Q52 12 54 22 L52 24 Q44 22 42 18 Z" fill="none" stroke={KORE.lime} strokeWidth="1.2"/>
      <circle cx="54" cy="22" r="2.2" fill={KORE.lime}/>
    </svg>
  );
}

function RPG({ size = 190 }) {
  const w = size, h = size * 0.34;
  return (
    <svg viewBox="0 0 190 64" width={w} height={h}>
      {/* tube */}
      <rect x="32" y="22" width="120" height="20" rx="2" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="40" y1="28" x2="146" y2="28" stroke={KORE.ink900} strokeWidth=".6"/>
      <line x1="40" y1="36" x2="146" y2="36" stroke={KORE.ink900} strokeWidth=".6"/>
      {/* rear flare */}
      <path d="M32 22 L20 14 L20 50 L32 42 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".7"/>
      {/* front cone (warhead) */}
      <path d="M152 22 L168 22 L182 32 L168 42 L152 42 Z" fill={KORE.rust} stroke={KORE.lime} strokeWidth=".8"/>
      <circle cx="170" cy="32" r="3" fill={KORE.lime}/>
      {/* grip */}
      <path d="M70 42 Q72 56 80 58 L84 44 Z" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".7"/>
      {/* sight */}
      <rect x="98" y="14" width="6" height="10" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".6"/>
      <rect x="60" y="14" width="6" height="10" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".6"/>
    </svg>
  );
}

function Molotov({ size = 86 }) {
  return (
    <svg viewBox="0 0 86 86" width={size} height={size}>
      {/* bottle */}
      <path d="M34 28 L34 22 L52 22 L52 28 L56 36 L56 70 Q56 78 48 78 L38 78 Q30 78 30 70 L30 36 Z" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".8"/>
      {/* liquid */}
      <path d="M32 44 L54 44 L54 70 Q54 76 48 76 L38 76 Q32 76 32 70 Z" fill={KORE.rust}/>
      {/* highlight */}
      <line x1="34" y1="50" x2="34" y2="68" stroke={KORE.lime2} strokeWidth="1" opacity=".5"/>
      {/* label */}
      <rect x="34" y="56" width="18" height="8" fill={KORE.bone} opacity=".85"/>
      <line x1="36" y1="60" x2="50" y2="60" stroke={KORE.ink900} strokeWidth=".6"/>
      {/* rag */}
      <path d="M38 22 Q40 14 44 12 Q50 10 50 16 L48 22 Z" fill={KORE.bone} stroke={KORE.lime} strokeWidth=".5"/>
      {/* flame */}
      <path d="M44 8 Q40 4 42 0 Q50 4 50 10 Q56 8 50 16 Q44 12 44 8 Z" fill={KORE.lime} opacity=".85"/>
      <path d="M44 6 Q44 2 46 0 Q50 4 48 8 Z" fill={KORE.lime3}/>
    </svg>
  );
}

function Bullet({ size = 28 }) {
  return (
    <svg viewBox="0 0 28 12" width={size} height={size * 12 / 28}>
      <path d="M0 4 L20 4 L26 6 L20 8 L0 8 Z" fill={KORE.brass} stroke={KORE.lime} strokeWidth=".5"/>
      <line x1="20" y1="4" x2="26" y2="6" stroke={KORE.fg} strokeWidth=".4"/>
    </svg>
  );
}

function Shell({ size = 28 }) {
  return (
    <svg viewBox="0 0 28 12" width={size} height={size * 12 / 28}>
      <rect x="0" y="3" width="22" height="6" fill={KORE.brass} stroke={KORE.lime} strokeWidth=".5"/>
      <rect x="0" y="3" width="4" height="6" fill={KORE.rust}/>
      <line x1="4" y1="3" x2="4" y2="9" stroke={KORE.ink900} strokeWidth=".5"/>
    </svg>
  );
}

/* ====================== PICKUPS ===================================== */

function HealthPack({ size = 90 }) {
  return (
    <svg viewBox="0 0 90 90" width={size} height={size}>
      <rect x="10" y="20" width="70" height="56" rx="6" fill={KORE.bone} stroke={KORE.lime} strokeWidth="1"/>
      <rect x="10" y="20" width="70" height="10" fill={KORE.blood}/>
      <rect x="38" y="36" width="14" height="34" fill={KORE.blood}/>
      <rect x="22" y="46" width="46" height="14" fill={KORE.blood}/>
      {/* corner mounts */}
      <circle cx="16" cy="68" r="2" fill={KORE.ink900}/>
      <circle cx="74" cy="68" r="2" fill={KORE.ink900}/>
      {/* tag */}
      <rect x="34" y="14" width="22" height="6" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".5"/>
    </svg>
  );
}

function MedSyringe({ size = 86 }) {
  return (
    <svg viewBox="0 0 86 86" width={size} height={size}>
      <g transform="rotate(-30 43 43)">
        <rect x="14" y="38" width="30" height="10" fill={KORE.bone} stroke={KORE.lime} strokeWidth=".7"/>
        <rect x="14" y="38" width="30" height="10" fill="none" stroke={KORE.ink700} strokeWidth=".4" strokeDasharray="2 2"/>
        <rect x="44" y="40" width="14" height="6" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".6"/>
        <line x1="58" y1="43" x2="74" y2="43" stroke={KORE.fg} strokeWidth="1.2"/>
        <rect x="6" y="36" width="8" height="14" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".6"/>
        {/* liquid */}
        <rect x="16" y="40" width="22" height="6" fill={KORE.lime}/>
        <text x="29" y="35" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" fill={KORE.ink900}>+1HP</text>
      </g>
    </svg>
  );
}

function ArmorPlate({ size = 90 }) {
  return (
    <svg viewBox="0 0 90 90" width={size} height={size}>
      <path d="M45 14 L74 24 L72 56 Q72 70 45 80 Q18 70 18 56 L16 24 Z"
        fill={KORE.ink700} stroke={KORE.lime} strokeWidth="1.2"/>
      <path d="M45 22 L66 30 L64 54 Q64 64 45 72 Q26 64 26 54 L24 30 Z"
        fill={KORE.ink850} stroke={KORE.lime} strokeWidth=".5"/>
      {/* plate seams */}
      <line x1="45" y1="22" x2="45" y2="72" stroke={KORE.ink900} strokeWidth=".7"/>
      <line x1="26" y1="46" x2="64" y2="46" stroke={KORE.ink900} strokeWidth=".7"/>
      {/* glyph: < */}
      <text x="45" y="52" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="20" fontWeight="600" fill={KORE.lime}>&lt;</text>
    </svg>
  );
}

function AmmoBox({ size = 86 }) {
  return (
    <svg viewBox="0 0 86 86" width={size} height={size}>
      <rect x="10" y="22" width="66" height="50" rx="3" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="10" y="22" width="66" height="10" fill={KORE.ink600}/>
      <rect x="36" y="14" width="14" height="10" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      {/* stencil */}
      <text x="43" y="50" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" letterSpacing=".15em" fill={KORE.lime}>AMMO</text>
      <text x="43" y="62" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.lime3} opacity=".75">5.56 NATO</text>
      {/* corner studs */}
      <circle cx="16" cy="66" r="1.6" fill={KORE.lime3}/>
      <circle cx="70" cy="66" r="1.6" fill={KORE.lime3}/>
      <circle cx="16" cy="28" r="1.6" fill={KORE.lime3}/>
      <circle cx="70" cy="28" r="1.6" fill={KORE.lime3}/>
    </svg>
  );
}

function Keycard({ size = 86 }) {
  return (
    <svg viewBox="0 0 86 86" width={size} height={size}>
      <rect x="14" y="26" width="58" height="38" rx="3" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="14" y="26" width="20" height="38" fill={KORE.lime}/>
      <text x="24" y="50" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="14" fontWeight="700" fill={KORE.ink900}>&lt;</text>
      <rect x="38" y="34" width="30" height="3" fill={KORE.lime3} opacity=".6"/>
      <rect x="38" y="40" width="22" height="2" fill={KORE.fgSoft} opacity=".5"/>
      <rect x="38" y="44" width="26" height="2" fill={KORE.fgSoft} opacity=".5"/>
      <rect x="38" y="56" width="14" height="4" fill={KORE.cyan}/>
    </svg>
  );
}

function RespectCoin({ size = 82 }) {
  return (
    <svg viewBox="0 0 82 82" width={size} height={size}>
      <defs>
        <radialGradient id="coingrad" cx="0.4" cy="0.35" r="0.7">
          <stop offset="0" stopColor={KORE.lime3}/>
          <stop offset="1" stopColor={KORE.lime}/>
        </radialGradient>
      </defs>
      <circle cx="41" cy="41" r="32" fill="url(#coingrad)" stroke={KORE.lime} strokeWidth="1.5"/>
      <circle cx="41" cy="41" r="26" fill="none" stroke={KORE.limeInk} strokeWidth=".7" strokeDasharray="2 2"/>
      <text x="41" y="48" textAnchor="middle" fontFamily="Instrument Serif, serif" fontSize="28" fontStyle="italic" fill={KORE.limeInk}>R</text>
      <circle cx="41" cy="41" r="32" fill="none" stroke={KORE.limeInk} strokeWidth=".4"/>
    </svg>
  );
}

function SkullMarker({ size = 48 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <path d="M24 6 Q40 6 40 22 Q40 30 36 32 L36 38 L30 38 L30 42 L18 42 L18 38 L12 38 L12 32 Q8 30 8 22 Q8 6 24 6 Z"
        fill={KORE.bone} stroke={KORE.lime} strokeWidth=".7"/>
      <circle cx="18" cy="22" r="3" fill={KORE.ink900}/>
      <circle cx="30" cy="22" r="3" fill={KORE.ink900}/>
      <path d="M22 30 L24 32 L26 30" fill="none" stroke={KORE.ink900} strokeWidth=".7"/>
      <line x1="20" y1="36" x2="20" y2="40" stroke={KORE.ink900} strokeWidth=".7"/>
      <line x1="24" y1="36" x2="24" y2="40" stroke={KORE.ink900} strokeWidth=".7"/>
      <line x1="28" y1="36" x2="28" y2="40" stroke={KORE.ink900} strokeWidth=".7"/>
    </svg>
  );
}

function LootCrate({ size = 84 }) {
  return (
    <svg viewBox="0 0 84 84" width={size} height={size}>
      <rect x="10" y="14" width="64" height="56" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      <line x1="10" y1="42" x2="74" y2="42" stroke={KORE.ink900} strokeWidth="1"/>
      <line x1="42" y1="14" x2="42" y2="70" stroke={KORE.ink900} strokeWidth="1"/>
      <text x="42" y="48" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="22" fontWeight="700" fill={KORE.lime}>&lt;</text>
      <rect x="14" y="18" width="56" height="48" fill="none" stroke={KORE.lime} strokeWidth=".4" strokeDasharray="2 3" opacity=".4"/>
      {/* corner brackets */}
      <path d="M10 14 L18 14 M10 14 L10 22" stroke={KORE.lime} strokeWidth="1.4"/>
      <path d="M74 14 L66 14 M74 14 L74 22" stroke={KORE.lime} strokeWidth="1.4"/>
      <path d="M10 70 L18 70 M10 70 L10 62" stroke={KORE.lime} strokeWidth="1.4"/>
      <path d="M74 70 L66 70 M74 70 L74 62" stroke={KORE.lime} strokeWidth="1.4"/>
    </svg>
  );
}

/* ====================== POWERUPS ==================================== */

function powerOrb(color, label) {
  return ({ size = 90 }) => (
    <svg viewBox="0 0 90 90" width={size} height={size}>
      <defs>
        <radialGradient id={`g-${label}`} cx="0.5" cy="0.4" r="0.6">
          <stop offset="0" stopColor="white" stopOpacity=".55"/>
          <stop offset=".5" stopColor={color} stopOpacity=".9"/>
          <stop offset="1" stopColor={color} stopOpacity=".25"/>
        </radialGradient>
      </defs>
      {/* outer glow */}
      <circle cx="45" cy="45" r="38" fill={color} opacity=".15"/>
      <circle cx="45" cy="45" r="30" fill={color} opacity=".25"/>
      {/* orb */}
      <circle cx="45" cy="45" r="22" fill={`url(#g-${label})`} stroke={color} strokeWidth="1.2"/>
      {/* highlight */}
      <ellipse cx="38" cy="36" rx="6" ry="3" fill="white" opacity=".5"/>
      {/* inner glyph */}
      {label}
    </svg>
  );
}

const PowerShield = ({ size = 90 }) => {
  const Inner = powerOrb(KORE.cyan, 'shield');
  return (
    <Inner size={size}/>
  );
};
// Replace simple inner with more interesting glyphs:
function withGlyph(color, glyph) {
  return ({ size = 90 }) => (
    <svg viewBox="0 0 90 90" width={size} height={size}>
      <defs>
        <radialGradient id={`grad-${glyph}`} cx="0.45" cy="0.4" r="0.65">
          <stop offset="0" stopColor="white" stopOpacity=".7"/>
          <stop offset=".5" stopColor={color} stopOpacity=".95"/>
          <stop offset="1" stopColor={color} stopOpacity=".3"/>
        </radialGradient>
      </defs>
      <circle cx="45" cy="45" r="38" fill={color} opacity=".12"/>
      <circle cx="45" cy="45" r="30" fill={color} opacity=".2"/>
      <circle cx="45" cy="45" r="22" fill={`url(#grad-${glyph})`} stroke={color} strokeWidth="1.4"/>
      <ellipse cx="38" cy="36" rx="6" ry="3" fill="white" opacity=".55"/>
      {glyph === 'shield' && (
        <path d="M45 32 L57 38 L55 50 Q55 56 45 60 Q35 56 35 50 L33 38 Z" fill="none" stroke={KORE.ink900} strokeWidth="1.4"/>
      )}
      {glyph === 'speed' && (
        <path d="M52 34 L40 46 L46 47 L40 58 L52 44 L46 43 Z" fill={KORE.ink900}/>
      )}
      {glyph === 'damage' && (
        <g stroke={KORE.ink900} strokeWidth="1.6" fill="none" strokeLinecap="round">
          <line x1="38" y1="38" x2="52" y2="52"/>
          <line x1="52" y1="38" x2="38" y2="52"/>
          <line x1="45" y1="32" x2="45" y2="58"/>
          <line x1="32" y1="45" x2="58" y2="45"/>
        </g>
      )}
      {glyph === 'emp' && (
        <g fill="none" stroke={KORE.ink900} strokeWidth="1.5">
          <circle cx="45" cy="45" r="6"/>
          <path d="M45 33 L47 41 L55 41 L48 46 L51 54 L45 49 L39 54 L42 46 L35 41 L43 41 Z" fill={KORE.ink900}/>
        </g>
      )}
      {glyph === 'cloak' && (
        <g fill="none" stroke={KORE.ink900} strokeWidth="1.4" strokeLinecap="round">
          <path d="M34 50 Q38 44 45 44 Q52 44 56 50"/>
          <circle cx="42" cy="48" r="1.4" fill={KORE.ink900}/>
          <circle cx="48" cy="48" r="1.4" fill={KORE.ink900}/>
          <line x1="34" y1="42" x2="56" y2="42" strokeDasharray="2 2"/>
        </g>
      )}
    </svg>
  );
}

const PS = withGlyph(KORE.cyan, 'shield');
const PSPD = withGlyph(KORE.lime, 'speed');
const PDMG = withGlyph('#E5604F', 'damage');
const PEMP = withGlyph(KORE.cyan, 'emp');
const PCLK = withGlyph('#9D7DD9', 'cloak');

/* ====================== PROPS ======================================= */

function RedBarrel({ size = 110 }) {
  return (
    <svg viewBox="0 0 110 110" width={size} height={size}>
      <defs>
        <radialGradient id="rbg" cx="0.4" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#E04A38"/>
          <stop offset="1" stopColor="#7A1D14"/>
        </radialGradient>
      </defs>
      <ellipse cx="55" cy="86" rx="32" ry="6" fill={KORE.ink900} opacity=".7"/>
      <ellipse cx="55" cy="55" rx="32" ry="32" fill="url(#rbg)" stroke={KORE.lime} strokeWidth=".8"/>
      <circle cx="55" cy="55" r="24" fill="none" stroke={KORE.bloodDk} strokeWidth=".6" strokeDasharray="2 3"/>
      <circle cx="55" cy="55" r="6" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
      <text x="55" y="58" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.lime}>EXP</text>
      {/* hazard stripes */}
      <path d="M30 55 A25 25 0 0 1 55 30" fill="none" stroke={KORE.bone} strokeWidth="3" opacity=".75"/>
      <path d="M55 80 A25 25 0 0 1 80 55" fill="none" stroke={KORE.bone} strokeWidth="3" opacity=".75"/>
    </svg>
  );
}

function Sandbags({ size = 140 }) {
  return (
    <svg viewBox="0 0 140 70" width={size} height={size * 0.5}>
      {Array.from({ length: 6 }).map((_, i) => {
        const cx = 18 + (i % 3) * 36;
        const cy = 24 + Math.floor(i / 3) * 22;
        return (
          <g key={i} transform={`translate(${cx} ${cy})`}>
            <ellipse cx="0" cy="3" rx="20" ry="6" fill={KORE.ink900} opacity=".5"/>
            <path d="M-18 -8 Q-18 -14 -10 -14 L10 -14 Q18 -14 18 -8 L18 4 Q18 10 10 10 L-10 10 Q-18 10 -18 4 Z"
              fill="#9C8E6E" stroke={KORE.lime} strokeWidth=".6"/>
            <line x1="-18" y1="-2" x2="18" y2="-2" stroke={KORE.ink900} strokeWidth=".5" opacity=".5"/>
            <line x1="-12" y1="-12" x2="-12" y2="-14" stroke={KORE.ink900} strokeWidth=".5"/>
            <line x1="12" y1="-12" x2="12" y2="-14" stroke={KORE.ink900} strokeWidth=".5"/>
          </g>
        );
      })}
    </svg>
  );
}

function Vending({ size = 120 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="14" y="10" width="92" height="100" rx="2" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="20" y="16" width="80" height="58" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".5"/>
      {/* shelves */}
      {[26, 42, 58].map((y, i) => (
        <g key={i}>
          <line x1="22" y1={y} x2="98" y2={y} stroke={KORE.lime} strokeWidth=".4" opacity=".5"/>
          {[28, 44, 60, 76, 92].map((x, j) => (
            <rect key={j} x={x} y={y - 9} width="6" height="8" fill={j % 2 ? KORE.lime : KORE.cyan} opacity=".7"/>
          ))}
        </g>
      ))}
      <rect x="20" y="80" width="80" height="22" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".5"/>
      <text x="60" y="95" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing=".18em" fill={KORE.lime}>SNAX · R5</text>
      {/* slot */}
      <rect x="50" y="100" width="20" height="3" fill={KORE.ink900}/>
    </svg>
  );
}

function Terminal({ size = 110 }) {
  return (
    <svg viewBox="0 0 110 110" width={size} height={size}>
      {/* base */}
      <ellipse cx="55" cy="98" rx="36" ry="6" fill={KORE.ink900} opacity=".6"/>
      <rect x="20" y="86" width="70" height="14" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      {/* pillar */}
      <rect x="32" y="40" width="46" height="50" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".7"/>
      {/* screen */}
      <rect x="22" y="14" width="66" height="34" rx="3" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="26" y="18" width="58" height="26" fill="#0E1A18" stroke={KORE.cyan} strokeWidth=".4"/>
      {/* scanlines */}
      {[22, 26, 30, 34, 38].map(y => (
        <line key={y} x1="26" y1={y} x2="84" y2={y} stroke={KORE.cyan} strokeWidth=".4" opacity=".4"/>
      ))}
      <text x="55" y="32" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fill={KORE.lime}>CAPTURE</text>
      <text x="55" y="42" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.cyan} opacity=".75">HOLD · E</text>
      {/* status light */}
      <circle cx="38" cy="60" r="2" fill={KORE.lime}/>
      <circle cx="46" cy="60" r="2" fill={KORE.cyan} opacity=".5"/>
      <circle cx="54" cy="60" r="2" fill={KORE.cyan} opacity=".3"/>
    </svg>
  );
}

function ServerRack({ size = 120 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      <rect x="18" y="8" width="84" height="104" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".8"/>
      {/* server units */}
      {[14, 32, 50, 68, 86].map((y, i) => (
        <g key={i}>
          <rect x="22" y={y} width="76" height="14" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".5"/>
          {/* led row */}
          <circle cx="28" cy={y + 7} r="1.4" fill={i % 2 ? KORE.lime : KORE.cyan}/>
          <circle cx="34" cy={y + 7} r="1.4" fill={KORE.lime} opacity={i % 3 === 0 ? 1 : .3}/>
          <circle cx="40" cy={y + 7} r="1.4" fill={KORE.cyan} opacity=".7"/>
          {/* drive bay */}
          <rect x="48" y={y + 3} width="44" height="8" fill={KORE.ink850} stroke={KORE.lime} strokeWidth=".3"/>
          <line x1="60" y1={y + 7} x2="88" y2={y + 7} stroke={KORE.fgSoft} strokeWidth=".4" opacity=".5"/>
        </g>
      ))}
      <rect x="22" y="104" width="76" height="6" fill={KORE.ink600}/>
    </svg>
  );
}

function Streetlight({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      {/* warm light pool */}
      <defs>
        <radialGradient id="pool" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F7E29A" stopOpacity=".4"/>
          <stop offset="1" stopColor="#F7E29A" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="65" cy="65" r="60" fill="url(#pool)"/>
      {/* lamp post (top-down: just a small black disk + bulb) */}
      <circle cx="65" cy="65" r="12" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
      <circle cx="65" cy="65" r="6" fill="#F7E29A"/>
      <circle cx="65" cy="65" r="3" fill="white"/>
    </svg>
  );
}

function Cone({ size = 70 }) {
  return (
    <svg viewBox="0 0 70 70" width={size} height={size}>
      <ellipse cx="35" cy="58" rx="22" ry="6" fill={KORE.ink900} opacity=".6"/>
      {/* base */}
      <ellipse cx="35" cy="56" rx="22" ry="6" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".6"/>
      {/* cone (top-down concentric rings) */}
      <circle cx="35" cy="50" r="18" fill="#E55F2A" stroke={KORE.lime} strokeWidth=".5"/>
      <circle cx="35" cy="48" r="14" fill="#F07238" stroke={KORE.bone} strokeWidth="1.2"/>
      <circle cx="35" cy="46" r="10" fill="#F58A48"/>
      <circle cx="35" cy="44" r="6" fill="#FFA968" stroke={KORE.bone} strokeWidth=".8"/>
      <circle cx="35" cy="43" r="2.5" fill={KORE.ink900}/>
    </svg>
  );
}

function Locker({ size = 110 }) {
  return (
    <svg viewBox="0 0 110 110" width={size} height={size}>
      <rect x="10" y="10" width="42" height="92" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="56" y="10" width="42" height="92" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".8"/>
      {/* vents */}
      {[18, 22, 26].map(y => (
        <line key={y} x1="20" y1={y} x2="42" y2={y} stroke={KORE.ink900} strokeWidth=".7"/>
      ))}
      {[18, 22, 26].map(y => (
        <line key={'b' + y} x1="66" y1={y} x2="88" y2={y} stroke={KORE.ink900} strokeWidth=".7"/>
      ))}
      {/* locks */}
      <circle cx="46" cy="58" r="2" fill={KORE.lime}/>
      <circle cx="62" cy="58" r="2" fill={KORE.cyan}/>
      {/* labels */}
      <rect x="22" y="74" width="18" height="8" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".4"/>
      <rect x="68" y="74" width="18" height="8" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".4"/>
      <text x="31" y="80" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.lime}>L-07</text>
      <text x="77" y="80" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.cyan}>L-08</text>
    </svg>
  );
}

/* ====================== TILES + STRUCTURE =========================== */

function FloorConcrete({ size = 64 }) {
  // base + flecks; uses seeded determinism on coords for stability
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <rect width="64" height="64" fill="#1F1A2A"/>
      <rect width="64" height="64" fill="#1F1A2A" stroke="#2A2540" strokeWidth=".5"/>
      {/* expansion seam */}
      <line x1="32" y1="0" x2="32" y2="64" stroke="#15101F" strokeWidth=".7"/>
      <line x1="0" y1="32" x2="64" y2="32" stroke="#15101F" strokeWidth=".7"/>
      {/* fleck pattern */}
      {[[8,12],[24,7],[44,15],[56,30],[12,40],[30,52],[48,46],[20,28],[38,22],[50,8],[6,56],[40,60]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r=".7" fill="#3B3252" opacity=".7"/>
      ))}
      {/* tile corner depressions */}
      <circle cx="2" cy="2" r="1" fill="#0E0814"/>
      <circle cx="62" cy="2" r="1" fill="#0E0814"/>
      <circle cx="2" cy="62" r="1" fill="#0E0814"/>
      <circle cx="62" cy="62" r="1" fill="#0E0814"/>
    </svg>
  );
}

function FloorGrate({ size = 64 }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size}>
      <rect width="64" height="64" fill="#181222"/>
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} x="0" y={4 + i * 8} width="64" height="3" fill="#2A2240" stroke={KORE.lime} strokeWidth=".15" opacity=".7"/>
      ))}
      {/* cross supports */}
      <line x1="14" y1="0" x2="14" y2="64" stroke="#3A2E52" strokeWidth=".7"/>
      <line x1="32" y1="0" x2="32" y2="64" stroke="#3A2E52" strokeWidth=".7"/>
      <line x1="50" y1="0" x2="50" y2="64" stroke="#3A2E52" strokeWidth=".7"/>
      {/* bolts */}
      {[[6,6],[58,6],[6,58],[58,58]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="1.4" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".3"/>
      ))}
    </svg>
  );
}

function WallBlock({ width = 140, height = 28 }) {
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
      <rect width={width} height={height} fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      {/* brick course pattern */}
      {Array.from({ length: Math.ceil(width / 24) }).map((_, i) => (
        <line key={i} x1={i * 24} y1="0" x2={i * 24} y2={height} stroke={KORE.ink900} strokeWidth=".5"/>
      ))}
      <line x1="0" y1={height/2} x2={width} y2={height/2} stroke={KORE.ink900} strokeWidth=".5"/>
      {Array.from({ length: Math.ceil(width / 24) }).map((_, i) => (
        <line key={'b' + i} x1={i * 24 + 12} y1={height/2} x2={i * 24 + 12} y2={height} stroke={KORE.ink900} strokeWidth=".5"/>
      ))}
      {/* lime hairline top */}
      <line x1="0" y1=".5" x2={width} y2=".5" stroke={KORE.lime} strokeWidth=".4" opacity=".5"/>
    </svg>
  );
}

function Door({ size = 100 }) {
  return (
    <svg viewBox="0 0 100 60" width={size} height={size * 0.6}>
      {/* frame */}
      <rect x="2" y="14" width="96" height="32" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".8"/>
      {/* door panel */}
      <rect x="8" y="20" width="84" height="20" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".6"/>
      <line x1="50" y1="20" x2="50" y2="40" stroke={KORE.ink900} strokeWidth=".7"/>
      {/* window viewports */}
      <rect x="22" y="26" width="20" height="8" fill={KORE.lime} opacity=".65"/>
      <rect x="58" y="26" width="20" height="8" fill={KORE.lime} opacity=".65"/>
      {/* handles */}
      <circle cx="46" cy="30" r="1.4" fill={KORE.lime3}/>
      <circle cx="54" cy="30" r="1.4" fill={KORE.lime3}/>
      {/* threshold */}
      <line x1="6" y1="46" x2="94" y2="46" stroke={KORE.lime} strokeWidth=".4" strokeDasharray="2 2"/>
    </svg>
  );
}

function Vent({ size = 110 }) {
  return (
    <svg viewBox="0 0 110 110" width={size} height={size}>
      <rect x="14" y="14" width="82" height="82" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".8"/>
      {/* slats */}
      {Array.from({ length: 7 }).map((_, i) => (
        <rect key={i} x="20" y={22 + i * 10} width="70" height="6" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".3"/>
      ))}
      {/* corner screws */}
      {[[20,20],[90,20],[20,90],[90,90]].map(([x,y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="2.2" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".4"/>
          <line x1={x-1.4} y1={y} x2={x+1.4} y2={y} stroke={KORE.lime} strokeWidth=".4"/>
        </g>
      ))}
    </svg>
  );
}

function CoverWall({ size = 140 }) {
  const w = size, h = size * 0.32;
  return (
    <svg viewBox={`0 0 ${size} ${size * 0.32}`} width={w} height={h}>
      <rect x="2" y="6" width={size-4} height={size*0.2} fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      {/* low-cover stencil bracket */}
      <text x={size/2} y={size*0.18} textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize={size*0.06} letterSpacing=".18em" fill={KORE.lime} opacity=".8">[ COVER · 60% ]</text>
      <line x1="2" y1={size*0.26} x2={size-2} y2={size*0.26} stroke={KORE.ink900} strokeWidth=".7"/>
      {/* shadow */}
      <ellipse cx={size/2} cy={size*0.3} rx={size*0.46} ry="3" fill={KORE.ink900} opacity=".5"/>
    </svg>
  );
}

/* ====================== DECALS ====================================== */

function BulletHole({ size = 48 }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size}>
      <circle cx="24" cy="24" r="4" fill={KORE.ink900} stroke={KORE.ink600} strokeWidth=".6"/>
      <circle cx="24" cy="24" r="9" fill="none" stroke={KORE.ink900} strokeWidth=".5" opacity=".7"/>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a, i) => {
        const r = 9 + (i % 2 ? 4 : 6);
        const x2 = 24 + Math.cos(a * Math.PI/180) * r;
        const y2 = 24 + Math.sin(a * Math.PI/180) * r;
        return <line key={i} x1="24" y1="24" x2={x2} y2={y2} stroke={KORE.ink900} strokeWidth=".7" opacity=".7"/>;
      })}
    </svg>
  );
}

function Scorch({ size = 100 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <defs>
        <radialGradient id="scorch" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#06030C"/>
          <stop offset=".6" stopColor="#0E0814" stopOpacity=".8"/>
          <stop offset="1" stopColor="#0E0814" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="50" rx="44" ry="38" fill="url(#scorch)"/>
      {/* irregular splotches */}
      <circle cx="32" cy="38" r="6" fill="#06030C" opacity=".7"/>
      <circle cx="64" cy="60" r="8" fill="#06030C" opacity=".7"/>
      <circle cx="60" cy="34" r="4" fill="#06030C" opacity=".6"/>
      <circle cx="38" cy="64" r="5" fill="#06030C" opacity=".6"/>
    </svg>
  );
}

function BloodSmear({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 60" width={size} height={size * 60 / 130}>
      <defs>
        <linearGradient id="smear" x1="0" x2="1">
          <stop offset="0" stopColor={KORE.bloodDk}/>
          <stop offset=".4" stopColor={KORE.blood}/>
          <stop offset="1" stopColor={KORE.blood} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d="M6 30 Q24 18 48 26 Q70 32 96 28 Q116 26 124 30 Q116 34 96 32 Q70 36 48 34 Q24 42 6 30 Z" fill="url(#smear)"/>
      {/* streak lines */}
      {[24, 30, 36].map((y, i) => (
        <path key={i} d={`M${10 + i * 3} ${y} Q40 ${y - 2} 80 ${y} Q110 ${y + 1} 120 ${y}`} fill="none" stroke={KORE.bloodDk} strokeWidth=".5" opacity=".6"/>
      ))}
      <circle cx="118" cy="32" r="1.6" fill={KORE.blood}/>
      <circle cx="124" cy="29" r="1.2" fill={KORE.blood} opacity=".7"/>
    </svg>
  );
}

function Footprint({ size = 56 }) {
  return (
    <svg viewBox="0 0 56 56" width={size} height={size}>
      {/* boot tread top-down */}
      <ellipse cx="28" cy="22" rx="10" ry="14" fill={KORE.ink900} opacity=".75"/>
      <ellipse cx="28" cy="40" rx="6" ry="6" fill={KORE.ink900} opacity=".75"/>
      {/* tread marks */}
      <line x1="22" y1="14" x2="34" y2="14" stroke={KORE.bone} strokeWidth=".5" opacity=".4"/>
      <line x1="22" y1="20" x2="34" y2="20" stroke={KORE.bone} strokeWidth=".5" opacity=".4"/>
      <line x1="22" y1="26" x2="34" y2="26" stroke={KORE.bone} strokeWidth=".5" opacity=".4"/>
    </svg>
  );
}

function Graffiti({ size = 150 }) {
  return (
    <svg viewBox="0 0 150 60" width={size} height={size * 60/150}>
      {/* spray fog */}
      <defs>
        <radialGradient id="spray" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={KORE.lime} stopOpacity=".25"/>
          <stop offset="1" stopColor={KORE.lime} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <ellipse cx="75" cy="30" rx="70" ry="22" fill="url(#spray)"/>
      <text x="75" y="36" textAnchor="middle" fontFamily="Instrument Serif, serif" fontSize="32" fontStyle="italic" fill={KORE.lime}>
        Kore<tspan fill={KORE.lime3}>.</tspan>
      </text>
      <text x="75" y="50" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" letterSpacing=".18em" fill={KORE.lime} opacity=".7">WAS HERE · 2026</text>
      {/* drip */}
      <line x1="58" y1="36" x2="58" y2="44" stroke={KORE.lime} strokeWidth=".7" opacity=".7"/>
      <line x1="92" y1="36" x2="92" y2="48" stroke={KORE.lime} strokeWidth=".7" opacity=".5"/>
    </svg>
  );
}

/* ====================== MARKERS ===================================== */

function SpawnPoint({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      {/* ground rings */}
      <circle cx="65" cy="65" r="56" fill="none" stroke={KORE.lime} strokeWidth="1.2" opacity=".5"/>
      <circle cx="65" cy="65" r="42" fill="none" stroke={KORE.lime} strokeWidth=".8" strokeDasharray="3 3" opacity=".7"/>
      <circle cx="65" cy="65" r="28" fill={KORE.lime} opacity=".08"/>
      {/* arrows pointing in */}
      {[0, 90, 180, 270].map((a, i) => (
        <g key={i} transform={`rotate(${a} 65 65)`}>
          <path d="M65 28 L60 38 L70 38 Z" fill={KORE.lime}/>
        </g>
      ))}
      {/* center bracket */}
      <text x="65" y="72" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="22" fontWeight="700" fill={KORE.lime}>&lt;</text>
      <text x="65" y="100" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing=".18em" fill={KORE.lime}>SPAWN</text>
    </svg>
  );
}

function CapturePoint({ size = 130, percent = 0.65 }) {
  const r = 44, c = 2 * Math.PI * r;
  const dash = c * percent;
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      <circle cx="65" cy="65" r="50" fill="none" stroke={KORE.line || 'rgba(255,255,255,.07)'} strokeWidth="6"/>
      <circle cx="65" cy="65" r="50" fill={KORE.cyan} opacity=".06"/>
      {/* arc fill */}
      <circle cx="65" cy="65" r={r} fill="none" stroke={KORE.cyan} strokeWidth="8"
        strokeDasharray={`${dash} ${c - dash}`} transform="rotate(-90 65 65)" strokeLinecap="butt"/>
      {/* tick marks */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i / 12) * Math.PI * 2 - Math.PI/2;
        const x1 = 65 + Math.cos(a) * 54;
        const y1 = 65 + Math.sin(a) * 54;
        const x2 = 65 + Math.cos(a) * 60;
        const y2 = 65 + Math.sin(a) * 60;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={KORE.cyan} strokeWidth=".6" opacity=".5"/>;
      })}
      <text x="65" y="62" textAnchor="middle" fontFamily="Instrument Serif, serif" fontSize="28" fill={KORE.fg}>{Math.round(percent*100)}<tspan fontFamily="JetBrains Mono, monospace" fontSize="10">%</tspan></text>
      <text x="65" y="78" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing=".18em" fill={KORE.cyan}>POINT B</text>
    </svg>
  );
}

function SupplyDrop({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      {/* parachute lines */}
      <line x1="20" y1="24" x2="65" y2="60" stroke={KORE.lime} strokeWidth=".7" opacity=".7"/>
      <line x1="65" y1="14" x2="65" y2="60" stroke={KORE.lime} strokeWidth=".7" opacity=".7"/>
      <line x1="110" y1="24" x2="65" y2="60" stroke={KORE.lime} strokeWidth=".7" opacity=".7"/>
      {/* parachute (top-down: scalloped circle) */}
      <path d="M14 24 Q26 4 42 14 Q54 0 65 12 Q76 0 88 14 Q104 4 116 24 Q104 30 88 26 Q76 32 65 28 Q54 32 42 26 Q26 30 14 24 Z"
        fill={KORE.lime} stroke={KORE.lime2} strokeWidth=".8" opacity=".85"/>
      {/* crate */}
      <rect x="48" y="56" width="34" height="34" fill={KORE.ink700} stroke={KORE.lime} strokeWidth="1"/>
      <line x1="48" y1="73" x2="82" y2="73" stroke={KORE.ink900} strokeWidth=".7"/>
      <line x1="65" y1="56" x2="65" y2="90" stroke={KORE.ink900} strokeWidth=".7"/>
      <text x="65" y="78" textAnchor="middle" fontFamily="Geist, sans-serif" fontSize="14" fontWeight="700" fill={KORE.lime}>&lt;</text>
      {/* glow */}
      <circle cx="65" cy="100" r="22" fill={KORE.lime} opacity=".15"/>
      <text x="65" y="118" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="8" letterSpacing=".18em" fill={KORE.lime}>SUPPLY · 5S</text>
    </svg>
  );
}

function ExitMarker({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      <rect x="14" y="44" width="100" height="42" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".8"/>
      <rect x="20" y="50" width="88" height="30" fill={KORE.ink900}/>
      {/* arrow */}
      <path d="M40 65 L80 65 L80 56 L98 65 L80 74 L80 65" fill={KORE.lime} stroke={KORE.lime2} strokeWidth=".8"/>
      <text x="64" y="98" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" letterSpacing=".18em" fill={KORE.lime}>EXIT · &gt;</text>
    </svg>
  );
}

function ZoneRing({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      <circle cx="65" cy="65" r="56" fill={KORE.cyan} opacity=".06"/>
      <circle cx="65" cy="65" r="56" fill="none" stroke={KORE.cyan} strokeWidth="1.4" strokeDasharray="4 3"/>
      <circle cx="65" cy="65" r="44" fill="none" stroke={KORE.cyan} strokeWidth=".7" strokeDasharray="2 4" opacity=".7"/>
      <text x="65" y="70" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" letterSpacing=".18em" fill={KORE.cyan}>ZONE · -2:14</text>
    </svg>
  );
}

/* ====================== FX (set 2) ================================== */

function Explosion({ size = 140, frame = 0 }) {
  const cfg = [
    { r: 10, fill: '#FFEFC2', strokeOp: 1, glow: 0.2, points: 8 },
    { r: 28, fill: '#FFC960', strokeOp: 0.9, glow: 0.4, points: 10 },
    { r: 50, fill: '#FF8A3C', strokeOp: 0.8, glow: 0.5, points: 12 },
    { r: 64, fill: '#E5604F', strokeOp: 0.6, glow: 0.4, points: 14 },
    { r: 70, fill: '#A8413A', strokeOp: 0.3, glow: 0.2, points: 16 },
  ][Math.min(frame, 4)];
  // build a star polygon
  const pts = [];
  for (let i = 0; i < cfg.points * 2; i++) {
    const a = (i / (cfg.points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? cfg.r : cfg.r * 0.62;
    pts.push(`${size/2 + Math.cos(a) * r},${size/2 + Math.sin(a) * r}`);
  }
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      {/* outer glow */}
      <circle cx={size/2} cy={size/2} r={cfg.r * 1.4} fill={cfg.fill} opacity={cfg.glow}/>
      <polygon points={pts.join(' ')} fill={cfg.fill} stroke={KORE.lime} strokeOpacity={cfg.strokeOp} strokeWidth=".7"/>
      {frame >= 1 && (
        <circle cx={size/2} cy={size/2} r={cfg.r * 0.6} fill="white" opacity={0.7 - frame * 0.15}/>
      )}
      {/* shrapnel rays */}
      {frame >= 1 && Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const x = size/2 + Math.cos(a) * cfg.r * 1.3;
        const y = size/2 + Math.sin(a) * cfg.r * 1.3;
        return <line key={i} x1={size/2} y1={size/2} x2={x} y2={y} stroke={KORE.lime} strokeWidth=".6" opacity={cfg.strokeOp * 0.6}/>;
      })}
    </svg>
  );
}

function SmokePuff({ size = 100 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <defs>
        <radialGradient id="smoke" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#7B7388" stopOpacity=".7"/>
          <stop offset="1" stopColor="#7B7388" stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="40" cy="50" r="22" fill="url(#smoke)"/>
      <circle cx="60" cy="42" r="18" fill="url(#smoke)" opacity=".8"/>
      <circle cx="50" cy="62" r="20" fill="url(#smoke)" opacity=".7"/>
      <circle cx="34" cy="38" r="14" fill="url(#smoke)" opacity=".7"/>
      <circle cx="68" cy="58" r="14" fill="url(#smoke)" opacity=".6"/>
    </svg>
  );
}

function EMPBurst({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      {[20, 36, 52, 64].map((r, i) => (
        <circle key={i} cx="65" cy="65" r={r} fill="none" stroke={KORE.cyan}
          strokeWidth={2 - i * 0.4} opacity={0.9 - i * 0.2}/>
      ))}
      {/* cross arcs */}
      <g stroke={KORE.cyan} strokeWidth="1.2" fill="none" strokeLinecap="round">
        <path d="M65 28 L65 38"/>
        <path d="M65 92 L65 102"/>
        <path d="M28 65 L38 65"/>
        <path d="M92 65 L102 65"/>
      </g>
      {/* lightning bolt */}
      <path d="M62 50 L72 50 L66 64 L74 64 L60 80 L66 66 L58 66 Z" fill={KORE.cyan} stroke={KORE.fg} strokeWidth=".5"/>
    </svg>
  );
}

function HealAura({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      <defs>
        <radialGradient id="heal" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={KORE.lime} stopOpacity=".5"/>
          <stop offset=".7" stopColor={KORE.lime} stopOpacity=".15"/>
          <stop offset="1" stopColor={KORE.lime} stopOpacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="65" cy="65" r="58" fill="url(#heal)"/>
      <circle cx="65" cy="65" r="44" fill="none" stroke={KORE.lime} strokeWidth="1" strokeDasharray="2 4"/>
      <circle cx="65" cy="65" r="28" fill="none" stroke={KORE.lime} strokeWidth="1.4" opacity=".8"/>
      {/* + cross */}
      <rect x="59" y="46" width="12" height="38" rx="2" fill={KORE.lime} opacity=".9"/>
      <rect x="46" y="59" width="38" height="12" rx="2" fill={KORE.lime} opacity=".9"/>
      <rect x="61" y="48" width="8" height="34" fill={KORE.lime3}/>
      <rect x="48" y="61" width="34" height="8" fill={KORE.lime3}/>
    </svg>
  );
}

function ShieldBubble({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      <defs>
        <pattern id="hex" width="14" height="12.12" patternUnits="userSpaceOnUse">
          <path d="M7 0 L14 3.5 L14 8.5 L7 12 L0 8.5 L0 3.5 Z" fill="none" stroke={KORE.cyan} strokeWidth=".5" opacity=".7"/>
        </pattern>
        <radialGradient id="bubble" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={KORE.cyan} stopOpacity="0"/>
          <stop offset=".75" stopColor={KORE.cyan} stopOpacity=".15"/>
          <stop offset="1" stopColor={KORE.cyan} stopOpacity=".5"/>
        </radialGradient>
      </defs>
      <circle cx="65" cy="65" r="58" fill="url(#bubble)"/>
      <circle cx="65" cy="65" r="58" fill="url(#hex)" opacity=".8"/>
      <circle cx="65" cy="65" r="58" fill="none" stroke={KORE.cyan} strokeWidth="1.4"/>
      <circle cx="48" cy="48" r="14" fill="white" opacity=".15"/>
    </svg>
  );
}

/* ====================== ENEMIES ===================================== */

function Turret({ size = 140, scanAngle = 0 }) {
  return (
    <svg viewBox="0 0 140 140" width={size} height={size}>
      {/* scan cone */}
      <g transform={`rotate(${scanAngle} 70 70)`}>
        <path d={`M70 70 L${70 - 36} ${70 - 60} A70 70 0 0 1 ${70 + 36} ${70 - 60} Z`} fill={KORE.lime} opacity=".12"/>
        <line x1="70" y1="70" x2="70" y2="-2" stroke={KORE.lime} strokeWidth=".5" strokeDasharray="2 3" opacity=".5"/>
      </g>
      {/* base */}
      <ellipse cx="70" cy="76" rx="32" ry="6" fill={KORE.ink900} opacity=".7"/>
      <circle cx="70" cy="70" r="30" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".8"/>
      <circle cx="70" cy="70" r="22" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".4"/>
      {/* mount bolts */}
      {[0, 90, 180, 270].map(a => {
        const x = 70 + Math.cos(a * Math.PI/180) * 26;
        const y = 70 + Math.sin(a * Math.PI/180) * 26;
        return <circle key={a} cx={x} cy={y} r="1.6" fill={KORE.lime}/>;
      })}
      {/* turret head — rotates with scan */}
      <g transform={`rotate(${scanAngle} 70 70)`}>
        <rect x="62" y="50" width="16" height="22" rx="2" fill={KORE.ink600} stroke={KORE.lime} strokeWidth=".8"/>
        <rect x="64" y="34" width="4" height="20" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".5"/>
        <rect x="72" y="34" width="4" height="20" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".5"/>
        <circle cx="70" cy="62" r="2" fill={KORE.lime}/>
        {/* scope */}
        <rect x="68" y="48" width="4" height="6" fill={KORE.ink900}/>
      </g>
    </svg>
  );
}

function Drone({ size = 130 }) {
  return (
    <svg viewBox="0 0 130 130" width={size} height={size}>
      {/* shadow on ground */}
      <ellipse cx="65" cy="100" rx="28" ry="6" fill={KORE.ink900} opacity=".5"/>
      {/* arms */}
      <line x1="32" y1="32" x2="98" y2="98" stroke={KORE.ink600} strokeWidth="3"/>
      <line x1="98" y1="32" x2="32" y2="98" stroke={KORE.ink600} strokeWidth="3"/>
      {/* rotors (blur effect via opacity rings) */}
      {[[32,32],[98,32],[32,98],[98,98]].map(([cx,cy], i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r="14" fill="none" stroke={KORE.lime} strokeWidth=".5" opacity=".3"/>
          <circle cx={cx} cy={cy} r="10" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".7"/>
          <line x1={cx-9} y1={cy} x2={cx+9} y2={cy} stroke={KORE.fgSoft} strokeWidth=".6" opacity=".6"/>
          <line x1={cx} y1={cy-9} x2={cx} y2={cy+9} stroke={KORE.fgSoft} strokeWidth=".6" opacity=".6"/>
          <circle cx={cx} cy={cy} r="2" fill={KORE.lime}/>
        </g>
      ))}
      {/* body */}
      <rect x="48" y="48" width="34" height="34" rx="4" fill={KORE.ink700} stroke={KORE.lime} strokeWidth="1"/>
      <circle cx="65" cy="65" r="8" fill={KORE.cyan} stroke={KORE.lime} strokeWidth=".7"/>
      <circle cx="65" cy="65" r="3" fill={KORE.ink900}/>
      {/* status leds */}
      <circle cx="55" cy="56" r="1.6" fill={KORE.lime}/>
      <circle cx="75" cy="56" r="1.6" fill={KORE.lime} opacity=".5"/>
    </svg>
  );
}

function Merchant({ size = 120 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size}>
      {/* shadow */}
      <ellipse cx="60" cy="100" rx="22" ry="5" fill={KORE.ink900} opacity=".6"/>
      {/* coat (top-down: a dark drape) */}
      <ellipse cx="60" cy="74" rx="28" ry="22" fill={KORE.ink700} stroke={KORE.lime} strokeWidth=".7"/>
      <line x1="60" y1="58" x2="60" y2="92" stroke={KORE.ink900} strokeWidth=".7"/>
      {/* shoulders */}
      <ellipse cx="40" cy="62" rx="10" ry="6" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".5"/>
      <ellipse cx="80" cy="62" rx="10" ry="6" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".5"/>
      {/* head — top-down */}
      <circle cx="60" cy="58" r="14" fill="#D9B89C" stroke={KORE.lime} strokeWidth=".7"/>
      {/* hat brim */}
      <ellipse cx="60" cy="56" rx="20" ry="6" fill={KORE.ink900} stroke={KORE.lime} strokeWidth=".6"/>
      <circle cx="60" cy="54" r="9" fill={KORE.ink800} stroke={KORE.lime} strokeWidth=".5"/>
      {/* lime band */}
      <ellipse cx="60" cy="55" rx="10" ry="3" fill="none" stroke={KORE.lime} strokeWidth="1"/>
      {/* coin display floating above */}
      <circle cx="60" cy="22" r="8" fill={KORE.lime} stroke={KORE.lime2} strokeWidth=".7"/>
      <text x="60" y="26" textAnchor="middle" fontFamily="Instrument Serif, serif" fontStyle="italic" fontSize="11" fill={KORE.limeInk}>R</text>
    </svg>
  );
}

/* ====================== EXPORT ====================================== */

Object.assign(window, {
  Shotgun, MP5, Sniper, Knife, FragGrenade, RPG, Molotov, Bullet, Shell,
  HealthPack, MedSyringe, ArmorPlate, AmmoBox, Keycard, RespectCoin, SkullMarker, LootCrate,
  PowerShield: PS, PowerSpeed: PSPD, PowerDamage: PDMG, PowerEMP: PEMP, PowerCloak: PCLK,
  RedBarrel, Sandbags, Vending, Terminal, ServerRack, Streetlight, Cone, Locker,
  FloorConcrete, FloorGrate, WallBlock, Door, Vent, CoverWall,
  BulletHole, Scorch, BloodSmear, Footprint, Graffiti,
  SpawnPoint, CapturePoint, SupplyDrop, ExitMarker, ZoneRing,
  Explosion, SmokePuff, EMPBurst, HealAura, ShieldBubble,
  Turret, Drone, Merchant,
});
