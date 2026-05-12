/* global React */
// =====================================================================
//  weapons2.jsx — additional top-down weapon SVGs in Kore palette.
//  Same conventions as weapons.jsx: barrel up, grip down, lime rim.
// =====================================================================

const W2_INK   = '#1A1326';
const W2_INK_2 = '#221932';
const W2_INK_3 = '#2C2240';
const W2_LINE  = 'rgba(255,255,255,.18)';
const W2_RIM   = '#C8F76A';
const W2_DARK  = '#0A0710';
const W2_STEEL = '#3A2E52';
const W2_WOOD  = '#3A2E1C';
const W2_WOOD2 = '#5A4426';
const W2_BONE  = '#EDE6D8';

/* ---------- Pump shotgun ------------------------------------------ */
function Shotgun({ size = 160, rimOn = true }) {
  const w = 30, h = 200;
  const s = size / h;
  return (
    <svg width={w*s} height={h*s} viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
      <ellipse cx={w/2} cy={h-2} rx={12} ry={3.5} fill="rgba(0,0,0,.5)"/>
      {/* barrel */}
      <rect x="13" y="0"  width="6"  height="86" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".5"/>
      <rect x="14" y="2"  width="4"  height="2"  fill={W2_DARK}/>
      {/* heat shield ribs */}
      {[0,1,2,3,4,5].map(i=>(
        <line key={i} x1="13" y1={20+i*8} x2="19" y2={20+i*8} stroke={W2_DARK} strokeWidth=".5"/>
      ))}
      {/* magazine tube */}
      <rect x="14" y="20" width="4" height="68" fill={W2_INK_2}/>
      {/* pump grip */}
      <rect x="10" y="86" width="14" height="14" rx="1" fill={W2_INK} stroke={W2_LINE} strokeWidth=".5"/>
      <line x1="11" y1="89" x2="23" y2="89" stroke="rgba(255,255,255,.08)" strokeWidth=".4"/>
      <line x1="11" y1="93" x2="23" y2="93" stroke="rgba(255,255,255,.08)" strokeWidth=".4"/>
      <line x1="11" y1="97" x2="23" y2="97" stroke="rgba(255,255,255,.08)" strokeWidth=".4"/>
      {/* receiver */}
      <rect x="11" y="100" width="12" height="38" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".5"/>
      <rect x="13" y="108" width="8" height="3" fill={W2_INK_2}/>{/* ejection port */}
      <rect x="14" y="108" width="6" height="2" fill={W2_DARK}/>
      {/* trigger guard */}
      <path d="M 11 138 Q 11 146 17 146 L 19 146 Q 24 146 24 138 Z" fill={W2_INK_2}/>
      <path d="M 14 140 Q 14 143 17 143 L 19 143 Q 21 143 21 140 Z" fill={W2_DARK}/>
      {/* wood stock */}
      <path d="M 9 138 L 25 138 L 26 188 L 10 192 Z" fill={W2_WOOD} stroke={W2_LINE} strokeWidth=".5"/>
      <path d="M 11 142 L 23 142 L 24 184 L 12 186 Z" fill={W2_WOOD2} opacity=".6"/>
      <rect x="9"  y="190" width="17" height="4" rx="1" fill={W2_DARK}/>
      {rimOn && (<>
        <line x1="18" y1="2"   x2="18" y2="86"  stroke={W2_RIM} strokeWidth=".75" opacity=".95"/>
        <line x1="23" y1="88"  x2="23" y2="100" stroke={W2_RIM} strokeWidth=".75" opacity=".85"/>
        <line x1="22" y1="102" x2="22" y2="138" stroke={W2_RIM} strokeWidth=".75" opacity=".8"/>
        <line x1="25" y1="142" x2="25" y2="184" stroke={W2_RIM} strokeWidth=".75" opacity=".7"/>
      </>)}
    </svg>
  );
}

