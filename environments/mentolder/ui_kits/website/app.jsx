/* global React */
const { useState } = React;

const ArrowIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M13 5l7 7-7 7"/></svg>
);

function BrandMark({ size = 32 }) {
  return (
    <img className="mark" src="../../assets/logo-mark.png" width={size} height={size} alt="" />
  );
}

function Topbar({ active = "angebote" }) {
  const links = [
    { id: "angebote", label: "Angebote" },
    { id: "ueber",     label: "Über mich" },
    { id: "referenzen",label: "Referenzen" },
    { id: "kontakt",   label: "Kontakt" },
  ];
  return (
    <header className="topbar">
      <div className="wrap">
        <a className="brand" aria-label="Mentolder">
          <BrandMark />
          <span className="name">mentolder<span className="dot">.</span></span>
        </a>
        <nav className="nav" aria-label="Haupt">
          {links.map(l => (
            <a key={l.id} className={active === l.id ? "is-active" : ""}>{l.label}</a>
          ))}
          <span className="nav-meta">Lüneburg · DE</span>
          <a className="btn btn-primary btn-sm">Erstgespräch <ArrowIcon /></a>
        </nav>
      </div>
    </header>
  );
}

function Atmosphere() {
  return <div className="bg-halo" aria-hidden="true" />;
}

function Portrait({ src = "../../assets/gerald.jpg", alt = "Gerald Korczewski" }) {
  return (
    <div className="portrait-wrap">
      <div className="halo" aria-hidden="true" />
      <div className="halo-2" aria-hidden="true" />
      <div className="portrait" role="img" aria-label={`Porträt von ${alt}`}>
        <img src={src} alt={alt} />
        <span className="tag">Anno 2026 · Lüneburg</span>
      </div>
      <div className="portrait-caption">
        <span className="pc-num">GK · 01</span>
        <span>
          <span className="pc-name">Gerald Korczewski</span>
          <span className="pc-role">Coach &amp; digitaler Begleiter</span>
        </span>
        <span className="pc-loc">65 Jahre · DE</span>
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="hero">
      <Atmosphere />
      <div className="wrap">
        <div className="grid">
          <div>
            <div className="kicker-row">
              <span className="bar" />
              <span>Digital Coaching</span>
              <span className="dot" />
              <span>Führungskräfte-Beratung</span>
            </div>
            <h1>Menschen, Prozesse und Technik <em>wieder&nbsp;verbinden.</em></h1>
            <p className="tagline">
              Mit 30+ Jahren Führungserfahrung bei der Polizei Hamburg begleite ich die Generation 50+ in der digitalen Welt
              – und erfahrene Führungskräfte in ihrer strategischen Neuausrichtung. Praxisnah. Strukturiert. Auf Augenhöhe.
            </p>
            <div className="hero-meta">
              <a className="btn btn-primary">Kostenloses Erstgespräch <ArrowIcon /></a>
              <a className="btn btn-ghost">Angebote ansehen</a>
            </div>
          </div>
          <div><Portrait /></div>
        </div>
      </div>
    </section>
  );
}

function StatStrip() {
  const stats = [
    { num: "30", em: "+", lab: "Jahre Führung" },
    { num: "50", em: "+", lab: "Teilnehmer begleitet" },
    { num: "40", em: "",  lab: "Jahre IT & Sicherheit" },
    { num: "",   em: "KI",lab: "Pionier der ersten Stunde" },
  ];
  const slots = ["09:30","11:00","14:30","16:00"];
  return (
    <section className="strip">
      <div className="stats">
        {stats.map((s, i) => (
          <div key={i} className="stat">
            <div className="num">{s.num}{s.em && <em>{s.em}</em>}</div>
            <div className="lab">{s.lab}</div>
          </div>
        ))}
      </div>
      <div className="availability">
        <div className="row">
          <span className="pulse" aria-hidden="true" />
          <div>
            <div className="avail-title">Nächste freie Termine</div>
            <div className="avail-sub">Di. 21. April · kostenloses Erstgespräch (30 Min.)</div>
          </div>
        </div>
        <div className="avail-slots">
          {slots.map(s => <a key={s} className="slot">{s}</a>)}
          <a className="slot">→ alle Termine</a>
        </div>
      </div>
    </section>
  );
}

