/* global React, Glock, Deagle, M4A1, MuzzleFlash, BulletHit, BloodSplat, BloodPool, SkullMarker, LootCrate, Bullet, TopDownBody */
// =====================================================================
//  canvas.jsx — Top section: static asset showcase
//  Lays out weapons, FX particles, animation breakdowns. No interaction
//  beyond hovering. Kore voice / tone all the way down.
// =====================================================================
const { useState, useEffect, useRef } = React;

/* tiny generic card */
function AssetCard({ index, label, hint, children, big = false, span = 1 }) {
  return (
    <div style={{
      gridColumn: `span ${span}`,
      background: 'var(--ink-850)',
      border: '1px solid var(--line)',
      borderRadius: 'var(--r-card)',
      padding: big ? 'var(--s-8)' : 'var(--s-6)',
      display: 'flex',
      flexDirection: 'column',
      gap: 'var(--s-4)',
      minHeight: big ? 280 : 200,
      transition: 'border-color var(--dur) var(--ease), box-shadow var(--dur) var(--ease)',
    }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--line-2)'; e.currentTarget.style.boxShadow = 'var(--shadow-2)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--line)'; e.currentTarget.style.boxShadow = 'none'; }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 'var(--s-4)' }}>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase' }}>{`[ ${index} ]`}</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.18em', color: 'var(--mute-2)', textTransform: 'uppercase' }}>{hint}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 100 }}>
        {children}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 'var(--s-3)', fontFamily: 'var(--sans)', fontSize: 13, color: 'var(--fg-soft)' }}>
        {label}
      </div>
    </div>
  );
}

/* ---------- Weapon Showcase ----------------------------------------- */
function WeaponShowcase() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--s-4)' }}>
      <AssetCard index="01" label="Glock 17 — sidearm, low recoil" hint="9mm · 17-round mag">
        <Glock size={120} />
      </AssetCard>
      <AssetCard index="02" label={<span>Desert Eagle <em style={{fontStyle:'italic',color:'var(--lime-2)'}}>— two taps usually do it</em></span>} hint=".50 ae · 7-round mag">
        <Deagle size={150} />
      </AssetCard>
      <AssetCard index="03" label="M4A1 — assault rifle, full auto" hint="5.56 · 30-round mag">
        <M4A1 size={220} />
      </AssetCard>
    </div>
  );
}

/* ---------- FX showcase --------------------------------------------- */
function FXShowcase() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' }}>
      <AssetCard index="04" label="Muzzle flash — frame 1" hint="lime · 56px · 90ms"><MuzzleFlash size={72} /></AssetCard>
      <AssetCard index="05" label="Bullet hit — surface spark" hint="lime · 36px · 120ms"><BulletHit size={56} /></AssetCard>
      <AssetCard index="06" label="Tracer round — in flight" hint="lime trail · ~6px"><div style={{ transform: 'rotate(0deg)' }}><Bullet size={20} /></div></AssetCard>
      <AssetCard index="07" label="Loot crate — drops on death" hint="ink-700 · &lt; stencil"><LootCrate size={72} /></AssetCard>
    </div>
  );
}

/* ---------- Blood splat variations ---------------------------------- */
function BloodShowcase() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' }}>
      <AssetCard index="08" label="Hit splat — small" hint="seed 1 · 96px"><BloodSplat size={96} seed={1} /></AssetCard>
      <AssetCard index="09" label="Hit splat — medium" hint="seed 7 · 96px"><BloodSplat size={96} seed={7} /></AssetCard>
      <AssetCard index="10" label="Hit splat — wide" hint="seed 13 · 120px"><BloodSplat size={120} seed={13} /></AssetCard>
      <AssetCard index="11" label="Death pool — slump" hint="120 × 90"><BloodPool size={120} /></AssetCard>
    </div>
  );
}

/* ---------- Animation breakdowns ------------------------------------ */
//  Each card runs a short looping demo of the animation, frame by frame.

function HitReactionDemo() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 6), 280);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ position: 'relative', width: 120, height: 120 }}>
      {/* base body */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          transform: frame === 1 ? 'translateX(-3px)' : frame === 2 ? 'translateX(2px)' : 'none',
          filter: frame === 1 ? 'brightness(2.2) saturate(0)' : 'none',
          transition: 'all 80ms linear',
        }}>
          <TopDownBody size={80} tone="cyan" />
        </div>
      </div>
      {/* splatter */}
      {frame >= 2 && frame <= 4 && (
        <div style={{ position: 'absolute', top: 30, right: 6, opacity: frame === 4 ? 0.4 : 1 }}>
          <BloodSplat size={48} seed={frame} />
        </div>
      )}
    </div>
  );
}