/* ---------- MP5 SMG ----------------------------------------------- */
function MP5({ size = 120, rimOn = true }) {
  const w = 32, h = 150;
  const s = size / h;
  return (
    <svg width={w*s} height={h*s} viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
      <ellipse cx={w/2} cy={h-2} rx={12} ry={3.5} fill="rgba(0,0,0,.5)"/>
      {/* barrel */}
      <rect x="14" y="0"  width="4"  height="14" fill={W2_INK_3}/>
      <rect x="15" y="2"  width="2"  height="2"  fill={W2_DARK}/>
      {/* fore-grip */}
      <rect x="11" y="14" width="10" height="22" rx="1" fill={W2_INK_2} stroke={W2_LINE} strokeWidth=".5"/>
      <line x1="13" y1="18" x2="19" y2="18" stroke={W2_DARK} strokeWidth=".4"/>
      <line x1="13" y1="22" x2="19" y2="22" stroke={W2_DARK} strokeWidth=".4"/>
      <line x1="13" y1="26" x2="19" y2="26" stroke={W2_DARK} strokeWidth=".4"/>
      <line x1="13" y1="30" x2="19" y2="30" stroke={W2_DARK} strokeWidth=".4"/>
      {/* receiver */}
      <rect x="9"  y="36" width="14" height="46" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".5"/>
      {/* iconic curved magazine */}
      <path d="M 7 54 Q 5 70 9 88 L 14 90 L 14 54 Z" fill={W2_INK} stroke={W2_LINE} strokeWidth=".5"/>
      <line x1="8"  y1="60" x2="13" y2="60" stroke="rgba(255,255,255,.06)" strokeWidth=".4"/>
      <line x1="8"  y1="68" x2="13" y2="68" stroke="rgba(255,255,255,.06)" strokeWidth=".4"/>
      <line x1="7"  y1="76" x2="13" y2="76" stroke="rgba(255,255,255,.06)" strokeWidth=".4"/>
      {/* trigger group */}
      <path d="M 9 82 Q 9 90 15 90 L 17 90 Q 22 90 22 82 Z" fill={W2_INK_2}/>
      <path d="M 12 84 Q 12 87 15 87 L 17 87 Q 19 87 19 84 Z" fill={W2_DARK}/>
      {/* pistol grip */}
      <path d="M 14 90 L 23 90 L 24 110 L 17 112 Z" fill={W2_INK}/>
      {/* collapsible wire stock */}
      <rect x="13" y="90" width="6" height="4" fill={W2_INK_3}/>
      <line x1="11" y1="96"  x2="20" y2="96"  stroke={W2_INK_2} strokeWidth="1.5"/>
      <line x1="11" y1="100" x2="20" y2="100" stroke={W2_INK_2} strokeWidth="1.5"/>
      <line x1="9"  y1="104" x2="22" y2="104" stroke={W2_INK_2} strokeWidth="1.5"/>
      <rect x="8"  y="112" width="16" height="20" rx="1" fill={W2_INK_2} stroke={W2_LINE} strokeWidth=".5"/>
      <rect x="8"  y="138" width="16" height="4" rx="1" fill={W2_DARK}/>
      {rimOn && (<>
        <line x1="17" y1="2"  x2="17" y2="14" stroke={W2_RIM} strokeWidth=".75" opacity=".95"/>
        <line x1="20" y1="16" x2="20" y2="36" stroke={W2_RIM} strokeWidth=".75" opacity=".9"/>
        <line x1="22" y1="38" x2="22" y2="82" stroke={W2_RIM} strokeWidth=".75" opacity=".85"/>
        <line x1="23" y1="92" x2="22" y2="110" stroke={W2_RIM} strokeWidth=".75" opacity=".7"/>
        <line x1="23" y1="114" x2="23" y2="138" stroke={W2_RIM} strokeWidth=".75" opacity=".7"/>
      </>)}
    </svg>
  );
}

