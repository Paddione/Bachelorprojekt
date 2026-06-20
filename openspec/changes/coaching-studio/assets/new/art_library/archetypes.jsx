/* eslint-disable */
// Mentolder — Service Archetypes & editorial brand blocks.
// Three offer archetypes (50+ digital · Führungskräfte-Coaching · Unternehmensberatung)
// each with a portrait-style symbol, palette, motto, and offer-row preview.
// Plus the canonical Portrait Frame (Gerald) and Quote Card components,
// lifted faithfully from Homepage Redesign.

const ARCHETYPES = [
  {
    id: "digital50",
    name: "50+ digital",
    role: "Einzeln · Gruppe · Pakete",
    tag: "Geduldig · ohne Fachchinesisch",
    motto: "Schritt für Schritt. In Ihrem Tempo.",
    bio: "Ihr sicherer Einstieg in die digitale Welt. Smartphone, Tablet, Computer — Grundlagen, sichere Nutzung, Online-Banking ohne Risiko.",
    price: "ab 60 €",
    unit: "pro Stunde",
    palette: { ink:"#0b111c", surface:"#101826", accent:"#d7b06a", accent2:"#f0d28c", soft:"#a8c9b0", line:"rgba(255,255,255,0.12)" },
    bullets: [
      "Smartphone, Tablet & Computer – Grundlagen",
      "WhatsApp, E-Mail und Videocalls sicher nutzen",
      "Online-Banking und Shopping ohne Risiko"
    ]
  },
  {
    id: "leadership",
    name: "Führungskräfte-Coaching",
    role: "Sparring auf Augenhöhe",
    tag: "Direkt · ohne Coaching-Sprech",
    motto: "Profil-Schärfung. Ehrlich.",
    bio: "Für erfahrene Führungskräfte vor der nächsten Station — Positionierung, Gesprächsvorbereitung, Karriere-Strategie.",
    price: "150 €",
    unit: "pro Session · 90 Min.",
    palette: { ink:"#0b111c", surface:"#17202e", accent:"#d7b06a", accent2:"#f0d28c", soft:"#a8c9b0", line:"rgba(255,255,255,0.12)" },
    bullets: [
      "Stärken-Analyse und strategische Positionierung",
      "Vorbereitung auf Headhunter- und Vorstellungsgespräche",
      "Karriere-Strategie und Timing"
    ]
  },
  {
    id: "consulting",
    name: "Unternehmensberatung",
    role: "Mittelstand · Verwaltung",
    tag: "Change · gelebt, nicht doziert",
    motto: "Strategie. Roadmap. Umsetzung.",
    bio: "Digitale Transformation in komplexen Strukturen. 40 Jahre Praxis aus IT- und Sicherheitsorganisationen — keine Theorie.",
    price: "nach Vereinbarung",
    unit: "3–12 Monate",
    palette: { ink:"#0b111c", surface:"#1d2736", accent:"#d7b06a", accent2:"#f0d28c", soft:"#6fa8d8", line:"rgba(255,255,255,0.12)" },
    bullets: [
      "Analyse, Strategie & Roadmap",
      "Change Management und Teamschulungen",
      "Umsetzungsbegleitung & Prozessoptimierung"
    ]
  }
];

// Each archetype has a "sigil" — an editorial SVG mark that telegraphs the
// service shape. Same vocabulary across all three: brass strokes on
// ink-blue field, hairline grid, single warm halo.

const SigilDigital50 = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ar-sigil">
    <defs>
      <radialGradient id="s50-bg" cx="70%" cy="35%" r="80%">
        <stop offset="0%" stopColor={p.accent} stopOpacity="0.16"/>
        <stop offset="100%" stopColor={p.ink} stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="s50-brass" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.accent2}/>
        <stop offset="100%" stopColor="#8a6a2a"/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill={p.surface}/>
    <rect width="240" height="300" fill="url(#s50-bg)"/>
    {/* hairline grid */}
    {[60,120,180].map(x => <line key={"v"+x} x1={x} y1="0" x2={x} y2="300" stroke={p.line} strokeWidth="0.6"/>)}
    {[75,150,225].map(y => <line key={"h"+y} x1="0" y1={y} x2="240" y2={y} stroke={p.line} strokeWidth="0.6"/>)}
    {/* the "5" — slow, hand-drawn shape */}
    <g transform="translate(120,150)" fill="none" stroke="url(#s50-brass)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M-30,-50 L18,-50"/>
      <path d="M-30,-50 L-30,-8"/>
      <path d="M-30,-8 Q-2,-18 18,-2 Q24,16 8,30 Q-12,40 -30,32"/>
    </g>
    {/* the plus */}
    <g transform="translate(180,108)" stroke={p.accent2} strokeWidth="3" strokeLinecap="round">
      <line x1="-10" y1="0" x2="10" y2="0"/>
      <line x1="0" y1="-10" x2="0" y2="10"/>
    </g>
    {/* the dot */}
    <circle cx="200" cy="200" r="4" fill={p.accent2}/>
    {/* mono caption */}
    <text x="20" y="280" fontFamily='"Geist Mono", monospace' fontSize="9" letterSpacing="2" fill={p.soft} opacity="0.7">EINSTIEG · GENERATION 50+</text>
  </svg>
);

