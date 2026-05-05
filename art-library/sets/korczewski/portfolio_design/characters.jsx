/* eslint-disable */
// Four character tokens for the tabletop board.
// Each character has:
//   - a portrait SVG (3/4 bust, gallery card)
//   - a figurine SVG (full body, faux 3D, made to sit on the wooden board)
// Distinct silhouettes by design — flowing hair / horned helmet / tricorn hat / hooded bald.

const CHARACTERS = [
  {
    id: "elara",
    name: "Elara",
    role: "Herbalist · Witch of the Greenwood",
    tag: "Green dress · red hair",
    palette: { skin: "#F2D2B8", skin2: "#D9A37E", hair: "#C0341D", hair2: "#7A1A0E", dress: "#3D8A4F", dress2: "#22542F", trim: "#C8F76A", eye: "#2A3A0C" },
    bio: "Brews. Hexes. Mostly listens. Wears the dye she makes herself — a green that never quite settles."
  },
  {
    id: "korrin",
    name: "Korrin",
    role: "Mendicant Cleric of the Quiet Order",
    tag: "Bald · hooded · steady",
    palette: { skin: "#C8966E", skin2: "#9A6E4A", robe: "#3A3148", robe2: "#221932", trim: "#D8AE5A", inner: "#5BD4D0", eye: "#1A1326" },
    bio: "Walks barefoot. Carries a bell, no blade. Rumors say he once outlasted a siege by sitting through it."
  },
  {
    id: "vex",
    name: "Vex",
    role: "Tricorn Rogue · Letter-Carrier",
    tag: "Masked · tall hat · slim",
    palette: { skin: "#E8C5A3", skin2: "#B98A65", hat: "#15101F", hat2: "#0A0710", coat: "#5C2E2A", coat2: "#341614", mask: "#0F0B18", trim: "#C8F76A", eye: "#C8F76A" },
    bio: "Delivers things that are not letters. Reads everyone's hand without looking — including yours."
  },
  {
    id: "brann",
    name: "Brann",
    role: "Forge-Knight · House Hammerfall",
    tag: "Horned helm · braided beard",
    palette: { armor: "#6B7480", armor2: "#3C434C", armor3: "#A8B0BB", beard: "#C26A2A", beard2: "#7A3A14", horn: "#E8DCC0", horn2: "#9A8A66", inner: "#E26B6B", trim: "#C8F76A" },
    bio: "Three winters at the Iron Pass. Snores like a forge bellows. Keeps a song for every dent in his armor."
  }
];

