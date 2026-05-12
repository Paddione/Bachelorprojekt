/* global React */
// =====================================================================
//  weapons.jsx — Top-down weapon SVGs in Kore palette
//  All weapons are drawn vertically (barrel pointing UP, grip at bottom)
//  so they can be rotated freely by the demo.
//  Body: aubergine ink. Rim light: plasma lime on the right edge.
//  Lengths roughly to-scale: Glock 92px, Deagle 110px, M4A1 200px.
// =====================================================================

const WEAPON_INK   = '#1A1326';   // body fill (ink-850)
const WEAPON_INK_2 = '#221932';   // softer body fill (ink-800)
const WEAPON_INK_3 = '#2C2240';   // top plane / slide (ink-750)
const WEAPON_LINE  = 'rgba(255,255,255,.18)';
const WEAPON_RIM   = '#C8F76A';   // lime rim
const WEAPON_RIM_2 = '#D8FF8A';
const WEAPON_DARK  = '#0A0710';   // shadow / hole
const WEAPON_STEEL = '#3A2E52';   // visible inner barrel

/* ---------- Glock 17 — compact 9mm --------------------------------- */
function Glock({ size = 64, rimOn = true }) {
  const w = 26, h = 92;
  const scale = size / h;
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      {/* drop shadow */}
      <ellipse cx={w/2 + 1} cy={h - 2} rx={10} ry={3} fill="rgba(0,0,0,.45)" />
      {/* slide / barrel */}
      <rect x="6"  y="2"  width="14" height="48" rx="2" fill={WEAPON_INK_3} stroke={WEAPON_LINE} strokeWidth=".5" />
      {/* slide serrations */}
      <line x1="7"  y1="36" x2="19" y2="36" stroke="rgba(0,0,0,.5)" strokeWidth=".5" />
      <line x1="7"  y1="40" x2="19" y2="40" stroke="rgba(0,0,0,.5)" strokeWidth=".5" />
      <line x1="7"  y1="44" x2="19" y2="44" stroke="rgba(0,0,0,.5)" strokeWidth=".5" />
      {/* front sight */}
      <rect x="11" y="0"  width="4"  height="3"  fill={WEAPON_INK_3} />
      {/* muzzle hole */}
      <rect x="11" y="3"  width="4"  height="2"  fill={WEAPON_DARK} />
      {/* frame */}
      <rect x="5"  y="48" width="16" height="6"  fill={WEAPON_INK_2} />
      {/* trigger guard */}
      <path d="M 6 54 Q 6 60 11 60 L 15 60 Q 20 60 20 54 Z" fill={WEAPON_INK_2} />
      <path d="M 9 56 Q 9 58 11 58 L 15 58 Q 17 58 17 56 Z" fill={WEAPON_DARK} />
      {/* grip (angled back) */}
      <path d="M 14 54 L 22 54 L 23 88 L 16 90 Z" fill={WEAPON_INK} />
      {/* grip texture */}
      <line x1="16" y1="62" x2="22" y2="62" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="16" y1="68" x2="22" y2="68" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="16" y1="74" x2="22" y2="74" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="16" y1="80" x2="22" y2="80" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      {/* magazine base */}
      <rect x="15" y="86" width="9"  height="3"  fill={WEAPON_INK_3} />
      {/* lime rim — right edge of slide */}
      {rimOn && (
        <>
          <line x1="20" y1="3"  x2="20" y2="50" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".9" />
          <line x1="22" y1="55" x2="23" y2="86" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".7" />
        </>
      )}
    </svg>
  );
}

