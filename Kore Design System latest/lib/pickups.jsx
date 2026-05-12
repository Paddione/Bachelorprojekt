/* global React */
// =====================================================================
//  pickups.jsx — small, glowy, top-down pickup items.
//  Convention: ground shadow + faint lime/teal up-glow ring,
//  tiny floating offset suggested by a soft drop shadow.
// =====================================================================

const PI_INK   = '#1A1326';
const PI_INK_2 = '#221932';
const PI_INK_3 = '#2C2240';
const PI_LIME  = '#C8F76A';
const PI_LIME2 = '#E6FFB0';
const PI_TEAL  = '#5BD4D0';
const PI_RED   = '#E2384A';
const PI_BONE  = '#EDE6D8';
const PI_GOLD  = '#D8B85A';

/* ground glow halo — re-used by all pickups */
function GroundGlow({ color = PI_LIME, r = 22 }) {
  return (
    <>
      <ellipse cx="32" cy="44" rx={r} ry={r * 0.32} fill="rgba(0,0,0,.45)" />
      <circle cx="32" cy="32" r={r} fill={color} opacity=".10" />
      <circle cx="32" cy="32" r={r * 0.7} fill={color} opacity=".18" />
    </>
  );
}

/* ---------- Health pack (cross on white box) ---------------------- */
function HealthPack({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_LIME} />
      <rect x="14" y="18" width="36" height="26" rx="3" fill={PI_BONE} stroke="rgba(0,0,0,.3)" strokeWidth=".75"/>
      <rect x="14" y="18" width="36" height="6"  fill="#D9D2C5"/>{/* lid */}
      <rect x="22" y="20" width="20" height="2"  fill="#9D9686" opacity=".5"/>{/* hinge */}
      {/* red cross */}
      <rect x="29" y="26" width="6" height="14" fill={PI_RED}/>
      <rect x="23" y="30" width="18" height="6" fill={PI_RED}/>
      {/* corner highlights */}
      <line x1="14" y1="20" x2="20" y2="20" stroke={PI_LIME} strokeWidth=".75" opacity=".8"/>
      <line x1="14" y1="20" x2="14" y2="26" stroke={PI_LIME} strokeWidth=".75" opacity=".8"/>
      <line x1="50" y1="20" x2="50" y2="26" stroke={PI_LIME} strokeWidth=".75" opacity=".8"/>
    </svg>
  );
}

/* ---------- Med syringe (small instant heal) --------------------- */
function MedSyringe({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_LIME} r={18} />
      <g transform="rotate(-25 32 32)">
        {/* needle */}
        <rect x="31" y="14" width="2" height="6" fill={PI_BONE}/>
        {/* barrel */}
        <rect x="26" y="20" width="12" height="22" rx="1" fill={PI_BONE} stroke="rgba(0,0,0,.25)" strokeWidth=".5"/>
        {/* fluid */}
        <rect x="28" y="24" width="8" height="14" fill={PI_LIME} opacity=".75"/>
        <rect x="28" y="24" width="8" height="3"  fill={PI_LIME2}/>
        {/* plunger */}
        <rect x="28" y="42" width="8" height="3"  fill="#9D9686"/>
        <rect x="30" y="44" width="4" height="8"  fill="#9D9686"/>
        <rect x="26" y="50" width="12" height="3" rx="1" fill="#9D9686"/>
        {/* highlight */}
        <line x1="28" y1="22" x2="28" y2="40" stroke="rgba(255,255,255,.6)" strokeWidth=".8"/>
      </g>
    </svg>
  );
}

/* ---------- Armor plate ------------------------------------------- */
function ArmorPlate({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_TEAL} />
      <path d="M 14 18 L 50 18 L 48 42 Q 32 50 16 42 Z" fill={PI_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <path d="M 18 22 L 46 22 L 44 38 Q 32 44 20 38 Z" fill={PI_INK_2}/>
      {/* teal trim — health/shield secondary */}
      <path d="M 14 18 L 50 18" stroke={PI_TEAL} strokeWidth="1.4"/>
      <path d="M 14 18 L 16 42" stroke={PI_TEAL} strokeWidth=".75" opacity=".7"/>
      <path d="M 50 18 L 48 42" stroke={PI_TEAL} strokeWidth=".75" opacity=".7"/>
      {/* center chevron */}
      <path d="M 26 26 L 32 32 L 38 26" stroke={PI_TEAL} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M 26 32 L 32 38 L 38 32" stroke={PI_TEAL} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity=".6"/>
      {/* bolts */}
      <circle cx="18" cy="22" r="1" fill={PI_BONE} opacity=".7"/>
      <circle cx="46" cy="22" r="1" fill={PI_BONE} opacity=".7"/>
    </svg>
  );
}

