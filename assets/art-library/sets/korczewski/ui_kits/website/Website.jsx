// Website.jsx — Kore.com marketing-page recreation
// Sections: SubNav, Hero, Services, Cases, Team, Contact, Footer

const Eyebrow = ({ num, children, className = '' }) => (
  <span className={`eyebrow ${className}`}>
    {num && <span style={{ color: 'var(--mute)', marginRight: 6 }}>{num}</span>}
    {children}
  </span>
);

const Em = ({ children }) => <em className="em">{children}</em>;

function SubNav({ active = 'work', onNav }) {
  const links = [
    ['work', 'Work'], ['services', 'Services'], ['team', 'Team'],
    ['notes', 'Notes'], ['contact', 'Contact'],
  ];
  return (
    <nav className="web-nav">
      <a className="shell-brand" href="#" onClick={(e)=>e.preventDefault()}>
        <img src="../../assets/logo-mark.svg" width="28" height="28" alt="Kore" />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 22 }}>
          Kore<span style={{ color: 'var(--copper)' }}>.</span>
        </span>
      </a>
      <div className="links">
        {links.map(([k, l]) => (
          <a key={k} href={`#${k}`} className={active === k ? 'active' : ''}
             onClick={(e) => { e.preventDefault(); onNav?.(k); }}>{l}</a>
        ))}
      </div>
      <div className="actions">
        <a className="btn ghost sm">Notes</a>
        <a className="btn primary sm">Book a call →</a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="w-hero">
      <span className="w-ticker">
        <span className="dot" />
        <b>3</b>&nbsp;clusters syncing · <span style={{ color: 'var(--mute)' }}>ord-1, fra-2, sfo-3</span>
      </span>
      <Eyebrow className="no-rule">[ Now deploying ]</Eyebrow>
      <h1>Kubernetes, <Em>quietly run for you.</Em></h1>
      <p className="lede">
        We adopt your control plane in two weeks, write the runbook your on-call
        will actually read, and carry the pager for the quarters you'd rather not.
      </p>
      <div className="cta-row">
        <a className="btn primary">Book a call →</a>
        <a className="btn ghost">Read selected work</a>
      </div>
      <div className="meta-row">
        <div>
          <div className="lab">Avg adoption</div>
          <div className="v">2<span className="u">wk</span></div>
          <div className="s">control plane → prod</div>
        </div>
        <div>
          <div className="lab">Pages / quarter</div>
          <div className="v"><Em>0</Em></div>
          <div className="s">outside business hours</div>
        </div>
        <div>
          <div className="lab">Clusters under care</div>
          <div className="v">37</div>
          <div className="s">EKS · GKE · bare-metal</div>
        </div>
        <div>
          <div className="lab">SLA hit</div>
          <div className="v">99.97<span className="u">%</span></div>
          <div className="s">12-month rolling</div>
        </div>
      </div>
    </section>
  );
}

function Service({ glyph, title, em, body, tags }) {
  return (
    <article className="w-svc">
      <div className="glyph">{glyph}</div>
      <h3>{title} <Em>{em}</Em></h3>
      <p>{body}</p>
      <div className="tags">{tags.map((t) => <span key={t}>{t}</span>)}</div>
    </article>
  );
}

