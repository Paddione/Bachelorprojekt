/* global React */
// =====================================================================
//  props.jsx — destructible / decorative props for the Arena map.
//  All top-down, ground shadow + side hint via lime rim. Some items are
//  interactive (red barrel explodes; vending machine drops a coin).
// =====================================================================

const PR_INK   = '#1A1326';
const PR_INK_2 = '#221932';
const PR_INK_3 = '#2C2240';
const PR_INK_4 = '#3A2E52';
const PR_LINE  = 'rgba(255,255,255,.10)';
const PR_LIME  = '#C8F76A';
const PR_LIME2 = '#E6FFB0';
const PR_TEAL  = '#5BD4D0';
const PR_RED   = '#E2384A';
const PR_RED_2 = '#B72632';
const PR_BONE  = '#EDE6D8';
const PR_RUST  = '#A85020';
const PR_RUST_2 = '#6A2810';
const PR_WOOD  = '#5A4426';

/* ---------- Red explosive barrel ---------------------------------- */
function RedBarrel({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <ellipse cx="32" cy="48" rx="18" ry="4.5" fill="rgba(0,0,0,.5)"/>
      {/* body */}
      <ellipse cx="32" cy="34" rx="18" ry="14" fill={PR_RED_2} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      <ellipse cx="32" cy="33" rx="17" ry="13" fill={PR_RED}/>
      {/* top rim — visible because top-down with a slight tilt */}
      <ellipse cx="32" cy="32" rx="14" ry="10" fill={PR_RUST_2}/>
      <ellipse cx="32" cy="32" rx="14" ry="10" fill="none" stroke="rgba(0,0,0,.5)" strokeWidth=".5"/>
      {/* hazard band */}
      <path d="M 14 38 Q 32 44 50 38" stroke={PR_BONE} strokeWidth="1.5" fill="none" opacity=".85"/>
      {/* hazard chevrons */}
      <path d="M 22 30 L 26 34 L 22 38" stroke={PR_BONE} strokeWidth="1" fill="none"/>
      <path d="M 38 30 L 42 34 L 38 38" stroke={PR_BONE} strokeWidth="1" fill="none"/>
      {/* center cap */}
      <circle cx="32" cy="32" r="3" fill={PR_RUST}/>
      <circle cx="32" cy="32" r="1.4" fill={PR_BONE}/>
      {/* lime rim — the "danger" hint */}
      <path d="M 47 30 Q 50 36 46 42" stroke={PR_LIME} strokeWidth="1" fill="none" opacity=".85"/>
    </svg>
  );
}

/* ---------- Sandbag stack (3 bags) -------------------------------- */
function Sandbags({ size = 88 }) {
  return (
    <svg width={size} height={size * 0.7} viewBox="0 0 80 56" style={{ overflow:'visible' }}>
      <ellipse cx="40" cy="50" rx="34" ry="4" fill="rgba(0,0,0,.5)"/>
      {[
        { x: 4,  y: 14, w: 36, h: 16 },
        { x: 38, y: 12, w: 38, h: 18 },
        { x: 18, y: 28, w: 44, h: 18 },
      ].map((b, i) => (
        <g key={i}>
          <path d={`M ${b.x} ${b.y+4} Q ${b.x+b.w/2} ${b.y-2} ${b.x+b.w} ${b.y+4} L ${b.x+b.w-1} ${b.y+b.h} Q ${b.x+b.w/2} ${b.y+b.h+3} ${b.x+1} ${b.y+b.h} Z`}
            fill={i % 2 ? "#5C4D2A" : "#6E5C36"} stroke="rgba(0,0,0,.35)" strokeWidth=".5"/>
          {/* seam */}
          <line x1={b.x + 4} y1={b.y + b.h/2} x2={b.x + b.w - 4} y2={b.y + b.h/2}
            stroke={PR_RUST_2} strokeWidth=".75" strokeDasharray="2 2" opacity=".7"/>
          {/* tied ends */}
          <circle cx={b.x + 2} cy={b.y + b.h/2} r="1.2" fill="#3A2E1C"/>
          <circle cx={b.x + b.w - 2} cy={b.y + b.h/2} r="1.2" fill="#3A2E1C"/>
        </g>
      ))}
      {/* lime rim */}
      <path d="M 18 28 Q 40 22 62 28" stroke={PR_LIME} strokeWidth=".75" fill="none" opacity=".7"/>
    </svg>
  );
}

