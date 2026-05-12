/* global React */
// =====================================================================
//  environment.jsx — Floor tiles, walls, doors, vents, cover.
//  Plus decals: bullet hole, scorch, blood smear, footprint, graffiti.
//  All top-down, designed to repeat or be placed in the sandbox map.
// =====================================================================

const EN_INK    = '#1A1326';
const EN_INK_2  = '#221932';
const EN_INK_3  = '#2C2240';
const EN_INK_4  = '#3A2E52';
const EN_INK_5  = '#4A3A66';
const EN_LINE   = 'rgba(255,255,255,.08)';
const EN_LINE_2 = 'rgba(255,255,255,.14)';
const EN_LIME   = '#C8F76A';
const EN_LIME2  = '#E6FFB0';
const EN_TEAL   = '#5BD4D0';
const EN_RED    = '#E2384A';
const EN_RED_2  = '#7A1820';
const EN_BONE   = '#EDE6D8';
const EN_DARK   = '#0A0710';

/* ------------------------------------------------------------------ */
/*  Tiles                                                             */
/* ------------------------------------------------------------------ */

/* Concrete floor — base game tile */
function FloorConcrete({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" fill={EN_INK_3}/>
      {/* subtle slabs */}
      <line x1="0"  y1="32" x2="64" y2="32" stroke={EN_LINE_2} strokeWidth=".5"/>
      <line x1="32" y1="0"  x2="32" y2="32" stroke={EN_LINE_2} strokeWidth=".5"/>
      <line x1="20" y1="32" x2="20" y2="64" stroke={EN_LINE_2} strokeWidth=".5"/>
      <line x1="48" y1="32" x2="48" y2="64" stroke={EN_LINE_2} strokeWidth=".5"/>
      {/* speckle */}
      {Array.from({ length: 22 }).map((_, i) => {
        const x = (i * 31) % 60 + 2;
        const y = (i * 17 + 7) % 60 + 2;
        const r = (i % 3 === 0) ? 0.7 : 0.4;
        return <circle key={i} cx={x} cy={y} r={r} fill="rgba(255,255,255,.08)"/>;
      })}
      {/* hairline crack */}
      <path d="M 8 14 L 18 22 L 26 18" stroke={EN_DARK} strokeWidth=".4" fill="none" opacity=".7"/>
    </svg>
  );
}

/* Metal grate — utility floor */
function FloorGrate({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <rect width="64" height="64" fill={EN_INK_2}/>
      {[0,1,2,3,4,5,6,7].map(i => (
        <rect key={i} x={i * 8 + 1} y="2" width="6" height="60" fill={EN_INK_3}/>
      ))}
      {[0,1,2,3,4,5,6,7].map(i => (
        <line key={`v${i}`} x1={i*8 + 4} y1="2" x2={i*8 + 4} y2="62" stroke={EN_DARK} strokeWidth=".5"/>
      ))}
      {/* cross-supports */}
      <line x1="0" y1="22" x2="64" y2="22" stroke={EN_INK} strokeWidth="1.4"/>
      <line x1="0" y1="42" x2="64" y2="42" stroke={EN_INK} strokeWidth="1.4"/>
      {/* corner bolts */}
      {[[2,2],[62,2],[2,62],[62,62]].map(([x,y],i)=> <circle key={i} cx={x} cy={y} r="1" fill={EN_INK_4}/>)}
    </svg>
  );
}

/* Wall block — tall ink rectangle, top edge catches lime rim */
function WallBlock({ width = 120, height = 24 }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ overflow:'visible' }}>
      <rect x="0" y="0" width={width} height={height} fill={EN_INK} stroke={EN_DARK} strokeWidth=".5"/>
      {/* brick courses */}
      <line x1="0" y1={height/2} x2={width} y2={height/2} stroke={EN_LINE} strokeWidth=".5"/>
      {Array.from({ length: Math.floor(width / 16) }).map((_, i) => (
        <line key={i} x1={i * 16 + 8} y1="0" x2={i * 16 + 8} y2={height/2} stroke={EN_LINE} strokeWidth=".5"/>
      ))}
      {Array.from({ length: Math.floor(width / 16) }).map((_, i) => (
        <line key={`b${i}`} x1={i * 16} y1={height/2} x2={i * 16} y2={height} stroke={EN_LINE} strokeWidth=".5"/>
      ))}
      {/* lime rim — top edge as if catching from above */}
      <line x1="0" y1="1" x2={width} y2="1" stroke={EN_LIME} strokeWidth=".75" opacity=".6"/>
    </svg>
  );
}