// ---------- Portrait (bust) ----------
// Each portrait sits in a 240x300 viewBox, head-and-shoulders, gallery-style.
const PortraitElara = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ch-portrait">
    <defs>
      <radialGradient id="elara-bg" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#22542F" stopOpacity="0.45"/>
        <stop offset="100%" stopColor="#0F0B18" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="elara-hair" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.hair}/>
        <stop offset="100%" stopColor={p.hair2}/>
      </linearGradient>
      <linearGradient id="elara-dress" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.dress}/>
        <stop offset="100%" stopColor={p.dress2}/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill="url(#elara-bg)"/>
    {/* Hair back layer (long, falling past shoulders) */}
    <path d="M50,120 Q40,180 60,260 Q90,290 120,290 Q150,290 180,260 Q200,180 190,120 Q170,90 120,90 Q70,90 50,120 Z"
      fill="url(#elara-hair)" opacity="0.95"/>
    {/* Shoulders / dress */}
    <path d="M40,300 Q40,230 80,210 L160,210 Q200,230 200,300 Z" fill="url(#elara-dress)"/>
    {/* Dress trim */}
    <path d="M80,212 Q120,205 160,212 L155,222 Q120,215 85,222 Z" fill={p.trim} opacity="0.55"/>
    {/* Lacing */}
    <path d="M120,215 L120,260" stroke={p.trim} strokeWidth="1" opacity="0.5"/>
    {[222, 232, 242, 252].map(y => (
      <path key={y} d={`M114,${y} L126,${y}`} stroke={p.trim} strokeWidth="0.8" opacity="0.5"/>
    ))}
    {/* Neck */}
    <rect x="108" y="170" width="24" height="50" fill={p.skin}/>
    <path d="M108,200 Q120,210 132,200 L132,220 L108,220 Z" fill={p.skin2} opacity="0.5"/>
    {/* Face */}
    <ellipse cx="120" cy="150" rx="38" ry="46" fill={p.skin}/>
    {/* Hair front strands */}
    <path d="M82,130 Q90,108 120,108 Q150,108 158,130 Q150,118 130,116 Q120,124 110,116 Q90,118 82,130 Z" fill="url(#elara-hair)"/>
    <path d="M82,130 Q78,160 84,200 Q70,180 70,150 Q72,135 82,130 Z" fill="url(#elara-hair)"/>
    <path d="M158,130 Q162,160 156,200 Q170,180 170,150 Q168,135 158,130 Z" fill="url(#elara-hair)"/>
    {/* Side strand falling forward */}
    <path d="M88,140 Q92,200 102,235" stroke={p.hair2} strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round"/>
    <path d="M152,140 Q148,200 138,235" stroke={p.hair2} strokeWidth="3" fill="none" opacity="0.9" strokeLinecap="round"/>
    {/* Cheek shadow */}
    <ellipse cx="100" cy="165" rx="6" ry="3" fill={p.skin2} opacity="0.35"/>
    <ellipse cx="140" cy="165" rx="6" ry="3" fill={p.skin2} opacity="0.35"/>
    {/* Eyes */}
    <ellipse cx="106" cy="152" rx="3.2" ry="2.2" fill={p.eye}/>
    <ellipse cx="134" cy="152" rx="3.2" ry="2.2" fill={p.eye}/>
    <circle cx="107" cy="151" r="0.8" fill="#fff"/>
    <circle cx="135" cy="151" r="0.8" fill="#fff"/>
    {/* Brow */}
    <path d="M100,144 Q106,142 112,145" stroke={p.hair2} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    <path d="M128,145 Q134,142 140,144" stroke={p.hair2} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    {/* Nose */}
    <path d="M120,158 Q118,170 122,176" stroke={p.skin2} strokeWidth="1" fill="none" opacity="0.6"/>
    {/* Lips */}
    <path d="M114,184 Q120,186 126,184" stroke="#9A2A1E" strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    <path d="M115,184 Q120,182 125,184" fill="#B83A2A" opacity="0.7"/>
    {/* Tiny sprig pinned in hair (witch-y detail) */}
    <g transform="translate(150,116)">
      <path d="M0,0 Q4,-6 10,-8" stroke={p.trim} strokeWidth="1.2" fill="none"/>
      <circle cx="3" cy="-3" r="1.5" fill={p.trim}/>
      <circle cx="7" cy="-6" r="1.5" fill={p.trim}/>
    </g>
  </svg>
);

