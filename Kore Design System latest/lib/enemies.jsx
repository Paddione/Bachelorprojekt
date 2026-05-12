/* global React */
// =====================================================================
//  enemies.jsx — non-player AI sprites for the Arena map.
//  Sentry turret · quad-rotor drone · merchant NPC.
//  All top-down, lime accent for "alive / scanning" states.
// =====================================================================

const EM_INK   = '#1A1326';
const EM_INK_2 = '#221932';
const EM_INK_3 = '#2C2240';
const EM_INK_4 = '#3A2E52';
const EM_LINE  = 'rgba(255,255,255,.10)';
const EM_LIME  = '#C8F76A';
const EM_LIME2 = '#E6FFB0';
const EM_TEAL  = '#5BD4D0';
const EM_RED   = '#E2384A';
const EM_BONE  = '#EDE6D8';
const EM_SKIN  = '#E8B894';
const EM_HAIR  = '#3A2E1C';

/* ---------- Sentry turret ----------------------------------------- */
function Turret({ size = 80, scanAngle = 35 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ overflow:'visible' }}>
      <ellipse cx="40" cy="60" rx="22" ry="4" fill="rgba(0,0,0,.5)"/>
      {/* scan cone */}
      <g transform={`rotate(${scanAngle} 40 40)`}>
        <path d="M 40 40 L 16 12 A 30 30 0 0 1 64 12 Z" fill={EM_LIME} opacity=".10"/>
        <path d="M 40 40 L 16 12 A 30 30 0 0 1 64 12 Z" fill="none" stroke={EM_LIME} strokeWidth=".75" opacity=".4"/>
      </g>
      {/* base ring */}
      <circle cx="40" cy="40" r="22" fill={EM_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <circle cx="40" cy="40" r="22" fill="none" stroke={EM_LIME} strokeWidth=".5" strokeDasharray="3 2" opacity=".6"/>
      {/* base body */}
      <circle cx="40" cy="40" r="16" fill={EM_INK_2}/>
      {/* turret head — points up by default */}
      <g transform={`rotate(${scanAngle} 40 40)`}>
        <rect x="36" y="24" width="8"  height="20" rx="1" fill={EM_INK_4} stroke={EM_LINE} strokeWidth=".5"/>
        {/* twin barrels */}
        <rect x="34" y="14" width="3"  height="14" fill={EM_INK_3}/>
        <rect x="43" y="14" width="3"  height="14" fill={EM_INK_3}/>
        <rect x="34" y="14" width="3"  height="2"  fill="#0A0710"/>
        <rect x="43" y="14" width="3"  height="2"  fill="#0A0710"/>
        {/* eye */}
        <circle cx="40" cy="38" r="3" fill="#0A0710"/>
        <circle cx="40" cy="38" r="1.6" fill={EM_RED}/>
      </g>
      {/* base bolts */}
      {[0,90,180,270].map((a, i) => {
        const r = a * Math.PI / 180;
        return <circle key={i} cx={40 + Math.cos(r)*19} cy={40 + Math.sin(r)*19} r="1.2" fill={EM_INK_4}/>;
      })}
      {/* status LED */}
      <circle cx="40" cy="56" r="1.4" fill={EM_LIME}/>
    </svg>
  );
}

