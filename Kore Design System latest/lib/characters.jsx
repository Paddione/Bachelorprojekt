/* global React */
// =====================================================================
//  characters.jsx — Two simple top-down character sprites for the demo
//  Player (you) + Dummy (target). Drawn as small iso-ish circles with
//  a directional aim indicator. The dummy holds a Glock by default.
// =====================================================================

const CHAR_INK    = '#1A1326';
const CHAR_INK_2  = '#2C2240';
const CHAR_INK_3  = '#3A2E52';
const CHAR_LIME   = '#C8F76A';
const CHAR_TEAL   = '#5BD4D0';
const CHAR_SKIN   = '#E8B894';
const CHAR_SKIN_2 = '#C49070';
const CHAR_FG     = '#ECEFF3';

/* Top-down body — head from above + shoulders.
 * Tone selects color of jacket. The weapon prop is a small SVG drawn
 * at the right hand; the demo replaces it.                       */
function TopDownBody({ size = 64, tone = 'lime', dead = false, slumped = false }) {
  const accent = tone === 'lime' ? CHAR_LIME : CHAR_TEAL;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ overflow: 'visible' }}>
      <ellipse cx="32" cy="50" rx="18" ry="5" fill="rgba(0,0,0,.45)" />
      {/* shoulders / jacket */}
      <ellipse cx="32" cy="36" rx="20" ry="14" fill={CHAR_INK_2} stroke="rgba(0,0,0,.4)" strokeWidth="1" />
      {/* lime/cyan rim on jacket back */}
      <path d="M 14 32 Q 32 22 50 32" stroke={accent} strokeWidth="1.5" fill="none" opacity=".9" />
      {/* arms bulges */}
      <ellipse cx="14" cy="40" rx="6" ry="7" fill={CHAR_INK} />
      <ellipse cx="50" cy="40" rx="6" ry="7" fill={CHAR_INK} />
      {/* head */}
      <circle cx="32" cy="30" r="10" fill={CHAR_SKIN} stroke={CHAR_SKIN_2} strokeWidth=".75" />
      {/* hair patch */}
      <path d="M 23 26 Q 32 18 41 26 Q 40 22 32 21 Q 24 22 23 26 Z" fill="#3A2E1C" />
      {/* shoulder dots — tone identifier */}
      <circle cx="20" cy="32" r="1.5" fill={accent} />
      <circle cx="44" cy="32" r="1.5" fill={accent} />
      {dead && !slumped && (
        // x eyes
        <>
          <line x1="27" y1="28" x2="30" y2="31" stroke="#000" strokeWidth="1.2" />
          <line x1="30" y1="28" x2="27" y2="31" stroke="#000" strokeWidth="1.2" />
          <line x1="34" y1="28" x2="37" y2="31" stroke="#000" strokeWidth="1.2" />
          <line x1="37" y1="28" x2="34" y2="31" stroke="#000" strokeWidth="1.2" />
        </>
      )}
    </svg>
  );
}

Object.assign(window, { TopDownBody });
