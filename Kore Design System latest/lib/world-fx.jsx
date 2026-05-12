/* global React */
// =====================================================================
//  world-fx.jsx — Map markers + extra particles/effects.
//  Markers: spawn point, capture point, supply drop, exit door.
//  Effects: explosion, smoke puff, EMP burst, healing aura, shield bubble.
// =====================================================================

const WF_INK   = '#1A1326';
const WF_INK_2 = '#221932';
const WF_INK_3 = '#2C2240';
const WF_LIME  = '#C8F76A';
const WF_LIME2 = '#E6FFB0';
const WF_TEAL  = '#5BD4D0';
const WF_RED   = '#E2384A';
const WF_BONE  = '#EDE6D8';
const WF_WHITE = '#FFF6E0';

/* ---------- Spawn point — ground ring with chevrons -------------- */
function SpawnPoint({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill={WF_LIME} opacity=".10"/>
      <circle cx="40" cy="40" r="26" fill="none" stroke={WF_LIME} strokeWidth="1.5" strokeDasharray="6 4" opacity=".85"/>
      <circle cx="40" cy="40" r="20" fill="none" stroke={WF_LIME} strokeWidth=".75" opacity=".5"/>
      {/* chevrons inward */}
      <path d="M 40 18 L 36 24 L 44 24 Z" fill={WF_LIME}/>
      <path d="M 40 62 L 44 56 L 36 56 Z" fill={WF_LIME}/>
      <path d="M 18 40 L 24 36 L 24 44 Z" fill={WF_LIME}/>
      <path d="M 62 40 L 56 44 L 56 36 Z" fill={WF_LIME}/>
      <text x="40" y="44" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="9" fontWeight="700" fill={WF_LIME} letterSpacing=".15em">SPAWN</text>
    </svg>
  );
}