function Services() {
  return (
    <section className="w-section" id="services">
      <div className="head">
        <span className="num">01 / 04</span>
        <h2>What we run, <Em>and what we won't.</Em></h2>
        <span className="hint">Three offerings</span>
      </div>
      <div className="w-services">
        <Service
          glyph={<img src="../../assets/k8s-wheel.svg" width="34" height="34" style={{filter:'invert(85%) sepia(40%) saturate(500%) hue-rotate(20deg)'}} />}
          title="Cluster" em="adoption"
          body="Two-week onboarding to a control plane your on-call can actually read."
          tags={['EKS', 'GKE', 'BARE-METAL']}
        />
        <Service
          glyph={<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2 4 6v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V6l-8-4z"/></svg>}
          title="Reliability" em="retainer"
          body="We carry your pager for the quarters you'd rather not, and write the runbook on the way."
          tags={['SLO', 'RUNBOOK', 'ON-CALL']}
        />
        <Service
          glyph={<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 12h4l3-8 4 16 3-8h4"/></svg>}
          title="Migration" em="surgery"
          body="Move workloads between clouds without the all-hands weekend. We've done it forty times."
          tags={['AWS→GCP', 'VMWARE', 'COLO']}
        />
      </div>
    </section>
  );
}

function Cases() {
  return (
    <section className="w-section" id="work">
      <div className="head">
        <span className="num">02 / 04</span>
        <h2>Selected <Em>case work,</Em> told briefly.</h2>
        <span className="hint">2024 — 2026</span>
      </div>
      <div className="w-cases">
        <article className="w-case lg">
          <span className="eye">Tradesman · Reliability retainer</span>
          <h3>From four-page weekends to <Em>none.</Em></h3>
          <blockquote>
            Their runbook is the only document my new SRE actually opens during an incident.
          </blockquote>
          <div className="who">— Maya O., Head of Platform · Tradesman</div>
          <div className="stats">
            <div className="stat"><div className="lab">Pages / mo</div><div className="v">38 → <Em>2</Em></div><div className="s">90-day rolling</div></div>
            <div className="stat"><div className="lab">Engagement</div><div className="v">14<span className="u">mo</span></div><div className="s">Renewed twice</div></div>
          </div>
          <div className="small-meta">EKS · MULTI-REGION · ON-CALL</div>
        </article>
        <article className="w-case">
          <span className="eye">Lumen.ag · Cluster adoption</span>
          <h3>Bare-metal to GKE in <Em>nine days.</Em></h3>
          <p style={{ color: 'var(--fg-soft)', marginTop: 14, fontSize: 14.5, lineHeight: 1.55 }}>
            A 22-node colo migrated to GKE Autopilot, with zero downtime and a runbook
            checked into the repo on day one.
          </p>
          <div className="small-meta" style={{ marginTop: 24 }}>GKE · TERRAFORM · ARGO</div>
        </article>
      </div>
    </section>
  );
}

function Team() {
  return (
    <section className="w-section" id="team">
      <div className="head">
        <span className="num">03 / 04</span>
        <h2>One human <Em>does the work.</Em></h2>
        <span className="hint">Solo studio · est. 2021</span>
      </div>
      <div className="w-team">
        <div className="who">
          <div className="portrait">
            <div className="id"><b>K. Korczewski</b><br/>Operator · Warsaw / Berlin</div>
          </div>
        </div>
        <div>
          <span className="role">Operator · founder</span>
          <h3>Konstanty <Em>Korczewski</Em></h3>
          <p className="bio">
            Twelve years carrying pagers for fintech, ad-tech, and one logistics
            company you've heard of. Doesn't believe in dashboards that nobody opens.
          </p>
          <p className="bio">
            Speaks Polish, English, German. Writes about boring infrastructure on
            Substack twice a month. Will say no to your request if it isn't worth doing.
          </p>
          <dl className="credits">
            <dt>Past</dt><dd>Allegro · DeliveryHero</dd>
            <dt>Now</dt><dd>Operating <Em>Tradesman</Em>, <Em>Lumen.ag</Em>, <Em>Halst</Em></dd>
            <dt>Speaks at</dt><dd>KubeCon EU, SREcon, PromCon</dd>
            <dt>Writes</dt><dd>kore.studio/notes</dd>
          </dl>
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const [picked, setPicked] = React.useState('wed-0930');
  const slots = [
    ['tue-1000', 'Tue 30', '10:00', false],
    ['tue-1400', 'Tue 30', '14:00', true],
    ['wed-0930', 'Wed 01', '09:30', false],
    ['wed-1500', 'Wed 01', '15:00', false],
    ['thu-1100', 'Thu 02', '11:00', false],
    ['thu-1600', 'Thu 02', '16:00', true],
  ];
  return (
    <section className="w-section" id="contact">
      <div className="head">
        <span className="num">04 / 04</span>
        <h2>Talk to a <Em>human,</Em> within a week.</h2>
        <span className="hint">No forms, no funnels</span>
      </div>
      <div className="w-contact">
        <div className="panel">
          <h3>The straight <Em>line.</Em></h3>
          <p>Email or Signal. Replies within one business day, in Berlin time.</p>
          <div className="row"><span className="lab">Email</span><span className="v"><a href="#" onClick={(e)=>e.preventDefault()}>hello@kore.studio</a><span className="small">PGP key on request</span></span></div>
          <div className="row"><span className="lab">Signal</span><span className="v">+49 30 ··· 4421<span className="small">Working hours only</span></span></div>
          <div className="row"><span className="lab">Office</span><span className="v">Friedrichstraße 132 · 10117 Berlin<span className="small">By appointment</span></span></div>
        </div>
        <div className="booker">
          <span className="lab">Next available</span>
          <h3>Book a 30-minute <Em>intro.</Em></h3>
          <div className="slots">
            {slots.map(([id, day, time, taken]) => (
              <div key={id}
                   className={`slot ${taken ? 'taken' : ''} ${picked === id ? 'sel' : ''}`}
                   style={picked === id ? { borderColor: 'var(--copper)', background: 'var(--copper-tint)' } : {}}
                   onClick={() => !taken && setPicked(id)}>
                <span className="day">{day}</span>
                <span className="time">{time}</span>
              </div>
            ))}
          </div>
          <p className="note">All times Europe/Berlin. We'll send a calendar hold within the hour.</p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="w-foot">
      <div className="w-foot-inner">
        <div>
          <div className="brand">Kore<span className="dot">.</span></div>
          <p style={{ color: 'var(--mute)', fontSize: 13, marginTop: 14, fontFamily: 'var(--mono)' }}>
            A solo Kubernetes studio.<br/>Berlin · Warsaw · ord-1.
          </p>
        </div>
        <div className="col"><h5>Work</h5><a>Cases</a><a>Notes</a><a>Open source</a></div>
        <div className="col"><h5>Services</h5><a>Adoption</a><a>Retainer</a><a>Migration</a></div>
        <div className="col"><h5>Studio</h5><a>About</a><a>Contact</a><a>Calendar</a></div>
      </div>
      <div className="legal">
        <span>© 2026 Kore. UG (haftungsbeschränkt)</span>
        <span>Last deploy · 2026-04-28 · 14:02 CET</span>
      </div>
    </footer>
  );
}

function Website() {
  const [active, setActive] = React.useState('work');
  return (
    <div className="web">
      <SubNav active={active} onNav={setActive} />
      <Hero />
      <Services />
      <Cases />
      <Team />
      <Contact />
      <Footer />
    </div>
  );
}

window.Website = Website;