const PortraitKorrin = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ch-portrait">
    <defs>
      <radialGradient id="korrin-bg" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor={p.inner} stopOpacity="0.18"/>
        <stop offset="100%" stopColor="#0F0B18" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="korrin-robe" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.robe}/>
        <stop offset="100%" stopColor={p.robe2}/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill="url(#korrin-bg)"/>
    {/* Hood back */}
    <path d="M40,300 Q30,200 60,150 Q120,110 180,150 Q210,200 200,300 Z" fill="url(#korrin-robe)"/>
    {/* Hood opening shadow */}
    <ellipse cx="120" cy="155" rx="62" ry="20" fill={p.robe2} opacity="0.7"/>
    {/* Bald head — round, intentionally distinct silhouette */}
    <ellipse cx="120" cy="148" rx="44" ry="50" fill={p.skin}/>
    {/* Skull-cap shadow */}
    <ellipse cx="120" cy="120" rx="40" ry="16" fill={p.skin2} opacity="0.3"/>
    {/* Hood front edge over forehead */}
    <path d="M68,140 Q120,118 172,140 Q172,128 120,108 Q68,128 68,140 Z" fill={p.robe} opacity="0.95"/>
    <path d="M68,138 Q120,120 172,138" stroke={p.trim} strokeWidth="1" fill="none" opacity="0.7"/>
    {/* Ears */}
    <ellipse cx="78" cy="155" rx="5" ry="9" fill={p.skin2}/>
    <ellipse cx="162" cy="155" rx="5" ry="9" fill={p.skin2}/>
    {/* Cheekbones */}
    <ellipse cx="96" cy="170" rx="8" ry="4" fill={p.skin2} opacity="0.4"/>
    <ellipse cx="144" cy="170" rx="8" ry="4" fill={p.skin2} opacity="0.4"/>
    {/* Eyes — closed/serene */}
    <path d="M98,158 Q106,162 114,158" stroke={p.eye} strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M126,158 Q134,162 142,158" stroke={p.eye} strokeWidth="2" fill="none" strokeLinecap="round"/>
    {/* Brow */}
    <path d="M96,150 L114,148" stroke={p.skin2} strokeWidth="1.4" strokeLinecap="round"/>
    <path d="M126,148 L144,150" stroke={p.skin2} strokeWidth="1.4" strokeLinecap="round"/>
    {/* Nose */}
    <path d="M120,164 Q118,180 122,186" stroke={p.skin2} strokeWidth="1" fill="none" opacity="0.6"/>
    {/* Mouth — calm */}
    <path d="M112,196 Q120,198 128,196" stroke={p.skin2} strokeWidth="1.4" fill="none" strokeLinecap="round"/>
    {/* Forehead mark — small circle (the order's sigil) */}
    <circle cx="120" cy="138" r="3" fill={p.inner} opacity="0.85"/>
    {/* Bell at chest */}
    <g transform="translate(120,250)">
      <path d="M-8,-6 Q-8,-12 0,-12 Q8,-12 8,-6 L10,2 L-10,2 Z" fill={p.trim}/>
      <rect x="-2" y="2" width="4" height="3" fill={p.trim}/>
      <line x1="0" y1="-22" x2="0" y2="-12" stroke={p.skin2} strokeWidth="0.8"/>
    </g>
    {/* Robe seam */}
    <path d="M120,230 L120,300" stroke={p.robe2} strokeWidth="1.5" opacity="0.8"/>
  </svg>
);