/* ---------- Capture point — pie chart contested ----------------- */
function CapturePoint({ size = 80, percent = 0.65 }) {
  const r = 26, cx = 40, cy = 40;
  const a = percent * Math.PI * 2 - Math.PI / 2;
  const x = cx + Math.cos(a) * r;
  const y = cy + Math.sin(a) * r;
  const large = percent > 0.5 ? 1 : 0;
  const path = `M ${cx} ${cy} L ${cx} ${cy - r} A ${r} ${r} 0 ${large} 1 ${x} ${y} Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="30" fill={WF_INK_2} stroke={WF_LIME} strokeWidth="1.5" opacity=".8"/>
      <circle cx="40" cy="40" r="26" fill={WF_INK}/>
      <path d={path} fill={WF_LIME}/>
      <circle cx="40" cy="40" r="26" fill="none" stroke={WF_BONE} strokeWidth=".5" opacity=".25"/>
      <text x="40" y="43" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="11" fontWeight="700" fill={WF_BONE} letterSpacing=".1em">B</text>
      <text x="40" y="73" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="7" fontWeight="600" fill={WF_LIME} letterSpacing=".18em">{Math.round(percent*100)}%</text>
    </svg>
  );
}

/* ---------- Supply drop beacon — top-down lit pad ---------------- */
function SupplyDrop({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80" style={{ overflow:'visible' }}>
      {/* light pool */}
      <radialGradient id="sd-glow">
        <stop offset="0%"  stopColor="#C8F76A" stopOpacity=".5"/>
        <stop offset="100%" stopColor="#C8F76A" stopOpacity="0"/>
      </radialGradient>
      <circle cx="40" cy="40" r="36" fill="url(#sd-glow)"/>
      <ellipse cx="40" cy="50" rx="20" ry="4" fill="rgba(0,0,0,.5)"/>
      {/* crate */}
      <rect x="22" y="22" width="36" height="28" rx="2" fill={WF_INK_3} stroke="rgba(0,0,0,.4)" strokeWidth=".75"/>
      <rect x="22" y="22" width="36" height="3" fill={WF_INK_2}/>
      <rect x="22" y="46" width="36" height="3" fill={WF_INK_2}/>
      <rect x="22" y="22" width="3" height="28" fill={WF_INK_2}/>
      <rect x="55" y="22" width="3" height="28" fill={WF_INK_2}/>
      {/* parachute strap shadow */}
      <line x1="32" y1="22" x2="40" y2="10" stroke="rgba(255,255,255,.1)" strokeWidth=".75"/>
      <line x1="48" y1="22" x2="40" y2="10" stroke="rgba(255,255,255,.1)" strokeWidth=".75"/>
      {/* < stencil */}
      <text x="40" y="40" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="14" fontWeight="700" fill={WF_LIME}>{'<'}</text>
      {/* corner marks */}
      <path d="M 22 22 L 28 22 M 22 22 L 22 28" stroke={WF_LIME} strokeWidth="1"/>
      <path d="M 58 22 L 52 22 M 58 22 L 58 28" stroke={WF_LIME} strokeWidth="1"/>
      <path d="M 22 50 L 28 50 M 22 50 L 22 44" stroke={WF_LIME} strokeWidth="1"/>
      <path d="M 58 50 L 52 50 M 58 50 L 58 44" stroke={WF_LIME} strokeWidth="1"/>
    </svg>
  );
}

/* ---------- Exit door marker — arrow + frame -------------------- */
function ExitMarker({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <rect x="6" y="14" width="68" height="52" rx="2" fill={WF_INK_2} stroke={WF_LIME} strokeWidth="1.5"/>
      <rect x="10" y="18" width="60" height="44" fill="rgba(200,247,106,.08)"/>
      {/* arrow */}
      <path d="M 22 40 L 50 40 L 50 32 L 60 44 L 50 56 L 50 48 L 22 48 Z" fill={WF_LIME}/>
      <path d="M 22 40 L 50 40 L 50 32 L 60 44 L 50 56 L 50 48 L 22 48 Z" fill="none" stroke={WF_INK} strokeWidth=".75"/>
      {/* label */}
      <text x="14" y="74" fontFamily="JetBrains Mono, monospace" fontSize="7" fontWeight="700" fill={WF_LIME} letterSpacing=".25em">[ EXIT ]</text>
    </svg>
  );
}

/* ---------- Zone marker — closing storm circle ------------------- */
function ZoneRing({ size = 80 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 80 80">
      <circle cx="40" cy="40" r="32" fill={WF_TEAL} opacity=".06"/>
      <circle cx="40" cy="40" r="32" fill="none" stroke={WF_TEAL} strokeWidth="2" strokeDasharray="3 3" opacity=".7"/>
      <circle cx="40" cy="40" r="22" fill="none" stroke={WF_TEAL} strokeWidth="1.2" strokeDasharray="2 4" opacity=".5"/>
      <circle cx="40" cy="40" r="3" fill={WF_TEAL}/>
      <circle cx="40" cy="40" r="3" fill="none" stroke={WF_BONE} strokeWidth=".5"/>
      {/* tick marks */}
      {[0, 90, 180, 270].map((a, i) => {
        const r = a * Math.PI / 180;
        return <line key={i}
          x1={40 + Math.cos(r)*30} y1={40 + Math.sin(r)*30}
          x2={40 + Math.cos(r)*34} y2={40 + Math.sin(r)*34}
          stroke={WF_TEAL} strokeWidth="1.2"/>;
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Effects                                                           */
/* ------------------------------------------------------------------ */

/* Explosion — chunky 4-frame ready burst, draws frame 2 by default */
function Explosion({ size = 110, frame = 2 }) {
  // size of central core grows with frame
  const coreR  = 4 + frame * 6;
  const ringR  = 8 + frame * 8;
  const flareR = 14 + frame * 10;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ overflow:'visible' }}>
      {/* outer flare */}
      <circle cx="48" cy="48" r={flareR} fill="#FFB940" opacity={Math.max(0, 0.7 - frame*0.15)}/>
      {/* second ring */}
      <circle cx="48" cy="48" r={ringR}  fill="#FF8030" opacity={Math.max(0, 0.85 - frame*0.18)}/>
      {/* core */}
      <circle cx="48" cy="48" r={coreR}  fill={WF_WHITE} opacity={Math.max(0, 0.95 - frame*0.2)}/>
      {/* shockwave ring */}
      <circle cx="48" cy="48" r={20 + frame*8} fill="none" stroke={WF_LIME} strokeWidth="1.2" opacity={0.6 - frame*0.12}/>
      {/* radial spikes */}
      {[0,30,60,90,120,150,180,210,240,270,300,330].map((a, i) => {
        const r = a * Math.PI / 180;
        const r1 = ringR + 2;
        const r2 = ringR + 8 + (i % 3) * 3;
        return <line key={i}
          x1={48 + Math.cos(r)*r1} y1={48 + Math.sin(r)*r1}
          x2={48 + Math.cos(r)*r2} y2={48 + Math.sin(r)*r2}
          stroke="#FFB940" strokeWidth="1.5" strokeLinecap="round"
          opacity={Math.max(0, 0.85 - frame*0.18)}/>;
      })}
      {/* debris dots */}
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        const d = 28 + frame * 4;
        return <circle key={i} cx={48 + Math.cos(a)*d} cy={48 + Math.sin(a)*d} r="1.4" fill={WF_INK} opacity={0.9 - frame*0.18}/>;
      })}
    </svg>
  );
}

/* Smoke puff — soft greys */
function SmokePuff({ size = 70 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow:'visible' }}>
      <circle cx="22" cy="36" r="14" fill="rgba(180,170,200,.35)"/>
      <circle cx="36" cy="28" r="16" fill="rgba(200,190,210,.38)"/>
      <circle cx="44" cy="40" r="11" fill="rgba(180,170,200,.32)"/>
      <circle cx="30" cy="22" r="9"  fill="rgba(220,210,230,.30)"/>
      <circle cx="40" cy="34" r="8"  fill="rgba(220,210,230,.40)"/>
      <circle cx="26" cy="32" r="6"  fill="rgba(255,255,255,.18)"/>
    </svg>
  );
}

/* EMP burst — concentric rings */
function EMPBurst({ size = 110 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ overflow:'visible' }}>
      <circle cx="48" cy="48" r="44" fill={WF_TEAL} opacity=".06"/>
      <circle cx="48" cy="48" r="36" fill="none" stroke={WF_TEAL} strokeWidth="1" opacity=".55"/>
      <circle cx="48" cy="48" r="26" fill="none" stroke={WF_TEAL} strokeWidth="1.4" opacity=".75"/>
      <circle cx="48" cy="48" r="16" fill="none" stroke={WF_TEAL} strokeWidth="2"  opacity=".95"/>
      <circle cx="48" cy="48" r="8"  fill="#9DEAE8"/>
      <circle cx="48" cy="48" r="3"  fill={WF_WHITE}/>
      {/* arcing bolts */}
      {[0,72,144,216,288].map((a, i) => {
        const r = a * Math.PI / 180;
        return <path key={i}
          d={`M ${48 + Math.cos(r)*9} ${48 + Math.sin(r)*9}
             L ${48 + Math.cos(r+0.05)*16} ${48 + Math.sin(r+0.05)*16}
             L ${48 + Math.cos(r-0.04)*22} ${48 + Math.sin(r-0.04)*22}
             L ${48 + Math.cos(r+0.06)*30} ${48 + Math.sin(r+0.06)*30}`}
          stroke={WF_WHITE} strokeWidth="1" fill="none"/>;
      })}
    </svg>
  );
}

/* Healing aura — green ring with cross */
function HealAura({ size = 100 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ overflow:'visible' }}>
      <circle cx="48" cy="48" r="42" fill={WF_LIME} opacity=".10"/>
      <circle cx="48" cy="48" r="34" fill={WF_LIME} opacity=".15"/>
      <circle cx="48" cy="48" r="26" fill="none" stroke={WF_LIME} strokeWidth="1.2" opacity=".7" strokeDasharray="4 3"/>
      {/* upward particles */}
      {[20, 36, 52, 68].map((x, i) => (
        <g key={i}>
          <circle cx={x} cy={36 + (i % 2) * 6} r="1.4" fill={WF_LIME2} opacity=".9"/>
          <circle cx={x + 4} cy={48 + (i % 2) * 8} r="1" fill={WF_LIME2} opacity=".7"/>
        </g>
      ))}
      {/* center cross */}
      <rect x="44" y="32" width="8" height="32" rx="1" fill={WF_LIME}/>
      <rect x="32" y="44" width="32" height="8" rx="1" fill={WF_LIME}/>
      <rect x="46" y="34" width="4" height="28" fill={WF_LIME2}/>
    </svg>
  );
}

/* Shield bubble — translucent dome */
function ShieldBubble({ size = 110 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" style={{ overflow:'visible' }}>
      <ellipse cx="48" cy="48" rx="40" ry="40" fill={WF_TEAL} opacity=".10"/>
      <ellipse cx="48" cy="48" rx="40" ry="40" fill="none" stroke={WF_TEAL} strokeWidth="2" opacity=".85"/>
      {/* hex pattern hint */}
      {[
        [38,32],[58,32],[28,48],[48,48],[68,48],[38,64],[58,64]
      ].map(([x,y], i) => (
        <polygon key={i} points={`${x},${y-5} ${x+4.3},${y-2.5} ${x+4.3},${y+2.5} ${x},${y+5} ${x-4.3},${y+2.5} ${x-4.3},${y-2.5}`}
          fill="none" stroke={WF_TEAL} strokeWidth=".5" opacity=".5"/>
      ))}
      {/* highlight */}
      <ellipse cx="36" cy="32" rx="14" ry="6" fill={WF_WHITE} opacity=".18"/>
    </svg>
  );
}

Object.assign(window, {
  SpawnPoint, CapturePoint, SupplyDrop, ExitMarker, ZoneRing,
  Explosion, SmokePuff, EMPBurst, HealAura, ShieldBubble,
});