/* ---------- Drone — quad-rotor ------------------------------------ */
function Drone({ size = 72 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ overflow:'visible' }}>
      <ellipse cx="40" cy="62" rx="22" ry="3.5" fill="rgba(0,0,0,.5)"/>
      {/* arms (X) */}
      <line x1="14" y1="14" x2="66" y2="66" stroke={EM_INK_4} strokeWidth="3"/>
      <line x1="66" y1="14" x2="14" y2="66" stroke={EM_INK_4} strokeWidth="3"/>
      <line x1="14" y1="14" x2="66" y2="66" stroke={EM_LINE} strokeWidth=".5"/>
      {/* rotor blur halos */}
      {[[14,14],[66,14],[14,66],[66,66]].map(([x,y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill="rgba(200,247,106,.06)"/>
          <circle cx={x} cy={y} r="9" fill="none" stroke={EM_LIME} strokeWidth=".5" opacity=".4"/>
          <ellipse cx={x} cy={y} rx="9" ry="1" fill="rgba(255,255,255,.6)" opacity=".4"/>
          <ellipse cx={x} cy={y} rx="1" ry="9" fill="rgba(255,255,255,.6)" opacity=".4"/>
          {/* hub */}
          <circle cx={x} cy={y} r="2" fill={EM_INK_2}/>
        </g>
      ))}
      {/* central body */}
      <rect x="28" y="28" width="24" height="24" rx="3" fill={EM_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <rect x="32" y="32" width="16" height="16" rx="1" fill={EM_INK_2}/>
      {/* camera lens */}
      <circle cx="40" cy="40" r="5" fill="#0A0710"/>
      <circle cx="40" cy="40" r="3" fill={EM_TEAL}/>
      <circle cx="41" cy="39" r="1" fill={EM_BONE} opacity=".8"/>
      {/* lime indicator */}
      <circle cx="32" cy="32" r="1" fill={EM_LIME}/>
      <circle cx="48" cy="32" r="1" fill={EM_RED}/>
    </svg>
  );
}

/* ---------- Merchant NPC (top-down body, satchel + hat) ----------- */
function Merchant({ size = 64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <ellipse cx="32" cy="50" rx="18" ry="5" fill="rgba(0,0,0,.45)"/>
      {/* coat — a longer drape than player */}
      <ellipse cx="32" cy="38" rx="20" ry="14" fill={EM_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth="1"/>
      <path d="M 18 44 Q 32 50 46 44 L 44 48 Q 32 52 20 48 Z" fill={EM_INK_2}/>
      {/* gold trim */}
      <path d="M 14 32 Q 32 22 50 32" stroke="#D8B85A" strokeWidth="1.4" fill="none" opacity=".85"/>
      {/* satchel strap */}
      <path d="M 22 26 Q 28 36 38 38" stroke={EM_INK} strokeWidth="2" fill="none"/>
      {/* satchel pouch on hip */}
      <ellipse cx="44" cy="42" rx="5" ry="4" fill="#5A4426" stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      <rect x="42" y="40" width="4" height="2" fill="#3A2E1C"/>
      {/* arms */}
      <ellipse cx="14" cy="40" rx="6" ry="7" fill={EM_INK}/>
      <ellipse cx="50" cy="40" rx="6" ry="7" fill={EM_INK}/>
      {/* head */}
      <circle cx="32" cy="30" r="10" fill={EM_SKIN} stroke="#C49070" strokeWidth=".75"/>
      {/* wide-brim hat (top-down ring) */}
      <ellipse cx="32" cy="28" rx="13" ry="11" fill={EM_INK_4} stroke="rgba(0,0,0,.5)" strokeWidth=".6" opacity=".75"/>
      <ellipse cx="32" cy="28" rx="9"  ry="8"  fill={EM_INK_3}/>
      {/* hat band */}
      <ellipse cx="32" cy="28" rx="9"  ry="8"  fill="none" stroke={EM_LIME} strokeWidth=".6" opacity=".6"/>
      {/* shoulder dots */}
      <circle cx="20" cy="32" r="1.5" fill={EM_LIME}/>
      <circle cx="44" cy="32" r="1.5" fill={EM_LIME}/>
      {/* exclamation marker over head */}
      <g transform="translate(32 8)">
        <circle r="5" fill={EM_LIME} stroke={EM_INK} strokeWidth=".75"/>
        <rect x="-.7" y="-2.5" width="1.4" height="3" fill={EM_INK}/>
        <rect x="-.7" y="1.4" width="1.4" height="1.4" fill={EM_INK}/>
      </g>
    </svg>
  );
}

Object.assign(window, { Turret, Drone, Merchant });