/* ---------- Ammo box ---------------------------------------------- */
function AmmoBox({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_LIME} />
      {/* metal box */}
      <rect x="14" y="20" width="36" height="22" rx="2" fill="#3A2E1C" stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <rect x="14" y="20" width="36" height="5" fill="#5A4426"/>
      {/* hinges */}
      <rect x="18" y="20" width="3" height="5" fill="#2A2014"/>
      <rect x="43" y="20" width="3" height="5" fill="#2A2014"/>
      {/* latch */}
      <rect x="29" y="24" width="6" height="3" fill="#1A140A"/>
      {/* stencil text */}
      <text x="32" y="36" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
        fontSize="9" fontWeight="700" fill={PI_LIME} letterSpacing=".1em">5.56</text>
      {/* stripe */}
      <rect x="14" y="38" width="36" height="1" fill={PI_LIME} opacity=".5"/>
      {/* corner rim */}
      <line x1="14" y1="22" x2="20" y2="22" stroke={PI_LIME} strokeWidth=".6" opacity=".7"/>
      <line x1="50" y1="22" x2="44" y2="22" stroke={PI_LIME} strokeWidth=".6" opacity=".7"/>
    </svg>
  );
}

/* ---------- Keycard ----------------------------------------------- */
function Keycard({ size = 48 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_TEAL} r={18} />
      <g transform="rotate(15 32 32)">
        <rect x="14" y="22" width="36" height="22" rx="2" fill={PI_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
        {/* magnetic stripe */}
        <rect x="14" y="26" width="36" height="3" fill={PI_INK}/>
        {/* chip */}
        <rect x="18" y="32" width="6" height="6" rx="1" fill={PI_GOLD}/>
        <line x1="19" y1="34" x2="23" y2="34" stroke="#9D8030" strokeWidth=".5"/>
        <line x1="19" y1="36" x2="23" y2="36" stroke="#9D8030" strokeWidth=".5"/>
        {/* mock text rows */}
        <rect x="28" y="33" width="14" height="1.2" fill={PI_TEAL} opacity=".7"/>
        <rect x="28" y="36" width="20" height="1.2" fill="rgba(255,255,255,.4)"/>
        <rect x="28" y="39" width="10" height="1.2" fill="rgba(255,255,255,.25)"/>
        {/* cluster K dot */}
        <circle cx="46" cy="40" r="1.4" fill={PI_LIME}/>
      </g>
    </svg>
  );
}

/* ---------- RESPECT coin ------------------------------------------ */
function RespectCoin({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <GroundGlow color={PI_LIME} r={18} />
      <ellipse cx="32" cy="34" rx="14" ry="13" fill={PI_GOLD} stroke="#9D8030" strokeWidth=".75"/>
      <ellipse cx="32" cy="32" rx="12" ry="11" fill="#E2C870"/>
      {/* edge ridge */}
      <ellipse cx="32" cy="32" rx="12" ry="11" fill="none" stroke="#9D8030" strokeWidth=".4" strokeDasharray="1.2 1"/>
      {/* the K. mark */}
      <text x="32" y="36" textAnchor="middle" fontFamily="JetBrains Mono, monospace"
        fontSize="14" fontWeight="700" fill={PI_INK}>{'<'}</text>
      <circle cx="40" cy="36" r="1.3" fill={PI_LIME}/>
      {/* shine */}
      <ellipse cx="26" cy="26" rx="4" ry="2" fill="#FFF6E0" opacity=".5"/>
    </svg>
  );
}

Object.assign(window, { HealthPack, MedSyringe, ArmorPlate, AmmoBox, Keycard, RespectCoin });