/* ---------- Vending machine (top-down) ---------------------------- */
function Vending({ size = 80 }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 64 72" style={{ overflow:'visible' }}>
      <ellipse cx="32" cy="66" rx="22" ry="4" fill="rgba(0,0,0,.5)"/>
      <rect x="10" y="10" width="44" height="52" rx="2" fill={PR_INK_4} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      {/* glass front */}
      <rect x="14" y="14" width="36" height="34" rx="1" fill={PR_INK_2} stroke={PR_LIME} strokeWidth=".75" opacity=".95"/>
      {/* shelves with cans */}
      {[0,1,2].map(row => (
        <g key={row}>
          <line x1="14" y1={22 + row*10} x2="50" y2={22 + row*10} stroke={PR_LINE} strokeWidth="1"/>
          {[0,1,2,3].map(c => (
            <rect key={c} x={16 + c*9} y={16 + row*10} width="6" height="4.5" rx=".5"
              fill={c % 2 ? PR_LIME : PR_TEAL} opacity=".85"/>
          ))}
        </g>
      ))}
      {/* dispenser slot */}
      <rect x="14" y="50" width="36" height="2" fill={PR_INK} />
      {/* keypad */}
      <rect x="38" y="54" width="12" height="6" rx="1" fill={PR_INK_2}/>
      {[0,1,2].map(c => <circle key={c} cx={40.5 + c*4} cy={57} r="1" fill={PR_LIME}/>)}
      {/* logo */}
      <text x="22" y="59" fontFamily="JetBrains Mono, monospace" fontSize="6" fontWeight="700" fill={PR_LIME} letterSpacing=".15em">{'<'}.SODA</text>
      {/* corner rim */}
      <line x1="10" y1="14" x2="14" y2="14" stroke={PR_LIME} strokeWidth=".75"/>
      <line x1="10" y1="14" x2="10" y2="20" stroke={PR_LIME} strokeWidth=".75"/>
    </svg>
  );
}

/* ---------- Wall-mount terminal / ATM ----------------------------- */
function Terminal({ size = 64 }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 64 72" style={{ overflow:'visible' }}>
      <ellipse cx="32" cy="66" rx="20" ry="3.5" fill="rgba(0,0,0,.5)"/>
      <rect x="12" y="10" width="40" height="52" rx="2" fill={PR_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      <rect x="14" y="14" width="36" height="20" rx="1" fill={PR_INK} />
      {/* screen content lines */}
      <text x="16" y="20" fontFamily="JetBrains Mono, monospace" fontSize="3.6" fill={PR_LIME} letterSpacing=".15em">$ kore deploy</text>
      <rect x="16" y="22" width="14" height="1.2" fill={PR_LIME} opacity=".7"/>
      <rect x="16" y="25" width="22" height="1.2" fill={PR_LIME2} opacity=".5"/>
      <rect x="16" y="28" width="10" height="1.2" fill={PR_TEAL} opacity=".55"/>
      <rect x="16" y="31" width="6"  height="1.2" fill={PR_LIME} opacity=".9"/>
      {/* cursor */}
      <rect x="22.5" y="31" width="1" height="1.4" fill={PR_LIME}/>
      {/* card slot */}
      <rect x="20" y="38" width="24" height="2" rx="1" fill={PR_INK}/>
      {/* keypad */}
      <g transform="translate(22 44)">
        {[0,1,2,3].map(r => [0,1,2].map(c => (
          <rect key={`${r}-${c}`} x={c*7} y={r*4} width="5" height="3" rx=".5" fill={PR_INK_4} stroke={PR_LINE} strokeWidth=".3"/>
        )))}
      </g>
      {/* lime rim */}
      <line x1="50" y1="14" x2="50" y2="60" stroke={PR_LIME} strokeWidth=".75" opacity=".7"/>
      <circle cx="48" cy="12" r="1" fill={PR_LIME}/>
    </svg>
  );
}

/* ---------- Server rack ------------------------------------------- */
function ServerRack({ size = 72 }) {
  return (
    <svg width={size} height={size * 1.2} viewBox="0 0 64 76" style={{ overflow:'visible' }}>
      <ellipse cx="32" cy="70" rx="24" ry="4" fill="rgba(0,0,0,.5)"/>
      <rect x="8" y="6" width="48" height="64" rx="2" fill={PR_INK_2} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <rect x="8" y="6" width="48" height="4" fill={PR_INK} />
      {/* rack units */}
      {[0,1,2,3,4,5].map(i => (
        <g key={i} transform={`translate(0 ${12 + i*9})`}>
          <rect x="10" y="0" width="44" height="8" rx=".5" fill={PR_INK_3} stroke={PR_LINE} strokeWidth=".4"/>
          {/* drive bays */}
          <rect x="12" y="2" width="6" height="4" fill={PR_INK_2}/>
          <rect x="20" y="2" width="6" height="4" fill={PR_INK_2}/>
          <rect x="28" y="2" width="6" height="4" fill={PR_INK_2}/>
          {/* status LEDs */}
          <circle cx="40" cy="4" r=".7" fill={i === 1 ? "#FF6B7A" : PR_LIME}/>
          <circle cx="43" cy="4" r=".7" fill={PR_TEAL}/>
          <circle cx="46" cy="4" r=".7" fill={i === 4 ? "#FF6B7A" : PR_LIME}/>
          <circle cx="49" cy="4" r=".7" fill={PR_LIME}/>
        </g>
      ))}
      {/* corner rim */}
      <line x1="8" y1="10" x2="14" y2="10" stroke={PR_LIME} strokeWidth=".75"/>
      <line x1="8" y1="10" x2="8" y2="16" stroke={PR_LIME} strokeWidth=".75"/>
    </svg>
  );
}