const SigilLeadership = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ar-sigil">
    <defs>
      <radialGradient id="sl-bg" cx="30%" cy="35%" r="80%">
        <stop offset="0%" stopColor={p.accent} stopOpacity="0.18"/>
        <stop offset="100%" stopColor={p.ink} stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="sl-brass" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0%" stopColor={p.accent2}/>
        <stop offset="100%" stopColor="#8a6a2a"/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill={p.surface}/>
    <rect width="240" height="300" fill="url(#sl-bg)"/>
    {[60,120,180].map(x => <line key={"v"+x} x1={x} y1="0" x2={x} y2="300" stroke={p.line} strokeWidth="0.6"/>)}
    {[75,150,225].map(y => <line key={"h"+y} x1="0" y1={y} x2="240" y2={y} stroke={p.line} strokeWidth="0.6"/>)}
    {/* two crossing diagonals — sparring, two parties meeting */}
    <g stroke="url(#sl-brass)" strokeWidth="9" strokeLinecap="round" fill="none">
      <path d="M60,90 L180,210"/>
      <path d="M180,90 L60,210"/>
    </g>
    {/* the meeting node */}
    <circle cx="120" cy="150" r="14" fill={p.ink} stroke={p.accent2} strokeWidth="2.5"/>
    <circle cx="120" cy="150" r="5" fill={p.accent2}/>
    {/* anchor dots */}
    <circle cx="60" cy="90" r="5" fill={p.accent2}/>
    <circle cx="180" cy="90" r="5" fill={p.accent2}/>
    <circle cx="60" cy="210" r="3" fill={p.soft} opacity="0.7"/>
    <circle cx="180" cy="210" r="3" fill={p.soft} opacity="0.7"/>
    <text x="20" y="280" fontFamily='"Geist Mono", monospace' fontSize="9" letterSpacing="2" fill={p.soft} opacity="0.7">SPARRING · 90 MIN.</text>
  </svg>
);

const SigilConsulting = ({ p }) => (
  <svg viewBox="0 0 240 300" xmlns="http://www.w3.org/2000/svg" className="ar-sigil">
    <defs>
      <radialGradient id="sc-bg" cx="50%" cy="80%" r="80%">
        <stop offset="0%" stopColor={p.accent} stopOpacity="0.15"/>
        <stop offset="100%" stopColor={p.ink} stopOpacity="0"/>
      </radialGradient>
      <linearGradient id="sc-brass" x1="0" x2="0" y1="0" y2="1">
        <stop offset="0%" stopColor={p.accent2}/>
        <stop offset="100%" stopColor="#8a6a2a"/>
      </linearGradient>
    </defs>
    <rect width="240" height="300" fill={p.surface}/>
    <rect width="240" height="300" fill="url(#sc-bg)"/>
    {[60,120,180].map(x => <line key={"v"+x} x1={x} y1="0" x2={x} y2="300" stroke={p.line} strokeWidth="0.6"/>)}
    {[75,150,225].map(y => <line key={"h"+y} x1="0" y1={y} x2="240" y2={y} stroke={p.line} strokeWidth="0.6"/>)}
    {/* a roadmap — staircase of brass nodes connected by a path */}
    <path d="M40,210 L80,210 L80,170 L130,170 L130,120 L200,120"
          stroke="url(#sc-brass)" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
    <g fill={p.surface} stroke={p.accent2} strokeWidth="2.5">
      <circle cx="40" cy="210" r="9"/>
      <circle cx="80" cy="170" r="9"/>
      <circle cx="130" cy="120" r="9"/>
      <circle cx="200" cy="120" r="11"/>
    </g>
    <circle cx="200" cy="120" r="4" fill={p.accent2}/>
    {/* horizon */}
    <line x1="0" y1="240" x2="240" y2="240" stroke={p.line} strokeWidth="0.8"/>
    <text x="20" y="280" fontFamily='"Geist Mono", monospace' fontSize="9" letterSpacing="2" fill={p.soft} opacity="0.7">ROADMAP · 3–12 MONATE</text>
  </svg>
);

const SIGILS = { digital50: SigilDigital50, leadership: SigilLeadership, consulting: SigilConsulting };