const PortraitVex = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ch-portrait">
    <defs>
      <radialGradient id="vex-bg" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#5C2E2A" stopOpacity="0.35"/>
        <stop offset="100%" stopColor="#0F0B18" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="vex-coat" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.coat}/>
        <stop offset="100%" stopColor={p.coat2}/>
      </linearGradient>
      <linearGradient id="vex-hat" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.hat}/>
        <stop offset="100%" stopColor={p.hat2}/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill="url(#vex-bg)"/>
    {/* Coat / shoulders — narrow, sharp */}
    <path d="M50,300 Q60,225 90,210 L150,210 Q180,225 190,300 Z" fill="url(#vex-coat)"/>
    {/* Coat lapels */}
    <path d="M90,210 L120,250 L150,210 L142,210 L120,238 L98,210 Z" fill={p.coat2}/>
    {/* High collar */}
    <path d="M100,212 Q120,200 140,212 L140,220 Q120,210 100,220 Z" fill={p.coat2}/>
    {/* Neck */}
    <rect x="112" y="180" width="16" height="30" fill={p.skin}/>
    {/* Face */}
    <ellipse cx="120" cy="160" rx="30" ry="40" fill={p.skin}/>
    {/* Hair back (low pony) */}
    <path d="M92,150 Q88,180 96,210 Q104,225 110,235" stroke={p.hat} strokeWidth="6" fill="none" strokeLinecap="round"/>
    {/* Mask — half-mask covering eyes */}
    <path d="M88,142 Q120,134 152,142 L154,162 Q140,168 120,168 Q100,168 86,162 Z" fill={p.mask}/>
    {/* Mask eye holes */}
    <ellipse cx="106" cy="154" rx="5" ry="3" fill={p.skin}/>
    <ellipse cx="134" cy="154" rx="5" ry="3" fill={p.skin}/>
    {/* Eyes — lime, sharp */}
    <circle cx="106" cy="154" r="2" fill={p.eye}/>
    <circle cx="134" cy="154" r="2" fill={p.eye}/>
    {/* Mask edge highlight */}
    <path d="M88,142 Q120,134 152,142" stroke={p.trim} strokeWidth="0.7" fill="none" opacity="0.5"/>
    {/* Tricorn hat — three-cornered, broad */}
    <path d="M40,118 Q50,80 120,72 Q190,80 200,118 Q170,108 120,108 Q70,108 40,118 Z" fill="url(#vex-hat)"/>
    {/* Hat brim points */}
    <path d="M40,118 L46,100 L60,118 Z" fill={p.hat2}/>
    <path d="M200,118 L194,100 L180,118 Z" fill={p.hat2}/>
    <path d="M120,72 L114,86 L126,86 Z" fill={p.hat2}/>
    {/* Hat band */}
    <path d="M62,118 Q120,108 178,118 L178,124 Q120,114 62,124 Z" fill={p.hat2}/>
    {/* Hat trim feather */}
    <path d="M168,108 Q190,80 200,82" stroke={p.trim} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    <path d="M170,104 Q185,90 195,86" stroke={p.trim} strokeWidth="1" fill="none" strokeLinecap="round"/>
    {/* Mouth — small smirk */}
    <path d="M114,188 Q120,192 128,186" stroke={p.coat2} strokeWidth="1.6" fill="none" strokeLinecap="round"/>
    {/* Chin shadow */}
    <ellipse cx="120" cy="196" rx="14" ry="4" fill={p.skin2} opacity="0.3"/>
  </svg>
);