function ServiceRow({ no, title, meta, desc, bullets, price, unit }) {
  return (
    <article className="offer">
      <div className="no">{no}</div>
      <div>
        <h3>{title}</h3>
        <span className="sage-meta">{meta}</span>
      </div>
      <div className="desc-col">
        <p className="desc">{desc}</p>
        <ul>{bullets.map(b => <li key={b}>{b}</li>)}</ul>
      </div>
      <div className="price"><span className="p">{price}</span><span className="u">{unit}</span></div>
      <a className="go">Mehr<span><ArrowIcon /></span></a>
    </article>
  );
}

function Offers() {
  const items = [
    { no:"01", title:"50+ digital", meta:"Einzeln · Gruppe · Pakete",
      desc:"Ihr sicherer Einstieg in die digitale Welt. Schritt für Schritt – in Ihrem Tempo, ohne Fachchinesisch, mit einem geduldigen Begleiter, der Ihre Fragen ernst nimmt.",
      bullets:["Smartphone, Tablet & Computer – Grundlagen","WhatsApp, E-Mail und Videocalls sicher nutzen","Online-Banking und Shopping ohne Risiko"],
      price:"ab 60 €", unit:"pro Stunde" },
    { no:"02", title:"Führungskräfte-Coaching", meta:"Sparring auf Augenhöhe",
      desc:"Für erfahrene Führungskräfte vor der nächsten Station. Profil-Schärfung, Positionierung, Gesprächsvorbereitung – direkt und ehrlich, ohne Coaching-Sprech.",
      bullets:["Stärken-Analyse und strategische Positionierung","Vorbereitung auf Headhunter- und Vorstellungsgespräche","Karriere-Strategie und Timing"],
      price:"150 €", unit:"pro Session · 90 Min." },
    { no:"03", title:"Unternehmensberatung", meta:"Mittelstand · Verwaltung",
      desc:"Digitale Transformation in komplexen Strukturen. 40 Jahre Praxis aus IT- und Sicherheitsorganisationen – keine Theorie, sondern gelebte Change-Arbeit.",
      bullets:["Analyse, Strategie & Roadmap","Change Management und Teamschulungen","Umsetzungsbegleitung & Prozessoptimierung"],
      price:"nach Vereinbarung", unit:"3–12 Monate" },
  ];
  return (
    <section id="angebote" className="section">
      <div className="wrap">
        <div className="section-head">
          <div>
            <div className="eyebrow">Meine Angebote</div>
            <h2 style={{ marginTop: 18 }}>Drei Wege, an denen ich Sie&nbsp;begleite.</h2>
          </div>
          <p>Sie suchen jemanden, der Menschen, Prozesse und Technik verbindet – der Führungserfahrung mit Empathie vereint und dabei unbequeme Fragen stellt, wenn es sein muss? Dann passt eines dieser drei Formate.</p>
        </div>
        <div className="offers">
          {items.map(it => <ServiceRow key={it.no} {...it} />)}
        </div>
      </div>
    </section>
  );
}