/* ---------- Sniper rifle (AWP-ish) -------------------------------- */
function Sniper({ size = 220, rimOn = true }) {
  const w = 36, h = 260;
  const s = size / h;
  return (
    <svg width={w*s} height={h*s} viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
      <ellipse cx={w/2} cy={h-2} rx={14} ry={4} fill="rgba(0,0,0,.55)"/>
      {/* muzzle brake */}
      <rect x="14" y="0"   width="6"  height="6"  fill={W2_INK_3}/>
      <line x1="14" y1="2" x2="20" y2="2" stroke={W2_DARK} strokeWidth=".6"/>
      <line x1="14" y1="4" x2="20" y2="4" stroke={W2_DARK} strokeWidth=".6"/>
      {/* barrel — long and tapered */}
      <rect x="15" y="6"   width="4"  height="80" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".4"/>
      <rect x="14" y="86"  width="6"  height="14" fill={W2_INK_3}/>{/* barrel collar */}
      {/* bipod */}
      <line x1="11" y1="88" x2="6"  y2="100" stroke={W2_INK_2} strokeWidth="1.5"/>
      <line x1="23" y1="88" x2="28" y2="100" stroke={W2_INK_2} strokeWidth="1.5"/>
      <circle cx="6"  cy="100" r="1.5" fill={W2_INK_2}/>
      <circle cx="28" cy="100" r="1.5" fill={W2_INK_2}/>
      {/* receiver / scope mount */}
      <rect x="10" y="100" width="14" height="60" fill={W2_INK_2} stroke={W2_LINE} strokeWidth=".5"/>
      {/* scope */}
      <rect x="6"  y="108" width="22" height="12" rx="2" fill={W2_INK} stroke={W2_LINE} strokeWidth=".5"/>
      <circle cx="9"  cy="114" r="3" fill={W2_DARK}/>
      <circle cx="9"  cy="114" r="1.6" fill={W2_RIM} opacity=".7"/>
      <circle cx="25" cy="114" r="3" fill={W2_DARK}/>
      <circle cx="25" cy="114" r="1.4" fill="#5BD4D0" opacity=".55"/>
      <rect x="14" y="106" width="6" height="2" fill={W2_INK_3}/>
      <rect x="14" y="120" width="6" height="2" fill={W2_INK_3}/>
      {/* bolt action handle */}
      <rect x="22" y="124" width="8" height="3" fill={W2_INK_3}/>
      <circle cx="30" cy="125.5" r="2" fill={W2_INK_3}/>
      {/* magazine */}
      <rect x="11" y="148" width="12" height="14" fill={W2_INK} stroke={W2_LINE} strokeWidth=".5"/>
      {/* trigger */}
      <path d="M 12 162 Q 12 170 18 170 L 19 170 Q 24 170 24 162 Z" fill={W2_INK_2}/>
      <path d="M 15 164 Q 15 167 18 167 L 19 167 Q 21 167 21 164 Z" fill={W2_DARK}/>
      {/* stock — long match-rifle shape */}
      <path d="M 10 160 L 24 160 L 25 252 L 11 254 Z" fill={W2_WOOD} stroke={W2_LINE} strokeWidth=".5"/>
      <path d="M 12 168 L 23 168 L 24 248 L 13 250 Z" fill={W2_WOOD2} opacity=".55"/>
      {/* cheek riser */}
      <rect x="11" y="180" width="13" height="20" fill={W2_INK_2} opacity=".8"/>
      <rect x="9"  y="252" width="17" height="5" rx="1" fill={W2_DARK}/>
      {rimOn && (<>
        <line x1="19" y1="2"   x2="19" y2="86"  stroke={W2_RIM} strokeWidth=".75" opacity="1"/>
        <line x1="20" y1="100" x2="20" y2="106" stroke={W2_RIM} strokeWidth=".75" opacity=".9"/>
        <line x1="28" y1="110" x2="28" y2="118" stroke={W2_RIM} strokeWidth=".75" opacity=".85"/>
        <line x1="24" y1="122" x2="24" y2="160" stroke={W2_RIM} strokeWidth=".75" opacity=".8"/>
        <line x1="25" y1="164" x2="24" y2="248" stroke={W2_RIM} strokeWidth=".75" opacity=".7"/>
      </>)}
    </svg>
  );
}