const PortraitBrann = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ch-portrait">
    <defs>
      <radialGradient id="brann-bg" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stopColor={p.inner} stopOpacity="0.2"/>
        <stop offset="100%" stopColor="#0F0B18" stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="brann-armor" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.armor3}/>
        <stop offset="50%" stopColor={p.armor}/>
        <stop offset="100%" stopColor={p.armor2}/>
      </linearGradient>
      <linearGradient id="brann-beard" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.beard}/>
        <stop offset="100%" stopColor={p.beard2}/>
      </linearGradient>
      <linearGradient id="brann-horn" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.horn}/>
        <stop offset="100%" stopColor={p.horn2}/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill="url(#brann-bg)"/>
    {/* Pauldrons — wide, dwarf-stocky silhouette */}
    <ellipse cx="50" cy="240" rx="40" ry="38" fill="url(#brann-armor)"/>
    <ellipse cx="190" cy="240" rx="40" ry="38" fill="url(#brann-armor)"/>
    {/* Pauldron rivets */}
    {[0,1,2,3].map(i => (
      <circle key={`l${i}`} cx={28 + i*8} cy={232 + i*2} r="1.5" fill={p.armor2}/>
    ))}
    {[0,1,2,3].map(i => (
      <circle key={`r${i}`} cx={184 + i*8} cy={232 - i*2} r="1.5" fill={p.armor2}/>
    ))}
    {/* Chest plate */}
    <path d="M70,260 Q70,220 120,210 Q170,220 170,260 L170,300 L70,300 Z" fill="url(#brann-armor)"/>
    {/* Chest emblem */}
    <path d="M120,240 L114,254 L106,254 L114,262 L110,276 L120,268 L130,276 L126,262 L134,254 L126,254 Z" fill={p.inner}/>
    {/* Helmet — wide, with horns */}
    <path d="M76,160 Q80,120 120,108 Q160,120 164,160 L164,180 L76,180 Z" fill="url(#brann-armor)"/>
    {/* Helmet center ridge */}
    <path d="M120,108 L120,180" stroke={p.armor2} strokeWidth="2" opacity="0.7"/>
    {/* Eye slit */}
    <rect x="86" y="146" width="68" height="8" rx="2" fill={p.armor2}/>
    {/* Glowing eyes inside slit */}
    <circle cx="104" cy="150" r="2" fill={p.inner}/>
    <circle cx="136" cy="150" r="2" fill={p.inner}/>
    {/* Horns — curving outward */}
    <path d="M76,156 Q40,130 30,90 Q40,110 50,128 Q60,140 76,148 Z" fill="url(#brann-horn)"/>
    <path d="M164,156 Q200,130 210,90 Q200,110 190,128 Q180,140 164,148 Z" fill="url(#brann-horn)"/>
    {/* Horn ridges */}
    <path d="M68,148 Q50,130 40,108" stroke={p.horn2} strokeWidth="0.8" fill="none" opacity="0.7"/>
    <path d="M172,148 Q190,130 200,108" stroke={p.horn2} strokeWidth="0.8" fill="none" opacity="0.7"/>
    {/* Beard — braided, hangs below helmet */}
    <path d="M86,180 Q100,200 96,250 Q108,240 110,260 Q120,250 130,260 Q132,240 144,250 Q140,200 154,180 Z" fill="url(#brann-beard)"/>
    {/* Braid bands */}
    <ellipse cx="105" cy="232" rx="6" ry="2" fill={p.armor3}/>
    <ellipse cx="135" cy="232" rx="6" ry="2" fill={p.armor3}/>
    <ellipse cx="105" cy="248" rx="5" ry="1.5" fill={p.beard2}/>
    <ellipse cx="135" cy="248" rx="5" ry="1.5" fill={p.beard2}/>
    {/* Beard texture */}
    {Array.from({length:8}).map((_,i) => (
      <path key={i} d={`M${92 + i*7},${198 + (i%3)*4} Q${92 + i*7},${220} ${92 + i*7 + 2},${240}`}
        stroke={p.beard2} strokeWidth="0.6" fill="none" opacity="0.5"/>
    ))}
  </svg>
);

const PORTRAITS = { elara: PortraitElara, korrin: PortraitKorrin, vex: PortraitVex, brann: PortraitBrann };

// ---------- Figurine (full body, faux-3D, board-token style) ----------
// 120x180 viewBox. Each figurine sits on an oval shadow base.
// Inspired by the user's screenshot: standing figures with subtle body shading.

const FigurineBase = ({ children, w = 120, h = 200 }) => (
  <svg viewBox={`0 0 ${w} ${h}`} xmlns="http://www.w3.org/2000/svg" className="ch-figurine">
    <defs>
      <radialGradient id="fig-shadow" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="#000" stopOpacity="0.7"/>
        <stop offset="100%" stopColor="#000" stopOpacity="0"/>
      </radialGradient>
    </defs>
    {/* Cast shadow on board */}
    <ellipse cx={w/2} cy={h - 8} rx="32" ry="6" fill="url(#fig-shadow)"/>
    {children}
  </svg>
);