function SlumpDemo() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 6), 320);
    return () => clearInterval(id);
  }, []);
  const rot = frame === 0 ? 0 : frame === 1 ? -10 : frame === 2 ? -45 : -90;
  return (
    <div style={{ position: 'relative', width: 140, height: 120 }}>
      {/* pool */}
      {frame >= 3 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: frame === 3 ? 0.4 : 1, transition: 'opacity 200ms' }}>
          <BloodPool size={120} />
        </div>
      )}
      {/* body slumping */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          transform: `rotate(${rot}deg) translateY(${frame >= 3 ? 8 : 0}px)`,
          transition: 'transform 240ms var(--ease)',
          transformOrigin: '50% 70%',
        }}>
          <TopDownBody size={80} tone="cyan" dead={frame >= 2} slumped={frame >= 3} />
        </div>
      </div>
    </div>
  );
}

function LootDropDemo() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % 6), 380);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {frame === 0 && <TopDownBody size={70} tone="cyan" />}
      {frame === 1 && (
        <div style={{ animation: 'kore-pop 200ms var(--ease)' }}>
          <BloodSplat size={120} seed={5} />
        </div>
      )}
      {frame === 2 && (
        <>
          <div style={{ position: 'absolute' }}><BloodSplat size={96} seed={5} /></div>
          <div style={{ position: 'absolute', opacity: 0.5, transform: 'scale(0.6)' }}><LootCrate size={56} /></div>
        </>
      )}
      {frame >= 3 && (
        <>
          <div style={{ position: 'absolute', opacity: 0.6 }}><BloodSplat size={88} seed={5} /></div>
          <div style={{ position: 'absolute', transform: `scale(${frame === 3 ? 1.1 : 1})`, transition: 'transform 200ms' }}><LootCrate size={56} /></div>
          {frame >= 4 && (
            <div style={{ position: 'absolute', top: -10 }}>
              <span className="eyebrow no-rule" style={{ color: 'var(--lime)', fontSize: 10 }}>+1 LOOT</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function MuzzleDemo() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = setInterval(() => setOn(o => !o), 280);
    return () => clearInterval(id);
  }, []);
  return (
    <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ position: 'relative' }}>
        <Glock size={90} />
        {on && (
          <div style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)' }}>
            <MuzzleFlash size={48} />
          </div>
        )}
      </div>
    </div>
  );
}

function AnimationBreakdowns() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--s-4)' }}>
      <AssetCard index="12" label="Muzzle flash · loop" hint="loop · 280ms"><MuzzleDemo /></AssetCard>
      <AssetCard index="13" label="Hit reaction · 6 frames" hint="white-flash + small splat"><HitReactionDemo /></AssetCard>
      <AssetCard index="14" label="Ragdoll slump · 6 frames" hint="rotate -90° + pool fade"><SlumpDemo /></AssetCard>
      <AssetCard index="15" label="Loot drop · 6 frames" hint="splat → crate → +1 loot"><LootDropDemo /></AssetCard>
    </div>
  );
}

/* ---------- Section header (Kore standard 3-col grid) -------------- */
function SectionHeader({ num, title, kicker, mono }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '80px 1fr auto',
      alignItems: 'baseline',
      gap: 'var(--s-6)',
      paddingBottom: 'var(--s-6)',
      borderBottom: '1px solid var(--line)',
      marginBottom: 'var(--s-8)',
    }}>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute)', textTransform: 'uppercase' }}>{`[ ${num} ]`}</span>
      <h2 style={{ margin: 0, fontFamily: 'var(--serif)', fontSize: 'var(--fs-h2)', lineHeight: 1.1, color: 'var(--fg)' }}>
        {title} <em style={{ fontStyle: 'italic', color: 'var(--lime-2)' }}>{kicker}</em>
      </h2>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--mute-2)', textTransform: 'uppercase' }}>{mono}</span>
    </div>
  );
}

function AssetCanvas() {
  return (
    <section style={{ paddingTop: 'var(--s-12)' }}>
      <SectionHeader num="01" title="Weapons —" kicker="three to start." mono="iso · top-down · lime rim" />
      <WeaponShowcase />

      <div style={{ height: 'var(--s-12)' }} />

      <SectionHeader num="02" title="Particles —" kicker="muzzle · spark · tracer · crate." mono="fx · 4 atoms" />
      <FXShowcase />

      <div style={{ height: 'var(--s-12)' }} />

      <SectionHeader num="03" title="Blood —" kicker="cartoon, not coroner." mono="splat · pool · seeded" />
      <BloodShowcase />

      <div style={{ height: 'var(--s-12)' }} />

      <SectionHeader num="04" title="Animations —" kicker="death, dryly." mono="hit · slump · loot" />
      <AnimationBreakdowns />
    </section>
  );
}

Object.assign(window, { AssetCanvas });