/* ---------- Combat knife ------------------------------------------ */
function Knife({ size = 80, rimOn = true }) {
  const w = 16, h = 84;
  const s = size / h;
  return (
    <svg width={w*s} height={h*s} viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
      <ellipse cx={w/2} cy={h-2} rx={5} ry={2} fill="rgba(0,0,0,.5)"/>
      {/* blade */}
      <path d="M 8 0 L 11 12 L 11 50 L 5 50 L 5 12 Z" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".5"/>
      {/* blade highlight */}
      <line x1="8" y1="2" x2="8" y2="48" stroke={W2_BONE} strokeWidth=".6" opacity=".5"/>
      {/* blood groove */}
      <line x1="7" y1="14" x2="7" y2="46" stroke={W2_DARK} strokeWidth=".6"/>
      {/* guard */}
      <rect x="2" y="50" width="12" height="3" fill={W2_INK_2}/>
      {/* handle wrap */}
      <rect x="5" y="53" width="6" height="22" fill={W2_INK} stroke={W2_LINE} strokeWidth=".5"/>
      {[0,1,2,3,4,5,6].map(i=>(
        <line key={i} x1="5" y1={56+i*3} x2="11" y2={56+i*3} stroke="rgba(255,255,255,.07)" strokeWidth=".4"/>
      ))}
      {/* pommel */}
      <rect x="4" y="75" width="8" height="6" rx="1" fill={W2_INK_2}/>
      <circle cx="8" cy="78" r="1.2" fill={W2_RIM}/>
      {rimOn && (
        <line x1="11" y1="2" x2="11" y2="50" stroke={W2_RIM} strokeWidth=".75" opacity=".95"/>
      )}
    </svg>
  );
}

/* ---------- Frag grenade (top-down) ------------------------------- */
function FragGrenade({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow:'visible' }}>
      <ellipse cx="24" cy="42" rx="13" ry="3" fill="rgba(0,0,0,.5)"/>
      {/* body */}
      <circle cx="24" cy="26" r="14" fill="#2A3A0C"/>
      <circle cx="24" cy="26" r="14" fill="none" stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      {/* serration grid */}
      {[0,1,2,3,4].map(i=>(
        <line key={`h${i}`} x1="11" y1={18+i*4} x2="37" y2={18+i*4} stroke="#1A2406" strokeWidth=".6"/>
      ))}
      {[0,1,2,3,4,5,6].map(i=>(
        <line key={`v${i}`} x1={12+i*4} y1="14" x2={12+i*4} y2="38" stroke="#1A2406" strokeWidth=".6"/>
      ))}
      {/* spoon */}
      <rect x="22" y="6" width="4" height="10" fill="#3A2E52"/>
      <rect x="20" y="14" width="8" height="3" fill="#3A2E52"/>
      {/* pin ring */}
      <circle cx="32" cy="10" r="3" fill="none" stroke="#C8F76A" strokeWidth="1.2"/>
      {/* highlight */}
      <ellipse cx="20" cy="20" rx="4" ry="2" fill="#5A6A1F" opacity=".6"/>
      {/* lime rim */}
      <path d="M 36 22 Q 38 28 35 34" stroke="#C8F76A" strokeWidth="1" fill="none" opacity=".8"/>
    </svg>
  );
}