function WhyMe() {
  const points = [
    { n:"01", title:"Erste deutsche Polizeibehörde mit KI", text:"Pionier, nicht Nachahmer. Gesichtserkennung, BOS-Digitalfunk, bundesweit führend." },
    { n:"02", title:"Systemischer Coach", text:"Nicht nur IT, sondern auch Menschen. Ich verbinde technologisches Verständnis mit Empathie." },
    { n:"03", title:"Selbst Generation 50+", text:"65 Jahre. Ich kenne die Herausforderungen aus eigener Erfahrung und spreche Ihre Sprache." },
  ];
  return (
    <section id="ueber" className="why section">
      <div className="wrap">
        <div className="why-grid">
          <div>
            <div className="eyebrow">Warum ich?</div>
            <h2 style={{ marginTop: 18 }}>Ich kenne beide Welten — die etablierten Strukturen und die modernsten&nbsp;<em>Werkzeuge.</em></h2>
            <p className="t-lede" style={{ marginTop: 22 }}>
              40 Jahre in IT- und Sicherheitsorganisationen. Systemischer Coach. Selbst Generation 50+. Ich weiß, wie Veränderung in komplexen Organisationen wirklich funktioniert – und wie sie in einzelnen Menschen beginnt.
            </p>
            <div className="points">
              {points.map(p => (
                <div key={p.n} className="point">
                  <div className="n">{p.n}</div>
                  <div>
                    <h4>{p.title}</h4>
                    <p>{p.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="quote-card">
              <span className="mark-q" aria-hidden="true">&ldquo;</span>
              <blockquote>Ich stelle unbequeme Fragen — weil echte Lösungen manchmal unbequeme Wahrheiten brauchen.</blockquote>
              <div className="quote-byline">
                <span className="avatar">GK</span>
                <div>
                  <div className="name">Gerald Korczewski</div>
                  <div className="role">Coach &amp; digitaler Begleiter · Lüneburg</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProcessRail() {
  const steps = [
    { num:"01 — Erstgespräch", h:"Kennenlernen", p:"30 Minuten, kostenlos. Wir klären Ihre Situation und Ihre Herausforderung." },
    { num:"02 — Klarheit",     h:"Zieldefinition", p:"Gemeinsam entscheiden wir: Was ist das richtige Format, was der richtige Rahmen?" },
    { num:"03 — Begleitung",   h:"Arbeitsphase", p:"Individuelle Sessions in Ihrem Tempo – online oder vor Ort in Lüneburg und Umgebung." },
    { num:"04 — Transfer",     h:"Nachhaltigkeit", p:"Was Sie hier lernen, bleibt bei Ihnen. Nicht als Wissen, sondern als Haltung." },
  ];
  return (
    <section className="process">
      <div className="wrap">
        <div>
          <div className="eyebrow">So arbeiten wir</div>
          <h2 style={{ marginTop: 14 }}>Vier ruhige Schritte.</h2>
        </div>
        <div className="steps">
          {steps.map(s => (
            <div key={s.num} className="step">
              <span className="dot" />
              <div className="num">{s.num}</div>
              <h4>{s.h}</h4>
              <p>{s.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section id="termin" className="cta">
      <div className="wrap cta-inner">
        <div className="eyebrow" style={{ justifyContent: "center" }}>Kostenloses Erstgespräch</div>
        <h2 style={{ marginTop: 22 }}>In 30 Minuten wissen wir, <em>ob es passt.</em></h2>
        <p>Kein Verkaufsgespräch. Kein Druck. Nur Klarheit. Wo stehen Sie – und wie könnte eine Zusammenarbeit konkret aussehen?</p>
        <div className="row">
          <a className="btn btn-primary">Termin vorschlagen <ArrowIcon /></a>
          <a className="btn btn-ghost">info@mentolder.de</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-grid">
          <div className="foot-brand">
            <a className="brand" aria-label="Mentolder"><BrandMark /><span className="name">mentolder<span className="dot">.</span></span></a>
            <p>Digital Coaching &amp; Führungskräfte-Beratung. Praxisnah. Strukturiert. Auf Augenhöhe.</p>
          </div>
          <div>
            <h5>Kontakt</h5>
            <p>+49 151 508 32 601</p>
            <p>info@mentolder.de</p>
            <p>Lüneburg und Umgebung</p>
          </div>
          <div>
            <h5>Angebote</h5>
            <a>50+ digital</a><a>Führungskräfte-Coaching</a><a>Unternehmensberatung</a>
          </div>
          <div>
            <h5>Rechtliches</h5>
            <a>Referenzen</a><a>Impressum</a><a>Datenschutz</a><a>AGB</a><a>Barrierefreiheit</a>
          </div>
        </div>
        <div className="foot-bot">
          <span>© 2026 Mentolder — Alle Rechte vorbehalten</span>
          <span>Gestaltet in Lüneburg · DE</span>
        </div>
      </div>
    </footer>
  );
}

function App() {
  return (
    <>
      <Topbar />
      <Hero />
      <StatStrip />
      <Offers />
      <WhyMe />
      <ProcessRail />
      <CtaSection />
      <Footer />
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
