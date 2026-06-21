import { Hero } from '@/components/Hero';
import { ServiceRow } from '@/components/ServiceRow';
import { WhyMeStats } from '@/components/WhyMeStats';
import { FAQ } from '@/components/FAQ';
import { CallToAction } from '@/components/CallToAction';
import { PageMeta } from '@/components/PageMeta';
import {
  SITE,
  heroContent,
  stats,
  services,
  faqItems,
  processSteps,
} from '@/content';
import { motion } from 'framer-motion';

export function HomePage() {
  return (
    <>
      <PageMeta
        title="Digital Coach & Führungskräfte-Mentor"
        description="Mit 30+ Jahren Führungserfahrung begleite ich Menschen und Organisationen bei der digitalen Transformation — praxisnah, empathisch und auf Augenhöhe."
        path={`${SITE.url}/`}
        ogImage={SITE.ogImage}
      />
      <Hero
        title={heroContent.title}
        titleEmphasis={heroContent.titleEmphasis}
        subtitle={heroContent.subtitle}
        tagline={heroContent.tagline}
        avatarType="initials"
        avatarInitials={SITE.person.initials}
        personName={SITE.person.name}
        personRole={SITE.person.role}
      />

      <WhyMeStats stats={stats} />

      <section
        id="angebote"
        className="py-[120px] max-md:py-[80px]"
        aria-labelledby="offers-heading"
      >
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-[72px] max-md:gap-6 max-md:mb-12 items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
                <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
                Meine Angebote
              </p>
              <h2
                id="offers-heading"
                className="font-serif font-normal text-fg leading-[1.1] m-0 max-w-[18ch]"
                style={{
                  fontSize: 'clamp(32px, 3.6vw, 48px)',
                  letterSpacing: '-0.02em',
                }}
              >
                Drei Wege, mit mir zu arbeiten.
              </h2>
            </div>
            <p className="text-[18px] leading-[1.6] text-fg-soft max-w-[52ch] m-0">
              Vom Coaching über Transformation bis zum Workshop — wählen Sie das Format, das zu Ihrer Situation passt.
            </p>
          </div>

          <ServiceRow services={services} />
        </div>
      </section>

      <section className="bg-ink-850 border-y border-line py-[120px] max-md:py-[80px]" aria-labelledby="why-heading">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-20 max-md:gap-14 items-start">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
                <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
                Warum mit mir?
              </p>
              <h2
                id="why-heading"
                className="font-serif font-normal text-fg leading-[1.1] m-0 max-w-[18ch]"
                style={{
                  fontSize: 'clamp(32px, 3.6vw, 48px)',
                  letterSpacing: '-0.02em',
                }}
              >
                Ich <em>verbinde</em> technische Tiefe mit menschlicher Klarheit.
              </h2>

              <ol className="list-none p-0 mt-10 border-t border-line" aria-label="Gründe">
                {[
                  { t: '30+ Jahre Führungserfahrung', d: 'Vom Teamlead bis zur Geschäftsführung. Ich kenne die Grautöne zwischen Folie und Werkbank.' },
                  { t: 'Technik trifft Empathie', d: 'Cloud, KI, DevOps — aber immer im Dienst der Menschen, die sie nutzen.' },
                  { t: 'Pragmatismus statt Hype', d: 'Wir bauen, was wirklich nützt. Keine Vendor-Pitches, keine Modeerscheinungen.' },
                  { t: 'Diskretion ist selbstverständlich', d: 'Was im Coaching besprochen wird, bleibt im Coaching. Punkt.' },
                ].map((p, i) => (
                  <motion.li
                    key={p.t}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.4 }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="py-[26px] border-b border-line grid grid-cols-[56px_1fr] gap-[22px] items-start"
                  >
                    <span className="font-mono text-[11px] text-brass tracking-[0.14em] uppercase pt-1.5">
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <div>
                      <h4 className="font-sans text-[17px] font-semibold text-fg m-0 mb-1.5" style={{ letterSpacing: '-0.01em' }}>
                        {p.t}
                      </h4>
                      <p className="text-[14px] leading-[1.6] text-mute m-0">{p.d}</p>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </div>

            <div className="pt-14 max-md:pt-0">
              <figure className="rounded-card border border-line-2 p-8 bg-ink-800 relative">
                <span
                  aria-hidden="true"
                  className="absolute left-8 -top-1 font-serif text-[64px] text-brass leading-none"
                  style={{ fontFamily: 'var(--serif)' }}
                >
                  &ldquo;
                </span>
                <blockquote className="font-serif text-[22px] leading-[1.4] text-fg m-0 mt-6" style={{ letterSpacing: '-0.01em' }}>
                  Gerald hat es geschafft, technische Tiefe und menschliche Wärme in jeden Termin zu bringen. Selten so klar gefragt, so präzise geantwortet.
                </blockquote>
                <figcaption className="mt-6 pt-4 border-t border-line flex flex-col gap-1">
                  <span className="font-serif text-[16px] text-fg">Dr. M. Albers</span>
                  <span className="font-mono text-[10px] tracking-[0.14em] uppercase text-mute">
                    CTO · mittelständisches SaaS-Unternehmen
                  </span>
                </figcaption>
              </figure>
            </div>
          </div>
        </div>
      </section>

      <section className="py-[80px] border-t border-line" aria-labelledby="process-heading">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-14 items-end">
            <div>
              <p className="font-mono text-[11px] tracking-[0.18em] uppercase text-brass inline-flex items-center gap-2.5 m-0 mb-4">
                <span aria-hidden="true" className="inline-block w-[22px] h-px bg-current opacity-80" />
                So geht's los
              </p>
              <h2
                id="process-heading"
                className="font-serif font-normal text-fg leading-[1.1] m-0"
                style={{ fontSize: 'clamp(28px, 3.2vw, 42px)', letterSpacing: '-0.02em' }}
              >
                In vier Schritten zu mehr Klarheit.
              </h2>
            </div>
          </div>

          <ol className="list-none p-0 m-0 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-line" aria-label="Prozessschritte">
            {processSteps.map((step, i) => (
              <motion.li
                key={step.num}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.3 }}
                transition={{ duration: 0.45, delay: i * 0.08 }}
                className="bg-ink-900 p-8 flex flex-col gap-4"
              >
                <span className="font-mono text-[11px] tracking-[0.14em] uppercase text-brass">{step.num}</span>
                <h3 className="font-serif text-[22px] font-normal text-fg m-0 leading-[1.1]" style={{ letterSpacing: '-0.015em' }}>
                  {step.title}
                </h3>
                <p className="text-[14px] leading-[1.6] text-mute m-0">{step.text}</p>
              </motion.li>
            ))}
          </ol>
        </div>
      </section>

      <FAQ items={faqItems} title="Häufige Fragen" />

      <CallToAction
        eyebrow="Bereit?"
        title="Lassen Sie uns"
        titleEmphasis="herausfinden, ob es passt."
        subtitle="30 Minuten, kostenlos, unverbindlich. Antwort innerhalb von 48 Stunden."
        primaryText="Termin vereinbaren"
        primaryHref="/kontakt"
        secondaryText={SITE.email}
        secondaryHref={`mailto:${SITE.email}`}
      />
    </>
  );
}