/* Door — closed, with frame + viewport */
function Door({ size = 72 }) {
  return (
    <svg width={size * 0.7} height={size} viewBox="0 0 48 72" style={{ overflow:'visible' }}>
      {/* frame */}
      <rect x="0" y="0" width="48" height="72" fill={EN_INK} stroke={EN_DARK} strokeWidth=".5"/>
      {/* door */}
      <rect x="4" y="4" width="40" height="64" rx="1" fill={EN_INK_3} stroke={EN_LINE_2} strokeWidth=".5"/>
      {/* inner panels */}
      <rect x="8" y="8"  width="32" height="22" fill="none" stroke={EN_LINE} strokeWidth=".5"/>
      <rect x="8" y="34" width="32" height="14" fill="none" stroke={EN_LINE} strokeWidth=".5"/>
      <rect x="8" y="52" width="32" height="14" fill="none" stroke={EN_LINE} strokeWidth=".5"/>
      {/* viewport */}
      <rect x="18" y="14" width="12" height="10" rx="1" fill={EN_LIME} opacity=".15"/>
      <rect x="18" y="14" width="12" height="10" rx="1" fill="none" stroke={EN_LIME} strokeWidth=".75"/>
      {/* handle */}
      <rect x="38" y="38" width="2" height="6" rx="1" fill={EN_LIME}/>
      {/* hinges */}
      <rect x="4" y="10" width="2" height="3" fill={EN_INK_4}/>
      <rect x="4" y="58" width="2" height="3" fill={EN_INK_4}/>
      {/* lime rim — left edge */}
      <line x1="44" y1="6" x2="44" y2="66" stroke={EN_LIME} strokeWidth=".75" opacity=".5"/>
    </svg>
  );
}

/* Floor vent — grilled rectangle */
function Vent({ size = 60 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 48 32">
      <rect x="0" y="0" width="48" height="32" rx="1" fill={EN_INK_2} stroke={EN_DARK} strokeWidth=".4"/>
      {[0,1,2,3,4,5,6].map(i => (
        <rect key={i} x="3" y={3 + i*4} width="42" height="2" fill={EN_INK} />
      ))}
      <line x1="2" y1="3" x2="2" y2="29" stroke={EN_INK_4} strokeWidth=".75"/>
      <line x1="46" y1="3" x2="46" y2="29" stroke={EN_INK_4} strokeWidth=".75"/>
      {/* corner screws */}
      {[[3,3],[45,3],[3,29],[45,29]].map(([x,y],i)=> <circle key={i} cx={x} cy={y} r=".7" fill={EN_INK_4}/>)}
    </svg>
  );
}

/* Cover wall (low concrete barrier with lime tag) */
function CoverWall({ size = 110 }) {
  return (
    <svg width={size} height={size * 0.5} viewBox="0 0 110 56" style={{ overflow:'visible' }}>
      <ellipse cx="55" cy="50" rx="48" ry="3.5" fill="rgba(0,0,0,.5)"/>
      <path d="M 8 32 L 102 32 L 96 16 L 14 16 Z" fill={EN_INK_4} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      <path d="M 8 32 L 102 32 L 100 38 L 10 38 Z" fill={EN_INK_3}/>
      {/* tonal seams */}
      <line x1="40" y1="16" x2="36" y2="32" stroke={EN_LINE} strokeWidth=".5"/>
      <line x1="70" y1="16" x2="74" y2="32" stroke={EN_LINE} strokeWidth=".5"/>
      {/* hazard stripes on side */}
      <path d="M 12 38 L 16 38 L 14 42 Z" fill={EN_LIME} opacity=".7"/>
      <path d="M 98 38 L 94 38 L 96 42 Z" fill={EN_LIME} opacity=".7"/>
      {/* lime rim on top edge */}
      <line x1="14" y1="16" x2="96" y2="16" stroke={EN_LIME} strokeWidth=".75" opacity=".7"/>
      {/* tag */}
      <text x="55" y="28" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="6" fill={EN_LIME} letterSpacing=".25em">{'< COVER'}</text>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Decals — overlays placed on top of floor                          */
/* ------------------------------------------------------------------ */

/* Bullet hole — small dark crater + radial cracks */
function BulletHole({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow:'visible' }}>
      <circle cx="12" cy="12" r="6" fill="rgba(0,0,0,.55)"/>
      <circle cx="12" cy="12" r="3.5" fill={EN_DARK}/>
      <circle cx="12" cy="12" r="1.6" fill="#000"/>
      {/* radial cracks */}
      <line x1="12" y1="12" x2="12" y2="3"  stroke={EN_DARK} strokeWidth=".6"/>
      <line x1="12" y1="12" x2="20" y2="9"  stroke={EN_DARK} strokeWidth=".6"/>
      <line x1="12" y1="12" x2="22" y2="14" stroke={EN_DARK} strokeWidth=".5"/>
      <line x1="12" y1="12" x2="16" y2="22" stroke={EN_DARK} strokeWidth=".6"/>
      <line x1="12" y1="12" x2="6"  y2="22" stroke={EN_DARK} strokeWidth=".5"/>
      <line x1="12" y1="12" x2="2"  y2="14" stroke={EN_DARK} strokeWidth=".5"/>
      <line x1="12" y1="12" x2="3"  y2="6"  stroke={EN_DARK} strokeWidth=".6"/>
      <circle cx="11" cy="11" r=".4" fill={EN_LIME} opacity=".7"/>
    </svg>
  );
}