/* ---------- RPG launcher ------------------------------------------ */
function RPG({ size = 200, rimOn = true }) {
  const w = 40, h = 240;
  const s = size / h;
  return (
    <svg width={w*s} height={h*s} viewBox={`0 0 ${w} ${h}`} style={{ overflow:'visible' }}>
      <ellipse cx={w/2} cy={h-2} rx={14} ry={4} fill="rgba(0,0,0,.5)"/>
      {/* warhead — chunky cone */}
      <path d="M 14 0 L 26 0 L 30 18 L 10 18 Z" fill="#4A1620"/>
      <path d="M 16 4 L 24 4 L 27 16 L 13 16 Z" fill="#6A2030" opacity=".6"/>
      <line x1="20" y1="2" x2="20" y2="16" stroke="#C8F76A" strokeWidth=".6" opacity=".8"/>
      {/* fins after warhead */}
      <path d="M 10 18 L 30 18 L 28 30 L 12 30 Z" fill="#3A2E52"/>
      <line x1="14" y1="20" x2="14" y2="28" stroke={W2_DARK} strokeWidth=".6"/>
      <line x1="20" y1="20" x2="20" y2="28" stroke={W2_DARK} strokeWidth=".6"/>
      <line x1="26" y1="20" x2="26" y2="28" stroke={W2_DARK} strokeWidth=".6"/>
      {/* tube */}
      <rect x="12" y="30"  width="16" height="160" fill={W2_INK_2} stroke={W2_LINE} strokeWidth=".5"/>
      {/* tube banding */}
      {[0,1,2,3].map(i=>(
        <rect key={i} x="11" y={50+i*32} width="18" height="3" fill={W2_INK_3}/>
      ))}
      {/* iron sight */}
      <rect x="18" y="56" width="4" height="10" fill={W2_INK_3}/>
      <rect x="19" y="50" width="2" height="6"  fill={W2_INK_3}/>
      {/* trigger / grip */}
      <rect x="13" y="158" width="14" height="6" fill={W2_INK_3}/>
      <path d="M 14 164 Q 14 170 19 170 L 21 170 Q 26 170 26 164 Z" fill={W2_INK_2}/>
      <path d="M 17 166 Q 17 168 19 168 L 21 168 Q 23 168 23 166 Z" fill={W2_DARK}/>
      <path d="M 16 170 L 24 170 L 25 188 L 18 190 Z" fill={W2_INK}/>
      {/* shoulder rest / rear */}
      <rect x="10" y="190" width="20" height="14" rx="2" fill={W2_INK_3} stroke={W2_LINE} strokeWidth=".5"/>
      <rect x="11" y="204" width="18" height="20" fill={W2_INK_2}/>
      <rect x="10" y="224" width="20" height="6" rx="1" fill={W2_DARK}/>
      {rimOn && (<>
        <line x1="27" y1="6"  x2="29" y2="18"  stroke={W2_RIM} strokeWidth="1" opacity=".95"/>
        <line x1="28" y1="32" x2="28" y2="190" stroke={W2_RIM} strokeWidth=".75" opacity=".85"/>
        <line x1="25" y1="170" x2="25" y2="188" stroke={W2_RIM} strokeWidth=".75" opacity=".7"/>
        <line x1="29" y1="194" x2="29" y2="222" stroke={W2_RIM} strokeWidth=".75" opacity=".75"/>
      </>)}
    </svg>
  );
}

/* ---------- Molotov cocktail -------------------------------------- */
function Molotov({ size = 60 }) {
  return (
    <svg width={size * 0.6} height={size} viewBox="0 0 36 60" style={{ overflow:'visible' }}>
      <ellipse cx="18" cy="56" rx="10" ry="2.5" fill="rgba(0,0,0,.5)"/>
      {/* bottle body */}
      <path d="M 10 18 L 26 18 L 28 50 Q 28 54 24 54 L 12 54 Q 8 54 8 50 Z" fill="#2A3A0C" opacity=".85" stroke={W2_LINE} strokeWidth=".5"/>
      {/* fluid highlight */}
      <path d="M 12 22 L 24 22 L 25 44 L 11 44 Z" fill="#C8F76A" opacity=".25"/>
      <line x1="14" y1="24" x2="14" y2="42" stroke="#E6FFB0" strokeWidth=".8" opacity=".5"/>
      {/* neck */}
      <rect x="14" y="10" width="8" height="10" fill="#221932" stroke={W2_LINE} strokeWidth=".5"/>
      {/* burning rag */}
      <path d="M 14 4 Q 18 0 22 4 L 21 10 L 15 10 Z" fill="#EDE6D8"/>
      <path d="M 16 0 Q 18 -4 20 0 L 19 4 L 17 4 Z" fill="#FF6B7A"/>
      <path d="M 17 -2 Q 18 -6 19 -2 L 18.5 1 L 17.5 1 Z" fill="#FFF6E0"/>
    </svg>
  );
}

Object.assign(window, { Shotgun, MP5, Sniper, Knife, FragGrenade, RPG, Molotov });