/* ---------- Desert Eagle — magnum hand cannon ---------------------- */
function Deagle({ size = 78, rimOn = true }) {
  const w = 30, h = 110;
  const scale = size / h;
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <ellipse cx={w/2 + 1} cy={h - 2} rx={12} ry={3.5} fill="rgba(0,0,0,.5)" />
      {/* barrel rib (chunky top) */}
      <rect x="8"  y="2"  width="14" height="58" rx="1" fill={WEAPON_INK_3} stroke={WEAPON_LINE} strokeWidth=".5" />
      {/* iconic top rib slots */}
      <line x1="10" y1="10" x2="20" y2="10" stroke={WEAPON_DARK} strokeWidth=".5" />
      <line x1="10" y1="14" x2="20" y2="14" stroke={WEAPON_DARK} strokeWidth=".5" />
      <line x1="10" y1="18" x2="20" y2="18" stroke={WEAPON_DARK} strokeWidth=".5" />
      <line x1="10" y1="22" x2="20" y2="22" stroke={WEAPON_DARK} strokeWidth=".5" />
      <line x1="10" y1="26" x2="20" y2="26" stroke={WEAPON_DARK} strokeWidth=".5" />
      {/* slide serrations rear */}
      <line x1="9"  y1="44" x2="21" y2="44" stroke="rgba(0,0,0,.6)" strokeWidth=".6" />
      <line x1="9"  y1="48" x2="21" y2="48" stroke="rgba(0,0,0,.6)" strokeWidth=".6" />
      <line x1="9"  y1="52" x2="21" y2="52" stroke="rgba(0,0,0,.6)" strokeWidth=".6" />
      {/* front sight */}
      <rect x="13" y="0"  width="4"  height="3"  fill={WEAPON_INK_3} />
      {/* muzzle — wide bore */}
      <rect x="12" y="3"  width="6"  height="3"  fill={WEAPON_DARK} />
      {/* frame */}
      <rect x="6"  y="58" width="18" height="8"  fill={WEAPON_INK_2} />
      {/* hammer */}
      <rect x="20" y="60" width="3"  height="4"  fill={WEAPON_INK_3} />
      {/* trigger guard — chunky */}
      <path d="M 7 66 Q 7 74 13 74 L 17 74 Q 23 74 23 66 Z" fill={WEAPON_INK_2} />
      <path d="M 11 68 Q 11 71 13 71 L 17 71 Q 19 71 19 68 Z" fill={WEAPON_DARK} />
      {/* grip — wider than glock */}
      <path d="M 15 66 L 25 66 L 26 106 L 18 108 Z" fill={WEAPON_INK} />
      {/* checkered grip texture */}
      {[0, 1, 2, 3, 4, 5].map(i => (
        <line key={i} x1="18" y1={74 + i*5} x2="25" y2={74 + i*5} stroke="rgba(255,255,255,.07)" strokeWidth=".5" />
      ))}
      {[0, 1, 2].map(i => (
        <line key={`v${i}`} x1={20 + i*2} y1="74" x2={20 + i*2} y2="104" stroke="rgba(255,255,255,.05)" strokeWidth=".4" />
      ))}
      <rect x="17" y="104" width="10" height="3" fill={WEAPON_INK_3} />
      {rimOn && (
        <>
          <line x1="22" y1="3"  x2="22" y2="60" stroke={WEAPON_RIM} strokeWidth="1" opacity=".95" />
          <line x1="25" y1="68" x2="26" y2="104" stroke={WEAPON_RIM} strokeWidth=".8" opacity=".75" />
        </>
      )}
    </svg>
  );
}