/* Scorch mark — explosion residue */
function Scorch({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <ellipse cx="32" cy="32" rx="28" ry="24" fill="rgba(0,0,0,.4)"/>
      <ellipse cx="32" cy="32" rx="22" ry="18" fill="rgba(0,0,0,.55)"/>
      <ellipse cx="32" cy="32" rx="14" ry="11" fill="#0E0814"/>
      <circle cx="30" cy="30" r="4" fill="#000"/>
      {/* radial streaks */}
      {[0,45,90,135,180,225,270,315].map((a, i) => {
        const rad = a * Math.PI / 180;
        return <line key={i}
          x1={32 + Math.cos(rad)*14} y1={32 + Math.sin(rad)*11}
          x2={32 + Math.cos(rad)*26} y2={32 + Math.sin(rad)*22}
          stroke="rgba(0,0,0,.5)" strokeWidth="2.5" strokeLinecap="round"/>;
      })}
      {/* tiny ember */}
      <circle cx="38" cy="28" r=".8" fill="#FF6B7A" opacity=".7"/>
    </svg>
  );
}

/* Blood smear — directional drag */
function BloodSmear({ size = 80 }) {
  return (
    <svg width={size} height={size * 0.6} viewBox="0 0 80 48" style={{ overflow:'visible' }}>
      <path d="M 8 24 Q 20 14 36 22 Q 52 28 70 22 L 72 28 Q 54 34 36 28 Q 20 22 8 30 Z"
        fill={EN_RED_2} opacity=".85"/>
      <path d="M 12 22 Q 24 14 38 20 Q 52 26 68 20 L 70 25 Q 54 30 38 24 Q 24 18 12 26 Z"
        fill={EN_RED}/>
      {/* drag streaks */}
      {[0,1,2,3].map(i => (
        <line key={i} x1={20 + i*14} y1={20 + (i%2)*2}
          x2={26 + i*14} y2={28 + (i%2)*2}
          stroke={EN_RED_2} strokeWidth="1.5" strokeLinecap="round" opacity=".6"/>
      ))}
      {/* trailing drops */}
      <circle cx="74" cy="24" r="1.6" fill={EN_RED}/>
      <circle cx="78" cy="22" r="1"   fill={EN_RED}/>
      <circle cx="6"  cy="32" r="1.4" fill={EN_RED_2}/>
    </svg>
  );
}

/* Footprint — boot tread, single */
function Footprint({ size = 28 }) {
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 24 40" style={{ overflow:'visible' }}>
      {/* heel */}
      <ellipse cx="12" cy="32" rx="6" ry="6" fill="rgba(0,0,0,.65)"/>
      {/* arch */}
      <path d="M 7 24 Q 7 16 12 16 Q 17 16 17 24 L 17 28 L 7 28 Z" fill="rgba(0,0,0,.65)"/>
      {/* toe */}
      <ellipse cx="12" cy="10" rx="6.5" ry="6" fill="rgba(0,0,0,.65)"/>
      {/* tread */}
      <line x1="9"  y1="14" x2="15" y2="14" stroke="rgba(255,255,255,.08)" strokeWidth=".75"/>
      <line x1="8.5" y1="18" x2="15.5" y2="18" stroke="rgba(255,255,255,.08)" strokeWidth=".75"/>
      <line x1="9"  y1="22" x2="15" y2="22" stroke="rgba(255,255,255,.08)" strokeWidth=".75"/>
      <line x1="8" y1="32" x2="16" y2="32" stroke="rgba(255,255,255,.08)" strokeWidth=".75"/>
      <line x1="8" y1="35" x2="16" y2="35" stroke="rgba(255,255,255,.08)" strokeWidth=".75"/>
    </svg>
  );
}

/* Graffiti — Kore < tag with paint drips */
function Graffiti({ size = 110 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 110 80" style={{ overflow:'visible' }}>
      {/* spray cloud */}
      <ellipse cx="55" cy="40" rx="50" ry="32" fill="rgba(200,247,106,.06)"/>
      {/* main < */}
      <text x="42" y="58" fontFamily="Geist, sans-serif" fontSize="64" fontWeight="700" fill={EN_LIME}>{'<'}</text>
      <circle cx="86" cy="56" r="5" fill={EN_LIME}/>
      {/* drips */}
      <path d="M 50 60 L 50 72" stroke={EN_LIME} strokeWidth="1.5" opacity=".7"/>
      <circle cx="50" cy="73" r="1.2" fill={EN_LIME} opacity=".7"/>
      <path d="M 70 58 L 70 68" stroke={EN_LIME} strokeWidth="1.5" opacity=".5"/>
      <circle cx="70" cy="69" r="1" fill={EN_LIME} opacity=".5"/>
      <path d="M 86 62 L 86 70" stroke={EN_LIME} strokeWidth="1" opacity=".5"/>
      {/* over-spray flecks */}
      {Array.from({ length: 18 }).map((_, i) => {
        const x = (i * 17 + 5) % 100 + 5;
        const y = (i * 13) % 70 + 8;
        return <circle key={i} cx={x} cy={y} r=".6" fill={EN_LIME} opacity=".22"/>;
      })}
    </svg>
  );
}

Object.assign(window, {
  FloorConcrete, FloorGrate, WallBlock, Door, Vent, CoverWall,
  BulletHole, Scorch, BloodSmear, Footprint, Graffiti,
});
