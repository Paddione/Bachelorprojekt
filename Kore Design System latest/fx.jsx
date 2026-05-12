/* global React */
// =====================================================================
//  fx.jsx — All particle / decoration SVGs
//  Muzzle flash · bullet hit · blood splat · death pool · skull · crate
//  Style: chunky, slightly pixel-edged, no gradients on blood — flat
//  cartoon red. Lime stays the lighting accent everywhere except blood.
// =====================================================================

const FX_RED   = '#E2384A';   // splat primary
const FX_RED_2 = '#B72632';   // splat shadow / pool
const FX_RED_3 = '#FF6B7A';   // splat highlight
const FX_LIME  = '#C8F76A';
const FX_LIME2 = '#E6FFB0';
const FX_WHITE = '#FFF6E0';

/* ---------- Muzzle flash — 4-point starburst, lime/white ----------- */
function MuzzleFlash({ size = 56, color = FX_LIME }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible' }}>
      {/* hot inner core */}
      <circle cx="32" cy="32" r="9" fill={FX_WHITE} opacity=".95" />
      {/* 4-point star */}
      <path d="M 32 0 L 36 28 L 64 32 L 36 36 L 32 64 L 28 36 L 0 32 L 28 28 Z"
        fill={color} opacity=".85" />
      {/* secondary diagonal star */}
      <path d="M 32 8 L 38 26 L 56 32 L 38 38 L 32 56 L 26 38 L 8 32 L 26 26 Z"
        fill={FX_LIME2} opacity=".55" transform="rotate(45 32 32)" />
      {/* hot center */}
      <circle cx="32" cy="32" r="4" fill={FX_WHITE} />
    </svg>
  );
}

/* ---------- Bullet hit — small spark + dust ------------------------ */
function BulletHit({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: 'visible' }}>
      <circle cx="16" cy="16" r="3" fill={FX_WHITE} />
      <line x1="16" y1="2"  x2="16" y2="10" stroke={FX_LIME}  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="16" y1="22" x2="16" y2="30" stroke={FX_LIME}  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="2"  y1="16" x2="10" y2="16" stroke={FX_LIME}  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="16" x2="30" y2="16" stroke={FX_LIME}  strokeWidth="1.5" strokeLinecap="round" />
      <line x1="6"  y1="6"  x2="11" y2="11" stroke={FX_LIME2} strokeWidth="1"   strokeLinecap="round" opacity=".7" />
      <line x1="21" y1="21" x2="26" y2="26" stroke={FX_LIME2} strokeWidth="1"   strokeLinecap="round" opacity=".7" />
      <line x1="6"  y1="26" x2="11" y2="21" stroke={FX_LIME2} strokeWidth="1"   strokeLinecap="round" opacity=".7" />
      <line x1="21" y1="11" x2="26" y2="6"  stroke={FX_LIME2} strokeWidth="1"   strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

/* ---------- Blood splat — cartoon, flat, no realism ---------------- */
//  Big blob in the middle, satellite drops at random angles. The drops
//  are circles of decreasing size — reads as "splat" not as "wound."
function BloodSplat({ size = 96, seed = 0, color = FX_RED, color2 = FX_RED_2 }) {
  // pseudo-random satellite pattern based on seed
  const drops = [];
  const rng = (n) => {
    const x = Math.sin(seed * 9301 + n * 49297) * 233280;
    return x - Math.floor(x);
  };
  for (let i = 0; i < 11; i++) {
    const angle = rng(i) * Math.PI * 2;
    const dist = 14 + rng(i + 100) * 18;
    const r = 1.5 + rng(i + 200) * 3.5;
    drops.push({
      cx: 32 + Math.cos(angle) * dist,
      cy: 32 + Math.sin(angle) * dist,
      r,
    });
  }
  // longer "splash" tendrils
  const tendrils = [];
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2 + rng(i + 50);
    const len = 12 + rng(i + 300) * 8;
    tendrils.push({
      x1: 32 + Math.cos(angle) * 8,
      y1: 32 + Math.sin(angle) * 8,
      x2: 32 + Math.cos(angle) * (8 + len),
      y2: 32 + Math.sin(angle) * (8 + len),
    });
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible' }}>
      {/* tendrils — drawn first so blob covers their start */}
      {tendrils.map((t, i) => (
        <line key={`t${i}`} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2}
          stroke={color} strokeWidth="2" strokeLinecap="round" />
      ))}
      {/* outer satellite drops (shadow tone) */}
      {drops.map((d, i) => (
        <circle key={`s${i}`} cx={d.cx + 0.6} cy={d.cy + 0.6} r={d.r} fill={color2} opacity=".7" />
      ))}
      {/* main blob — irregular */}
      <path d="M 24 28 Q 20 22 26 20 Q 32 16 38 22 Q 44 24 42 32 Q 46 38 38 42 Q 32 48 26 42 Q 18 40 22 32 Z"
        fill={color2} />
      <path d="M 25 28 Q 22 24 27 22 Q 32 19 37 23 Q 42 25 40 31 Q 43 36 37 40 Q 32 45 27 40 Q 21 38 24 32 Z"
        fill={color} />
      {/* satellite drops on top */}
      {drops.map((d, i) => (
        <circle key={`d${i}`} cx={d.cx} cy={d.cy} r={d.r} fill={color} />
      ))}
      {/* highlight dot */}
      <circle cx="29" cy="26" r="2" fill={FX_RED_3} opacity=".8" />
    </svg>
  );
}