/* ---------- Streetlight (top-down beam pool) ---------------------- */
function Streetlight({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ overflow:'visible' }}>
      {/* warm light pool */}
      <radialGradient id="sl-pool">
        <stop offset="0%"  stopColor="#FFF6E0" stopOpacity=".75"/>
        <stop offset="35%" stopColor="#FFF6E0" stopOpacity=".25"/>
        <stop offset="100%" stopColor="#FFF6E0" stopOpacity="0"/>
      </radialGradient>
      <circle cx="40" cy="40" r="36" fill="url(#sl-pool)"/>
      <ellipse cx="40" cy="46" rx="9" ry="2.5" fill="rgba(0,0,0,.55)"/>
      {/* pole base */}
      <circle cx="40" cy="40" r="6"   fill={PR_INK_2} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      <circle cx="40" cy="40" r="3.5" fill={PR_INK_3}/>
      {/* light cone glow */}
      <circle cx="40" cy="40" r="2.2" fill="#FFF6E0"/>
      <circle cx="40" cy="40" r="1.2" fill="#FFFFFF"/>
      {/* brace shadow */}
      <line x1="40" y1="40" x2="56" y2="40" stroke="rgba(0,0,0,.4)" strokeWidth="1" opacity=".4"/>
    </svg>
  );
}

/* ---------- Traffic cone ------------------------------------------ */
function Cone({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" style={{ overflow:'visible' }}>
      <ellipse cx="16" cy="26" rx="9" ry="2" fill="rgba(0,0,0,.5)"/>
      <rect x="6" y="22" width="20" height="3" rx=".5" fill="#5A2C0A"/>
      <ellipse cx="16" cy="22" rx="10" ry="2.5" fill={PR_RUST}/>
      <ellipse cx="16" cy="22" rx="8"  ry="2"   fill="#C8540F"/>
      <ellipse cx="16" cy="14" rx="5"  ry="1.6" fill="#C8540F"/>
      <path d="M 11 22 L 14 8 L 18 8 L 21 22 Z" fill="#E26020" stroke="rgba(0,0,0,.3)" strokeWidth=".4"/>
      <path d="M 12 18 L 20 18" stroke={PR_BONE} strokeWidth="1.3"/>
      <path d="M 13 14 L 19 14" stroke={PR_BONE} strokeWidth="1"/>
      <ellipse cx="16" cy="8" rx="2" ry=".7" fill="#9D4010"/>
    </svg>
  );
}

/* ---------- Locker -------------------------------------------------- */
function Locker({ size = 56 }) {
  return (
    <svg width={size} height={size * 1.1} viewBox="0 0 56 62" style={{ overflow:'visible' }}>
      <ellipse cx="28" cy="58" rx="20" ry="3" fill="rgba(0,0,0,.5)"/>
      <rect x="6" y="6" width="44" height="50" rx="1" fill={PR_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".5"/>
      {/* split doors */}
      <line x1="28" y1="6" x2="28" y2="56" stroke={PR_INK} strokeWidth="1"/>
      <rect x="6" y="6"  width="22" height="50" fill="none" stroke={PR_LINE} strokeWidth=".4"/>
      <rect x="28" y="6" width="22" height="50" fill="none" stroke={PR_LINE} strokeWidth=".4"/>
      {/* vents */}
      {[0,1,2,3].map(i => (
        <line key={i} x1="10" y1={12 + i*3} x2="24" y2={12 + i*3} stroke={PR_INK} strokeWidth=".75"/>
      ))}
      {[0,1,2,3].map(i => (
        <line key={`r${i}`} x1="32" y1={12 + i*3} x2="46" y2={12 + i*3} stroke={PR_INK} strokeWidth=".75"/>
      ))}
      {/* handles */}
      <rect x="24" y="32" width="3" height="6" rx=".5" fill={PR_INK_4}/>
      <rect x="29" y="32" width="3" height="6" rx=".5" fill={PR_INK_4}/>
      {/* labels */}
      <text x="17" y="50" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill={PR_LIME} letterSpacing=".2em">07</text>
      <text x="39" y="50" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="5" fill={PR_LIME} letterSpacing=".2em">08</text>
    </svg>
  );
}

Object.assign(window, { RedBarrel, Sandbags, Vending, Terminal, ServerRack, Streetlight, Cone, Locker });