const FigElara = ({ p }) => (
  <FigurineBase>
    <defs>
      <linearGradient id="figelara-dress" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.dress2}/>
        <stop offset="50%" stopColor={p.dress}/>
        <stop offset="100%" stopColor={p.dress2}/>
      </linearGradient>
      <linearGradient id="figelara-hair" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.hair2}/>
        <stop offset="50%" stopColor={p.hair}/>
        <stop offset="100%" stopColor={p.hair2}/>
      </linearGradient>
    </defs>
    {/* Dress (bell-skirt) */}
    <path d="M40,170 Q34,130 50,110 L70,110 Q86,130 80,170 Z" fill="url(#figelara-dress)"/>
    {/* Trim */}
    <path d="M40,170 Q60,166 80,170 L78,176 Q60,172 42,176 Z" fill={p.trim} opacity="0.7"/>
    {/* Lacing */}
    <path d="M60,114 L60,150" stroke={p.trim} strokeWidth="0.6" opacity="0.6"/>
    {/* Body — torso highlight */}
    <path d="M48,114 Q60,108 72,114 L70,124 Q60,118 50,124 Z" fill={p.dress} opacity="0.7"/>
    {/* Shoulders */}
    <ellipse cx="60" cy="100" rx="14" ry="6" fill={p.skin}/>
    {/* Neck */}
    <rect x="56" y="92" width="8" height="12" fill={p.skin}/>
    {/* Hair back — long down past dress */}
    <path d="M44,80 Q40,140 50,160 L62,158 Q50,140 50,80 Z" fill="url(#figelara-hair)"/>
    <path d="M76,80 Q80,140 70,160 L58,158 Q70,140 70,80 Z" fill="url(#figelara-hair)"/>
    {/* Head */}
    <ellipse cx="60" cy="78" rx="14" ry="16" fill={p.skin}/>
    {/* Hair front cap */}
    <path d="M46,76 Q50,62 60,60 Q70,62 74,76 Q70,68 60,68 Q50,68 46,76 Z" fill="url(#figelara-hair)"/>
    {/* Face dots */}
    <circle cx="55" cy="80" r="0.9" fill={p.eye}/>
    <circle cx="65" cy="80" r="0.9" fill={p.eye}/>
    <path d="M57,86 Q60,87 63,86" stroke="#9A2A1E" strokeWidth="0.7" fill="none" strokeLinecap="round"/>
    {/* Side-light highlight on dress */}
    <path d="M44,120 Q42,150 46,168" stroke={p.dress2} strokeWidth="2" fill="none" opacity="0.6"/>
  </FigurineBase>
);

const FigKorrin = ({ p }) => (
  <FigurineBase>
    <defs>
      <linearGradient id="figkorrin-robe" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.robe2}/>
        <stop offset="50%" stopColor={p.robe}/>
        <stop offset="100%" stopColor={p.robe2}/>
      </linearGradient>
    </defs>
    {/* Robe (heavy, conical) */}
    <path d="M34,170 Q30,120 50,90 L70,90 Q90,120 86,170 Z" fill="url(#figkorrin-robe)"/>
    {/* Robe seam */}
    <path d="M60,94 L60,170" stroke={p.robe2} strokeWidth="1" opacity="0.8"/>
    {/* Robe hood overlay */}
    <path d="M40,100 Q50,76 60,72 Q70,76 80,100 Q70,90 60,90 Q50,90 40,100 Z" fill={p.robe2}/>
    {/* Bell on robe */}
    <g transform="translate(60,140)">
      <path d="M-3,-2 Q-3,-5 0,-5 Q3,-5 3,-2 L4,1 L-4,1 Z" fill={p.trim}/>
      <rect x="-1" y="1" width="2" height="1.5" fill={p.trim}/>
    </g>
    {/* Sigil on chest */}
    <circle cx="60" cy="110" r="3" fill={p.inner} opacity="0.6"/>
    {/* Head — bald, peeking from hood */}
    <ellipse cx="60" cy="76" rx="12" ry="13" fill={p.skin}/>
    {/* Hood front shadow */}
    <path d="M48,80 Q60,72 72,80 Q72,68 60,64 Q48,68 48,80 Z" fill={p.robe2} opacity="0.6"/>
    {/* Eyes — closed */}
    <path d="M55,80 Q57,82 59,80" stroke={p.eye} strokeWidth="0.8" fill="none"/>
    <path d="M61,80 Q63,82 65,80" stroke={p.eye} strokeWidth="0.8" fill="none"/>
    {/* Forehead mark */}
    <circle cx="60" cy="74" r="1" fill={p.inner}/>
  </FigurineBase>
);