/* ---------- Blood pool — for ragdoll slump ------------------------- */
function BloodPool({ size = 120, color = FX_RED, color2 = FX_RED_2 }) {
  return (
    <svg width={size} height={size * 0.75} viewBox="0 0 120 90" style={{ overflow: 'visible' }}>
      {/* outer dark */}
      <ellipse cx="60" cy="50" rx="48" ry="30" fill={color2} opacity=".85" />
      {/* main */}
      <path d="M 18 50 Q 14 28 42 26 Q 70 18 92 28 Q 110 32 104 56 Q 96 76 60 76 Q 22 76 18 50 Z"
        fill={color} />
      {/* highlight */}
      <ellipse cx="46" cy="40" rx="14" ry="6" fill={FX_RED_3} opacity=".5" />
      {/* satellite drops around the pool */}
      <circle cx="10"  cy="46" r="3" fill={color} />
      <circle cx="6"   cy="58" r="2" fill={color} />
      <circle cx="114" cy="42" r="3" fill={color} />
      <circle cx="116" cy="60" r="2" fill={color} />
      <circle cx="60"  cy="84" r="2.5" fill={color} />
      <circle cx="50"  cy="14" r="2" fill={color} />
      <circle cx="78"  cy="12" r="2.5" fill={color} />
    </svg>
  );
}

/* ---------- Skull marker — drops over death spot ------------------- */
function SkullMarker({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow: 'visible' }}>
      <path d="M 8 12 Q 8 4 16 4 Q 24 4 24 12 L 24 18 Q 24 22 22 22 L 22 26 Q 22 28 20 28 L 12 28 Q 10 28 10 26 L 10 22 Q 8 22 8 18 Z"
        fill="#ECEFF3" />
      <circle cx="12" cy="14" r="2.5" fill="#120D1C" />
      <circle cx="20" cy="14" r="2.5" fill="#120D1C" />
      <path d="M 14 19 L 16 22 L 18 19 Z" fill="#120D1C" />
      <line x1="13" y1="25" x2="13" y2="27" stroke="#120D1C" strokeWidth="1.5" />
      <line x1="16" y1="25" x2="16" y2="27" stroke="#120D1C" strokeWidth="1.5" />
      <line x1="19" y1="25" x2="19" y2="27" stroke="#120D1C" strokeWidth="1.5" />
    </svg>
  );
}

/* ---------- Loot crate — top-down ---------------------------------- */
function LootCrate({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ overflow: 'visible' }}>
      <ellipse cx="24" cy="42" rx="20" ry="4" fill="rgba(0,0,0,.4)" />
      {/* crate body */}
      <rect x="6"  y="8"  width="36" height="36" rx="2" fill="#3A2E52" stroke="rgba(255,255,255,.1)" strokeWidth=".5" />
      {/* planks */}
      <rect x="6"  y="8"  width="36" height="2" fill="#221932" />
      <rect x="6"  y="20" width="36" height="2" fill="#221932" />
      <rect x="6"  y="32" width="36" height="2" fill="#221932" />
      <rect x="6"  y="42" width="36" height="2" fill="#221932" />
      {/* corner reinforcements */}
      <rect x="6"  y="8"  width="3"  height="36" fill="#221932" />
      <rect x="39" y="8"  width="3"  height="36" fill="#221932" />
      {/* lime stencil "K." in the middle */}
      <text x="24" y="30" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
        fontSize="14" fontWeight="600" fill="#C8F76A">{'<'}</text>
      {/* lime corner highlights */}
      <line x1="9"  y1="9"  x2="14" y2="9"  stroke="#C8F76A" strokeWidth=".75" />
      <line x1="9"  y1="9"  x2="9"  y2="14" stroke="#C8F76A" strokeWidth=".75" />
      <line x1="39" y1="9"  x2="39" y2="14" stroke="#C8F76A" strokeWidth=".75" />
      <line x1="34" y1="9"  x2="39" y2="9"  stroke="#C8F76A" strokeWidth=".75" />
    </svg>
  );
}

/* ---------- Bullet — tiny tracer round ----------------------------- */
function Bullet({ size = 12 }) {
  return (
    <svg width={size} height={size * 2} viewBox="0 0 8 16" style={{ overflow: 'visible' }}>
      {/* tracer trail */}
      <ellipse cx="4" cy="14" rx="1.5" ry="6" fill="#C8F76A" opacity=".5" />
      <ellipse cx="4" cy="14" rx="0.8" ry="4" fill="#E6FFB0" />
      {/* bullet */}
      <ellipse cx="4" cy="6"  rx="2"   ry="3" fill="#FFF6E0" />
      <ellipse cx="4" cy="5"  rx="1"   ry="1.5" fill="#FFFFFF" />
    </svg>
  );
}

/* ---------- Shell casing — small ejection ------------------------- */
function Shell({ size = 8 }) {
  return (
    <svg width={size} height={size * 1.6} viewBox="0 0 8 12">
      <rect x="2" y="0" width="4" height="12" rx="1" fill="#D8FF8A" />
      <rect x="2" y="0" width="4" height="2"  fill="#6B8B1F" />
      <rect x="3" y="2" width="1" height="9"  fill="#FFFFFF" opacity=".4" />
    </svg>
  );
}

Object.assign(window, { MuzzleFlash, BulletHit, BloodSplat, BloodPool, SkullMarker, LootCrate, Bullet, Shell });
