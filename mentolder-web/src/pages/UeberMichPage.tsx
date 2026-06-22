import { KickerBar } from '@/components/KickerBar';
import { CallToAction } from '@/components/CallToAction';
import { ueberMich } from '@/content';

export function UeberMichPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative pt-[80px] pb-[80px] max-md:pt-[56px]">
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
          aria-hidden="true"
        >
          <div
            className="absolute -top-[180px] -right-[120px] w-[620px] h-[620px] rounded-full"
            style={{
              background: 'radial-gradient(circle, oklch(0.80 0.09 75 / .14), transparent 65%)',
              filter: 'blur(18px)',
            }}
          />
        </div>
        <div className="relative max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <KickerBar parts={ueberMich.kicker} className="mb-6" />
          <h1
            className="font-serif font-light text-fg leading-[1.05] m-0"
            style={{ fontSize: 'clamp(40px, 5.4vw, 72px)', letterSpacing: '-0.02em' }}
          >
            {ueberMich.headline} <em>{ueberMich.headlineEmphasis}</em>
          </h1>
          <p className="text-[18px] leading-[1.6] text-fg-soft mt-5 max-w-[52ch]">
            {ueberMich.lede}
          </p>
        </div>
      </section>

      {/* Milestones */}
      <section className="py-[80px] border-t border-line" aria-label="Meilensteine">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <h2
            className="font-serif font-light text-fg text-center m-0 mb-14"
            style={{ fontSize: 'clamp(28px, 3vw, 40px)', letterSpacing: '-0.02em' }}
          >
            Mein Weg
          </h2>
          <div className="flex flex-col gap-8 max-w-[720px] mx-auto">
            {ueberMich.milestones.map((m) => (
              <div key={m.year} className="flex gap-6 items-start">
                <div className="flex-shrink-0 w-20 text-right pt-1">
                  <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-ink-900 bg-brass px-2.5 py-1 rounded-full whitespace-nowrap">
                    {m.year}
                  </span>
                </div>
                <div className="w-px bg-line self-stretch flex-shrink-0" aria-hidden="true" />
                <div className="pb-4">
                  <h3 className="font-serif text-[18px] text-fg m-0 mb-1">{m.title}</h3>
                  <p className="text-fg-soft text-[15px] leading-[1.6] m-0">{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Sections */}
      <section className="py-[80px] border-t border-line" aria-label="Über mich">
        <div className="max-w-[720px] mx-auto px-10 max-md:px-[22px] flex flex-col gap-10">
          {ueberMich.sections.map((sec) => (
            <div key={sec.title} className="border-l-2 border-brass pl-6">
              <h2
                className="font-serif text-[22px] text-fg m-0 mb-3"
                style={{ letterSpacing: '-0.015em' }}
              >
                {sec.title}
              </h2>
              <p className="text-fg-soft text-[16px] leading-[1.7] m-0">{sec.content}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Was ich nicht mache */}
      <section className="py-[80px] border-t border-line" aria-labelledby="not-doing-heading">
        <div className="max-w-[1240px] mx-auto px-10 max-md:px-[22px]">
          <h2
            id="not-doing-heading"
            className="font-serif font-light text-fg m-0 mb-10"
            style={{ fontSize: 'clamp(24px, 2.8vw, 36px)', letterSpacing: '-0.02em' }}
          >
            Was ich nicht mache
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-[900px]">
            {ueberMich.notDoing.map((item) => (
              <div
                key={item.title}
                className="border-l-2 pl-5 py-2"
                style={{ borderColor: 'oklch(0.63 0.22 22 / 0.5)' }}
              >
                <p className="text-[15px] text-fg m-0 mb-1 font-medium">{item.title}</p>
                <p className="text-fg-soft text-[14px] leading-[1.6] m-0">{item.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CallToAction />
    </>
  );
}