const FigVex = ({ p }) => (
  <FigurineBase>
    <defs>
      <linearGradient id="figvex-coat" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.coat2}/>
        <stop offset="50%" stopColor={p.coat}/>
        <stop offset="100%" stopColor={p.coat2}/>
      </linearGradient>
    </defs>
    {/* Long coat */}
    <path d="M42,170 Q40,120 50,98 L70,98 Q80,120 78,170 Z" fill="url(#figvex-coat)"/>
    {/* Coat lapels (V) */}
    <path d="M50,98 L60,140 L70,98 L66,98 L60,128 L54,98 Z" fill={p.coat2}/>
    {/* Belt */}
    <rect x="44" y="140" width="32" height="3" fill={p.hat2}/>
    <rect x="58" y="139" width="4" height="5" fill={p.trim}/>
    {/* Shoulders narrow */}
    <ellipse cx="60" cy="96" rx="11" ry="4" fill={p.coat}/>
    {/* Neck */}
    <rect x="57" y="86" width="6" height="12" fill={p.skin}/>
    {/* Head */}
    <ellipse cx="60" cy="74" rx="11" ry="12" fill={p.skin}/>
    {/* Mask */}
    <path d="M50,72 Q60,68 70,72 L70,80 Q60,82 50,80 Z" fill={p.mask}/>
    {/* Eyes — lime glow */}
    <circle cx="56" cy="76" r="0.9" fill={p.eye}/>
    <circle cx="64" cy="76" r="0.9" fill={p.eye}/>
    {/* Tricorn hat */}
    <path d="M38,68 Q44,52 60,50 Q76,52 82,68 Q70,62 60,62 Q50,62 38,68 Z" fill={p.hat}/>
    <path d="M38,68 L42,58 L48,68 Z" fill={p.hat2}/>
    <path d="M82,68 L78,58 L72,68 Z" fill={p.hat2}/>
    <path d="M60,50 L57,57 L63,57 Z" fill={p.hat2}/>
    {/* Feather */}
    <path d="M74,58 Q82,46 86,46" stroke={p.trim} strokeWidth="1" fill="none" strokeLinecap="round"/>
  </FigurineBase>
);