/* ---------- M4A1 — assault rifle ----------------------------------- */
function M4A1({ size = 140, rimOn = true }) {
  const w = 36, h = 200;
  const scale = size / h;
  return (
    <svg width={w * scale} height={h * scale} viewBox={`0 0 ${w} ${h}`} style={{ overflow: 'visible' }}>
      <ellipse cx={w/2} cy={h - 2} rx={14} ry={3.5} fill="rgba(0,0,0,.5)" />
      {/* flash hider */}
      <rect x="14" y="0"   width="6"  height="6"  fill={WEAPON_INK_3} />
      <rect x="15" y="2"   width="4"  height="3"  fill={WEAPON_DARK} />
      {/* outer barrel */}
      <rect x="15" y="6"   width="4"  height="42" fill={WEAPON_INK_3} />
      {/* front sight post (triangular block) */}
      <path d="M 12 38 L 22 38 L 21 48 L 13 48 Z" fill={WEAPON_INK_3} />
      <rect x="16" y="34"  width="2"  height="6"  fill={WEAPON_INK_2} />
      {/* gas tube / handguard */}
      <rect x="11" y="48"  width="12" height="56" rx="1" fill={WEAPON_INK_2} stroke={WEAPON_LINE} strokeWidth=".5" />
      {/* rail slots on handguard */}
      {[0,1,2,3,4,5,6,7,8].map(i => (
        <line key={i} x1="13" y1={54 + i*5} x2="21" y2={54 + i*5} stroke="rgba(0,0,0,.55)" strokeWidth=".5" />
      ))}
      {/* upper receiver */}
      <rect x="10" y="104" width="14" height="32" fill={WEAPON_INK_3} stroke={WEAPON_LINE} strokeWidth=".5" />
      {/* charging handle */}
      <rect x="13" y="104" width="8"  height="3"  fill={WEAPON_INK_2} />
      {/* rear sight / carry handle hint */}
      <rect x="14" y="118" width="6"  height="4"  fill={WEAPON_INK_2} />
      {/* magazine — curved STANAG */}
      <path d="M 9 118 Q 7 130 9 154 L 16 156 L 16 118 Z" fill={WEAPON_INK} stroke={WEAPON_LINE} strokeWidth=".5" />
      <line x1="10" y1="124" x2="15" y2="124" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="10" y1="132" x2="15" y2="132" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="9"  y1="140" x2="15" y2="140" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      <line x1="9"  y1="148" x2="15" y2="148" stroke="rgba(255,255,255,.06)" strokeWidth=".5" />
      {/* lower receiver — pistol grip area */}
      <rect x="10" y="136" width="14" height="14" fill={WEAPON_INK_2} />
      {/* trigger guard */}
      <path d="M 11 142 Q 11 150 16 150 L 19 150 Q 24 150 24 142 Z" fill={WEAPON_INK_2} />
      <path d="M 14 144 Q 14 147 16 147 L 19 147 Q 21 147 21 144 Z" fill={WEAPON_DARK} />
      {/* pistol grip */}
      <path d="M 17 150 L 26 150 L 27 168 L 20 170 Z" fill={WEAPON_INK} />
      {/* buffer tube */}
      <rect x="14" y="150" width="6" height="20" fill={WEAPON_INK_3} />
      {/* collapsible stock */}
      <path d="M 9 168 L 25 168 L 24 192 L 10 192 Z" fill={WEAPON_INK_2} stroke={WEAPON_LINE} strokeWidth=".5" />
      <rect x="11" y="172" width="12" height="4"  fill={WEAPON_INK_3} />
      <rect x="11" y="180" width="12" height="3"  fill={WEAPON_INK_3} />
      {/* butt pad */}
      <rect x="9"  y="190" width="16" height="4"  rx="1" fill={WEAPON_DARK} />
      {rimOn && (
        <>
          {/* rim along right edge — top to stock */}
          <line x1="19" y1="2"   x2="19" y2="48"  stroke={WEAPON_RIM} strokeWidth=".75" opacity=".95" />
          <line x1="22" y1="50"  x2="22" y2="104" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".9" />
          <line x1="23" y1="106" x2="23" y2="136" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".85" />
          <line x1="26" y1="152" x2="27" y2="166" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".75" />
          <line x1="24" y1="170" x2="23" y2="190" stroke={WEAPON_RIM} strokeWidth=".75" opacity=".7" />
          {/* tiny lime dot — fire-mode selector "highlight" */}
          <circle cx="11" cy="138" r="1" fill={WEAPON_RIM_2} />
        </>
      )}
    </svg>
  );
}

/* ---------- export ------------------------------------------------- */
Object.assign(window, { Glock, Deagle, M4A1 });