// ---------- Archetype Card (gallery view) ----------
function ArchetypeCard({ ar, idx }) {
  const Sigil = SIGILS[ar.id];
  return (
    <article className="ar-card">
      <div className="ar-card__sigil">
        <Sigil p={ar.palette}/>
        <div className="ar-card__index mono">[ {String(idx+1).padStart(2,"0")} ]</div>
      </div>
      <div className="ar-card__body">
        <div className="ar-card__head">
          <h3 className="ar-card__name">{ar.name}</h3>
          <span className="ar-card__tag mono">{ar.tag.toUpperCase()}</span>
        </div>
        <div className="ar-card__role mono">{ar.role.toUpperCase()}</div>
        <p className="ar-card__motto">{ar.motto}</p>
        <p className="ar-card__bio">{ar.bio}</p>
        <ul className="ar-card__bullets">
          {ar.bullets.map(b => <li key={b}>{b}</li>)}
        </ul>
        <div className="ar-card__foot">
          <div className="ar-card__price">
            <span className="p">{ar.price}</span>
            <span className="u mono">{ar.unit.toUpperCase()}</span>
          </div>
          <div className="ar-card__swatches">
            {Object.entries(ar.palette).slice(0,5).map(([k,v]) => (
              <span key={k} title={k} style={{background:v}}/>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

function ArchetypeGrid() {
  return (
    <div className="ar-grid">
      {ARCHETYPES.map((ar,i) => <ArchetypeCard key={ar.id} ar={ar} idx={i}/>)}
    </div>
  );
}

// ---------- Portrait Frame (Gerald) — canonical hero treatment ----------
function PortraitFrame({ src = "assets/gerald.jpg" }) {
  return (
    <div className="portrait-wrap">
      <div className="halo" aria-hidden="true"/>
      <div className="halo-2" aria-hidden="true"/>
      <div className="portrait" role="img" aria-label="Porträt von Gerald Korczewski">
        <img src={src} alt="Gerald Korczewski"/>
        <span className="tag">Anno 2026 · Lüneburg</span>
      </div>
      <div className="portrait-caption">
        <span className="pc-num mono">GK · 01</span>
        <span>
          <span className="pc-name">Gerald Korczewski</span>
          <span className="pc-role mono">COACH &amp; DIGITALER BEGLEITER</span>
        </span>
        <span className="pc-loc mono">65 J. · DE</span>
      </div>
    </div>
  );
}

// ---------- Quote Card ----------
function QuoteCard() {
  return (
    <div className="quote-card">
      <span className="mark-q" aria-hidden="true">&ldquo;</span>
      <blockquote>
        Ich stelle unbequeme Fragen — weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.
      </blockquote>
      <div className="quote-byline">
        <span className="avatar">GK</span>
        <div>
          <div className="name">Gerald Korczewski</div>
          <div className="role">Coach &amp; digitaler Begleiter · Lüneburg</div>
        </div>
      </div>
    </div>
  );
}

// ---------- Stats Strip ----------
function StatsStrip() {
  const stats = [
    { num:"30", em:"+", lab:"Jahre Führung" },
    { num:"50", em:"+", lab:"Teilnehmer begleitet" },
    { num:"40", em:"",  lab:"Jahre IT & Sicherheit" },
    { num:"",   em:"KI", lab:"Pionier der ersten Stunde" }
  ];
  return (
    <div className="strip">
      <div className="strip__stats">
        {stats.map((s,i) => (
          <div className="strip__stat" key={i}>
            <div className="strip__num">{s.num}<em>{s.em}</em></div>
            <div className="strip__lab mono">{s.lab.toUpperCase()}</div>
          </div>
        ))}
      </div>
      <div className="strip__avail">
        <div className="strip__row">
          <span className="strip__pulse" aria-hidden="true"/>
          <div>
            <div className="strip__avail-title">Nächste freie Termine</div>
            <div className="strip__avail-sub">Di. 21. April · kostenloses Erstgespräch (30 Min.)</div>
          </div>
        </div>
        <div className="strip__slots">
          {["09:30","11:00","14:30","16:00","→ alle Termine"].map(s => (
            <span className="strip__slot mono" key={s}>{s}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Process Steps ----------
function ProcessSteps() {
  const steps = [
    { num:"01 — Erstgespräch", title:"Kennenlernen", body:"30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung." },
    { num:"02 — Klarheit",     title:"Zieldefinition", body:"Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?" },
    { num:"03 — Begleitung",   title:"Arbeitsphase", body:"Individuelle Sessions in Ihrem Tempo – online oder vor Ort in Lüneburg." },
    { num:"04 — Transfer",     title:"Nachhaltigkeit", body:"Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung." }
  ];
  return (
    <div className="steps-preview">
      <div className="steps">
        {steps.map((s,i) => (
          <div className="step" key={i}>
            <span className="step__dot"/>
            <div className="step__num mono">{s.num.toUpperCase()}</div>
            <div className="step__title">{s.title}</div>
            <p className="step__body">{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

window.ARCHETYPES = ARCHETYPES;
window.SIGILS = SIGILS;
window.ArchetypeCard = ArchetypeCard;
window.ArchetypeGrid = ArchetypeGrid;
window.PortraitFrame = PortraitFrame;
window.QuoteCard = QuoteCard;
window.StatsStrip = StatsStrip;
window.ProcessSteps = ProcessSteps;