const FigBrann = ({ p }) => (
  <FigurineBase>
    <defs>
      <linearGradient id="figbrann-armor" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.armor2}/>
        <stop offset="50%" stopColor={p.armor3}/>
        <stop offset="100%" stopColor={p.armor2}/>
      </linearGradient>
      <linearGradient id="figbrann-beard" x1="0" x2="1" y1="0" y2="0">
        <stop offset="0%" stopColor={p.beard2}/>
        <stop offset="50%" stopColor={p.beard}/>
        <stop offset="100%" stopColor={p.beard2}/>
      </linearGradient>
    </defs>
    {/* Stocky body — wide stance */}
    <path d="M32,170 Q28,130 42,108 L78,108 Q92,130 88,170 Z" fill="url(#figbrann-armor)"/>
    {/* Belt */}
    <rect x="32" y="140" width="56" height="5" fill={p.armor2}/>
    <rect x="58" y="139" width="4" height="7" fill={p.beard}/>
    {/* Chest emblem */}
    <path d="M60,124 L56,132 L52,132 L57,138 L54,148 L60,144 L66,148 L63,138 L68,132 L64,132 Z" fill={p.inner}/>
    {/* Pauldrons (wide) */}
    <ellipse cx="36" cy="112" rx="14" ry="11" fill="url(#figbrann-armor)"/>
    <ellipse cx="84" cy="112" rx="14" ry="11" fill="url(#figbrann-armor)"/>
    {/* Beard hangs over chest */}
    <path d="M48,98 Q54,120 52,140 Q58,134 60,142 Q62,134 68,140 Q66,120 72,98 Z" fill="url(#figbrann-beard)"/>
    <ellipse cx="55" cy="128" rx="3" ry="1" fill={p.armor3}/>
    <ellipse cx="65" cy="128" rx="3" ry="1" fill={p.armor3}/>
    {/* Helmet */}
    <path d="M46,90 Q48,72 60,68 Q72,72 74,90 L74,98 L46,98 Z" fill="url(#figbrann-armor)"/>
    <path d="M60,68 L60,98" stroke={p.armor2} strokeWidth="1"/>
    {/* Eye slit */}
    <rect x="50" y="84" width="20" height="3" rx="1" fill={p.armor2}/>
    <circle cx="55" cy="85.5" r="0.8" fill={p.inner}/>
    <circle cx="65" cy="85.5" r="0.8" fill={p.inner}/>
    {/* Horns — outward and curving */}
    <path d="M46,86 Q30,76 24,60 Q30,72 36,80 Q42,84 46,86 Z" fill={p.horn}/>
    <path d="M74,86 Q90,76 96,60 Q90,72 84,80 Q78,84 74,86 Z" fill={p.horn}/>
  </FigurineBase>
);

const FIGURINES = { elara: FigElara, korrin: FigKorrin, vex: FigVex, brann: FigBrann };

// ---------- Cards ----------
function CharacterCard({ ch }) {
  const Portrait = PORTRAITS[ch.id];
  const Figurine = FIGURINES[ch.id];
  return (
    <article className="ch-card">
      <div className="ch-card__portrait">
        <Portrait p={ch.palette}/>
        <div className="ch-card__index">{`[ ${String(CHARACTERS.indexOf(ch)+1).padStart(2,"0")} ]`}</div>
      </div>
      <div className="ch-card__body">
        <div className="ch-card__head">
          <h3 className="ch-card__name">{ch.name}</h3>
          <span className="ch-card__tag mono">{ch.tag.toUpperCase()}</span>
        </div>
        <div className="ch-card__role mono">{ch.role}</div>
        <p className="ch-card__bio">{ch.bio}</p>
        <div className="ch-card__figrow">
          <div className="ch-card__figbox">
            <Figurine p={ch.palette}/>
          </div>
          <div className="ch-card__figmeta">
            <div className="eyebrow no-rule">Token</div>
            <div className="mono ch-card__figmeta-id">FIG · {ch.id.toUpperCase()}</div>
            <div className="ch-card__swatches">
              {Object.entries(ch.palette).slice(0,6).map(([k,v]) => (
                <div key={k} className="ch-card__sw" title={k}>
                  <span style={{background: v}}/>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function CharacterGrid() {
  return (
    <div className="ch-grid">
      {CHARACTERS.map(ch => <CharacterCard key={ch.id} ch={ch}/>)}
    </div>
  );
}

// ---------- Board preview ----------
// Matches the user's screenshot: wooden tabletop with the four figurines standing on it.
function BoardPreview() {
  return (
    <div className="board">
      <div className="board__surface">
        <div className="board__row">
          {CHARACTERS.map(ch => {
            const Fig = FIGURINES[ch.id];
            return (
              <div key={ch.id} className="board__token">
                <Fig p={ch.palette}/>
                <div className="board__label mono">{ch.name.toUpperCase()}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="board__caption mono">BRETT · 4 FIGUREN · STANDARD-AUFSTELLUNG</div>
    </div>
  );
}

window.CHARACTERS = CHARACTERS;
window.CharacterGrid = CharacterGrid;
window.BoardPreview = BoardPreview;
window.PORTRAITS = PORTRAITS;
window.FIGURINES = FIGURINES;
