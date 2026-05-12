/* global React */
// =====================================================================
//  powerups.jsx — orb-style powerups that float over the floor.
//  Each is a recognisable glyph encased in a small lime/teal halo.
// =====================================================================

const PU_INK   = '#1A1326';
const PU_INK_2 = '#221932';
const PU_INK_3 = '#2C2240';
const PU_LIME  = '#C8F76A';
const PU_LIME2 = '#E6FFB0';
const PU_TEAL  = '#5BD4D0';
const PU_BONE  = '#EDE6D8';

function OrbHalo({ color = PU_LIME }) {
  return (
    <>
      <ellipse cx="32" cy="50" rx="14" ry="3.5" fill="rgba(0,0,0,.4)"/>
      <circle cx="32" cy="32" r="22" fill={color} opacity=".10"/>
      <circle cx="32" cy="32" r="16" fill={color} opacity=".18"/>
      <circle cx="32" cy="32" r="11" fill={color} opacity=".30"/>
      <circle cx="32" cy="32" r="11" fill="none" stroke={color} strokeWidth="1" opacity=".7"/>
    </>
  );
}

/* ---------- Shield bubble ----------------------------------------- */
function PowerShield({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <OrbHalo color={PU_TEAL} />
      {/* shield glyph */}
      <path d="M 32 22 L 40 26 L 40 34 Q 40 40 32 44 Q 24 40 24 34 L 24 26 Z"
        fill={PU_INK_2} stroke={PU_TEAL} strokeWidth="1.2"/>
      <path d="M 32 26 L 36 28 L 36 34 Q 36 38 32 41 Q 28 38 28 34 L 28 28 Z"
        fill="none" stroke={PU_TEAL} strokeWidth=".75" opacity=".7"/>
      <circle cx="32" cy="33" r="1.5" fill={PU_TEAL}/>
    </svg>
  );
}

/* ---------- Speed (lightning bolt) -------------------------------- */
function PowerSpeed({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <OrbHalo color={PU_LIME} />
      <path d="M 34 22 L 26 33 L 31 33 L 28 44 L 38 31 L 33 31 L 36 22 Z"
        fill={PU_LIME} stroke={PU_INK} strokeWidth=".75" strokeLinejoin="round"/>
      <path d="M 34 22 L 26 33 L 31 33 L 28 44"
        fill="none" stroke={PU_LIME2} strokeWidth=".75" opacity=".8"/>
    </svg>
  );
}

/* ---------- Damage (crossed swords / pointed star) ---------------- */
function PowerDamage({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <OrbHalo color={PU_LIME} />
      <g stroke={PU_INK} strokeWidth=".5" strokeLinejoin="round">
        <path d="M 32 21 L 34 30 L 43 32 L 34 34 L 32 43 L 30 34 L 21 32 L 30 30 Z"
          fill={PU_LIME}/>
        <path d="M 32 25 L 33 30 L 38 31 L 33 32 L 32 38 L 31 32 L 26 31 L 31 30 Z"
          fill={PU_LIME2}/>
      </g>
      <circle cx="32" cy="32" r="1.4" fill={PU_INK}/>
    </svg>
  );
}

/* ---------- EMP (concentric rings + central dot) ----------------- */
function PowerEMP({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <OrbHalo color={PU_TEAL} />
      <circle cx="32" cy="32" r="9"  fill="none" stroke={PU_TEAL} strokeWidth="1"   opacity=".9"/>
      <circle cx="32" cy="32" r="6"  fill="none" stroke={PU_TEAL} strokeWidth=".75" opacity=".7"/>
      <circle cx="32" cy="32" r="3"  fill={PU_TEAL}/>
      {/* zig-zag bolts radiating out */}
      <path d="M 32 23 L 33 27 L 31 27 L 32 23"  stroke={PU_BONE} strokeWidth=".75" fill={PU_BONE}/>
      <path d="M 41 32 L 37 33 L 37 31 L 41 32"  stroke={PU_BONE} strokeWidth=".75" fill={PU_BONE}/>
      <path d="M 32 41 L 31 37 L 33 37 L 32 41"  stroke={PU_BONE} strokeWidth=".75" fill={PU_BONE}/>
      <path d="M 23 32 L 27 31 L 27 33 L 23 32"  stroke={PU_BONE} strokeWidth=".75" fill={PU_BONE}/>
    </svg>
  );
}

/* ---------- Cloak (eye / lens with strikethrough) ----------------- */
function PowerCloak({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <OrbHalo color={PU_TEAL} />
      <ellipse cx="32" cy="32" rx="11" ry="6.5" fill="none" stroke={PU_BONE} strokeWidth="1.2" opacity=".85"/>
      <circle cx="32" cy="32" r="3.5" fill={PU_TEAL}/>
      <circle cx="33" cy="31" r="1" fill={PU_BONE}/>
      <line x1="22" y1="42" x2="42" y2="22" stroke={PU_BONE} strokeWidth="1.4"/>
      <line x1="22" y1="42" x2="42" y2="22" stroke={PU_INK} strokeWidth=".5"/>
    </svg>
  );
}

Object.assign(window, { PowerShield, PowerSpeed, PowerDamage, PowerEMP, PowerCloak });
